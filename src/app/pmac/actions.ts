'use server'

import type { Prisma } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import {
  PMAC_ASSIGNMENT_RESPONDER_ROLES,
  PMAC_ATTENDANCE_MANAGER_ROLES,
  PMAC_ATTENDANCE_STATUSES,
  PMAC_EVENT_CREATOR_ROLES,
  PMAC_EVENT_DUTY_ROLES,
  PMAC_EVENT_MANAGER_ROLES,
  PMAC_EVENT_STATUSES,
  PMAC_OPERATIONAL_ROLES,
  PMAC_OVERSIGHT_ROLES,
  PMAC_POLL_CREATOR_ROLES,
  PMAC_POLL_MANAGER_ROLES,
  PMAC_POLL_MONITOR_ROLES,
  PMAC_POLL_RESULTS_VISIBILITY,
  PMAC_POLL_STATUSES,
  PMAC_POLL_TYPES,
  PMAC_POLL_VOTER_ROLES,
  PMAC_STAFFING_MANAGER_ROLES,
  PMAC_VOTE_CHOICES,
} from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { revalidatePmacViews } from '@/lib/pmacRevalidation'
import { assertActionAccess } from '@/lib/security'
import { sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'
import type { Role } from '@/types'

type PmacEventStatus = (typeof PMAC_EVENT_STATUSES)[number]
type PmacEventDutyRole = (typeof PMAC_EVENT_DUTY_ROLES)[number]
type PmacAttendanceStatus = (typeof PMAC_ATTENDANCE_STATUSES)[number]
type PmacPollType = (typeof PMAC_POLL_TYPES)[number]
type PmacPollStatus = (typeof PMAC_POLL_STATUSES)[number]
type PmacPollResultsVisibility = (typeof PMAC_POLL_RESULTS_VISIBILITY)[number]
type PmacVoteChoice = (typeof PMAC_VOTE_CHOICES)[number]
type PmacAllowedRole = (typeof PMAC_OPERATIONAL_ROLES)[number] | (typeof PMAC_OVERSIGHT_ROLES)[number]

type PmacEventPayload = {
  eventId?: string
  title: string
  description?: string
  venue: string
  startDateTime: string
  endDateTime: string
}

type PmacAssignmentInput = {
  memberId: string
  assignmentRole: PmacEventDutyRole
  assignmentNotes?: string
}

type PmacAttendanceInput = {
  eventId: string
  memberId: string
  status: PmacAttendanceStatus
  notes?: string
}

type PmacPollPayload = {
  pollId?: string
  title: string
  description?: string
  type: PmacPollType
  opensAt?: string | null
  closesAt?: string | null
  linkedEventId?: string | null
  resultsVisibility: PmacPollResultsVisibility
}

type SessionUser = {
  id: string
  name?: string | null
  role: Role
  pmacMemberId: string | null
}

const PMAC_ALLOWED_ROLES = [...PMAC_OPERATIONAL_ROLES, ...PMAC_OVERSIGHT_ROLES] as const satisfies readonly Role[]

const PMAC_EVENT_LIST_SELECT = {
  id: true,
  title: true,
  venue: true,
  startDateTime: true,
  endDateTime: true,
  status: true,
  createdAt: true,
  submittedAt: true,
  approvedAt: true,
  completedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  _count: {
    select: {
      assignments: true,
      attendance: true,
    },
  },
} satisfies Prisma.PmacEventSelect

const PMAC_EVENT_WORKSPACE_INCLUDE_BASE = {
  createdBy: {
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
    },
  },
  assignments: {
    orderBy: [
      { assignmentRole: 'asc' },
      { member: { fullName: 'asc' } },
    ],
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
          clubRole: true,
          account: {
            select: {
              id: true,
              role: true,
              isActive: true,
            },
          },
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  },
  attendance: {
    orderBy: {
      member: {
        fullName: 'asc',
      },
    },
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
          clubRole: true,
        },
      },
      recordedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.PmacEventInclude

const PMAC_EVENT_WORKSPACE_INCLUDE_V4 = {
  attachments: {
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  },
  activityLogs: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 12,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.PmacEventInclude

const PMAC_POLL_WORKSPACE_INCLUDE_BASE = {
  createdBy: {
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
    },
  },
  linkedEvent: {
    select: {
      id: true,
      title: true,
      status: true,
      startDateTime: true,
      endDateTime: true,
    },
  },
  votes: {
    orderBy: {
      votedAt: 'asc',
    },
    include: {
      voter: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      voterMember: {
        select: {
          id: true,
          fullName: true,
          clubRole: true,
          status: true,
        },
      },
    },
  },
  _count: {
    select: {
      votes: true,
    },
  },
} satisfies Prisma.PmacPollInclude

