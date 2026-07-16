import { hasPmacV4Delegates, hasUserSecurityFields, prisma } from '@/lib/prisma'
import {
  calculatePmacReadinessScore,
  getRecommendedAssignmentRoles,
  PMAC_ATTENDANCE_STATUSES,
  PMAC_EVENT_STATUSES,
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_POLL_STATUSES,
  PMAC_PROJECT_STATUSES,
  PMAC_SPECIALTY_LABELS,
} from '@/lib/pmac'
import { getPmacMemberEducation } from '@/lib/pmacMembers'
import {
  describePmacReportPeriod,
  getPmacReportDateRange,
  getPmacReportSubject,
  type PmacReportFilters,
} from '@/lib/pmacReportFilters'
import { sanitizeCsvCell } from '@/lib/sanitization'

export type PmacReportType = 'members' | 'events' | 'projects' | 'polls' | 'activity' | 'staffing' | 'performance' | 'attendance'
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

export type PmacReportFilterOptions = {
  events: Array<{ id: string; title: string }>
  projects: Array<{ id: string; title: string }>
}

function joinCsv(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')).join('\n')
}

function withReportMetadata(type: PmacReportType, filters: PmacReportFilters, csv: string) {
  return `${joinCsv([
    ['PMAC Report', type.toUpperCase()],
    ['Generated At', new Date().toISOString()],
    ['Reporting Period', describePmacReportPeriod(filters)],
    ['Status Filter', filters.status ?? 'All'],
    ['Department Filter', filters.department ?? 'All'],
    ['Executive Branch Filter', filters.branch ? PMAC_EXECUTIVE_TITLE_LABELS[filters.branch] : 'All'],
    ['Event / Project Filter', filters.subject ?? 'All'],
    [],
  ])}\n${csv}`
}

function hasStatus<T extends string>(statuses: readonly T[], status: string | undefined): status is T {
  return !!status && statuses.includes(status as T)
}

export async function buildPmacReportFilterOptions(): Promise<PmacReportFilterOptions> {
  if (!hasPmacV4Delegates()) {
    return { events: [], projects: [] }
  }

  const [events, projects] = await Promise.all([
    prisma.pmacEvent.findMany({
      orderBy: [{ startDateTime: 'desc' }, { title: 'asc' }],
      take: 250,
      select: { id: true, title: true },
    }),
    prisma.pmacProject.findMany({
      orderBy: [{ targetDate: 'desc' }, { title: 'asc' }],
      take: 250,
      select: { id: true, title: true },
    }),
  ])

  return { events, projects }
}

