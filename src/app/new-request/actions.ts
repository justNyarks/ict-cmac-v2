'use server'

import { unstable_noStore as noStore } from "next/cache"

import { findRequestConflicts } from "@/lib/conflicts"
import { revalidatePmacViews } from "@/lib/pmacRevalidation"
import { syncPmacEventFromServiceRequest } from "@/lib/pmacRequestSync"
import { prisma } from "@/lib/prisma"
import { revalidateRequestViews } from "@/lib/requestWorkflow"
import { assertActionAccess } from "@/lib/security"
import { validateAndNormalizeRequestInput } from "@/lib/requestValidation"
import { sanitizeSingleLineText } from "@/lib/sanitization"
import type { DocumentationType, School, ServiceType } from "@/types"
import { updateServiceRequest as updateExistingServiceRequest } from "@/app/requests/actions"
import type { RequestInput } from "@/lib/requestValidation"

export async function getEditableServiceRequest(id: string) {
  const session = await assertActionAccess(['SECRETARY'])
  return prisma.serviceRequest.findFirst({
    where: {
      id,
      secretaryId: session.user.id,
      deletedAt: null,
      status: { in: ['PENDING', 'REVISION_REQUESTED', 'REJECTED', 'WITHDRAWN'] },
    },
    select: {
      id: true,
      status: true,
      eventTitle: true,
      eventDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      eventVenue: true,
      school: true,
      serviceType: true,
      documentationType: true,
      letterUrl: true,
      letterContent: true,
      needsSameDayEdit: true,
      needsSameDayPhoto: true,
      campusType: true,
    },
  })
}

export async function updateExistingRequest(id: string, formData: RequestInput) {
  await updateExistingServiceRequest(id, formData)
  return { success: true as const }
}

export async function createServiceRequest(formData: {
  eventTitle: string
  eventDate: string
  endDate?: string
  startTime?: string
  endTime?: string
  eventVenue: string
  school: School
  serviceType?: ServiceType | null
  documentationType: DocumentationType
  letterUrl?: string | null
  letterAttachmentId?: string | null
  letterContent?: string | null
  needsSameDayEdit?: boolean
  needsSameDayPhoto?: boolean
  campusType?: 'IN_CAMPUS' | 'OFF_CAMPUS'
  directorBypassReason?: string | null
}) {
  noStore()

  try {
    const session = await assertActionAccess(['SECRETARY', 'ICT_DIRECTOR'])
    const { user } = session

    const isDirector = user.role === 'ICT_DIRECTOR'

    const bypassReason = sanitizeSingleLineText(formData.directorBypassReason, {
      fieldName: 'Bypass reason',
      maxLength: 191,
    })
    if (isDirector && !bypassReason) {
      return { success: false, error: 'A bypass reason is required when the director adds an event directly to the calendar.' }
    }

    const normalized = validateAndNormalizeRequestInput(formData, user)
    const request = await prisma.$transaction(async (tx) => {
      const conflictCheck = await findRequestConflicts({
        startDate: formData.eventDate,
        startTime: formData.startTime,
        endDate: formData.endDate,
        endTime: formData.endTime,
        eventVenue: formData.eventVenue,
      }, tx)
      if (conflictCheck.conflicts.length > 0) {
        const [firstConflict] = conflictCheck.conflicts
        throw new Error(`Schedule conflict with "${firstConflict.title}" at ${firstConflict.venue}. Please choose a different schedule.`)
      }

      if (normalized.letterAttachmentId) {
        const attachment = await tx.requestLetterAttachment.findFirst({
          where: {
            id: normalized.letterAttachmentId,
            uploadedById: user.id,
            requestId: null,
          },
          select: { id: true },
        })
        if (!attachment) throw new Error('The uploaded request letter is no longer available. Please upload it again.')
      }

      const createdRequest = await tx.serviceRequest.create({
        data: {
          eventTitle: normalized.eventTitle,
          eventDate: normalized.eventDate,
          endDate: normalized.endDate,
          startTime: normalized.startTime,
          endTime: normalized.endTime,
          eventVenue: normalized.eventVenue,
          school: normalized.school,
          serviceType: normalized.serviceType,
          documentationType: normalized.documentationType,
          letterUrl: normalized.letterAttachmentId
            ? `/api/request-letters/${normalized.letterAttachmentId}`
            : normalized.letterUrl,
          letterContent: normalized.letterContent,
          needsSameDayEdit: normalized.needsSameDayEdit,
          needsSameDayPhoto: normalized.needsSameDayPhoto,
          campusType: normalized.campusType,
          secretaryId: user.id,
          status: isDirector ? 'DIRECTOR_APPROVED' : 'PENDING',
          directorNote: isDirector ? bypassReason : null,
          directorId: isDirector ? user.id : null,
          directorApprovedAt: isDirector ? new Date() : null,
        },
      })

      await tx.auditLog.create({
        data: {
          requestId: createdRequest.id,
          action: isDirector ? 'DIRECT_BYPASS' : 'SUBMITTED',
          actorName: sanitizeSingleLineText(user.name, {
            fieldName: 'Actor name',
            maxLength: 191,
          }) || 'Unknown',
          actorRole: user.role,
          details: isDirector
            ? `Event directly added to calendar by Director. Reason: ${bypassReason}`
            : `New service request submitted by ${user.name || 'Unknown user'}.`,
        },
      })

      if (normalized.letterAttachmentId) {
        const linked = await tx.requestLetterAttachment.updateMany({
          where: {
            id: normalized.letterAttachmentId,
            uploadedById: user.id,
            requestId: null,
          },
          data: { requestId: createdRequest.id },
        })
        if (linked.count !== 1) throw new Error('The request letter was already used by another request.')
      }

      if (isDirector) {
        await syncPmacEventFromServiceRequest(tx, createdRequest, {
          id: user.id,
          name: user.name,
          role: user.role,
        })
      }

      return createdRequest
    }, { isolationLevel: 'Serializable' })

    revalidateRequestViews()
    if (isDirector && normalized.serviceType === 'PMAC') {
      revalidatePmacViews([`/pmac/events/${request.id}`])
    }
    return { success: true, data: { id: request.id } }
  } catch (error) {
    console.error('SERVER_ACTION_CRITICAL_ERROR:', error)

    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown server error.' }
  }
}

export async function checkConflict(startDate: string, startTime?: string, endDate?: string, endTime?: string, eventVenue?: string) {
  noStore()

  return findRequestConflicts({
    startDate,
    startTime,
    endDate,
    endTime,
    eventVenue,
  })
}