const PMAC_POLL_WORKSPACE_INCLUDE_V4 = {
  attachments: {
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  },
  activityLogs: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 12,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.PmacPollInclude

function getPmacEventWorkspaceInclude(): Prisma.PmacEventInclude {
  if (!hasPmacV4Delegates()) {
    return PMAC_EVENT_WORKSPACE_INCLUDE_BASE
  }

  return {
    ...PMAC_EVENT_WORKSPACE_INCLUDE_BASE,
    ...PMAC_EVENT_WORKSPACE_INCLUDE_V4,
  }
}

function getPmacPollWorkspaceInclude(): Prisma.PmacPollInclude {
  if (!hasPmacV4Delegates()) {
    return PMAC_POLL_WORKSPACE_INCLUDE_BASE
  }

  return {
    ...PMAC_POLL_WORKSPACE_INCLUDE_BASE,
    ...PMAC_POLL_WORKSPACE_INCLUDE_V4,
  }
}

function isPmacV4RelationValidationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return [
    'Unknown field `attachments`',
    'Unknown field `activityLogs`',
    'PmacPollCountOutputType',
    'PmacEventCountOutputType',
  ].some(pattern => error.message.includes(pattern))
}

function isPmacAllowedRole(role?: string | null): role is PmacAllowedRole {
  return !!role && PMAC_ALLOWED_ROLES.includes(role as PmacAllowedRole)
}

function isPmacCreatorRole(role?: string | null): role is (typeof PMAC_EVENT_CREATOR_ROLES)[number] {
  return !!role && PMAC_EVENT_CREATOR_ROLES.includes(role as (typeof PMAC_EVENT_CREATOR_ROLES)[number])
}

function isPmacEventManagerRole(role?: string | null): role is (typeof PMAC_EVENT_MANAGER_ROLES)[number] {
  return !!role && PMAC_EVENT_MANAGER_ROLES.includes(role as (typeof PMAC_EVENT_MANAGER_ROLES)[number])
}

function isPmacStaffingManagerRole(role?: string | null): role is (typeof PMAC_STAFFING_MANAGER_ROLES)[number] {
  return !!role && PMAC_STAFFING_MANAGER_ROLES.includes(role as (typeof PMAC_STAFFING_MANAGER_ROLES)[number])
}

function isPmacAttendanceManagerRole(role?: string | null): role is (typeof PMAC_ATTENDANCE_MANAGER_ROLES)[number] {
  return !!role && PMAC_ATTENDANCE_MANAGER_ROLES.includes(role as (typeof PMAC_ATTENDANCE_MANAGER_ROLES)[number])
}

function isPmacAssignmentResponderRole(role?: string | null): role is (typeof PMAC_ASSIGNMENT_RESPONDER_ROLES)[number] {
  return !!role && PMAC_ASSIGNMENT_RESPONDER_ROLES.includes(role as (typeof PMAC_ASSIGNMENT_RESPONDER_ROLES)[number])
}

function isPmacPollManagerRole(role?: string | null): role is (typeof PMAC_POLL_MANAGER_ROLES)[number] {
  return !!role && PMAC_POLL_MANAGER_ROLES.includes(role as (typeof PMAC_POLL_MANAGER_ROLES)[number])
}

function isPmacPollMonitorRole(role?: string | null): role is (typeof PMAC_POLL_MONITOR_ROLES)[number] {
  return !!role && PMAC_POLL_MONITOR_ROLES.includes(role as (typeof PMAC_POLL_MONITOR_ROLES)[number])
}

function isPmacPollVoterRole(role?: string | null): role is (typeof PMAC_POLL_VOTER_ROLES)[number] {
  return !!role && PMAC_POLL_VOTER_ROLES.includes(role as (typeof PMAC_POLL_VOTER_ROLES)[number])
}

function isCoordinatorRole(role?: string | null): role is 'CMAC_COORDINATOR' {
  return role === 'CMAC_COORDINATOR'
}