export async function buildPmacMembersCsv(filters: PmacReportFilters = {}) {
  const dateRange = getPmacReportDateRange(filters)
  const members = await prisma.pmacMember.findMany({
    where: {
      ...(filters.department ? { department: filters.department } : {}),
      ...(hasStatus(['ACTIVE', 'INACTIVE'] as const, filters.status) ? { status: filters.status } : {}),
      ...(dateRange ? { joinedAt: dateRange } : {}),
    },
    include: {
      account: {
        select: {
          email: true,
          role: true,
          isActive: true,
          ...(hasUserSecurityFields() ? { mustChangePassword: true } : {}),
        },
      },
      specialties: {
        select: {
          specialty: true,
        },
        orderBy: {
          specialty: 'asc',
        },
      },
      receivedTags: {
        include: {
          assignedByMember: {
            select: {
              fullName: true,
              executiveTitle: true,
            },
          },
        },
        orderBy: [
          { label: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
    orderBy: [
      { clubRole: 'asc' },
      { executiveTitle: 'asc' },
      { fullName: 'asc' },
    ],
  })

  return joinCsv([
    ['Full Name', 'Email', 'Club Role', 'Executive Title', 'Specialties', 'Assigned Tags', 'Status', 'System Role', 'Account Active', 'Password Reset Required', 'Joined At', 'Department', 'Course', 'Phone'],
    ...members.map((member) => {
      const education = getPmacMemberEducation(member)

      return [
        member.fullName,
        member.email,
        member.clubRole,
        member.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle] : '',
        member.specialties.map((entry) => PMAC_SPECIALTY_LABELS[entry.specialty]).join(' | '),
        member.receivedTags.map((tag) => `${tag.label} (${tag.assignedByMember.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[tag.assignedByMember.executiveTitle] : tag.assignedByMember.fullName})`).join(' | '),
        member.status,
        member.account?.role ?? '',
        member.account?.isActive ? 'Yes' : 'No',
        member.account?.mustChangePassword ? 'Yes' : 'No',
        member.joinedAt?.toISOString() ?? '',
        education.department,
        education.course,
        member.phone ?? '',
      ]
    }),
  ])
}

export async function buildPmacEventsCsv(filters: PmacReportFilters = {}) {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Title', 'Status', 'Venue', 'Starts At', 'Ends At', 'Created By', 'Creator Email', 'Approved By', 'Assignments', 'Attendance Records', 'Attachments'],
    ])
  }

  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)
  const events = await prisma.pmacEvent.findMany({
    where: {
      ...(hasStatus(PMAC_EVENT_STATUSES, filters.status) ? { status: filters.status } : {}),
      ...(dateRange ? { startDateTime: dateRange } : {}),
      ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
    },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
      approvedBy: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          assignments: true,
          attendance: true,
          attachments: true,
        },
      },
    },
    orderBy: [
      { startDateTime: 'desc' },
      { title: 'asc' },
    ],
  })

  return joinCsv([
    ['Title', 'Status', 'Source Type', 'Source Label', 'Source School', 'Source Documentation', 'Source Campus', 'Venue', 'Starts At', 'Ends At', 'Created By', 'Creator Email', 'Approved By', 'Assignments', 'Attendance Records', 'Attachments'],
    ...events.map((event) => [
      event.title,
      event.status,
      event.sourceType,
      event.sourceLabel ?? '',
      event.sourceSchool ?? '',
      event.sourceDocumentationType ?? '',
      event.sourceCampusType ?? '',
      event.venue,
      event.startDateTime.toISOString(),
      event.endDateTime.toISOString(),
      event.createdBy.name ?? '',
      event.createdBy.email,
      event.approvedBy?.name ?? '',
      event._count.assignments,
      event._count.attendance,
      event._count.attachments,
    ]),
  ])
}

