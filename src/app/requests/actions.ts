'use server'

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"

import { ServiceType } from "@prisma/client"

export async function approveRequest(id: string, note: string, serviceType?: ServiceType) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) throw new Error('Unauthorized')

  const role = (session.user as any).role
  const userId = (session.user as any).id

  const request = await prisma.serviceRequest.findUnique({ where: { id } })
  if (!request) throw new Error('Request not found')
  if ((request as any).deletedAt) throw new Error('Request has already been deleted')

  if (role === 'CMAC_COORDINATOR' && request.status === 'PENDING') {
    await prisma.serviceRequest.update({
      where: { id },
      data: {
        status: 'COORDINATOR_APPROVED',
        coordinatorNote: note,
        coordinatorId: userId,
        coordinatorApprovedAt: new Date(),
        // serviceType is NOT set by the Coordinator — only the Director can assign it
      }
    })
  } else if (role === 'ICT_DIRECTOR' && (request.status === 'COORDINATOR_APPROVED' || request.status === 'PENDING')) {
    if (!serviceType) {
      throw new Error('Service type is required for director approval')
    }

    await prisma.serviceRequest.update({
      where: { id },
      data: {
        status: 'DIRECTOR_APPROVED',
        directorNote: note,
        directorId: userId,
        directorApprovedAt: new Date(),
        serviceType,
        // If it was still PENDING, we record that it was approved directly
        coordinatorNote: request.status === 'PENDING' && !request.coordinatorNote ? 'Bypassed by Director' : undefined
      }
    })
  } else {
    throw new Error('Invalid action for this role or request status')
  }

  // Create Audit Log
  await (prisma as any).auditLog.create({
    data: {
      requestId: id,
      action: role === 'CMAC_COORDINATOR' ? 'COORDINATOR_APPROVED' : 'DIRECTOR_APPROVED',
      actorName: session.user.name || 'Unknown',
      actorRole: role,
      details: note ? `Note: ${note}` : 'Approved without additional notes.'
    }
  });

  revalidatePath('/')
  revalidatePath('/requests')
  revalidatePath('/calendar')
  revalidatePath('/logs')
}

export async function rejectRequest(id: string, note: string) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) throw new Error('Unauthorized')

  const role = (session.user as any).role
  if (role !== 'CMAC_COORDINATOR' && role !== 'ICT_DIRECTOR') {
    throw new Error('Only Coordinators or Directors can reject requests')
  }

  const request = await prisma.serviceRequest.findUnique({ where: { id } })
  if (!request) throw new Error('Request not found')
  if ((request as any).deletedAt) throw new Error('Request has already been deleted')

  await prisma.serviceRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      coordinatorNote: role === 'CMAC_COORDINATOR' ? note : undefined,
      directorNote: role === 'ICT_DIRECTOR' ? note : undefined,
    }
  })

  // Create Audit Log
  await (prisma as any).auditLog.create({
    data: {
      requestId: id,
      action: 'REJECTED',
      actorName: session.user.name || 'Unknown',
      actorRole: role,
      details: `Rejected by ${role.replace('_', ' ')}. Note: ${note}`
    }
  });

  revalidatePath('/')
  revalidatePath('/requests')
  revalidatePath('/calendar')
  revalidatePath('/logs')
}

export async function deleteRequest(id: string) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) throw new Error('Unauthorized')

  const role = (session.user as any).role
  if (role !== 'CMAC_COORDINATOR' && role !== 'ICT_DIRECTOR') {
    throw new Error('Only Coordinators or Directors can delete requests')
  }

  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { eventTitle: true, deletedAt: true }
  })
  if (!request) throw new Error('Request not found')
  if ((request as any).deletedAt) throw new Error('Request has already been deleted')

  // Soft-delete the request so its audit trail remains intact.
  await (prisma as any).auditLog.create({
    data: {
      requestId: id,
      action: 'DELETED',
      actorName: session.user.name || 'Unknown',
      actorRole: role,
      details: `Request for "${request?.eventTitle || 'Unknown'}" was deleted from the system.`
    }
  });

  await (prisma.serviceRequest as any).update({
    where: { id },
    data: {
      deletedAt: new Date()
    }
  })

  revalidatePath('/')
  revalidatePath('/requests')
  revalidatePath('/calendar')
  revalidatePath('/logs')
}

