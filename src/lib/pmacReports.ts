import { hasPmacV4Delegates, hasUserSecurityFields, prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
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
  type PmacReportType,
} from '@/lib/pmacReportFilters'
import { sanitizeCsvCell } from '@/lib/sanitization'
import { buildPmacReportSummary } from '@/lib/pmacReportSummary'
import type { PmacReportSummary } from '@/lib/pmacReportSummary'

export type { PmacReportType } from '@/lib/pmacReportFilters'
export type { PmacReportSummary } from '@/lib/pmacReportSummary'

export type PmacReportFilterOptions = {
  events: Array<{ id: string; title: string }>
  projects: Array<{ id: string; title: string }>
}

export type PmacReportCounts = Record<PmacReportType, number>

export type PmacReportAnalytics = {
  attendance: Array<{ status: string; count: number; percentage: number }>
  coverage: Array<{
    id: string
    title: string
    startsAt: Date
    assigned: number
    recommended: number
    pending: number
    percentage: number
  }>
  projectBranches: Array<{
    branch: string
    label: string
    total: number
    completed: number
    percentage: number
  }>
  overdue: Array<{
    id: string
    type: 'PROJECT' | 'MILESTONE'
    projectTitle: string
    label: string
    dueDate: Date
    daysOverdue: number
  }>
  members: Array<{
    id: string
    name: string
    department: string
    assignments: number
    attendanceRate: number
    absences: number
  }>
  trends: Array<{
    key: string
    label: string
    assignments: number
    reliableAttendance: number
    absences: number
  }>
}

function joinCsv(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')).join('\n')
}

function buildReportMetadataCsv(type: PmacReportType, filters: PmacReportFilters) {
  return joinCsv([
    ['PMAC Report', type.toUpperCase()],
    ['Generated At', new Date().toISOString()],
    ['Reporting Period', describePmacReportPeriod(filters)],
    ['Status Filter', filters.status ?? 'All'],
    ['Department Filter', filters.department ?? 'All'],
    ['Executive Branch Filter', filters.branch ? PMAC_EXECUTIVE_TITLE_LABELS[filters.branch] : 'All'],
    ['Event / Project Filter', filters.subject ?? 'All'],
    [],
  ])
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
      select: { id: true, title: true },
    }),
    prisma.pmacProject.findMany({
      orderBy: [{ targetDate: 'desc' }, { title: 'asc' }],
      select: { id: true, title: true },
    }),
  ])

  return { events, projects }
}

function getFilteredEventWhere(filters: PmacReportFilters) {
  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)

  return {
    ...(hasStatus(PMAC_EVENT_STATUSES, filters.status) ? { status: filters.status } : {}),
    ...(dateRange ? { startDateTime: dateRange } : {}),
    ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
  }
}

function getFilteredProjectWhere(filters: PmacReportFilters) {
  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)

  return {
    ...(hasStatus(PMAC_PROJECT_STATUSES, filters.status) ? { status: filters.status } : {}),
    ...(filters.branch ? { branch: filters.branch } : {}),
    ...(dateRange ? { startDate: dateRange } : {}),
    ...(subject?.type === 'PROJECT' ? { id: subject.id } : {}),
  }
}

function getFilteredMemberWhere(filters: PmacReportFilters, activeOnly = false) {
  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)

  return {
    ...(filters.department ? { department: filters.department } : {}),
    ...(activeOnly
      ? { status: 'ACTIVE' as const, account: { is: { isActive: true } } }
      : hasStatus(['ACTIVE', 'INACTIVE'] as const, filters.status)
        ? { status: filters.status }
        : {}),
    ...(!activeOnly && dateRange ? { joinedAt: dateRange } : {}),
    ...(subject?.type === 'EVENT'
      ? {
          OR: [
            { eventAssignments: { some: { eventId: subject.id } } },
            { attendanceRecords: { some: { eventId: subject.id } } },
          ],
        }
      : {}),
  }
}

function getFilteredAttendanceWhere(filters: PmacReportFilters) {
  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)

  return {
    ...(hasStatus(PMAC_ATTENDANCE_STATUSES, filters.status) ? { status: filters.status } : {}),
    ...(filters.department ? { member: { is: { department: filters.department } } } : {}),
    ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
    ...(subject?.type === 'PROJECT' ? { id: '__project_scope_not_applicable__' } : {}),
    ...(dateRange ? { event: { is: { startDateTime: dateRange } } } : {}),
  }
}

