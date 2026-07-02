import { hasPmacV4Delegates, hasUserSecurityFields, prisma } from '@/lib/prisma'
import { sanitizeCsvCell } from '@/lib/sanitization'

export type PmacReportType = 'members' | 'events' | 'polls' | 'activity'

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
    },
    orderBy: [
      { clubRole: 'asc' },
      { fullName: 'asc' },
    ],
  })

  return joinCsv([
    ['Full Name', 'Email', 'Club Role', 'Status', 'System Role', 'Account Active', 'Password Reset Required', 'Joined At', 'Course / Department', 'Phone'],
    ...members.map((member) => [
      member.fullName,
      member.email,
      member.clubRole,
      member.status,
      member.account?.role ?? '',
      member.account?.isActive ? 'Yes' : 'No',
      member.account?.mustChangePassword ? 'Yes' : 'No',
      member.joinedAt?.toISOString() ?? '',
      member.courseOrDepartment ?? '',
      member.phone ?? '',
    ]),
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
    ['Title', 'Status', 'Venue', 'Starts At', 'Ends At', 'Created By', 'Creator Email', 'Approved By', 'Assignments', 'Attendance Records', 'Attachments'],
    ...events.map((event) => [
      event.title,
      event.status,
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

export async function buildPmacActivityCsv() {
  if (!hasPmacV4Delegates()) {
    return joinCsv([
      ['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor Name', 'Actor Role', 'Summary', 'Details'],
    ])
  }

  const entries = await prisma.pmacActivityLog.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 500,
  })

  return joinCsv([
    ['Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor Name', 'Actor Role', 'Summary', 'Details'],
    ...entries.map((entry) => [
      entry.createdAt.toISOString(),
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.actorName,
      entry.actorRole,
      entry.summary,
      entry.details ?? '',
    ]),
  ])
}

export async function buildPmacReportCsv(type: PmacReportType) {
  switch (type) {
    case 'members':
      return buildPmacMembersCsv()
    case 'events':
      return buildPmacEventsCsv()
    case 'polls':
      return buildPmacPollsCsv()
    case 'activity':
      return buildPmacActivityCsv()
  }
}
