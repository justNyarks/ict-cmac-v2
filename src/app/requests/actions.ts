'use server'

import { Prisma, type ServiceType } from "@prisma/client"
import { unstable_noStore as noStore } from "next/cache"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { findRequestConflicts } from "@/lib/conflicts"
import { revalidatePmacViews } from "@/lib/pmacRevalidation"
import { syncPmacEventFromServiceRequest } from "@/lib/pmacRequestSync"
import { prisma } from "@/lib/prisma"
import { getCalendarWhere, getRequestListWhere, revalidateRequestViews } from "@/lib/requestWorkflow"
import { applyAtomicRequestTransition, type RequestTransitionAction } from "@/lib/requestTransitions"
import { assertActionAccess } from "@/lib/security"
import { sanitizeSingleLineText } from "@/lib/sanitization"
import { validateAndNormalizeRequestInput, type RequestInput } from "@/lib/requestValidation"
import { isCoreWorkflowRole } from "@/lib/roles"
import { isPrivilegedRole } from "@/lib/zeroTrust"

function getActorName(name?: string | null) {
  return sanitizeSingleLineText(name, {
    fieldName: 'Actor name',
    maxLength: 191,
  }) || 'Unknown'
}

export async function approveRequest(id: string, note: string, serviceType?: ServiceType) {
  const session = await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], { zeroTrust: true })

  const { user } = session
  const sanitizedNote = sanitizeSingleLineText(note, {
    fieldName: 'Approval note',
    maxLength: 191,
  })
  const actorName = getActorName(user.name)
  const syncActor = {
    id: user.id,
    name: user.name,
    role: user.role,
  }

  const touchedPmacEvent = await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request) throw new Error('Request not found')
    if (request.deletedAt) throw new Error('Request has already been deleted')

    if (user.role === 'CMAC_COORDINATOR' && request.status === 'PENDING') {
      await applyAtomicRequestTransition(tx, request, user.role, 'APPROVE', {
          coordinatorNote: sanitizedNote,
          coordinatorId: user.id,
          coordinatorApprovedAt: new Date(),
          serviceType: serviceType ?? request.serviceType,
      })

      await tx.auditLog.create({
        data: {
          requestId: id,
          action: 'COORDINATOR_APPROVED',
          actorName,
          actorRole: user.role,
          details: [
            `Routing recommendation: ${serviceType ?? request.serviceType ?? 'Unassigned'}.`,
            sanitizedNote ? `Note: ${sanitizedNote}` : 'Approved without additional notes.',
          ].join(' '),
        },
      })

      return false
    }

    if (user.role === 'ICT_DIRECTOR' && request.status === 'COORDINATOR_APPROVED') {
      if (!serviceType) {
        throw new Error('Service type is required for director approval')
      }

      const conflictCheck = await findRequestConflicts({
        startDate: request.eventDate.toISOString().slice(0, 10),
        startTime: request.startTime ?? undefined,
        endDate: request.endDate ? request.endDate.toISOString().slice(0, 10) : undefined,
        endTime: request.endTime ?? undefined,
        eventVenue: request.eventVenue,
        currentRequestId: request.id,
      }, tx)
      if (conflictCheck.conflicts.length > 0) {
        const [firstConflict] = conflictCheck.conflicts
        throw new Error(`Cannot approve because "${firstConflict.title}" already conflicts with this schedule at ${firstConflict.venue}.`)
      }

      const updatedRequest = await applyAtomicRequestTransition(tx, request, user.role, 'APPROVE', {
          directorNote: sanitizedNote,
          directorId: user.id,
          directorApprovedAt: new Date(),
          serviceType,
      })

      const mirrored = await syncPmacEventFromServiceRequest(tx, updatedRequest, syncActor)

      await tx.auditLog.create({
        data: {
          requestId: id,
          action: 'DIRECTOR_APPROVED',
          actorName,
          actorRole: user.role,
          details: [
            `Final service assignment: ${serviceType}.`,
            sanitizedNote
              ? `Note: ${sanitizedNote}`
              : 'Approved without additional notes.',
          ].join(' '),
        },
      })

      return mirrored
    }

    throw new Error('Invalid action for this role or request status')
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  revalidateRequestViews(true)
  if (touchedPmacEvent) {
    revalidatePmacViews([`/pmac/events/${id}`])
  }
}

