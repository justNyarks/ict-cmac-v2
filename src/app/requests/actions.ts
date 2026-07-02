'use server'

import { ServiceType } from "@prisma/client"
import { unstable_noStore as noStore } from "next/cache"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { findRequestConflicts } from "@/lib/conflicts"
import { prisma } from "@/lib/prisma"
import { getCalendarWhere, getRequestListWhere, revalidateRequestViews } from "@/lib/requestWorkflow"
import { assertActionAccess } from "@/lib/security"
import { sanitizeSingleLineText } from "@/lib/sanitization"
import { isCoreWorkflowRole } from "@/lib/roles"
import { isPrivilegedRole } from "@/lib/zeroTrust"

export async function approveRequest(id: string, note: string, serviceType?: ServiceType) {
  const session = await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], { zeroTrust: true })

  const { user } = session
  const sanitizedNote = sanitizeSingleLineText(note, {
    fieldName: 'Approval note',
    maxLength: 191,
  })
  const actorName = sanitizeSingleLineText(user.name, {
    fieldName: 'Actor name',
    maxLength: 191,
  }) || 'Unknown'

  await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request) throw new Error('Request not found')
    if (request.deletedAt) throw new Error('Request has already been deleted')

    if (user.role === 'CMAC_COORDINATOR' && request.status === 'PENDING') {
      await tx.serviceRequest.update({
        where: { id },
        data: {
          status: 'COORDINATOR_APPROVED',
          coordinatorNote: sanitizedNote,
          coordinatorId: user.id,
          coordinatorApprovedAt: new Date(),
        },
      })

      await tx.auditLog.create({
        data: {
          requestId: id,
          action: 'COORDINATOR_APPROVED',
          actorName,
          actorRole: user.role,
          details: sanitizedNote ? `Note: ${sanitizedNote}` : 'Approved without additional notes.',
        },
      })

      return
    }

    if (user.role === 'ICT_DIRECTOR' && (request.status === 'COORDINATOR_APPROVED' || request.status === 'PENDING')) {
      if (!serviceType) {
        throw new Error('Service type is required for director approval')
      }

      const isDirectBypass = request.status === 'PENDING'
      if (isDirectBypass && !sanitizedNote) {
        throw new Error('A bypass reason is required when the director skips coordinator review')
      }

      await tx.serviceRequest.update({
        where: { id },
        data: {
          status: 'DIRECTOR_APPROVED',
          directorNote: sanitizedNote,
          directorId: user.id,
          directorApprovedAt: new Date(),
          serviceType,
          coordinatorNote: isDirectBypass && !request.coordinatorNote ? 'Bypassed by Director' : undefined,
        },
      })

      await tx.auditLog.create({
        data: {
          requestId: id,
          action: isDirectBypass ? 'DIRECT_BYPASS' : 'DIRECTOR_APPROVED',
          actorName,
          actorRole: user.role,
          details: sanitizedNote
            ? `Note: ${sanitizedNote}`
            : isDirectBypass
              ? 'Approved directly by the ICT Director.'
              : 'Approved without additional notes.',
        },
      })

      return
    }

    throw new Error('Invalid action for this role or request status')
  })

  revalidateRequestViews(true)
}

export async function rejectRequest(id: string, note: string) {
  const session = await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], { zeroTrust: true })

  const { user } = session
  const sanitizedNote = sanitizeSingleLineText(note, {
    fieldName: 'Rejection note',
    maxLength: 191,
    required: true,
  })
  const actorName = sanitizeSingleLineText(user.name, {
    fieldName: 'Actor name',
    maxLength: 191,
  }) || 'Unknown'

  await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id } })
    if (!request) throw new Error('Request not found')
    if (request.deletedAt) throw new Error('Request has already been deleted')

    await tx.serviceRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        coordinatorNote: user.role === 'CMAC_COORDINATOR' ? sanitizedNote : undefined,
        directorNote: user.role === 'ICT_DIRECTOR' ? sanitizedNote : undefined,
      },
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
  })

  revalidateRequestViews(true)
}

export async function deleteRequest(id: string) {
  const session = await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], { zeroTrust: true })

  const { user } = session
  const actorName = sanitizeSingleLineText(user.name, {
    fieldName: 'Actor name',
    maxLength: 191,
  }) || 'Unknown'

  await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({
      where: { id },
      select: { eventTitle: true, deletedAt: true },
    })
    if (!request) throw new Error('Request not found')
    if (request.deletedAt) throw new Error('Request has already been deleted')

    await tx.serviceRequest.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    })

    await tx.auditLog.create({
        data: {
          requestId: id,
          action: 'DELETED',
          actorName,
          actorRole: user.role,
          details: `Request for "${request.eventTitle || 'Unknown'}" was deleted from the system.`,
        },
    })
  })

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
