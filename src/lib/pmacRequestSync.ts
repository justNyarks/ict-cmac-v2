import type { Prisma } from '@prisma/client'

import { recordPmacActivity } from '@/lib/pmacActivity'
import type { CampusType, DocumentationType, Role, School } from '@/types'

type PmacSyncActor = {
  id?: string | null
  name?: string | null
  role: Role
}

type RequestMirrorInput = {
  id: string
  createdAt: Date
  eventTitle: string
  eventDate: Date
  endDate: Date | null
  startTime: string | null
  endTime: string | null
  eventVenue: string
  school: School
  serviceType: 'CMAC' | 'PMAC' | null
  documentationType: DocumentationType
  campusType: CampusType
  letterContent: string | null
  eventDetails: string | null
  status: 'PENDING' | 'COORDINATOR_APPROVED' | 'DIRECTOR_APPROVED' | 'REJECTED'
  deletedAt: Date | null
  secretaryId: string
  coordinatorApprovedAt: Date | null
  directorId: string | null
  directorApprovedAt: Date | null
  directorNote: string | null
  coordinatorNote: string | null
}

function applyTime(date: Date, time: string | null, fallbackHour: number, fallbackMinute: number) {
  const next = new Date(date)

  if (time) {
    const [hours, minutes] = time.split(':').map(Number)
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      next.setHours(hours, minutes, 0, 0)
      return next
    }
  }

  next.setHours(fallbackHour, fallbackMinute, 0, 0)
  return next
}

export function shouldMirrorRequestToPmacEvent(request: Pick<RequestMirrorInput, 'serviceType' | 'status' | 'deletedAt'>) {
  return request.serviceType === 'PMAC' && request.status === 'DIRECTOR_APPROVED' && !request.deletedAt
}

export function buildPmacEventScheduleFromRequest(request: Pick<RequestMirrorInput, 'eventDate' | 'endDate' | 'startTime' | 'endTime'>) {
  const startDateTime = applyTime(request.eventDate, request.startTime, 8, 0)
  const endDateBase = request.endDate ?? request.eventDate
  let endDateTime = applyTime(endDateBase, request.endTime, 17, 0)

  if (endDateTime <= startDateTime) {
    endDateTime = new Date(startDateTime.getTime() + (60 * 60 * 1000))
  }

  return {
    startDateTime,
    endDateTime,
  }
}

function formatDocumentationType(value: DocumentationType) {
  switch (value) {
    case 'BOTH':
      return 'Photo and Video'
    case 'PHOTO':
      return 'Photo'
    case 'VIDEO':
      return 'Video'
  }
}

function buildImportedEventDescription(request: Pick<RequestMirrorInput, 'school' | 'documentationType' | 'campusType' | 'eventDetails'>) {
  const details = request.eventDetails?.trim()

  return [
    'Approved CMAC request routed to PMAC for event coverage.',
    `School/Department: ${request.school}`,
    `Documentation: ${formatDocumentationType(request.documentationType)}`,
    `Campus Type: ${request.campusType === 'OFF_CAMPUS' ? 'Off-Campus' : 'In-Campus'}`,
    details ? `Request Notes: ${details}` : null,
  ].filter(Boolean).join('\n\n')
}

function buildApprovalRemarks(request: Pick<RequestMirrorInput, 'directorNote' | 'coordinatorNote'>) {
  return request.directorNote || request.coordinatorNote || 'Approved in CMAC and released to PMAC for staffing.'
}