export async function rejectRequest(id: string, note: string) {
  const session = await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], { zeroTrust: true })

  const { user } = session
  const sanitizedNote = sanitizeSingleLineText(note, {
    fieldName: 'Rejection note',
    maxLength: 191,
    required: true,
  })
  const actorName = getActorName(user.name)

  const touchedPmacEvent = await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request) throw new Error('Request not found')
    if (request.deletedAt) throw new Error('Request has already been deleted')

    const updatedRequest = await applyAtomicRequestTransition(tx, request, user.role, 'REJECT', {
        coordinatorNote: user.role === 'CMAC_COORDINATOR' ? sanitizedNote : undefined,
        directorNote: user.role === 'ICT_DIRECTOR' ? sanitizedNote : undefined,
    })

    const mirrored = await syncPmacEventFromServiceRequest(tx, updatedRequest, {
      id: user.id,
      name: user.name,
      role: user.role,
    })

    await tx.auditLog.create({
        data: {
          requestId: id,
          action: 'REJECTED',
          actorName,
          actorRole: user.role,
          details: `Rejected by ${user.role.replace('_', ' ')}. Note: ${sanitizedNote}`,
        },
      })
    return mirrored || request.serviceType === 'PMAC'
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  revalidateRequestViews(true)
  if (touchedPmacEvent) {
    revalidatePmacViews([`/pmac/events/${id}`])
  }
}

async function transitionWithNote(
  id: string,
  action: Extract<RequestTransitionAction, 'REQUEST_REVISION' | 'CANCEL' | 'ARCHIVE'>,
  note: string,
  allowedRoles: Array<'CMAC_COORDINATOR' | 'ICT_DIRECTOR'>
) {
  const session = await assertActionAccess(allowedRoles, { zeroTrust: true })
  const sanitizedNote = sanitizeSingleLineText(note, {
    fieldName: action === 'ARCHIVE' ? 'Archive reason' : 'Reason',
    maxLength: 191,
    required: true,
  })
  const { user } = session

  const touchedPmacEvent = await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request || request.deletedAt) throw new Error('Request not found')

    const updatedRequest = await applyAtomicRequestTransition(tx, request, user.role, action, {
      archivedAt: action === 'ARCHIVE' ? new Date() : undefined,
      coordinatorNote: user.role === 'CMAC_COORDINATOR' && sanitizedNote ? sanitizedNote : undefined,
      directorNote: user.role === 'ICT_DIRECTOR' && sanitizedNote ? sanitizedNote : undefined,
    })

    const auditAction = action === 'REQUEST_REVISION'
      ? 'REVISION_REQUESTED'
      : action === 'CANCEL'
        ? 'CANCELLED'
        : 'ARCHIVED'

    await tx.auditLog.create({
      data: {
        requestId: id,
        action: auditAction,
        actorName: getActorName(user.name),
        actorRole: user.role,
        details: sanitizedNote,
      },
    })

    const mirrored = await syncPmacEventFromServiceRequest(tx, updatedRequest, {
      id: user.id,
      name: user.name,
      role: user.role,
    })
    return mirrored || request.serviceType === 'PMAC'
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  revalidateRequestViews(true)
  if (touchedPmacEvent) revalidatePmacViews([`/pmac/events/${id}`])
}

export async function requestRevision(id: string, note: string) {
  return transitionWithNote(id, 'REQUEST_REVISION', note, ['CMAC_COORDINATOR', 'ICT_DIRECTOR'])
}

export async function cancelRequest(id: string, note: string) {
  return transitionWithNote(id, 'CANCEL', note, ['ICT_DIRECTOR'])
}

export async function archiveRequest(id: string, note: string) {
  return transitionWithNote(id, 'ARCHIVE', note, ['CMAC_COORDINATOR', 'ICT_DIRECTOR'])
}

