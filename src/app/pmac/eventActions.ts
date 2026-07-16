'use server'

import { unstable_noStore as noStore } from 'next/cache'
import { calculatePmacReadinessScore, getRecommendedAssignmentRoles, getPmacReadinessLabel, isPmacAssignmentResponderRole, isPmacAttendanceManagerRole, isPmacStaffingManagerRole } from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { prisma } from '@/lib/prisma'
import { revalidatePmacViews } from '@/lib/pmacRevalidation'
import { sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'
import type { PmacClubRole, PmacExecutiveTitle, PmacSpecialty } from '@/types'

import { PMAC_EVENT_LIST_SELECT, isCoordinatorRole, ensureEventPayload, getPmacEventWhere, getPmacCalendarWhere, getViewerSession, assertPmacActionSession, getActivityActor, findPmacEventForUser, buildWorkspacePermissions, getMissingCoverageRoles, buildWrapUpFilledCount, buildAssignmentTemplateRows, buildAssignmentSuggestions } from './actionShared'
import type { PmacEventDutyRole, PmacAttendanceStatus, PmacEventPayload, StaffingFocusEvent, PmacWrapUpPayload } from './actionShared'

export async function getPmacEvents() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  const events = await prisma.pmacEvent.findMany({
    where: getPmacEventWhere(session.user),
    select: PMAC_EVENT_LIST_SELECT,
    orderBy: [
      { startDateTime: 'asc' },
      { createdAt: 'desc' },
    ],
  })

  return events
}

export async function getPmacStaffingOverview() {
  noStore()

  const session = await getViewerSession()
  if (!session || (!isCoordinatorRole(session.user.role) && !isPmacStaffingManagerRole(session.user.role))) {
    return null
  }

  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const recentCutoff = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 7))

  const [upcomingEvents, recentCompletedEvents, activeMembers] = await Promise.all([
    prisma.pmacEvent.findMany({
      where: {
        status: 'APPROVED',
        startDateTime: {
          gte: now,
          lte: soon,
        },
      },
      select: {
        id: true,
        title: true,
        venue: true,
        startDateTime: true,
        sourceType: true,
        sourceDocumentationType: true,
        assignments: {
          select: {
            id: true,
            assignmentRole: true,
            availabilityResponse: true,
          },
        },
      },
      orderBy: {
        startDateTime: 'asc',
      },
      take: 20,
    }),
    prisma.pmacEvent.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: recentCutoff,
        },
      },
      select: {
        id: true,
        title: true,
        attendance: {
          select: { id: true },
        },
        assignments: {
          select: { id: true },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: 12,
    }),
    prisma.pmacMember.findMany({
      where: {
        status: 'ACTIVE',
        account: {
          is: {
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        eventAssignments: {
          where: {
            event: {
              status: {
                in: ['APPROVED', 'COMPLETED'],
              },
              startDateTime: {
                gte: now,
                lte: soon,
              },
            },
          },
          select: {
            id: true,
          },
        },
      },
    }),
  ])

  const focusEvents: StaffingFocusEvent[] = upcomingEvents.map((event) => {
    const missingRoles = getMissingCoverageRoles(event.sourceDocumentationType, event.assignments as Array<{ assignmentRole: PmacEventDutyRole }>)
    const pendingResponses = event.assignments.filter((assignment) => assignment.availabilityResponse === 'PENDING').length
    const readinessScore = calculatePmacReadinessScore({
      sourceDocumentationType: event.sourceDocumentationType,
      assignments: event.assignments as Array<{ assignmentRole: PmacEventDutyRole; availabilityResponse: 'PENDING' | 'YES' | 'NO' | null }>,
      eventStatus: 'APPROVED',
    })

    return {
      id: event.id,
      title: event.title,
      venue: event.venue,
      startDateTime: event.startDateTime,
      sourceType: event.sourceType,
      sourceDocumentationType: event.sourceDocumentationType,
      assignmentCount: event.assignments.length,
      pendingResponses,
      readinessScore,
      staffingLabel: getPmacReadinessLabel(readinessScore),
      missingRoles,
    }
  })

  const unassignedCount = focusEvents.filter((event) => event.assignmentCount === 0).length
  const importedCount = focusEvents.filter((event) => event.sourceType === 'CMAC_REQUEST').length
  const pendingResponses = focusEvents.reduce((total, event) => total + event.pendingResponses, 0)
  const understaffedCount = focusEvents.filter((event) => event.assignmentCount === 0 || event.missingRoles.length > 0).length
  const attendanceGapCount = recentCompletedEvents.filter((event) => event.assignments.length > 0 && event.attendance.length === 0).length
  const activeMemberCount = activeMembers.length
  const overloadedMemberCount = activeMembers.filter((member) => member.eventAssignments.length >= 4).length
  const averageReadinessScore = focusEvents.length
    ? Math.round(focusEvents.reduce((total, event) => total + event.readinessScore, 0) / focusEvents.length)
    : 0

  return {
    totalUpcoming: focusEvents.length,
    importedCount,
    unassignedCount,
    pendingResponses,
    understaffedCount,
    attendanceGapCount,
    activeMemberCount,
    overloadedMemberCount,
    averageReadinessScore,
    focusEvents: focusEvents
      .filter((event) => event.assignmentCount === 0 || event.pendingResponses > 0 || event.missingRoles.length > 0 || event.readinessScore < 85)
      .slice(0, 6),
  }
}

