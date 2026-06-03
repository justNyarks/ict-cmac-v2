'use server'

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { School, ServiceType, DocumentationType } from "@prisma/client"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"

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
}) {
  noStore()
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return { success: false, error: 'Authentication required. Please log in again.' };
    }

    const role = (session.user as any).role;
    if (role !== 'SECRETARY' && role !== 'ICT_DIRECTOR') {
      return { success: false, error: 'Only Secretaries and Directors can submit requests.' };
    }

    const userId = (session.user as any).id;
    if (!userId) {
      return { success: false, error: 'Session error: User ID missing.' };
    }

    const isDirector = role === 'ICT_DIRECTOR';
    if (isDirector && !formData.serviceType) {
      return { success: false, error: 'Directly approved events must have a service type.' };
    }

    const request = await (prisma.serviceRequest as any).create({
      data: {
        eventTitle: formData.eventTitle,
        eventDate: new Date(formData.eventDate),
        endDate: (formData.endDate && formData.endDate.trim()) ? new Date(formData.endDate) : null,
        startTime: formData.startTime,
        endTime: formData.endTime,
        eventVenue: formData.eventVenue,
        school: formData.school,
        serviceType: formData.serviceType || null,
        documentationType: formData.documentationType,
        letterUrl: formData.letterUrl,
        letterContent: formData.letterContent,
        needsSameDayEdit: formData.needsSameDayEdit || false,
        needsSameDayPhoto: formData.needsSameDayPhoto || false,
        campusType: formData.campusType || 'IN_CAMPUS',
        secretaryId: userId, // Director acts as the "requester"
        status: isDirector ? 'DIRECTOR_APPROVED' : 'PENDING',
        directorId: isDirector ? userId : null,
        directorApprovedAt: isDirector ? new Date() : null,
      }
    });

    // Create Audit Log
    await (prisma as any).auditLog.create({
      data: {
        requestId: request.id,
        action: isDirector ? 'DIRECT_BYPASS' : 'SUBMITTED',
        actorName: session.user.name || 'Unknown',
        actorRole: role,
        details: isDirector 
          ? `Event directly added to calendar by Director (Bypass Mode).`
          : `New service request submitted by ${session.user.name}.`
      }
    });
    
    revalidatePath('/')
    revalidatePath('/requests')
    revalidatePath('/calendar')
    return { success: true, data: { id: request.id } };
  } catch (error: any) {
    console.error('SERVER_ACTION_CRITICAL_ERROR:', error);
    return { success: false, error: `Server error: ${error.message || 'Unknown error'}` };
  }
}

export async function checkConflict(startDate: string, startTime?: string, endDate?: string, endTime?: string, eventVenue?: string) {
  noStore()
  if (!startDate) return { hasConflict: false, conflicts: [], sameDayEvents: [] };
  try {
    const reqStart = new Date(startDate);
    const reqEnd = (endDate && endDate.trim()) ? new Date(endDate) : new Date(startDate);
    
    // Find all bookings that overlap with the requested date range
    const overlappingBookings = await (prisma.serviceRequest as any).findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            // Event starts within our range
            eventDate: { gte: reqStart, lte: reqEnd }
          },
          {
            // Event ends within our range
            endDate: { gte: reqStart, lte: reqEnd }
          },
          {
            // Event spans across our entire range
            AND: [
              { eventDate: { lte: reqStart } },
              { endDate: { gte: reqEnd } }
            ]
          }
        ],
        status: { in: ['DIRECTOR_APPROVED', 'COORDINATOR_APPROVED', 'PENDING'] }
      },
      select: { eventTitle: true, eventDate: true, endDate: true, startTime: true, endTime: true, status: true, eventVenue: true }
    });

    // Detailed time/venue overlap check
    const conflicts = overlappingBookings.filter((b: any) => {
      if (eventVenue && b.eventVenue !== eventVenue) return false;
      
      const bStart = b.eventDate;
      const bEnd = b.endDate || b.eventDate;
      
      // If dates are different, it's a conflict (at least one day overlaps fully)
      // If they share at least one full day in the middle, it's a conflict
      // If they share only the boundary days, check times
      
      const bStartTime = b.startTime || '00:00'
      const bEndTime = b.endTime || '23:59'
      const rStartTime = startTime || '00:00'
      const rEndTime = endTime || '23:59'

      // If it's the same day, check times
      if (bStart.getTime() === reqStart.getTime() && bEnd.getTime() === reqEnd.getTime()) {
        return (rStartTime < bEndTime && rEndTime > bStartTime);
      }

      return true; // Overlapping dates on same venue = conflict
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
    console.error("Conflict check error:", error);
    return { hasConflict: false, conflicts: [], sameDayEvents: [] };
  }
}