export async function withdrawRequest(id: string, note: string) {
  const session = await assertActionAccess(['SECRETARY'])
  const sanitizedNote = sanitizeSingleLineText(note, {
    fieldName: 'Withdrawal reason',
    maxLength: 191,
    required: true,
  })
  const { user } = session

  await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request || request.deletedAt || request.secretaryId !== user.id) throw new Error('Request not found')
    await applyAtomicRequestTransition(tx, request, user.role, 'WITHDRAW')
    await tx.auditLog.create({
      data: {
        requestId: id,
        action: 'WITHDRAWN',
        actorName: getActorName(user.name),
        actorRole: user.role,
        details: sanitizedNote,
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  revalidateRequestViews(true)
}

export async function resubmitRequest(id: string, note = '') {
  const session = await assertActionAccess(['SECRETARY'])
  const sanitizedNote = sanitizeSingleLineText(note, {
    fieldName: 'Resubmission note',
    maxLength: 191,
  })
  const { user } = session

  await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request || request.deletedAt || request.secretaryId !== user.id) throw new Error('Request not found')
    if (request.status === 'REVISION_REQUESTED' || request.status === 'REJECTED') {
      const feedback = await tx.auditLog.findFirst({
        where: { requestId: id, action: { in: ['REVISION_REQUESTED', 'REJECTED'] } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const correction = await tx.auditLog.findFirst({
        where: {
          requestId: id,
          action: 'CORRECTED',
          createdAt: feedback ? { gt: feedback.createdAt } : undefined,
        },
        select: { id: true },
      })
      if (!correction) throw new Error('Edit and save the requested corrections before resubmitting.')
    }
    await applyAtomicRequestTransition(tx, request, user.role, 'RESUBMIT', {
      coordinatorId: null,
      coordinatorApprovedAt: null,
      directorId: null,
      directorApprovedAt: null,
      archivedAt: null,
    })
    await tx.auditLog.create({
      data: {
        requestId: id,
        action: 'RESUBMITTED',
        actorName: getActorName(user.name),
        actorRole: user.role,
        details: sanitizedNote || 'Request corrected and resubmitted for coordinator review.',
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  revalidateRequestViews(true)
}

export async function updateServiceRequest(id: string, formData: RequestInput) {
  const session = await assertActionAccess(['SECRETARY'])
  const { user } = session
  const normalized = validateAndNormalizeRequestInput(formData, user, { isEditing: true })

  await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request || request.deletedAt || request.secretaryId !== user.id) throw new Error('Request not found')
    if (!['PENDING', 'REVISION_REQUESTED', 'REJECTED', 'WITHDRAWN'].includes(request.status)) {
      throw new Error('This request can no longer be edited.')
    }

    const conflictCheck = await findRequestConflicts({
      startDate: formData.eventDate,
      startTime: formData.startTime,
      endDate: formData.endDate,
      endTime: formData.endTime,
      eventVenue: formData.eventVenue,
      currentRequestId: id,
    }, tx)
    if (conflictCheck.conflicts.length > 0) {
      const [firstConflict] = conflictCheck.conflicts
      throw new Error(`Schedule conflict with "${firstConflict.title}" at ${firstConflict.venue}. Please choose a different schedule.`)
    }

    if (normalized.letterAttachmentId) {
      const attachment = await tx.requestLetterAttachment.findFirst({
        where: { id: normalized.letterAttachmentId, uploadedById: user.id, requestId: null },
        select: { id: true },
      })
      if (!attachment) throw new Error('The uploaded request letter is no longer available.')
      await tx.requestLetterAttachment.deleteMany({
        where: { requestId: id },
      })
    } else if (normalized.letterContent) {
      await tx.requestLetterAttachment.deleteMany({ where: { requestId: id } })
    }

    const updated = await tx.serviceRequest.updateMany({
      where: { id, status: request.status, deletedAt: null },
      data: {
        eventTitle: normalized.eventTitle,
        eventDate: normalized.eventDate,
        endDate: normalized.endDate,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        eventVenue: normalized.eventVenue,
        school: normalized.school,
        documentationType: normalized.documentationType,
        campusType: normalized.campusType,
        letterUrl: normalized.letterAttachmentId
          ? `/api/request-letters/${normalized.letterAttachmentId}`
          : normalized.letterUrl,
        letterContent: normalized.letterContent,
        needsSameDayEdit: normalized.needsSameDayEdit,
        needsSameDayPhoto: normalized.needsSameDayPhoto,
      },
    })
    if (updated.count !== 1) throw new Error('This request changed while you were editing it. Refresh and try again.')

    if (normalized.letterAttachmentId) {
      const linked = await tx.requestLetterAttachment.updateMany({
        where: { id: normalized.letterAttachmentId, uploadedById: user.id, requestId: null },
        data: { requestId: id },
      })
      if (linked.count !== 1) throw new Error('The uploaded request letter could not be linked to this request.')
    }

    await tx.auditLog.create({
      data: {
        requestId: id,
        action: 'CORRECTED',
        actorName: getActorName(user.name),
        actorRole: user.role,
        details: 'Request details were corrected by the submitter.',
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  revalidateRequestViews(true)
}

export async function getRequests() {
  noStore()

  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return []
    }

    const { user } = session
    if (!isCoreWorkflowRole(user.role)) {
      return []
    }
    if (isPrivilegedRole(user.role)) {
      await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'])
    }
    const where = getRequestListWhere(user)

    const data = await prisma.serviceRequest.findMany({
      where,
      include: {
        secretary: { select: { name: true } },
        coordinator: { select: { name: true } },
        director: { select: { name: true } },
        logs: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return data
  } catch (error) {
    console.error('SERVER_ACTION_GET_REQUESTS_ERROR:', error)

    if (error instanceof Error && error.message === 'Zero trust verification required') {
      throw error
    }

    return []
  }
}

export async function getCalendarRequests() {
  noStore()

  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []
  if (!isCoreWorkflowRole(session.user.role)) return []

  return prisma.serviceRequest.findMany({
    where: getCalendarWhere(session.user),
    select: {
      id: true,
      eventTitle: true,
      eventDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      eventVenue: true,
      serviceType: true,
      status: true,
      school: true,
      secretaryId: true,
      secretary: { select: { name: true } },
    },
    orderBy: { eventDate: 'asc' },
  })
}

export async function checkConflict(startDate: string, startTime?: string, endDate?: string, endTime?: string, eventVenue?: string, currentRequestId?: string) {
  return findRequestConflicts({
    startDate,
    startTime,
    endDate,
    endTime,
    eventVenue,
    currentRequestId,
  })
}

export async function getAuditLogs() {
  await assertActionAccess(['CMAC_COORDINATOR'])

  return prisma.auditLog.findMany({
    include: {
      request: {
        select: {
          eventTitle: true,
          school: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}