export async function buildPmacReportCounts(filters: PmacReportFilters = {}): Promise<PmacReportCounts> {
  const now = new Date()
  const soon = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1_000))
  const dateRange = getPmacReportDateRange(filters) ?? { gte: now, lte: soon }
  const subject = getPmacReportSubject(filters)
  const activityWhere = {
    ...(getPmacReportDateRange(filters) ? { createdAt: getPmacReportDateRange(filters) } : {}),
    ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
    ...(subject?.type === 'PROJECT' ? { projectId: subject.id } : {}),
  }
  const staffingEventWhere = {
    status: 'APPROVED' as const,
    startDateTime: dateRange,
    ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
  }
  const staffingMemberWhere = {
    status: 'ACTIVE' as const,
    ...(filters.department ? { department: filters.department } : {}),
    ...(subject?.type === 'EVENT' ? { eventAssignments: { some: { eventId: subject.id } } } : {}),
  }

  const [members, events, projects, polls, activity, attendance, performance, staffingEvents, staffingMembers] = await Promise.all([
    prisma.pmacMember.count({ where: getFilteredMemberWhere(filters) }),
    prisma.pmacEvent.count({ where: getFilteredEventWhere(filters) }),
    hasPmacV4Delegates() ? prisma.pmacProject.count({ where: getFilteredProjectWhere(filters) }) : Promise.resolve(0),
    prisma.pmacPoll.count({
      where: {
        ...(hasStatus(PMAC_POLL_STATUSES, filters.status) ? { status: filters.status } : {}),
        ...(getPmacReportDateRange(filters) ? { createdAt: getPmacReportDateRange(filters) } : {}),
        ...(subject?.type === 'EVENT' ? { linkedEventId: subject.id } : {}),
      },
    }),
    hasPmacV4Delegates() ? prisma.pmacActivityLog.count({ where: activityWhere }) : Promise.resolve(0),
    prisma.pmacAttendance.count({ where: getFilteredAttendanceWhere(filters) }),
    prisma.pmacMember.count({ where: getFilteredMemberWhere(filters, true) }),
    prisma.pmacEvent.count({ where: staffingEventWhere }),
    prisma.pmacMember.count({ where: staffingMemberWhere }),
  ])

  return {
    members,
    events,
    projects,
    polls,
    activity,
    attendance,
    performance,
    staffing: staffingEvents + staffingMembers,
  }
}

function getMonthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function buildPmacReportAnalytics(filters: PmacReportFilters = {}): Promise<PmacReportAnalytics> {
  const now = new Date()
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))
  const trendRange = getPmacReportDateRange(filters) ?? { gte: defaultFrom, lte: now }
  const subject = getPmacReportSubject(filters)
  const attendanceWhere = getFilteredAttendanceWhere(filters)
  const eventWhere = getFilteredEventWhere(filters)
  const projectWhere = getFilteredProjectWhere(filters)
  const memberWhere = getFilteredMemberWhere(filters, true)

  const [attendanceGroups, coverageEvents, projectGroups, overdueProjects, overdueMilestones, members] = await Promise.all([
    prisma.pmacAttendance.groupBy({
      by: ['status'],
      where: attendanceWhere,
      _count: { _all: true },
    }),
    prisma.pmacEvent.findMany({
      where: eventWhere,
      orderBy: { startDateTime: 'desc' },
      take: 40,
      select: {
        id: true,
        title: true,
        startDateTime: true,
        sourceDocumentationType: true,
        assignments: {
          select: {
            assignmentRole: true,
            availabilityResponse: true,
          },
        },
      },
    }),
    hasPmacV4Delegates()
      ? prisma.pmacProject.groupBy({
          by: ['branch', 'status'],
          where: projectWhere,
          _count: { _all: true },
        })
      : Promise.resolve([]),
    hasPmacV4Delegates()
      ? prisma.pmacProject.findMany({
          where: {
            AND: [
              projectWhere,
              { status: { in: ['PLANNED', 'ACTIVE', 'ON_HOLD'] }, targetDate: { lt: now } },
            ],
          },
          orderBy: { targetDate: 'asc' },
          take: 20,
          select: { id: true, title: true, targetDate: true },
        })
      : Promise.resolve([]),
    hasPmacV4Delegates()
      ? prisma.pmacProjectMilestone.findMany({
          where: {
            status: { not: 'DONE' },
            dueDate: { lt: now },
            project: { is: projectWhere },
          },
          orderBy: { dueDate: 'asc' },
          take: 20,
          select: {
            id: true,
            title: true,
            dueDate: true,
            project: { select: { title: true } },
          },
        })
      : Promise.resolve([]),
    prisma.pmacMember.findMany({
      where: memberWhere,
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        department: true,
        eventAssignments: {
          where: {
            event: {
              startDateTime: trendRange,
              ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
            },
          },
          select: { event: { select: { startDateTime: true } } },
        },
        attendanceRecords: {
          where: {
            recordedAt: trendRange,
            ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
          },
          select: { status: true, recordedAt: true },
        },
      },
    }),
  ])

  const attendanceTotal = attendanceGroups.reduce((total, group) => total + group._count._all, 0)
  const attendance = PMAC_ATTENDANCE_STATUSES.map((status) => {
    const count = attendanceGroups.find((group) => group.status === status)?._count._all ?? 0
    return { status, count, percentage: attendanceTotal ? Math.round((count / attendanceTotal) * 100) : 0 }
  })

  const coverage = coverageEvents.map((event) => {
    const recommendedRoles = event.sourceDocumentationType ? getRecommendedAssignmentRoles(event.sourceDocumentationType) : []
    const assignedRoles = new Set(event.assignments.map((assignment) => assignment.assignmentRole))
    const filled = recommendedRoles.filter((role) => assignedRoles.has(role)).length
    const percentage = recommendedRoles.length
      ? Math.round((filled / recommendedRoles.length) * 100)
      : event.assignments.length ? 100 : 0

    return {
      id: event.id,
      title: event.title,
      startsAt: event.startDateTime,
      assigned: event.assignments.length,
      recommended: recommendedRoles.length,
      pending: event.assignments.filter((assignment) => assignment.availabilityResponse === 'PENDING').length,
      percentage,
    }
  })

  const projectBranchMap = new Map<string, { total: number; completed: number }>()
  for (const group of projectGroups) {
    const current = projectBranchMap.get(group.branch) ?? { total: 0, completed: 0 }
    current.total += group._count._all
    if (group.status === 'COMPLETED') {
      current.completed += group._count._all
    }
    projectBranchMap.set(group.branch, current)
  }
  const projectBranches = Array.from(projectBranchMap.entries()).map(([branch, value]) => ({
    branch,
    label: PMAC_EXECUTIVE_TITLE_LABELS[branch as keyof typeof PMAC_EXECUTIVE_TITLE_LABELS],
    total: value.total,
    completed: value.completed,
    percentage: value.total ? Math.round((value.completed / value.total) * 100) : 0,
  })).sort((left, right) => left.label.localeCompare(right.label))

  const overdue = [
    ...overdueProjects.map((project) => ({
      id: project.id,
      type: 'PROJECT' as const,
      projectTitle: project.title,
      label: project.title,
      dueDate: project.targetDate,
      daysOverdue: Math.max(1, Math.floor((now.getTime() - project.targetDate.getTime()) / (24 * 60 * 60 * 1_000))),
    })),
    ...overdueMilestones.map((milestone) => ({
      id: milestone.id,
      type: 'MILESTONE' as const,
      projectTitle: milestone.project.title,
      label: milestone.title,
      dueDate: milestone.dueDate,
      daysOverdue: Math.max(1, Math.floor((now.getTime() - milestone.dueDate.getTime()) / (24 * 60 * 60 * 1_000))),
    })),
  ].sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime()).slice(0, 30)

  const memberRows = members.map((member) => {
    const reliable = member.attendanceRecords.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').length
    const absences = member.attendanceRecords.filter((record) => record.status === 'ABSENT').length
    return {
      id: member.id,
      name: member.fullName,
      department: member.department ?? '',
      assignments: member.eventAssignments.length,
      attendanceRate: member.attendanceRecords.length ? Math.round((reliable / member.attendanceRecords.length) * 100) : 100,
      absences,
    }
  }).sort((left, right) => right.assignments - left.assignments || right.attendanceRate - left.attendanceRate)

  const monthMap = new Map<string, { assignments: number; reliableAttendance: number; absences: number }>()
  for (const member of members) {
    for (const assignment of member.eventAssignments) {
      const key = getMonthKey(assignment.event.startDateTime)
      const current = monthMap.get(key) ?? { assignments: 0, reliableAttendance: 0, absences: 0 }
      current.assignments += 1
      monthMap.set(key, current)
    }
    for (const record of member.attendanceRecords) {
      const key = getMonthKey(record.recordedAt)
      const current = monthMap.get(key) ?? { assignments: 0, reliableAttendance: 0, absences: 0 }
      if (record.status === 'PRESENT' || record.status === 'LATE') current.reliableAttendance += 1
      if (record.status === 'ABSENT') current.absences += 1
      monthMap.set(key, current)
    }
  }
  const trends = Array.from(monthMap.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => ({
    key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    ...values,
  }))

  return { attendance, coverage, projectBranches, overdue, members: memberRows.slice(0, 50), trends }
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
    },
    orderBy: [
      { clubRole: 'asc' },
      { executiveTitle: 'asc' },
      { fullName: 'asc' },
    ],
  })

  return joinCsv([
    ['Full Name', 'Email', 'Club Role', 'Executive Title', 'Specialties', 'Status', 'System Role', 'Account Active', 'Password Reset Required', 'Joined At', 'Department', 'Course', 'Phone'],
    ...members.map((member) => {
      const education = getPmacMemberEducation(member)

      return [
        member.fullName,
        member.email,
        member.clubRole,
        member.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle] : '',
        member.specialties.map((entry) => PMAC_SPECIALTY_LABELS[entry.specialty]).join(' | '),
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

function buildPmacActivityRow(entry: {
  createdAt: Date
  entityType: string
  entityId: string
  action: string
  actorName: string
  actorRole: string
  summary: string
  details: string | null
  changes: unknown
  archivedAt: Date | null
}) {
  return [
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
  ]
}

export async function* streamPmacActivityCsv(filters: PmacReportFilters = {}) {
  yield `${buildReportMetadataCsv('activity', filters)}\n`
  yield `${joinCsv([['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor Name', 'Actor Role', 'Summary', 'Details', 'Changes', 'Archived At']])}\n`

  if (!hasPmacV4Delegates()) {
    return
  }

  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)
  const where = {
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
    ...(subject?.type === 'PROJECT' ? { projectId: subject.id } : {}),
  }
  let cursor: string | undefined

  while (true) {
    const entries = await prisma.pmacActivityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    if (!entries.length) {
      return
    }

    yield `${joinCsv(entries.map(buildPmacActivityRow))}\n`
    cursor = entries.at(-1)?.id

    if (entries.length < 500) {
      return
    }
  }
}

const PMAC_EXPORT_BATCH_SIZE = 250

async function* paginateExportRows<T extends { id: string }>(
  loadPage: (cursor?: string) => Promise<T[]>,
) {
  let cursor: string | undefined

  while (true) {
    const rows = await loadPage(cursor)
    if (!rows.length) return

    yield rows
    cursor = rows.at(-1)?.id
    if (rows.length < PMAC_EXPORT_BATCH_SIZE) return
  }
}

async function* startPmacCsvStream(type: PmacReportType, filters: PmacReportFilters, header: unknown[]) {
  yield `${buildReportMetadataCsv(type, filters)}\n`
  yield `${joinCsv([header])}\n`
}

async function* streamPmacMembersCsv(filters: PmacReportFilters) {
  yield* startPmacCsvStream('members', filters, [
    'Full Name', 'Email', 'Club Role', 'Executive Title', 'Specialties', 'Status', 'System Role',
    'Account Active', 'Password Reset Required', 'Joined At', 'Department', 'Course', 'Phone',
  ])

  const where = getFilteredMemberWhere(filters)
  for await (const members of paginateExportRows((cursor) => prisma.pmacMember.findMany({
    where,
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      account: {
        select: {
          email: true,
          role: true,
          isActive: true,
          ...(hasUserSecurityFields() ? { mustChangePassword: true } : {}),
        },
      },
      specialties: { select: { specialty: true }, orderBy: { specialty: 'asc' } },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(members.map((member) => {
      const education = getPmacMemberEducation(member)
      return [
        member.fullName,
        member.email,
        member.clubRole,
        member.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle] : '',
        member.specialties.map((entry) => PMAC_SPECIALTY_LABELS[entry.specialty]).join(' | '),
        member.status,
        member.account?.role ?? '',
        member.account?.isActive ? 'Yes' : 'No',
        member.account?.mustChangePassword ? 'Yes' : 'No',
        member.joinedAt?.toISOString() ?? '',
        education.department,
        education.course,
        member.phone ?? '',
      ]
    }))}\n`
  }
}

async function* streamPmacEventsCsv(filters: PmacReportFilters) {
  const header = [
    'Title', 'Status', 'Source Type', 'Source Label', 'Source School', 'Source Documentation', 'Source Campus', 'Venue',
    'Starts At', 'Ends At', 'Created By', 'Creator Email', 'Approved By', 'Assignments', 'Attendance Records', 'Attachments',
  ]
  yield* startPmacCsvStream('events', filters, header)
  if (!hasPmacV4Delegates()) return

  const where = getFilteredEventWhere(filters)
  for await (const events of paginateExportRows((cursor) => prisma.pmacEvent.findMany({
    where,
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      createdBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true } },
      _count: { select: { assignments: true, attendance: true, attachments: true } },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(events.map((event) => [
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
    ]))}\n`
  }
}

async function* streamPmacProjectsCsv(filters: PmacReportFilters) {
  yield* startPmacCsvStream('projects', filters, [
    'Title', 'Branch', 'Status', 'Starts At', 'Target Date', 'Head', 'Team', 'Milestones Done', 'Milestones Total',
    'Milestone Details', 'Output Submitted', 'Output Summary', 'Links', 'Launched By', 'Launcher Email', 'Created At',
  ])
  if (!hasPmacV4Delegates()) return

  const where = getFilteredProjectWhere(filters)
  for await (const projects of paginateExportRows((cursor) => prisma.pmacProject.findMany({
    where,
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      launchedBy: { select: { name: true, email: true } },
      headMember: { select: { fullName: true } },
      memberAssignments: {
        include: { member: { select: { fullName: true } } },
        orderBy: { createdAt: 'asc' },
      },
      milestones: { select: { title: true, status: true, dueDate: true }, orderBy: { dueDate: 'asc' } },
      links: { select: { type: true, label: true, url: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(projects.map((project) => [
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
    ]))}\n`
  }
}

async function* streamPmacPollsCsv(filters: PmacReportFilters) {
  yield* startPmacCsvStream('polls', filters, [
    'Title', 'Type', 'Status', 'Results Visibility', 'Opens At', 'Closes At', 'Created By', 'Creator Email',
    'Linked Event', 'Votes Cast', 'Attachments',
  ])
  if (!hasPmacV4Delegates()) return

  const dateRange = getPmacReportDateRange(filters)
  const subject = getPmacReportSubject(filters)
  const where = {
    ...(hasStatus(PMAC_POLL_STATUSES, filters.status) ? { status: filters.status } : {}),
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...(subject?.type === 'EVENT' ? { linkedEventId: subject.id } : {}),
  }

  for await (const polls of paginateExportRows((cursor) => prisma.pmacPoll.findMany({
    where,
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      createdBy: { select: { name: true, email: true } },
      linkedEvent: { select: { title: true } },
      _count: { select: { votes: true, attachments: true } },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(polls.map((poll) => [
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
    ]))}\n`
  }
}

async function* streamPmacAttendanceCsv(filters: PmacReportFilters) {
  yield* startPmacCsvStream('attendance', filters, [
    'Event', 'Event Date', 'Member', 'Department', 'Course', 'Assigned Duties', 'Attendance Status', 'Notes',
    'Recorded By', 'Recorded At',
  ])
  if (!hasPmacV4Delegates()) return

  const where = getFilteredAttendanceWhere(filters)
  for await (const attendance of paginateExportRows((cursor) => prisma.pmacAttendance.findMany({
    where,
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      notes: true,
      recordedAt: true,
      event: {
        select: {
          title: true,
          startDateTime: true,
          assignments: { select: { memberId: true, assignmentRole: true } },
        },
      },
      member: {
        select: { id: true, fullName: true, department: true, course: true, courseOrDepartment: true },
      },
      recordedBy: { select: { name: true, email: true } },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(attendance.map((record) => {
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
    }))}\n`
  }
}

async function* streamPmacStaffingCsv(filters: PmacReportFilters) {
  yield* startPmacCsvStream('staffing', filters, [
    'Section', 'Label', 'Source/Role', 'Source Label', 'Starts At', 'Venue', 'Assignment Count',
    'Pending Responses', 'Missing Roles / Specialties', 'Assignment Details',
  ])

  const now = new Date()
  const soon = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1_000))
  const dateRange = getPmacReportDateRange(filters) ?? { gte: now, lte: soon }
  const subject = getPmacReportSubject(filters)

  for await (const events of paginateExportRows((cursor) => prisma.pmacEvent.findMany({
    where: {
      status: 'APPROVED',
      startDateTime: dateRange,
      ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
    },
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      assignments: { include: { member: { select: { fullName: true } } } },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(events.map((event) => {
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
    }))}\n`
  }

  for await (const members of paginateExportRows((cursor) => prisma.pmacMember.findMany({
    where: {
      status: 'ACTIVE',
      ...(filters.department ? { department: filters.department } : {}),
      ...(subject?.type === 'EVENT' ? { eventAssignments: { some: { eventId: subject.id } } } : {}),
    },
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      fullName: true,
      clubRole: true,
      executiveTitle: true,
      specialties: { select: { specialty: true }, orderBy: { specialty: 'asc' } },
      eventAssignments: {
        where: {
          event: {
            status: { in: ['APPROVED', 'COMPLETED'] },
            startDateTime: dateRange,
            ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
          },
        },
        select: {
          assignmentRole: true,
          event: { select: { title: true, startDateTime: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(members.map((member) => [
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
    ]))}\n`
  }
}

async function* streamPmacPerformanceCsv(filters: PmacReportFilters) {
  yield* startPmacCsvStream('performance', filters, [
    'Full Name', 'Club Role', 'Executive Title', 'Specialties', 'Upcoming Load', 'Recent Assignments',
    'Attendance Rate', 'Late/Absent Count', 'Recent Duty History', 'Attendance Notes',
  ])

  const now = new Date()
  const soon = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1_000))
  const attendanceWindow = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1_000))
  const dateRange = getPmacReportDateRange(filters) ?? { gte: attendanceWindow, lte: soon }
  const attendanceDateRange = getPmacReportDateRange(filters) ?? { gte: attendanceWindow }
  const subject = getPmacReportSubject(filters)

  for await (const members of paginateExportRows((cursor) => prisma.pmacMember.findMany({
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
      account: { is: { isActive: true } },
    },
    take: PMAC_EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      fullName: true,
      clubRole: true,
      executiveTitle: true,
      specialties: { select: { specialty: true }, orderBy: { specialty: 'asc' } },
      eventAssignments: {
        where: {
          event: {
            status: { in: ['APPROVED', 'COMPLETED'] },
            startDateTime: dateRange,
            ...(subject?.type === 'EVENT' ? { id: subject.id } : {}),
          },
        },
        select: {
          assignmentRole: true,
          event: { select: { title: true, startDateTime: true } },
        },
      },
      attendanceRecords: {
        where: {
          recordedAt: attendanceDateRange,
          ...(subject?.type === 'EVENT' ? { eventId: subject.id } : {}),
        },
        select: { status: true, event: { select: { title: true } } },
      },
    },
    orderBy: { id: 'asc' },
  }))) {
    yield `${joinCsv(members.map((member) => {
      const upcomingLoad = member.eventAssignments.filter((assignment) => assignment.event.startDateTime >= now).length
      const reliableAttendance = member.attendanceRecords.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').length
      const attendanceRate = member.attendanceRecords.length
        ? Math.round((reliableAttendance / member.attendanceRecords.length) * 100)
        : 100
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
    }))}\n`
  }
}

export async function* streamPmacReportCsv(type: PmacReportType, filters: PmacReportFilters = {}) {
  switch (type) {
    case 'members':
      yield* streamPmacMembersCsv(filters)
      return
    case 'events':
      yield* streamPmacEventsCsv(filters)
      return
    case 'projects':
      yield* streamPmacProjectsCsv(filters)
      return
    case 'staffing':
      yield* streamPmacStaffingCsv(filters)
      return
    case 'performance':
      yield* streamPmacPerformanceCsv(filters)
      return
    case 'attendance':
      yield* streamPmacAttendanceCsv(filters)
      return
    case 'polls':
      yield* streamPmacPollsCsv(filters)
      return
    case 'activity':
      yield* streamPmacActivityCsv(filters)
  }
}

export const getCachedPmacReportSummary = unstable_cache(
  buildPmacReportSummary,
  ['pmac-report-summary-v1'],
  { revalidate: 60, tags: ['pmac-reports'] },
)

export const getCachedPmacReportFilterOptions = unstable_cache(
  buildPmacReportFilterOptions,
  ['pmac-report-filter-options-v1'],
  { revalidate: 300, tags: ['pmac-reports'] },
)

export const getCachedPmacReportCounts = unstable_cache(
  buildPmacReportCounts,
  ['pmac-report-counts-v1'],
  { revalidate: 60, tags: ['pmac-reports'] },
)

export const getCachedPmacReportAnalytics = unstable_cache(
  buildPmacReportAnalytics,
  ['pmac-report-analytics-v1'],
  { revalidate: 60, tags: ['pmac-reports'] },
)
