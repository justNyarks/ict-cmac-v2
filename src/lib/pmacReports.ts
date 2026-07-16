import { hasPmacV4Delegates, hasUserSecurityFields, prisma } from '@/lib/prisma'
import { calculatePmacReadinessScore, getRecommendedAssignmentRoles, PMAC_EXECUTIVE_TITLE_LABELS, PMAC_SPECIALTY_LABELS } from '@/lib/pmac'
import { getPmacMemberEducation } from '@/lib/pmacMembers'
import { sanitizeCsvCell } from '@/lib/sanitization'

export type PmacReportType = 'members' | 'events' | 'projects' | 'polls' | 'activity' | 'staffing' | 'performance'
export type PmacReportSummary = {
  members: number
  activeMembers: number
  events: number
  importedEvents: number
  openPolls: number
  pendingResponses: number
  understaffedUpcoming: number
  attendanceGaps: number
  attachments: number
  activity: number
  archivedActivity: number
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

function joinCsv(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')).join('\n')
}

export async function buildPmacMembersCsv() {
  const members = await prisma.pmacMember.findMany({
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

export async function buildPmacEventsCsv() {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Title', 'Status', 'Venue', 'Starts At', 'Ends At', 'Created By', 'Creator Email', 'Approved By', 'Assignments', 'Attendance Records', 'Attachments'],
    ])
  }

  const events = await prisma.pmacEvent.findMany({
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

export async function buildPmacProjectsCsv() {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Title', 'Branch', 'Status', 'Starts At', 'Target Date', 'Head', 'Team', 'Milestones Done', 'Milestones Total', 'Output Submitted', 'Links', 'Launched By', 'Created At'],
    ])
  }

  const projects = await prisma.pmacProject.findMany({
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

export async function buildPmacStaffingCsv() {
  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))

  const [upcomingEvents, memberWorkloads] = await Promise.all([
    prisma.pmacEvent.findMany({
      where: {
        status: 'APPROVED',
        startDateTime: {
          gte: now,
          lte: soon,
        },
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
                gte: now,
                lte: soon,
              },
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

export async function buildPmacPollsCsv() {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Title', 'Type', 'Status', 'Results Visibility', 'Opens At', 'Closes At', 'Created By', 'Creator Email', 'Linked Event', 'Votes Cast', 'Attachments'],
    ])
  }

  const polls = await prisma.pmacPoll.findMany({
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

export async function buildPmacPerformanceCsv() {
  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const attendanceWindow = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 90))

  const members = await prisma.pmacMember.findMany({
    where: {
      status: 'ACTIVE',
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
              gte: attendanceWindow,
              lte: soon,
            },
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
            gte: attendanceWindow,
          },
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

export async function buildPmacActivityCsv() {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor Name', 'Actor Role', 'Summary', 'Details', 'Changes', 'Archived At'],
    ])
  }

  const entries = await prisma.pmacActivityLog.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  })

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
    attachments,
    activity,
    archivedActivity,
    pendingResponses,
    upcomingEvents,
    recentCompletedEvents,
    activeMemberPerformance,
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
    hasPmacV4Delegates() ? prisma.pmacAttachment.count() : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacActivityLog.count() : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacActivityLog.count({ where: { archivedAt: { not: null } } }) : Promise.resolve(0),
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
        eventAssignments: {
          where: {
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
            event: {
              select: {
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
  const reliableMembers = activeMemberPerformance.filter((member) => {
    if (!member.attendanceRecords.length) {
      return true
    }
    const reliableRate = member.attendanceRecords.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').length / member.attendanceRecords.length
    return reliableRate >= 0.85
  }).length
  const overloadedMembers = activeMemberPerformance.filter((member) => (
    member.eventAssignments.filter((assignment) => assignment.event.startDateTime >= now).length >= 4
  )).length

  return {
    members,
    activeMembers,
    events,
    importedEvents,
    openPolls,
    pendingResponses,
    understaffedUpcoming,
    attendanceGaps,
    attachments,
    activity,
    archivedActivity,
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

export async function buildPmacReportCsv(type: PmacReportType) {
  switch (type) {
    case 'members':
      return buildPmacMembersCsv()
    case 'events':
      return buildPmacEventsCsv()
    case 'projects':
      return buildPmacProjectsCsv()
    case 'polls':
      return buildPmacPollsCsv()
    case 'staffing':
      return buildPmacStaffingCsv()
    case 'activity':
      return buildPmacActivityCsv()
    case 'performance':
      return buildPmacPerformanceCsv()
  }
}