function parseDateTime(value: string, fieldName: string) {
  const normalized = sanitizeSingleLineText(value, {
    fieldName,
    maxLength: 50,
    required: true,
  })
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid.`)
  }
  return parsed
}

function parseOptionalDateTime(value: string | null | undefined, fieldName: string) {
  if (!value) {
    return null
  }

  return parseDateTime(value, fieldName)
}

function ensureEventPayload(payload: PmacEventPayload) {
  const title = sanitizeSingleLineText(payload.title, {
    fieldName: 'Event title',
    maxLength: 191,
    required: true,
  })
  const description = sanitizeMultilineText(payload.description, {
    fieldName: 'Event description',
    maxLength: 5000,
  })
  const venue = sanitizeSingleLineText(payload.venue, {
    fieldName: 'Venue',
    maxLength: 191,
    required: true,
  })
  const startDateTime = parseDateTime(payload.startDateTime, 'Start date and time')
  const endDateTime = parseDateTime(payload.endDateTime, 'End date and time')

  if (endDateTime <= startDateTime) {
    throw new Error('End date and time must be after the start date and time.')
  }

  return {
    title,
    description: description || null,
    venue,
    startDateTime,
    endDateTime,
  }
}

function ensurePollPayload(payload: PmacPollPayload) {
  const title = sanitizeSingleLineText(payload.title, {
    fieldName: 'Poll title',
    maxLength: 191,
    required: true,
  })
  const description = sanitizeMultilineText(payload.description, {
    fieldName: 'Poll description',
    maxLength: 5000,
  })
  if (!PMAC_POLL_TYPES.includes(payload.type)) {
    throw new Error('Please choose a valid poll type.')
  }
  if (!PMAC_POLL_RESULTS_VISIBILITY.includes(payload.resultsVisibility)) {
    throw new Error('Please choose a valid results visibility setting.')
  }

  const opensAt = parseOptionalDateTime(payload.opensAt, 'Open date and time')
  const closesAt = parseOptionalDateTime(payload.closesAt, 'Close date and time')

  if (opensAt && closesAt && closesAt <= opensAt) {
    throw new Error('Close date and time must be after the open date and time.')
  }

  const linkedEventId = sanitizeSingleLineText(payload.linkedEventId, {
    fieldName: 'Linked event ID',
    maxLength: 191,
  })

  return {
    title,
    description: description || null,
    type: payload.type,
    opensAt,
    closesAt,
    linkedEventId: linkedEventId || null,
    resultsVisibility: payload.resultsVisibility,
  }
}

function isPollOpenForVoting(
  poll: Pick<Prisma.PmacPollUncheckedCreateInput, 'status' | 'opensAt' | 'closesAt'>,
  now = new Date()
) {
  if (poll.status !== 'OPEN') {
    return false
  }

  if (poll.opensAt && poll.opensAt > now) {
    return false
  }

  if (poll.closesAt && poll.closesAt < now) {
    return false
  }

  return true
}

function isPollClosedForResults(
  poll: Pick<Prisma.PmacPollUncheckedCreateInput, 'status' | 'closesAt'>,
  now = new Date()
) {
  return poll.status === 'CLOSED' || poll.status === 'ARCHIVED' || (!!poll.closesAt && poll.closesAt <= now)
}

function canViewPollResults(
  poll: Pick<Prisma.PmacPollUncheckedCreateInput, 'status' | 'closesAt' | 'resultsVisibility'>,
  now = new Date()
) {
  return poll.resultsVisibility === 'IMMEDIATE' || isPollClosedForResults(poll, now)
}

function getPmacEventWhere(user: SessionUser): Prisma.PmacEventWhereInput {
  if (isCoordinatorRole(user.role)) {
    return {}
  }

  if (isPmacEventManagerRole(user.role) || user.role === 'PMAC_SECRETARY') {
    return {}
  }

  if (!user.pmacMemberId) {
    return { id: '__missing_member__' }
  }

  return {
    assignments: {
      some: {
        memberId: user.pmacMemberId,
      },
    },
  }
}

function getPmacCalendarWhere(user: SessionUser): Prisma.PmacEventWhereInput {
  if (isCoordinatorRole(user.role)) {
    return {
      status: {
        in: ['APPROVED', 'COMPLETED'],
      },
    }
  }

  if (isPmacEventManagerRole(user.role) || user.role === 'PMAC_SECRETARY') {
    return {
      status: {
        in: ['APPROVED', 'COMPLETED'],
      },
    }
  }

  if (!user.pmacMemberId) {
    return { id: '__missing_member__' }
  }

  return {
    status: {
      in: ['APPROVED', 'COMPLETED'],
    },
    assignments: {
      some: {
        memberId: user.pmacMemberId,
      },
    },
  }
}

async function getViewerSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isPmacAllowedRole(session.user.role)) {
    return null
  }
  if (isCoordinatorRole(session.user.role)) {
    return assertActionAccess(['CMAC_COORDINATOR'])
  }
  return session
}

async function assertPmacActionSession(allowedRoles: readonly Role[]) {
  const session = await assertActionAccess(allowedRoles, {
    zeroTrust: allowedRoles.includes('CMAC_COORDINATOR'),
  })

  if (!isCoordinatorRole(session.user.role) && !session.user.pmacMemberId) {
    throw new Error('PMAC member profile is missing for this account.')
  }

  return session
}

function getActivityActor(user: SessionUser) {
  return {
    actorId: user.id,
    actorName: sanitizeSingleLineText(user.name, {
      fieldName: 'Actor name',
      maxLength: 191,
    }) || 'Unknown PMAC user',
    actorRole: user.role,
  }
}

async function findPmacEventForUser(eventId: string, user: SessionUser): Promise<any> {
  try {
    return await prisma.pmacEvent.findFirst({
      where: {
        id: eventId,
        ...getPmacEventWhere(user),
      },
      include: getPmacEventWorkspaceInclude(),
    })
  } catch (error) {
    if (!isPmacV4RelationValidationError(error)) {
      throw error
    }

    return prisma.pmacEvent.findFirst({
      where: {
        id: eventId,
        ...getPmacEventWhere(user),
      },
      include: PMAC_EVENT_WORKSPACE_INCLUDE_BASE,
    })
  }
}

function buildWorkspacePermissions(user: SessionUser, event: Awaited<ReturnType<typeof findPmacEventForUser>>) {
  const canEdit = !!event && isPmacEventManagerRole(user.role) && (event.status === 'DRAFT' || event.status === 'REJECTED')
  const canSubmit = !!event && isPmacCreatorRole(user.role) && (event.status === 'DRAFT' || event.status === 'REJECTED')
  const canApprove = !!event && isCoordinatorRole(user.role) && event.status === 'PENDING_APPROVAL'
  const canReject = canApprove
  const canManageAssignments = !!event && isPmacStaffingManagerRole(user.role) && (event.status === 'APPROVED' || event.status === 'COMPLETED')
  const canRespond = !!event && isPmacAssignmentResponderRole(user.role)
  const canRecordAttendance = !!event && isPmacAttendanceManagerRole(user.role) && (event.status === 'APPROVED' || event.status === 'COMPLETED')
  const canComplete = !!event && isPmacStaffingManagerRole(user.role) && event.status === 'APPROVED'

  return {
    canEdit,
    canSubmit,
    canApprove,
    canReject,
    canManageAssignments,
    canRespond,
    canRecordAttendance,
    canComplete,
  }
}

async function countEligiblePmacVoters() {
  return prisma.user.count({
    where: {
      role: {
        in: [...PMAC_POLL_VOTER_ROLES],
      },
      isActive: true,
      pmacMemberId: {
        not: null,
      },
      pmacMember: {
        is: {
          status: 'ACTIVE',
        },
      },
    },
  })
}

function getPmacPollWhere(user: SessionUser): Prisma.PmacPollWhereInput {
  if (isCoordinatorRole(user.role) || isPmacPollManagerRole(user.role) || isPmacPollMonitorRole(user.role)) {
    return {}
  }

  return {
    status: {
      in: ['OPEN', 'CLOSED', 'ARCHIVED'],
    },
  }
}

async function findPmacPollForUser(pollId: string, user: SessionUser): Promise<any> {
  try {
    return await prisma.pmacPoll.findFirst({
      where: { id: pollId, ...getPmacPollWhere(user) },
      include: getPmacPollWorkspaceInclude(),
    })
  } catch (error) {
    if (!isPmacV4RelationValidationError(error)) {
      throw error
    }

    return prisma.pmacPoll.findFirst({
      where: { id: pollId, ...getPmacPollWhere(user) },
      include: PMAC_POLL_WORKSPACE_INCLUDE_BASE,
    })
  }
}

function buildPollWorkspacePermissions(
  user: SessionUser,
  poll: Awaited<ReturnType<typeof findPmacPollForUser>>,
  viewerVote: { id: string } | null,
  now = new Date()
) {
  const canEdit = !!poll && isPmacPollManagerRole(user.role) && poll.status === 'DRAFT'
  const canOpen = !!poll && isPmacPollManagerRole(user.role) && poll.status === 'DRAFT'
  const canClose = !!poll && isPmacPollManagerRole(user.role) && poll.status === 'OPEN'
  const canArchive = !!poll && isPmacPollManagerRole(user.role) && poll.status !== 'ARCHIVED'
  const canVote = !!poll
    && isPmacPollVoterRole(user.role)
    && !!user.pmacMemberId
    && !viewerVote
    && isPollOpenForVoting(poll, now)
  const canMonitorParticipation = !!poll && (isCoordinatorRole(user.role) || isPmacPollMonitorRole(user.role))

  return {
    canEdit,
    canOpen,
    canClose,
    canArchive,
    canVote,
    canMonitorParticipation,
    canViewResults: !!poll && canViewPollResults(poll, now),
  }
}

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
          status: true,
        },
        orderBy: [
          { clubRole: 'asc' },
          { fullName: 'asc' },
        ],
      })
    : []

  const filteredAssignments = isPmacAssignmentResponderRole(session.user.role) && session.user.pmacMemberId
    ? event.assignments.filter((assignment: any) => assignment.memberId === session.user.pmacMemberId)
    : event.assignments

  const filteredAttendance = isPmacAssignmentResponderRole(session.user.role) && session.user.pmacMemberId
    ? event.attendance.filter((record: any) => record.memberId === session.user.pmacMemberId)
    : event.attendance

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

export async function getPmacAssignmentsBoard() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  const where: Prisma.PmacEventAssignmentWhereInput = isCoordinatorRole(session.user.role) || isPmacStaffingManagerRole(session.user.role)
    ? {}
    : session.user.pmacMemberId
      ? { memberId: session.user.pmacMemberId }
      : { id: '__missing_member__' }

  return prisma.pmacEventAssignment.findMany({
    where,
    include: {
      event: {
        select: {
          id: true,
          title: true,
          venue: true,
          startDateTime: true,
          endDateTime: true,
          status: true,
        },
      },
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          clubRole: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: [
      { event: { startDateTime: 'asc' } },
      { assignmentRole: 'asc' },
    ],
  })
}

export async function getPmacAttendanceBoard() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  if (!isCoordinatorRole(session.user.role) && !isPmacAttendanceManagerRole(session.user.role)) {
    return []
  }

  return prisma.pmacEvent.findMany({
    where: {
      status: {
        in: ['APPROVED', 'COMPLETED'],
      },
    },
    include: {
      attendance: {
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              clubRole: true,
              email: true,
            },
          },
          recordedBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          member: {
            fullName: 'asc',
          },
        },
      },
      assignments: {
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              clubRole: true,
              email: true,
            },
          },
        },
        orderBy: {
          member: {
            fullName: 'asc',
          },
        },
      },
    },
    orderBy: {
      startDateTime: 'asc',
    },
  })
}

export async function getPmacPolls() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  const [polls, totalEligibleVoters] = await Promise.all([
    prisma.pmacPoll.findMany({
      where: getPmacPollWhere(session.user),
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        opensAt: true,
        closesAt: true,
        resultsVisibility: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        linkedEvent: {
          select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
          },
        },
        _count: {
          select: {
            votes: true,
          },
        },
        votes: {
          where: {
            voterId: session.user.id,
          },
          select: {
            id: true,
            selectedOption: true,
            votedAt: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
        { title: 'asc' },
      ],
    }),
    countEligiblePmacVoters(),
  ])

  const now = new Date()

  return polls.map((poll) => {
    const viewerVote = poll.votes[0] ?? null
    const votesCast = poll._count.votes

    return {
      ...poll,
      viewerVote,
      votesCast,
      totalEligibleVoters,
      participationRate: totalEligibleVoters ? Math.round((votesCast / totalEligibleVoters) * 100) : 0,
      isVotingOpen: isPollOpenForVoting(poll, now),
      resultsVisible: canViewPollResults(poll, now),
      canVote: isPmacPollVoterRole(session.user.role) && !!session.user.pmacMemberId && !viewerVote && isPollOpenForVoting(poll, now),
    }
  })
}

export async function getPmacPollWorkspace(pollId: string) {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return null
  }

  const sanitizedId = sanitizeSingleLineText(pollId, {
    fieldName: 'Poll ID',
    maxLength: 191,
    required: true,
  })

  const poll = await findPmacPollForUser(sanitizedId, session.user)
  if (!poll) {
    return null
  }

  const now = new Date()
  const viewerVote = poll.votes.find((vote: any) => vote.voterId === session.user.id) ?? null
  const permissions = buildPollWorkspacePermissions(session.user, poll, viewerVote, now)

  const [totalEligibleVoters, linkableEvents] = await Promise.all([
    countEligiblePmacVoters(),
    permissions.canEdit
      ? prisma.pmacEvent.findMany({
          select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
          },
          orderBy: [
            { startDateTime: 'desc' },
            { title: 'asc' },
          ],
        })
      : Promise.resolve([]),
  ])

  const voteSummary = PMAC_VOTE_CHOICES.reduce((summary, choice) => {
    summary[choice] = poll.votes.filter((vote: any) => vote.selectedOption === choice).length
    return summary
  }, {} as Record<PmacVoteChoice, number>)

  return {
    poll: {
      ...poll,
      attachments: 'attachments' in poll && Array.isArray(poll.attachments) ? poll.attachments : [],
      activityLogs: 'activityLogs' in poll && Array.isArray(poll.activityLogs) ? poll.activityLogs : [],
      votes: permissions.canViewResults ? poll.votes : [],
    },
    voteSummary: permissions.canViewResults ? voteSummary : null,
    metrics: {
      totalEligibleVoters,
      totalVotesCast: poll._count.votes,
      participationRate: totalEligibleVoters ? Math.round((poll._count.votes / totalEligibleVoters) * 100) : 0,
      isVotingOpen: isPollOpenForVoting(poll, now),
      resultsVisible: permissions.canViewResults,
    },
    viewerRole: session.user.role,
    viewerMemberId: session.user.pmacMemberId,
    viewerVote,
    permissions,
    linkableEvents,
  }
}

export async function createPmacPoll(payload: PmacPollPayload) {
  try {
    const session = await assertPmacActionSession(PMAC_POLL_CREATOR_ROLES)
    const data = ensurePollPayload(payload)

    if (data.linkedEventId) {
      const linkedEvent = await prisma.pmacEvent.findUnique({
        where: { id: data.linkedEventId },
        select: { id: true },
      })

      if (!linkedEvent) {
        return { success: false, error: 'Linked PMAC event was not found.' }
      }
    }

    const poll = await prisma.$transaction(async (tx) => {
      const createdPoll = await tx.pmacPoll.create({
        data: {
          ...data,
          createdById: session.user.id,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: createdPoll.id,
        pollId: createdPoll.id,
        ...getActivityActor(session.user),
        action: 'POLL_CREATED',
        summary: `Created PMAC poll "${createdPoll.title}".`,
        details: createdPoll.description,
      })

      return createdPoll
    })

    revalidatePmacViews([`/pmac/polls/${poll.id}`])
    return { success: true, pollId: poll.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create PMAC poll.' }
  }
}

export async function updatePmacPoll(payload: PmacPollPayload) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const pollId = sanitizeSingleLineText(payload.pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })
    const data = ensurePollPayload(payload)

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: pollId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status !== 'DRAFT') {
      return { success: false, error: 'Only draft polls can be edited.' }
    }

    if (data.linkedEventId) {
      const linkedEvent = await prisma.pmacEvent.findUnique({
        where: { id: data.linkedEventId },
        select: { id: true },
      })

      if (!linkedEvent) {
        return { success: false, error: 'Linked PMAC event was not found.' }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: pollId },
        data,
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: pollId,
        pollId,
        ...getActivityActor(session.user),
        action: 'POLL_UPDATED',
        summary: `Updated draft PMAC poll "${data.title}".`,
        details: data.description,
      })
    })

    revalidatePmacViews([`/pmac/polls/${pollId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update PMAC poll.' }
  }
}

