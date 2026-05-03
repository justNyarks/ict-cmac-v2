'use server'

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export async function approveRequest(id: string, note: string) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) throw new Error('Unauthorized')

  const role = (session.user as any).role
  const userId = (session.user as any).id

  const request = await prisma.serviceRequest.findUnique({ where: { id } })
  if (!request) throw new Error('Request not found')

  if (role === 'CMAC_COORDINATOR' && request.status === 'PENDING') {
    await prisma.serviceRequest.update({
      where: { id },
      data: {
        status: 'COORDINATOR_APPROVED',
        coordinatorNote: note,
        coordinatorId: userId,
        coordinatorApprovedAt: new Date()
      }
    })
  } else if (role === 'ICT_DIRECTOR' && (request.status === 'COORDINATOR_APPROVED' || request.status === 'PENDING')) {
    await prisma.serviceRequest.update({
      where: { id },
      data: {
        status: 'DIRECTOR_APPROVED',
        directorNote: note,
        directorId: userId,
        directorApprovedAt: new Date(),
        // If it was still PENDING, we record that it was approved directly
        coordinatorNote: request.status === 'PENDING' && !request.coordinatorNote ? 'Bypassed by Director' : undefined
      }
    })
  } else {
    throw new Error('Invalid action for this role or request status')
  }

  revalidatePath('/')
  revalidatePath('/requests')
}

export async function rejectRequest(id: string, note: string) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) throw new Error('Unauthorized')

  const role = (session.user as any).role
  if (role !== 'CMAC_COORDINATOR' && role !== 'ICT_DIRECTOR') {
    throw new Error('Only Coordinators or Directors can reject requests')
  }

  await prisma.serviceRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      coordinatorNote: role === 'CMAC_COORDINATOR' ? note : undefined,
      directorNote: role === 'ICT_DIRECTOR' ? note : undefined,
    }
  })

  revalidatePath('/')
  revalidatePath('/requests')
}

export async function getRequests() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []

  const role = (session.user as any).role
  const school = (session.user as any).school

  // If Secretary, only show their own school or own requests?
  // User request says: "SECRETARY: REQUEST LETTER, CHOOSE ONE SERVICE"
  // Usually Secretary only sees their own requests.
  
  const where: any = {}
  if (role === 'SECRETARY') {
    where.secretaryId = (session.user as any).id
  }

  return prisma.serviceRequest.findMany({
    where,
    include: {
      secretary: { select: { name: true } },
      coordinator: { select: { name: true } },
      director: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getCalendarRequests() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []

  // Shared calendar needs to fetch all requests.
  // Optimize by selecting ONLY necessary fields to prevent sending large text blocks (eventDetails, letterContent) over the network.
  return prisma.serviceRequest.findMany({
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