export async function getPmacEventWorkspace(eventId: string) {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return null
  }

  const event = await findPmacEventForUser(eventId, session.user)
  if (!event) {
    return null
  }

  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const attendanceWindow = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 90))

  const roster = (isPmacStaffingManagerRole(session.user.role) || isPmacAttendanceManagerRole(session.user.role) || isCoordinatorRole(session.user.role))
    ? await prisma.pmacMember.findMany({
        where: {
          status: 'ACTIVE',
          account: {
            is: {
              isActive: true,
            },
          },
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          clubRole: true,
          executiveTitle: true,
          status: true,
          specialties: {
            select: {
              specialty: true,
            },
            orderBy: {
              specialty: 'asc',
            },
          },
        },
        orderBy: [
          { clubRole: 'asc' },
          { fullName: 'asc' },
        ],
      })
    : []

  const rosterInsights = roster.length
    ? await prisma.pmacMember.findMany({
        where: {
          id: {
            in: roster.map((member) => member.id),
          },
        },
        select: {
          id: true,
          fullName: true,
          clubRole: true,
          executiveTitle: true,
          specialties: {
            select: {
              specialty: true,
            },
            orderBy: {
              specialty: 'asc',
            },
          },
          eventAssignments: {
            where: {
              eventId: {
                not: event.id,
              },
              event: {
                status: {
                  in: ['APPROVED', 'COMPLETED'],
                },
                startDateTime: {
                  gte: attendanceWindow,
                  lte: soon,
                },
              },
            },
            select: {
              assignmentRole: true,
              event: {
                select: {
                  id: true,
                  startDateTime: true,
                },
              },
            },
          },
          attendanceRecords: {
            where: {
              recordedAt: {
                gte: attendanceWindow,
              },
            },
            select: {
              status: true,
            },
          },
        },
      })
    : []

  const filteredAssignments = isPmacAssignmentResponderRole(session.user.role) && session.user.pmacMemberId
    ? event.assignments.filter((assignment: any) => assignment.memberId === session.user.pmacMemberId)
    : event.assignments

  const filteredAttendance = isPmacAssignmentResponderRole(session.user.role) && session.user.pmacMemberId
    ? event.attendance.filter((record: any) => record.memberId === session.user.pmacMemberId)
    : event.attendance

  const wrapUpFilledCount = buildWrapUpFilledCount(event)
  const readinessScore = calculatePmacReadinessScore({
    sourceDocumentationType: event.sourceDocumentationType ?? null,
    assignments: event.assignments as Array<{ assignmentRole: PmacEventDutyRole; availabilityResponse: 'PENDING' | 'YES' | 'NO' | null }>,
    attendanceCount: event.attendance.length,
    eventStatus: event.status,
    wrapUpFilledCount,
  })
  const assignmentSuggestions = buildAssignmentSuggestions({
    sourceDocumentationType: event.sourceDocumentationType ?? null,
    assignedMemberIds: event.assignments.map((assignment: any) => assignment.memberId),
      members: rosterInsights as Array<{
        id: string
        fullName: string
        clubRole: PmacClubRole
        executiveTitle: PmacExecutiveTitle | null
        specialties: Array<{
          specialty: PmacSpecialty
        }>
        eventAssignments: Array<{
        assignmentRole: PmacEventDutyRole
        event: {
          id: string
          startDateTime: Date
        }
      }>
      attendanceRecords: Array<{
        status: PmacAttendanceStatus
      }>
    }>,
  })
  const confirmedAssignments = event.assignments.filter((assignment: any) => assignment.availabilityResponse === 'YES').length
  const declinedAssignments = event.assignments.filter((assignment: any) => assignment.availabilityResponse === 'NO').length
  const pendingResponses = event.assignments.filter((assignment: any) => assignment.availabilityResponse === 'PENDING').length
  const recommendedRoles = getRecommendedAssignmentRoles(event.sourceDocumentationType ?? null)

  return {
    event: {
      ...event,
      attachments: 'attachments' in event && Array.isArray(event.attachments) ? event.attachments : [],
      activityLogs: 'activityLogs' in event && Array.isArray(event.activityLogs) ? event.activityLogs : [],
      assignments: filteredAssignments,
      attendance: filteredAttendance,
    },
    roster,
    permissions: buildWorkspacePermissions(session.user, event),
    assignmentTemplates: buildAssignmentTemplateRows(event.sourceDocumentationType ?? null),
    staffingReadiness: {
      missingRoles: getMissingCoverageRoles(
        event.sourceDocumentationType ?? null,
        event.assignments as Array<{ assignmentRole: PmacEventDutyRole }>
      ),
      readinessScore,
      readinessLabel: getPmacReadinessLabel(readinessScore),
      pendingResponses,
      confirmedAssignments,
      declinedAssignments,
      recommendedRoleCount: recommendedRoles.length,
      assignedRoleCount: new Set(event.assignments.map((assignment: any) => assignment.assignmentRole)).size,
      attendancePrepared: event.attendance.length,
      wrapUpFilledCount,
    },
    assignmentSuggestions,
    viewerRole: session.user.role,
    viewerMemberId: session.user.pmacMemberId,
  }
}