export async function openPmacPoll(pollId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
        opensAt: true,
        closesAt: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status !== 'DRAFT') {
      return { success: false, error: 'Only draft polls can be opened.' }
    }

    if (poll.closesAt && poll.closesAt <= new Date()) {
      return { success: false, error: 'This poll has already passed its close time. Update the schedule before opening it.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: sanitizedId },
        data: {
          status: 'OPEN',
          opensAt: poll.opensAt ?? new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'POLL_OPENED',
        summary: 'Opened a PMAC poll for voting.',
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to open PMAC poll.' }
  }
}

export async function closePmacPoll(pollId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status !== 'OPEN') {
      return { success: false, error: 'Only open polls can be closed.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: sanitizedId },
        data: {
          status: 'CLOSED',
          closesAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'POLL_CLOSED',
        summary: 'Closed a PMAC poll.',
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to close PMAC poll.' }
  }
}

export async function archivePmacPoll(pollId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status === 'ARCHIVED') {
      return { success: false, error: 'This poll is already archived.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: sanitizedId },
        data: {
          status: 'ARCHIVED',
          ...(poll.status === 'OPEN' ? { closesAt: new Date() } : {}),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'POLL_ARCHIVED',
        summary: 'Archived a PMAC poll.',
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to archive PMAC poll.' }
  }
}

export async function castPmacVote(pollId: string, selectedOption: PmacVoteChoice) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE', 'PMAC_MEMBER'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    if (!PMAC_VOTE_CHOICES.includes(selectedOption)) {
      return { success: false, error: 'Please choose a valid vote option.' }
    }

    const voter = await prisma.user.findFirst({
      where: {
        id: session.user.id,
        role: {
          in: [...PMAC_POLL_VOTER_ROLES],
        },
        isActive: true,
        pmacMember: {
          is: {
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        pmacMemberId: true,
      },
    })

    if (!voter?.pmacMemberId) {
      return { success: false, error: 'Your PMAC membership is not eligible for voting.' }
    }

    const voterMemberId = voter.pmacMemberId

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
        opensAt: true,
        closesAt: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (!isPollOpenForVoting(poll)) {
      return { success: false, error: 'Voting is only available while the poll is open.' }
    }

    const existingVote = await prisma.pmacVote.findFirst({
      where: {
        pollId: sanitizedId,
        voterId: voter.id,
      },
      select: {
        id: true,
      },
    })

    if (existingVote) {
      return { success: false, error: 'You have already voted in this poll.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacVote.create({
        data: {
          pollId: sanitizedId,
          voterId: voter.id,
          voterMemberId,
          selectedOption,
          votedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'VOTE_CAST',
        summary: `Recorded a ${selectedOption.toLowerCase()} vote in a PMAC poll.`,
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit PMAC vote.' }
  }
}

export async function createPmacEvent(payload: PmacEventPayload) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR'])
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
    const session = await assertPmacActionSession(['PMAC_DIRECTOR'])
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
        status: true,
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
        status: true,
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
        status: true,
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
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to complete PMAC event.' }
  }
}

export async function savePmacAssignments(eventId: string, assignments: PmacAssignmentInput[]) {
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
        status: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'APPROVED' && event.status !== 'COMPLETED') {
      return { success: false, error: 'Assignments can only be managed for approved or completed PMAC events.' }
    }

    const normalizedAssignments = assignments.map((assignment) => {
      const memberId = sanitizeSingleLineText(assignment.memberId, {
        fieldName: 'Member ID',
        maxLength: 191,
        required: true,
      })
      if (!PMAC_EVENT_DUTY_ROLES.includes(assignment.assignmentRole)) {
        throw new Error('Please choose a valid PMAC assignment role.')
      }
      const assignmentNotes = sanitizeMultilineText(assignment.assignmentNotes, {
        fieldName: 'Assignment notes',
        maxLength: 2000,
      })

      return {
        memberId,
        assignmentRole: assignment.assignmentRole,
        assignmentNotes: assignmentNotes || null,
      }
    })

    const assignmentKeys = normalizedAssignments.map(assignment => `${assignment.memberId}:${assignment.assignmentRole}`)
    if (new Set(assignmentKeys).size !== assignmentKeys.length) {
      return { success: false, error: 'Each PMAC member-duty combination can only be assigned once per event.' }
    }

    const memberIds = Array.from(new Set(normalizedAssignments.map(assignment => assignment.memberId)))
    const activeMembers = await prisma.pmacMember.findMany({
      where: {
        id: {
          in: memberIds,
        },
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
    })

    if (activeMembers.length !== memberIds.length) {
      return { success: false, error: 'All assigned PMAC members must be active.' }
    }

    const existingAssignments = await prisma.pmacEventAssignment.findMany({
      where: {
        eventId: sanitizedId,
      },
      select: {
        id: true,
        memberId: true,
        assignmentRole: true,
      },
    })

    const existingByKey = new Map(
      existingAssignments.map(assignment => [
        `${assignment.memberId}:${assignment.assignmentRole}`,
        assignment,
      ])
    )
    const nextKeys = new Set(normalizedAssignments.map(assignment => `${assignment.memberId}:${assignment.assignmentRole}`))

    await prisma.$transaction(async (tx) => {
      const deletions = existingAssignments
        .filter(assignment => !nextKeys.has(`${assignment.memberId}:${assignment.assignmentRole}`))
        .map(assignment => assignment.id)

      if (deletions.length) {
        await tx.pmacEventAssignment.deleteMany({
          where: {
            id: {
              in: deletions,
            },
          },
        })
      }

      for (const assignment of normalizedAssignments) {
        const key = `${assignment.memberId}:${assignment.assignmentRole}`
        const existingAssignment = existingByKey.get(key)

        if (existingAssignment) {
          await tx.pmacEventAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              assignmentNotes: assignment.assignmentNotes,
              assignedById: session.user.id,
            },
          })
          continue
        }

        await tx.pmacEventAssignment.create({
          data: {
            eventId: sanitizedId,
            memberId: assignment.memberId,
            assignmentRole: assignment.assignmentRole,
            assignmentNotes: assignment.assignmentNotes,
            assignedById: session.user.id,
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: sanitizedId,
        eventId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'ASSIGNMENTS_UPDATED',
        summary: `Updated PMAC staffing assignments for ${normalizedAssignments.length} duty slot(s).`,
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save PMAC assignments.' }
  }
}

export async function respondToPmacAssignment(assignmentId: string, response: 'YES' | 'NO') {
  try {
    const session = await assertPmacActionSession(['PMAC_EXECUTIVE', 'PMAC_MEMBER'])
    const sanitizedId = sanitizeSingleLineText(assignmentId, {
      fieldName: 'Assignment ID',
      maxLength: 191,
      required: true,
    })

    const assignment = await prisma.pmacEventAssignment.findUnique({
      where: { id: sanitizedId },
      include: {
        event: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    })

    if (!assignment || assignment.memberId !== session.user.pmacMemberId) {
      return { success: false, error: 'Assignment not found.' }
    }

    if (assignment.event.status !== 'APPROVED' && assignment.event.status !== 'COMPLETED') {
      return { success: false, error: 'Availability can only be updated after the PMAC event is approved.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacEventAssignment.update({
        where: { id: sanitizedId },
        data: {
          availabilityResponse: response,
          respondedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: assignment.event.id,
        eventId: assignment.event.id,
        memberId: assignment.memberId,
        ...getActivityActor(session.user),
        action: 'ASSIGNMENT_RESPONSE_UPDATED',
        summary: `Updated assignment availability to ${response}.`,
      })
    })

    revalidatePmacViews([`/pmac/events/${assignment.event.id}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update availability response.' }
  }
}

export async function savePmacAttendance(records: PmacAttendanceInput[]) {
  try {
    const session = await assertPmacActionSession(['PMAC_SECRETARY'])

    const normalizedRecords = records.map((record) => {
      const eventId = sanitizeSingleLineText(record.eventId, {
        fieldName: 'Event ID',
        maxLength: 191,
        required: true,
      })
      const memberId = sanitizeSingleLineText(record.memberId, {
        fieldName: 'Member ID',
        maxLength: 191,
        required: true,
      })
      if (!PMAC_ATTENDANCE_STATUSES.includes(record.status)) {
        throw new Error('Please choose a valid attendance status.')
      }
      const notes = sanitizeMultilineText(record.notes, {
        fieldName: 'Attendance notes',
        maxLength: 2000,
      })

      return {
        eventId,
        memberId,
        status: record.status,
        notes: notes || null,
      }
    })

    const eventIds = Array.from(new Set(normalizedRecords.map(record => record.eventId)))
    const events = await prisma.pmacEvent.findMany({
      where: {
        id: {
          in: eventIds,
        },
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (events.length !== eventIds.length || events.some(event => event.status !== 'APPROVED' && event.status !== 'COMPLETED')) {
      return { success: false, error: 'Attendance can only be recorded for approved or completed PMAC events.' }
    }

    await prisma.$transaction(async (tx) => {
      for (const record of normalizedRecords) {
        await tx.pmacAttendance.upsert({
          where: {
            eventId_memberId: {
              eventId: record.eventId,
              memberId: record.memberId,
            },
          },
          update: {
            status: record.status,
            notes: record.notes,
            recordedById: session.user.id,
            recordedAt: new Date(),
          },
          create: {
            eventId: record.eventId,
            memberId: record.memberId,
            status: record.status,
            notes: record.notes,
            recordedById: session.user.id,
            recordedAt: new Date(),
          },
        })
      }

      for (const eventId of eventIds) {
        await recordPmacActivity(tx, {
          entityType: 'EVENT',
          entityId: eventId,
          eventId,
          ...getActivityActor(session.user),
          action: 'ATTENDANCE_UPDATED',
          summary: 'Updated PMAC attendance records.',
        })
      }
    })

    revalidatePmacViews(eventIds.map(eventId => `/pmac/events/${eventId}`))
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save attendance.' }
  }
}
