'use server'

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { School, ServiceType, DocumentationType } from "@prisma/client"
import { revalidatePath } from "next/cache"

export async function createServiceRequest(formData: {
  eventTitle: string
  eventDate: string
  endDate?: string
  startTime?: string
  endTime?: string
  eventVenue: string
  school: School
  serviceType: ServiceType
  documentationType: DocumentationType
  letterUrl?: string | null
  letterContent?: string | null
  needsSoundSystem?: boolean
  needsSameDayEdit?: boolean
  needsICTPersonnel?: boolean
  hasOnlineSpeaker?: boolean
  campusType?: 'IN_CAMPUS' | 'OFF_CAMPUS'
}) {
  console.log("SERVER_ACTION: createServiceRequest called with", formData.eventTitle);
  
  try {
    const session = await getServerSession(authOptions);
    console.log("SERVER_ACTION: Session found", session?.user?.email);
    
    if (!session || !session.user) {
      console.error("SERVER_ACTION: No session");
      return { success: false, error: 'Authentication required. Please log in again.' };
    }

    if ((session.user as any).role !== 'SECRETARY') {
      console.error("SERVER_ACTION: Invalid role", (session.user as any).role);
      return { success: false, error: 'Only Secretaries can submit requests.' };
    }

    const userId = (session.user as any).id;
    if (!userId) {
      console.error("SERVER_ACTION: No user ID");
      return { success: false, error: 'Session error: User ID missing.' };
    }

    const schoolEnum = (formData.school as string) === 'School of Medicine' ? 'MEDICINE' : formData.school;

    const reqStart = formData.startTime || '00:00';
    const reqEnd = formData.endTime || '23:59';
    
    // Conflict check is now handled via UI warning, we allow submission so coordinator can decide.

    console.log("SERVER_ACTION: Creating in Prisma...");
    const request = await (prisma.serviceRequest as any).create({
      data: {
        eventTitle: formData.eventTitle,
        eventDate: new Date(formData.eventDate),
        endDate: formData.endDate ? new Date(formData.endDate) : null,
        startTime: formData.startTime,
        endTime: formData.endTime,
        eventVenue: formData.eventVenue,
        school: schoolEnum as School,
        serviceType: formData.serviceType,
        documentationType: formData.documentationType,
        letterUrl: formData.letterUrl,
        letterContent: formData.letterContent,
        needsSoundSystem: formData.needsSoundSystem || false,
        needsSameDayEdit: formData.needsSameDayEdit || false,
        needsICTPersonnel: formData.needsICTPersonnel || false,
        hasOnlineSpeaker: formData.hasOnlineSpeaker || false,
        campusType: formData.campusType || 'IN_CAMPUS',
        secretaryId: userId,
        status: 'PENDING'
      }
    });

    console.log("SERVER_ACTION: Successfully created", request.id);
    
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
  if (!startDate) return { hasConflict: false, conflicts: [], sameDayEvents: [] };
  try {
    const reqStart = new Date(startDate);
    const reqEnd = endDate ? new Date(endDate) : new Date(startDate);
    
    // Find all bookings that overlap with the requested date range
    const overlappingBookings = await (prisma.serviceRequest as any).findMany({
      where: {
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
      
      const startsSameDay = bStart.toISOString().split('T')[0] === reqEnd.toISOString().split('T')[0];
      const endsSameDay = bEnd.toISOString().split('T')[0] === reqStart.toISOString().split('T')[0];
      
      // Simple logic: if they share any date, and it's the same venue, it's a conflict for now
      // (Unless we want to get super granular with times on the boundary days)
      const bStartTime = b.startTime || '00:00';
      const bEndTime = b.endTime || '23:59';
      const rStartTime = startTime || '00:00';
      const rEndTime = endTime || '23:59';

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