export async function getPmacCalendarEvents() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  return prisma.pmacEvent.findMany({
    where: getPmacCalendarWhere(session.user),
    select: {
      id: true,
      title: true,
      venue: true,
      startDateTime: true,
      endDateTime: true,
      status: true,
      sourceType: true,
      sourceLabel: true,
      assignments: {
        select: {
          id: true,
          memberId: true,
        },
      },
    },
    orderBy: {
      startDateTime: 'asc',
    },
  })
}

export async function createPmacEvent(payload: PmacEventPayload) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'])
    const data = ensureEventPayload(payload)

    const event = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.pmacEvent.create({
        data: {
          ...data,
          createdById: session.user.id,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: createdEvent.id,
        eventId: createdEvent.id,
        ...getActivityActor(session.user),
        action: 'EVENT_CREATED',
        summary: `Created PMAC event "${createdEvent.title}".`,
        details: createdEvent.description,
      })

      return createdEvent
    })

    revalidatePmacViews(['/pmac/events/new', `/pmac/events/${event.id}`])
    return { success: true, eventId: event.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create PMAC event.' }
  }
}

export async function updatePmacEvent(payload: PmacEventPayload) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'])
    const eventId = sanitizeSingleLineText(payload.eventId, {
      fieldName: 'Event ID',
      maxLength: 191,
      required: true,
    })
    const event = await prisma.pmacEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'DRAFT' && event.status !== 'REJECTED') {
      return { success: false, error: 'Only draft or rejected events can be edited.' }
    }

    const data = ensureEventPayload(payload)

    await prisma.$transaction(async (tx) => {
      await tx.pmacEvent.update({
        where: { id: eventId },
        data: {
          ...data,
          status: event.status,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: eventId,
        eventId,
        ...getActivityActor(session.user),
        action: 'EVENT_UPDATED',
        summary: `Updated PMAC event "${data.title}".`,
        details: data.description,
      })
    })

    revalidatePmacViews([`/pmac/events/${eventId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update PMAC event.' }
  }
}

export async function submitPmacEvent(eventId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'])
    const sanitizedId = sanitizeSingleLineText(eventId, {
      fieldName: 'Event ID',
      maxLength: 191,
      required: true,
    })

    const event = await prisma.pmacEvent.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
        createdById: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'DRAFT' && event.status !== 'REJECTED') {
      return { success: false, error: 'Only draft or rejected events can be submitted.' }
    }

    if (event.createdById !== session.user.id) {
      return { success: false, error: 'Only the event creator can submit this event.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacEvent.update({
        where: { id: sanitizedId },
        data: {
          status: 'PENDING_APPROVAL',
          submittedAt: new Date(),
          approvedById: null,
          approvedAt: null,
          rejectedAt: null,
          approvalRemarks: null,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: sanitizedId,
        eventId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'EVENT_SUBMITTED',
        summary: 'Submitted a PMAC event for CMAC approval.',
        changes: {
          status: { before: event.status, after: 'PENDING_APPROVAL' },
        },
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit PMAC event.' }
  }
}

export async function approvePmacEvent(eventId: string, remarks?: string) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(eventId, {
      fieldName: 'Event ID',
      maxLength: 191,
      required: true,
    })
    const approvalRemarks = sanitizeMultilineText(remarks, {
      fieldName: 'Approval remarks',
      maxLength: 2000,
    })

    const event = await prisma.pmacEvent.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        title: true,
        status: true,
        startDateTime: true,
        endDateTime: true,
        sourceDocumentationType: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'PENDING_APPROVAL') {
      return { success: false, error: 'Only pending PMAC events can be approved.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacEvent.update({
        where: { id: sanitizedId },
        data: {
          status: 'APPROVED',
          approvedById: session.user.id,
          approvedAt: new Date(),
          approvalRemarks: approvalRemarks || null,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: sanitizedId,
        eventId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'EVENT_APPROVED',
        summary: 'Approved a PMAC event.',
        details: approvalRemarks || null,
        changes: {
          status: { before: event.status, after: 'APPROVED' },
        },
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to approve PMAC event.' }
  }
}

export async function rejectPmacEvent(eventId: string, remarks: string) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(eventId, {
      fieldName: 'Event ID',
      maxLength: 191,
      required: true,
    })
    const rejectionRemarks = sanitizeMultilineText(remarks, {
      fieldName: 'Rejection remarks',
      maxLength: 2000,
      required: true,
    })

    const event = await prisma.pmacEvent.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        title: true,
        status: true,
        startDateTime: true,
        endDateTime: true,
        sourceDocumentationType: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'PENDING_APPROVAL') {
      return { success: false, error: 'Only pending PMAC events can be rejected.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacEvent.update({
        where: { id: sanitizedId },
        data: {
          status: 'REJECTED',
          approvedById: session.user.id,
          approvalRemarks: rejectionRemarks,
          rejectedAt: new Date(),
          approvedAt: null,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: sanitizedId,
        eventId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'EVENT_REJECTED',
        summary: 'Rejected a PMAC event.',
        details: rejectionRemarks,
        changes: {
          status: { before: event.status, after: 'REJECTED' },
        },
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reject PMAC event.' }
  }
}

export async function markPmacEventCompleted(eventId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'])
    const sanitizedId = sanitizeSingleLineText(eventId, {
      fieldName: 'Event ID',
      maxLength: 191,
      required: true,
    })

    const event = await prisma.pmacEvent.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        title: true,
        status: true,
        startDateTime: true,
        endDateTime: true,
        sourceDocumentationType: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'APPROVED') {
      return { success: false, error: 'Only approved PMAC events can be marked completed.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacEvent.update({
        where: { id: sanitizedId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: sanitizedId,
        eventId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'EVENT_COMPLETED',
        summary: 'Marked a PMAC event as completed.',
        changes: {
          status: { before: event.status, after: 'COMPLETED' },
        },
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to complete PMAC event.' }
  }
}

export async function savePmacEventWrapUp(eventId: string, payload: PmacWrapUpPayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'])
    const sanitizedId = sanitizeSingleLineText(eventId, {
      fieldName: 'Event ID',
      maxLength: 191,
      required: true,
    })

    const event = await prisma.pmacEvent.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        title: true,
        status: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'APPROVED' && event.status !== 'COMPLETED') {
      return { success: false, error: 'Wrap-up notes can only be saved after PMAC event approval.' }
    }

    const deliveredOutputs = sanitizeMultilineText(payload.deliveredOutputs, {
      fieldName: 'Delivered outputs',
      maxLength: 4000,
    })
    const issuesEncountered = sanitizeMultilineText(payload.issuesEncountered, {
      fieldName: 'Issues encountered',
      maxLength: 4000,
    })
    const attachmentAuditNotes = sanitizeMultilineText(payload.attachmentAuditNotes, {
      fieldName: 'Attachment audit notes',
      maxLength: 4000,
    })
    const wrapUpNotes = sanitizeMultilineText(payload.wrapUpNotes, {
      fieldName: 'Wrap-up notes',
      maxLength: 4000,
    })

    await prisma.$transaction(async (tx) => {
      await tx.pmacEvent.update({
        where: { id: sanitizedId },
        data: {
          deliveredOutputs: deliveredOutputs || null,
          issuesEncountered: issuesEncountered || null,
          attachmentAuditNotes: attachmentAuditNotes || null,
          wrapUpNotes: wrapUpNotes || null,
          wrapUpUpdatedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: sanitizedId,
        eventId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'EVENT_WRAP_UP_UPDATED',
        summary: 'Updated PMAC event wrap-up notes.',
        details: `Saved post-event notes for "${event.title}".`,
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`, '/pmac/events', '/pmac/reports'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save PMAC wrap-up.' }
  }
}
