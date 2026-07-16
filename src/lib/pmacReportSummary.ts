import { calculatePmacReadinessScore, getRecommendedAssignmentRoles } from '@/lib/pmac'
import { hasPmacV4Delegates, prisma } from '@/lib/prisma'

export type PmacReportSummary = {
  members: number
  activeMembers: number
  events: number
  importedEvents: number
  openPolls: number
  polls: number
  pendingResponses: number
  upcomingEvents: number
  understaffedUpcoming: number
  attendanceGaps: number
  attachments: number
  activity: number
  archivedActivity: number
  attendanceRecords: number
  attendanceRate: number
  averageReadinessScore: number
  reliableMembers: number
  incompleteMemberProfiles: number
  overloadedMembers: number
  wrapUpsPending: number
  projects: number
  activeProjects: number
  onHoldProjects: number
  completedProjects: number
  overdueProjects: number
  projectCompletionRate: number
}

export async function buildPmacReportSummary(): Promise<PmacReportSummary> {
  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const recent = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 7))
  const attendanceWindow = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 90))

  const [
    members,
    activeMembers,
    events,
    importedEvents,
    openPolls,
    polls,
    attachments,
    activity,
    archivedActivity,
    attendanceRecords,
    reliableAttendanceRecords,
    pendingResponses,
    upcomingEvents,
    recentCompletedEvents,
    activeMemberIds,
    memberAttendanceGroups,
    memberUpcomingWorkloads,
    incompleteMemberProfiles,
    pendingWrapUps,
    projects,
    activeProjects,
    onHoldProjects,
    completedProjects,
    overdueProjects,
  ] = await Promise.all([
    prisma.pmacMember.count(),
    prisma.user.count({
      where: {
        pmacMemberId: {
          not: null,
        },
        isActive: true,
      },
    }),
    prisma.pmacEvent.count(),
    prisma.pmacEvent.count({
      where: {
        sourceType: 'CMAC_REQUEST',
      },
    }),
    prisma.pmacPoll.count({
      where: {
        status: 'OPEN',
      },
    }),
    prisma.pmacPoll.count(),
    hasPmacV4Delegates() ? prisma.pmacAttachment.count() : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacActivityLog.count() : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacActivityLog.count({ where: { archivedAt: { not: null } } }) : Promise.resolve(0),
    prisma.pmacAttendance.count(),
    prisma.pmacAttendance.count({
      where: {
        status: { in: ['PRESENT', 'LATE'] },
      },
    }),
    prisma.pmacEventAssignment.count({
      where: {
        availabilityResponse: 'PENDING',
        event: {
          status: 'APPROVED',
        },
      },
    }),
    prisma.pmacEvent.findMany({
      where: {
        status: 'APPROVED',
        startDateTime: {
          gte: now,
          lte: soon,
        },
      },
      select: {
        sourceDocumentationType: true,
        status: true,
        deliveredOutputs: true,
        issuesEncountered: true,
        attachmentAuditNotes: true,
        wrapUpNotes: true,
        assignments: {
          select: {
            assignmentRole: true,
            availabilityResponse: true,
          },
        },
      },
    }),
    prisma.pmacEvent.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: recent,
        },
      },
      select: {
        assignments: {
          select: { id: true },
        },
        attendance: {
          select: { id: true },
        },
      },
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
      },
    }),
    prisma.pmacAttendance.groupBy({
      by: ['memberId', 'status'],
      where: {
        recordedAt: { gte: attendanceWindow },
        member: {
          status: 'ACTIVE',
          account: {
            is: { isActive: true },
          },
        },
      },
      _count: { _all: true },
    }),
    prisma.pmacEventAssignment.groupBy({
      by: ['memberId'],
      where: {
        member: {
          status: 'ACTIVE',
          account: {
            is: { isActive: true },
          },
        },
        event: {
          status: 'APPROVED',
          startDateTime: {
            gte: now,
            lte: soon,
          },
        },
      },
      _count: { _all: true },
    }),
    prisma.pmacMember.count({
      where: {
        OR: [
          { department: null },
          { department: '' },
          { course: null },
          { course: '' },
        ],
      },
    }),
    prisma.pmacEvent.count({
      where: {
        status: 'COMPLETED',
        OR: [
          { deliveredOutputs: null },
          { issuesEncountered: null },
          { attachmentAuditNotes: null },
          { wrapUpNotes: null },
        ],
      },
    }),
    hasPmacV4Delegates() ? prisma.pmacProject.count() : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacProject.count({ where: { status: 'ACTIVE' } }) : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacProject.count({ where: { status: 'ON_HOLD' } }) : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacProject.count({ where: { status: 'COMPLETED' } }) : Promise.resolve(0),
    hasPmacV4Delegates()
      ? prisma.pmacProject.count({
          where: {
            status: { in: ['PLANNED', 'ACTIVE', 'ON_HOLD'] },
            targetDate: { lt: now },
          },
        })
      : Promise.resolve(0),
  ])

  const understaffedUpcoming = upcomingEvents.filter((event) => {
    if (event.assignments.length === 0) {
      return true
    }

    if (!event.sourceDocumentationType) {
      return false
    }

    const assignedRoles = new Set(event.assignments.map((assignment) => assignment.assignmentRole))
    return getRecommendedAssignmentRoles(event.sourceDocumentationType).some((role) => !assignedRoles.has(role))
  }).length

  const attendanceGaps = recentCompletedEvents.filter((event) => event.assignments.length > 0 && event.attendance.length === 0).length
  const averageReadinessScore = upcomingEvents.length
    ? Math.round(upcomingEvents.reduce((total, event) => {
        const wrapUpFilledCount = [
          event.deliveredOutputs,
          event.issuesEncountered,
          event.attachmentAuditNotes,
          event.wrapUpNotes,
        ].filter((value) => !!value && value.trim().length > 0).length
        const assignedRoles = event.assignments.map((assignment) => ({
          assignmentRole: assignment.assignmentRole,
          availabilityResponse: assignment.availabilityResponse,
        }))
        return total + calculatePmacReadinessScore({
          sourceDocumentationType: event.sourceDocumentationType,
          assignments: assignedRoles,
          wrapUpFilledCount,
          eventStatus: event.status,
        })
      }, 0) / upcomingEvents.length)
    : 0
  const attendanceByMember = new Map<string, { total: number; reliable: number }>()
  for (const group of memberAttendanceGroups) {
    const current = attendanceByMember.get(group.memberId) ?? { total: 0, reliable: 0 }
    current.total += group._count._all
    if (group.status === 'PRESENT' || group.status === 'LATE') {
      current.reliable += group._count._all
    }
    attendanceByMember.set(group.memberId, current)
  }

  const reliableMembers = activeMemberIds.filter((member) => {
    const attendance = attendanceByMember.get(member.id)
    return !attendance?.total || attendance.reliable / attendance.total >= 0.85
  }).length
  const overloadedMembers = memberUpcomingWorkloads.filter((member) => member._count._all >= 4).length

  return {
    members,
    activeMembers,
    events,
    importedEvents,
    openPolls,
    polls,
    pendingResponses,
    upcomingEvents: upcomingEvents.length,
    understaffedUpcoming,
    attendanceGaps,
    attachments,
    activity,
    archivedActivity,
    attendanceRecords,
    attendanceRate: attendanceRecords ? Math.round((reliableAttendanceRecords / attendanceRecords) * 100) : 100,
    averageReadinessScore,
    reliableMembers,
    incompleteMemberProfiles,
    overloadedMembers,
    wrapUpsPending: pendingWrapUps,
    projects,
    activeProjects,
    onHoldProjects,
    completedProjects,
    overdueProjects,
    projectCompletionRate: projects ? Math.round((completedProjects / projects) * 100) : 0,
  }
}
