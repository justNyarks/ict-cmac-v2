import type { PmacFulfillmentStatus, Prisma, Role } from '@prisma/client'

import { getRecommendedAssignmentRoles } from '@/lib/pmac'
import { getCoverageReadiness } from '@/lib/pmacReadiness'
import { getPmacDeliveryLink } from '@/lib/pmacDeliveryEvidence'
import type { DocumentationType, PmacEventDutyRole } from '@/types'

type FulfillmentActor = {
  id?: string | null
  name?: string | null
  role: Role
}

type CompletionReadiness = {
  endDateTime: Date
  sourceType: 'MANUAL' | 'CMAC_REQUEST'
  sourceDocumentationType: DocumentationType | null
  handoffAcknowledgedAt: Date | null
  assignments: Array<{
    memberId: string
    assignmentRole: PmacEventDutyRole
    availabilityResponse: 'PENDING' | 'YES' | 'NO'
  }>
  attendance: Array<{ memberId: string }>
}

export function getPmacCompletionBlocker(event: CompletionReadiness, now = new Date()) {
  if (now < event.endDateTime) return 'This event cannot be completed before its scheduled end time.'
  if (event.sourceType === 'CMAC_REQUEST' && !event.handoffAcknowledgedAt) {
    return 'Acknowledge the CMAC handoff before completing this event.'
  }

  const confirmedAssignments = event.assignments.filter((assignment) => assignment.availabilityResponse === 'YES')
  if (!confirmedAssignments.length) return 'At least one PMAC member must accept a duty before this event can be completed.'
  if (event.assignments.some((assignment) => assignment.availabilityResponse === 'PENDING')) {
    return 'Resolve all pending coverage responses before completing this event.'
  }

  const confirmedRoles = new Set(confirmedAssignments.map((assignment) => assignment.assignmentRole))
  const missingRoles = getRecommendedAssignmentRoles(event.sourceDocumentationType)
    .filter((role) => !confirmedRoles.has(role))
  if (missingRoles.length) return `Confirmed coverage is still missing: ${missingRoles.join(', ')}.`

  const attendedMemberIds = new Set(event.attendance.map((record) => record.memberId))
  if (confirmedAssignments.some((assignment) => !attendedMemberIds.has(assignment.memberId))) {
    return 'Record attendance for every confirmed PMAC member before completing this event.'
  }

  return null
}

export async function syncRequestFulfillmentFromPmacEvent(
  tx: Prisma.TransactionClient,
  eventId: string,
  actor?: FulfillmentActor,
) {
  const event = await tx.pmacEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      sourceType: true,
      sourceRequestId: true,
      sourceDocumentationType: true,
      status: true,
      handoffAcknowledgedAt: true,
      deliveredOutputs: true,
      assignments: {
        select: {
          assignmentRole: true,
          availabilityResponse: true,
        },
      },
    },
  })

  if (!event || event.sourceType !== 'CMAC_REQUEST' || !event.sourceRequestId) return null

  let nextStatus: PmacFulfillmentStatus = 'RELEASED'
  if (event.status === 'REJECTED' || event.status === 'CANCELLED') {
    nextStatus = 'CANCELLED'
  } else if (event.status === 'COMPLETED' && getPmacDeliveryLink(event.deliveredOutputs)) {
    nextStatus = 'DELIVERED'
  } else if (event.status === 'COMPLETED') {
    nextStatus = 'EVENT_COMPLETED'
  } else {
    const { isReady } = getCoverageReadiness(event.sourceDocumentationType, event.assignments)

    if (isReady) nextStatus = 'READY'
    else if (event.assignments.length > 0) nextStatus = 'STAFFING'
    else if (event.handoffAcknowledgedAt) nextStatus = 'ACKNOWLEDGED'
  }

  const request = await tx.serviceRequest.findUnique({
    where: { id: event.sourceRequestId },
    select: { pmacFulfillmentStatus: true },
  })
  if (!request || request.pmacFulfillmentStatus === nextStatus) return nextStatus

  const now = new Date()
  await tx.serviceRequest.update({
    where: { id: event.sourceRequestId },
    data: {
      pmacFulfillmentStatus: nextStatus,
      pmacFulfillmentUpdatedAt: now,
      pmacFulfilledAt: nextStatus === 'DELIVERED' ? now : null,
    },
  })

  await tx.auditLog.create({
    data: {
      requestId: event.sourceRequestId,
      action: 'PMAC_FULFILLMENT_UPDATED',
      actorName: actor?.name || 'PMAC Workflow',
      actorRole: actor?.role ?? 'PMAC_DIRECTOR',
      details: `PMAC fulfillment moved from ${request.pmacFulfillmentStatus} to ${nextStatus} for "${event.title}".`,
    },
  })

  return nextStatus
}
