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
    const conflictCheck = await findRequestConflicts({
      startDate: formData.eventDate,
      startTime: formData.startTime,
      endDate: formData.endDate,
      endTime: formData.endTime,
      eventVenue: formData.eventVenue,
    })

    if (conflictCheck.conflicts.length > 0) {
      const [firstConflict] = conflictCheck.conflicts
      return {
        success: false,
        error: `Schedule conflict with "${firstConflict.title}" at ${firstConflict.venue}. Please choose a different schedule.`,
      }
    }

    const request = await prisma.$transaction(async (tx) => {
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
          letterUrl: normalized.letterUrl,
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

      if (isDirector) {
        await syncPmacEventFromServiceRequest(tx, createdRequest, {
          id: user.id,
          name: user.name,
          role: user.role,
        })
      }

      return createdRequest
    })

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