export async function buildPmacProjectsCsv(filters: PmacReportFilters = {}) {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Title', 'Branch', 'Status', 'Starts At', 'Target Date', 'Head', 'Team', 'Milestones Done', 'Milestones Total', 'Output Submitted', 'Links', 'Launched By', 'Created At'],
    ])
  }

  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)
  const projects = await prisma.pmacProject.findMany({
    where: {
      ...(hasStatus(PMAC_PROJECT_STATUSES, filters.status) ? { status: filters.status } : {}),
      ...(filters.branch ? { branch: filters.branch } : {}),
      ...(dateRange ? { startDate: dateRange } : {}),
      ...(subject?.type === 'PROJECT' ? { id: subject.id } : {}),
    },
    include: {
      launchedBy: {
        select: {
          name: true,
          email: true,
        },
      },
      headMember: {
        select: {
          fullName: true,
        },
      },
      memberAssignments: {
        include: {
          member: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      milestones: {
        select: {
          title: true,
          status: true,
          dueDate: true,
        },
        orderBy: {
          dueDate: 'asc',
        },
      },
      links: {
        select: {
          type: true,
          label: true,
          url: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
    orderBy: [
      { targetDate: 'desc' },
      { title: 'asc' },
    ],
  })

  return joinCsv([
    ['Title', 'Branch', 'Status', 'Starts At', 'Target Date', 'Head', 'Team', 'Milestones Done', 'Milestones Total', 'Milestone Details', 'Output Submitted', 'Output Summary', 'Links', 'Launched By', 'Launcher Email', 'Created At'],
    ...projects.map((project) => [
      project.title,
      PMAC_EXECUTIVE_TITLE_LABELS[project.branch],
      project.status,
      project.startDate.toISOString(),
      project.targetDate.toISOString(),
      project.headMember?.fullName ?? '',
      project.memberAssignments.map((assignment) => assignment.member.fullName).join(' | '),
      project.milestones.filter((milestone) => milestone.status === 'DONE').length,
      project.milestones.length,
      project.milestones.map((milestone) => `${milestone.title} (${milestone.status}, ${milestone.dueDate.toISOString()})`).join(' | '),
      project.outputSubmittedAt?.toISOString() ?? '',
      project.outputSummary ?? '',
      project.links.map((link) => `${link.type}: ${link.label} (${link.url})`).join(' | '),
      project.launchedBy.name ?? '',
      project.launchedBy.email,
      project.createdAt.toISOString(),
    ]),
  ])
}

export async function buildPmacStaffingCsv(filters: PmacReportFilters = {}) {
  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const dateRange = getPmacReportDateRange(filters) ?? { gte: now, lte: soon }
  const subject = getPmacReportSubject(filters)

  const [upcomingEvents, memberWorkloads] = await Promise.all([
    prisma.pmacEvent.findMany({
      where: {
        status: 'APPROVED',
        startDateTime: dateRange,
        ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
      },
      include: {
        assignments: {
          include: {
            member: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: {
        startDateTime: 'asc',
      },
    }),
    prisma.pmacMember.findMany({
      where: {
        status: 'ACTIVE',
        ...(filters.department ? { department: filters.department } : {}),
        ...(subject?.type === 'EVENT' ? { eventAssignments: { some: { eventId: subject.id } } } : {}),
      },
      select: {
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
            event: {
              status: {
                in: ['APPROVED', 'COMPLETED'],
              },
              startDateTime: {
                ...dateRange,
              },
              ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
            },
          },
          select: {
            assignmentRole: true,
            event: {
              select: {
                title: true,
                startDateTime: true,
              },
            },
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    }),
  ])

  const eventRows = upcomingEvents.map((event) => {
    const assignedRoles = new Set(event.assignments.map((assignment) => assignment.assignmentRole))
    const missingRoles = event.sourceDocumentationType
      ? getRecommendedAssignmentRoles(event.sourceDocumentationType).filter((role) => !assignedRoles.has(role))
      : []

    return [
      'EVENT',
      event.title,
      event.sourceType,
      event.sourceLabel ?? '',
      event.startDateTime.toISOString(),
      event.venue,
      event.assignments.length,
      event.assignments.filter((assignment) => assignment.availabilityResponse === 'PENDING').length,
      missingRoles.join(' | '),
      event.assignments.map((assignment) => `${assignment.member.fullName} (${assignment.assignmentRole})`).join(' | '),
    ]
  })

  const workloadRows = memberWorkloads.map((member) => [
    'MEMBER',
    member.fullName,
    member.executiveTitle ? `${member.clubRole} (${PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle]})` : member.clubRole,
    '',
    '',
    '',
    member.eventAssignments.length,
    member.eventAssignments.filter((assignment) => assignment.event.startDateTime >= now).length,
    member.specialties.map((entry) => PMAC_SPECIALTY_LABELS[entry.specialty]).join(' | '),
    member.eventAssignments.map((assignment) => `${assignment.event.title} (${assignment.assignmentRole})`).join(' | '),
  ])

  return joinCsv([
    ['Section', 'Label', 'Source/Role', 'Source Label', 'Starts At', 'Venue', 'Assignment Count', 'Pending Responses', 'Missing Roles / Specialties', 'Assignment Details'],
    ...eventRows,
    ...workloadRows,
  ])
}

export async function buildPmacPollsCsv(filters: PmacReportFilters = {}) {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Title', 'Type', 'Status', 'Results Visibility', 'Opens At', 'Closes At', 'Created By', 'Creator Email', 'Linked Event', 'Votes Cast', 'Attachments'],
    ])
  }

  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)
  const polls = await prisma.pmacPoll.findMany({
    where: {
      ...(hasStatus(PMAC_POLL_STATUSES, filters.status) ? { status: filters.status } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(subject?.type === 'EVENT' ? { linkedEventId: subject.id } : {}),
    },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
      linkedEvent: {
        select: {
          title: true,
        },
      },
      _count: {
        select: {
          votes: true,
          attachments: true,
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' },
      { title: 'asc' },
    ],
  })

  return joinCsv([
    ['Title', 'Type', 'Status', 'Results Visibility', 'Opens At', 'Closes At', 'Created By', 'Creator Email', 'Linked Event', 'Votes Cast', 'Attachments'],
    ...polls.map((poll) => [
      poll.title,
      poll.type,
      poll.status,
      poll.resultsVisibility,
      poll.opensAt?.toISOString() ?? '',
      poll.closesAt?.toISOString() ?? '',
      poll.createdBy.name ?? '',
      poll.createdBy.email,
      poll.linkedEvent?.title ?? '',
      poll._count.votes,
      poll._count.attachments,
    ]),
  ])
}

export async function buildPmacPerformanceCsv(filters: PmacReportFilters = {}) {
  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const attendanceWindow = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 90))
  const dateRange = getPmacReportDateRange(filters) ?? { gte: attendanceWindow, lte: soon }
  const attendanceDateRange = getPmacReportDateRange(filters) ?? { gte: attendanceWindow }
  const subject = getPmacReportSubject(filters)

  const members = await prisma.pmacMember.findMany({
    where: {
      status: 'ACTIVE',
      ...(filters.department ? { department: filters.department } : {}),
      ...(subject?.type === 'EVENT'
        ? {
            OR: [
              { eventAssignments: { some: { eventId: subject.id } } },
              { attendanceRecords: { some: { eventId: subject.id } } },
            ],
          }
        : {}),
      account: {
        is: {
          isActive: true,
        },
      },
    },
    select: {
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
          event: {
            status: {
              in: ['APPROVED', 'COMPLETED'],
            },
            startDateTime: {
              ...dateRange,
            },
            ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
          },
        },
        select: {
          assignmentRole: true,
          event: {
            select: {
              title: true,
              startDateTime: true,
            },
          },
        },
      },
      attendanceRecords: {
        where: {
          recordedAt: {
            ...attendanceDateRange,
          },
          ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
        },
        select: {
          status: true,
          event: {
            select: {
              title: true,
            },
          },
        },
      },
    },
    orderBy: [
      { clubRole: 'asc' },
      { fullName: 'asc' },
    ],
  })

  return joinCsv([
    ['Full Name', 'Club Role', 'Executive Title', 'Specialties', 'Upcoming Load', 'Recent Assignments', 'Attendance Rate', 'Late/Absent Count', 'Recent Duty History', 'Attendance Notes'],
    ...members.map((member) => {
      const upcomingLoad = member.eventAssignments.filter((assignment) => assignment.event.startDateTime >= now).length
      const attendanceCount = member.attendanceRecords.length
      const reliableAttendance = member.attendanceRecords.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').length
      const attendanceRate = attendanceCount ? Math.round((reliableAttendance / attendanceCount) * 100) : 100
      const lateOrAbsentCount = member.attendanceRecords.filter((record) => record.status === 'LATE' || record.status === 'ABSENT').length

      return [
        member.fullName,
        member.clubRole,
        member.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle] : '',
        member.specialties.map((entry) => PMAC_SPECIALTY_LABELS[entry.specialty]).join(' | '),
        upcomingLoad,
        member.eventAssignments.length,
        `${attendanceRate}%`,
        lateOrAbsentCount,
        member.eventAssignments.map((assignment) => `${assignment.event.title} (${assignment.assignmentRole})`).join(' | '),
        member.attendanceRecords.map((record) => `${record.event.title} (${record.status})`).join(' | '),
      ]
    }),
  ])
}

export async function buildPmacAttendanceCsv(filters: PmacReportFilters = {}) {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Event', 'Event Date', 'Member', 'Department', 'Course', 'Assigned Duties', 'Attendance Status', 'Notes', 'Recorded By', 'Recorded At'],
    ])
  }

  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)
  const attendance = await prisma.pmacAttendance.findMany({
    where: {
      ...(hasStatus(PMAC_ATTENDANCE_STATUSES, filters.status) ? { status: filters.status } : {}),
      ...(filters.department ? { member: { is: { department: filters.department } } } : {}),
      ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
      ...(subject?.type === 'PROJECT' ? { id: '__project_scope_not_applicable__' } : {}),
      ...(dateRange ? { event: { is: { startDateTime: dateRange } } } : {}),
    },
    select: {
      status: true,
      notes: true,
      recordedAt: true,
      event: {
        select: {
          id: true,
          title: true,
          startDateTime: true,
          assignments: {
            select: {
              memberId: true,
              assignmentRole: true,
            },
          },
        },
      },
      member: {
        select: {
          id: true,
          fullName: true,
          department: true,
          course: true,
          courseOrDepartment: true,
        },
      },
      recordedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      { event: { startDateTime: 'desc' } },
      { member: { fullName: 'asc' } },
    ],
  })

  return joinCsv([
    ['Event', 'Event Date', 'Member', 'Department', 'Course', 'Assigned Duties', 'Attendance Status', 'Notes', 'Recorded By', 'Recorded At'],
    ...attendance.map((record) => {
      const education = getPmacMemberEducation(record.member)
      const duties = record.event.assignments
        .filter((assignment) => assignment.memberId === record.member.id)
        .map((assignment) => assignment.assignmentRole)

      return [
        record.event.title,
        record.event.startDateTime.toISOString(),
        record.member.fullName,
        education.department,
        education.course,
        duties.join(' | '),
        record.status,
        record.notes ?? '',
        record.recordedBy.name ?? record.recordedBy.email,
        record.recordedAt.toISOString(),
      ]
    }),
  ])
}