export async function syncPmacEventFromServiceRequest(
  tx: Prisma.TransactionClient,
  request: RequestMirrorInput,
  actor?: PmacSyncActor
) {
  if (!shouldMirrorRequestToPmacEvent(request)) {
    const removed = await tx.pmacEvent.findFirst({
      where: {
        OR: [
          { id: request.id },
          { sourceRequestId: request.id },
        ],
      },
      select: {
        id: true,
        title: true,
      },
    })

    if (removed) {
      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: removed.id,
        actorId: actor?.id ?? request.directorId ?? null,
        actorName: actor?.name || 'CMAC Workflow',
        actorRole: actor?.role ?? 'ICT_DIRECTOR',
        action: 'EVENT_REMOVED_FROM_CMAC_SYNC',
        summary: `Removed imported PMAC event "${removed.title}" because the CMAC request is no longer an approved PMAC request.`,
        details: 'The source request was rejected, deleted, or moved away from PMAC service.',
      })
    }

    await tx.pmacEvent.deleteMany({
      where: {
        OR: [
          { id: request.id },
          { sourceRequestId: request.id },
        ],
      },
    })
    return false
  }

  const existingEvent = await tx.pmacEvent.findFirst({
    where: {
      OR: [
        { id: request.id },
        { sourceRequestId: request.id },
      ],
    },
    select: {
      id: true,
      status: true,
      title: true,
      startDateTime: true,
      endDateTime: true,
      venue: true,
    },
  })

  const { startDateTime, endDateTime } = buildPmacEventScheduleFromRequest(request)
  const createdById = request.secretaryId
  const approvedById = request.directorId ?? null
  const approvalRemarks = buildApprovalRemarks(request)

  if (existingEvent) {
    await tx.pmacEvent.update({
      where: { id: existingEvent.id },
      data: {
        title: request.eventTitle,
        description: buildImportedEventDescription(request),
        venue: request.eventVenue,
        startDateTime,
        endDateTime,
        status: existingEvent.status === 'COMPLETED' ? 'COMPLETED' : 'APPROVED',
        sourceType: 'CMAC_REQUEST',
        sourceRequestId: request.id,
        sourceLabel: 'Imported from approved CMAC request',
        sourceSchool: request.school,
        sourceDocumentationType: request.documentationType,
        sourceCampusType: request.campusType,
        createdById,
        approvedById,
        approvalRemarks,
        submittedAt: request.coordinatorApprovedAt ?? request.createdAt,
        approvedAt: request.directorApprovedAt ?? request.createdAt,
        rejectedAt: null,
      },
    })

    const scheduleChanged = existingEvent.startDateTime.getTime() !== startDateTime.getTime()
      || existingEvent.endDateTime.getTime() !== endDateTime.getTime()
    const titleChanged = existingEvent.title !== request.eventTitle
    const venueChanged = existingEvent.venue !== request.eventVenue

    if (scheduleChanged || titleChanged || venueChanged) {
      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: existingEvent.id,
        eventId: existingEvent.id,
        actorId: actor?.id ?? request.directorId ?? null,
        actorName: actor?.name || 'CMAC Workflow',
        actorRole: actor?.role ?? 'ICT_DIRECTOR',
        action: 'EVENT_UPDATED_FROM_CMAC',
        summary: `Updated imported PMAC event "${request.eventTitle}" from the latest CMAC request data.`,
        details: [
          titleChanged ? 'Title changed.' : null,
          scheduleChanged ? 'Schedule changed.' : null,
          venueChanged ? 'Venue changed.' : null,
        ].filter(Boolean).join(' '),
      })
    }

    return true
  }

  await tx.pmacEvent.create({
    data: {
      id: request.id,
      title: request.eventTitle,
      description: buildImportedEventDescription(request),
      venue: request.eventVenue,
      startDateTime,
      endDateTime,
      status: 'APPROVED',
      sourceType: 'CMAC_REQUEST',
      sourceRequestId: request.id,
      sourceLabel: 'Imported from approved CMAC request',
      sourceSchool: request.school,
      sourceDocumentationType: request.documentationType,
      sourceCampusType: request.campusType,
      createdById,
      approvedById,
      approvalRemarks,
      submittedAt: request.coordinatorApprovedAt ?? request.createdAt,
      approvedAt: request.directorApprovedAt ?? request.createdAt,
    },
  })

  await recordPmacActivity(tx, {
    entityType: 'EVENT',
    entityId: request.id,
    eventId: request.id,
    actorId: actor?.id ?? request.directorId ?? null,
    actorName: actor?.name || 'ICT Director',
    actorRole: actor?.role ?? 'ICT_DIRECTOR',
    action: 'EVENT_IMPORTED_FROM_CMAC',
    summary: `Imported CMAC request "${request.eventTitle}" into PMAC events.`,
    details: 'PMAC leadership can now assign members to this approved event.',
  })

  return true
}
