'use server'

import { unstable_noStore as noStore } from "next/cache"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { findRequestConflicts } from "@/lib/conflicts"
import { prisma } from "@/lib/prisma"
import { revalidateRequestViews } from "@/lib/requestWorkflow"
import { validateAndNormalizeRequestInput } from "@/lib/requestValidation"
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
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return { success: false, error: 'Authentication required. Please log in again.' }
    }

    const { user } = session
    if (user.role !== 'SECRETARY' && user.role !== 'ICT_DIRECTOR') {
      return { success: false, error: 'Only Secretaries and Directors can submit requests.' }
    }

    if (!user.id) {
      return { success: false, error: 'Session error: User ID missing.' }
    }

    const isDirector = user.role === 'ICT_DIRECTOR'
    if (isDirector && !formData.serviceType) {
      return { success: false, error: 'Directly approved events must have a service type.' }
    }

    const bypassReason = formData.directorBypassReason?.trim() || ''
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
          actorName: user.name || 'Unknown',
          actorRole: user.role,
          details: isDirector
            ? `Event directly added to calendar by Director. Reason: ${bypassReason}`
            : `New service request submitted by ${user.name || 'Unknown user'}.`,
        },
      })

      return createdRequest
    })

    revalidateRequestViews()
    return { success: true, data: { id: request.id } }
  } catch (error) {
    console.error('SERVER_ACTION_CRITICAL_ERROR:', error)

    if (error instanceof Error) {
      return { success: false, error: `Server error: ${error.message}` }
    }

    return { success: false, error: 'Server error: Unknown error' }
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