const PMAC_ACTIVITY_EXPORT_LIMIT = 10_000

export async function buildPmacActivityCsv(filters: PmacReportFilters = {}) {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor Name', 'Actor Role', 'Summary', 'Details', 'Changes', 'Archived At'],
    ])
  }

  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)
  const entries = await prisma.pmacActivityLog.findMany({
    where: {
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
      ...(subject?.type === 'PROJECT' ? { projectId: subject.id } : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: PMAC_ACTIVITY_EXPORT_LIMIT + 1,
  })

  if (entries.length > PMAC_ACTIVITY_EXPORT_LIMIT) {
    throw new Error(`Report is too large. Select a shorter date range to export ${PMAC_ACTIVITY_EXPORT_LIMIT.toLocaleString()} activity records or fewer.`)
  }

  return joinCsv([
    ['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor Name', 'Actor Role', 'Summary', 'Details', 'Changes', 'Archived At'],
    ...entries.map((entry) => [
      entry.createdAt.toISOString(),
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.actorName,
      entry.actorRole,
      entry.summary,
      entry.details ?? '',
      entry.changes ? JSON.stringify(entry.changes) : '',
      entry.archivedAt?.toISOString() ?? '',
    ]),
  ])
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

export async function buildPmacReportCsv(type: PmacReportType, filters: PmacReportFilters = {}) {
  let csv: string

  switch (type) {
    case 'members':
      csv = await buildPmacMembersCsv(filters)
      break
    case 'events':
      csv = await buildPmacEventsCsv(filters)
      break
    case 'projects':
      csv = await buildPmacProjectsCsv(filters)
      break
    case 'polls':
      csv = await buildPmacPollsCsv(filters)
      break
    case 'staffing':
      csv = await buildPmacStaffingCsv(filters)
      break
    case 'activity':
      csv = await buildPmacActivityCsv(filters)
      break
    case 'performance':
      csv = await buildPmacPerformanceCsv(filters)
      break
    case 'attendance':
      csv = await buildPmacAttendanceCsv(filters)
      break
  }

  return withReportMetadata(type, filters, csv)
}