export async function getRequests() {
  noStore()
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      console.log("SERVER_ACTION_GET_REQUESTS: No session found");
      return []
    }

    const role = (session.user as any).role
    const school = (session.user as any).school
    const userId = (session.user as any).id

    console.log("SERVER_ACTION_GET_REQUESTS: Logged in user:", { role, school, userId, name: session.user.name });
    
    const where: any = { deletedAt: null }
    if (role === 'SECRETARY') {
      where.secretaryId = userId
    }

    const data = await prisma.serviceRequest.findMany({
      where,
      include: {
        secretary: { select: { name: true } },
        coordinator: { select: { name: true } },
        director: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    console.log("SERVER_ACTION_GET_REQUESTS: Fetched requests count:", data.length);
    return data
  } catch (err: any) {
    console.error("SERVER_ACTION_GET_REQUESTS_ERROR:", err);
    return []
  }
}

export async function getCalendarRequests() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []

  // Shared calendar needs to fetch all requests.
  // Optimize by selecting ONLY necessary fields to prevent sending large text blocks (eventDetails, letterContent) over the network.
  return prisma.serviceRequest.findMany({
    where: { deletedAt: null },
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
      secretary: { select: { name: true } }
    },
    orderBy: { eventDate: 'asc' }
  })
}

export async function checkConflict(startDate: string, startTime?: string, endDate?: string, endTime?: string, eventVenue?: string, currentRequestId?: string) {
  if (!startDate) return { hasConflict: false, conflicts: [], sameDayEvents: [] };
  try {
    const reqStart = new Date(startDate);
    const reqEnd = endDate ? new Date(endDate) : new Date(startDate);
    
    const overlappingBookings = await (prisma.serviceRequest as any).findMany({
      where: {
        deletedAt: null,
        id: currentRequestId ? { not: currentRequestId } : undefined,
        OR: [
          { eventDate: { gte: reqStart, lte: reqEnd } },
          { endDate: { gte: reqStart, lte: reqEnd } },
          { AND: [{ eventDate: { lte: reqStart } }, { endDate: { gte: reqEnd } }] }
        ],
        status: { in: ['DIRECTOR_APPROVED', 'COORDINATOR_APPROVED', 'PENDING'] }
      },
      select: { eventTitle: true, eventDate: true, endDate: true, startTime: true, endTime: true, status: true, eventVenue: true }
    });

    const conflicts = overlappingBookings.filter((b: any) => {
      if (eventVenue && b.eventVenue !== eventVenue) return false;
      const bStart = b.eventDate;
      const bEnd = b.endDate || b.eventDate;
      const bStartTime = b.startTime || '00:00';
      const bEndTime = b.endTime || '23:59';
      const rStartTime = startTime || '00:00';
      const rEndTime = endTime || '23:59';
      if (bStart.getTime() === reqStart.getTime() && bEnd.getTime() === reqEnd.getTime()) {
        return (rStartTime < bEndTime && rEndTime > bStartTime);
      }
      return true;
    });

    return { 
      hasConflict: conflicts.length > 0, 
      conflicts: conflicts.map((c: any) => ({ 
        title: c.eventTitle, 
        startTime: c.startTime, 
        endTime: c.endTime, 
        status: c.status, 
        venue: c.eventVenue,
        date: c.eventDate.toLocaleDateString()
      })),
      sameDayEvents: overlappingBookings.map((c: any) => ({ 
        title: c.eventTitle, 
        startTime: c.startTime, 
        endTime: c.endTime, 
        status: c.status, 
        venue: c.eventVenue,
        date: c.eventDate.toLocaleDateString()
      }))
    };
  } catch (error) {
    return { hasConflict: false, conflicts: [], sameDayEvents: [] };
  }
}

export async function getAuditLogs() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []

  const role = (session.user as any).role
  if (role !== 'CMAC_COORDINATOR') {
    return [] // Exclusive for Coordinator as requested
  }

  return prisma.auditLog.findMany({
    include: {
      request: {
        select: {
          eventTitle: true,
          school: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 100 // Last 100 changes
  })
}
