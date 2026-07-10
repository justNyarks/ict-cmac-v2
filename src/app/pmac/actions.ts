'use server'

import type { Prisma } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import {
  calculatePmacReadinessScore,
  getDutyRolesForSpecialties,
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_EXECUTIVE_BRANCH_SPECIALTY,
  getRecommendedAssignmentRoles,
  getPmacReadinessLabel,
  isPmacAssignmentResponderRole,
  isPmacAttendanceManagerRole,
  isPmacCreatorRole,
  isPmacEventManagerRole,
  isPmacPollManagerRole,
  isPmacPollMonitorRole,
  isPmacPollVoterRole,
  isPmacStaffingManagerRole,
  PMAC_ASSIGNMENT_TEMPLATES,
  PMAC_ATTENDANCE_STATUSES,
  PMAC_EVENT_DUTY_ROLES,
  PMAC_EVENT_DUTY_ROLE_LABELS,
  PMAC_OPERATIONAL_ROLES,
  PMAC_OVERSIGHT_ROLES,
  PMAC_POLL_CREATOR_ROLES,
  PMAC_POLL_RESULTS_VISIBILITY,
  PMAC_POLL_TYPES,
  PMAC_POLL_VOTER_ROLES,
  PMAC_EXECUTIVE_TITLES,
  PMAC_PROJECT_LAUNCHER_ROLES,
  PMAC_PROJECT_LINK_TYPES,
  PMAC_PROJECT_MILESTONE_STATUSES,
  PMAC_PROJECT_STATUSES,
  PMAC_SPECIALTY_LABELS,
  PMAC_VOTE_CHOICES,
  isPmacProjectLauncherRole,
} from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { getExecutiveBranchForUser, getPmacProjectWhere } from '@/lib/pmacProjects'
import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { revalidatePmacViews } from '@/lib/pmacRevalidation'
import { assertActionAccess } from '@/lib/security'
import { sanitizeAttachmentReference, sanitizeExternalHttpUrl, sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'
import type { DocumentationType, PmacClubRole, PmacExecutiveTitle, PmacProjectLinkType, PmacProjectMilestoneStatus, PmacProjectStatus, PmacSpecialty, Role } from '@/types'

type PmacEventDutyRole = (typeof PMAC_EVENT_DUTY_ROLES)[number]
type PmacAttendanceStatus = (typeof PMAC_ATTENDANCE_STATUSES)[number]
type PmacPollType = (typeof PMAC_POLL_TYPES)[number]
type PmacPollResultsVisibility = (typeof PMAC_POLL_RESULTS_VISIBILITY)[number]
type PmacVoteChoice = (typeof PMAC_VOTE_CHOICES)[number]
type PmacProjectStatusValue = (typeof PMAC_PROJECT_STATUSES)[number]
type PmacProjectMilestoneStatusValue = (typeof PMAC_PROJECT_MILESTONE_STATUSES)[number]
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

type PmacProjectPayload = {
  projectId?: string
  title: string
  summary?: string
  branch: PmacExecutiveTitle
  headMemberId?: string
  status?: PmacProjectStatus
  startDate: string
  targetDate: string
}

type PmacProjectMemberPayload = {
  projectId: string
  memberIds: string[]
}

type PmacProjectMilestonePayload = {
  projectId: string
  milestoneId?: string
  title: string
  dueDate: string
  status?: PmacProjectMilestoneStatus
  notes?: string
}

type PmacProjectOutputPayload = {
  projectId: string
  outputSummary: string
}

type PmacProjectLinkPayload = {
  projectId: string
  label: string
  url: string
  type: PmacProjectLinkType
}

type SessionUser = {
  id: string
  name?: string | null
  role: Role
  pmacMemberId: string | null
}

type StaffingFocusEvent = {
  id: string
  title: string
  venue: string
  startDateTime: Date
  sourceType: 'MANUAL' | 'CMAC_REQUEST'
  sourceDocumentationType: DocumentationType | null
  assignmentCount: number
  pendingResponses: number
  readinessScore: number
  staffingLabel: string
  missingRoles: readonly PmacEventDutyRole[]
}

type PmacWrapUpPayload = {
  deliveredOutputs?: string
  issuesEncountered?: string
  attachmentAuditNotes?: string
  wrapUpNotes?: string
}

type PmacExecutiveTagPayload = {
  memberId: string
  tags: string[]
}

const PMAC_ALLOWED_ROLES = [...PMAC_OPERATIONAL_ROLES, ...PMAC_OVERSIGHT_ROLES] as const satisfies readonly Role[]

const PMAC_EVENT_LIST_SELECT = {
  id: true,
  title: true,
  venue: true,
  startDateTime: true,
  endDateTime: true,
  status: true,
  sourceType: true,
  sourceSchool: true,
  sourceDocumentationType: true,
  sourceCampusType: true,
  createdBy: {
    select: {
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
      name: true,
      role: true,
    },
  },
  approvedBy: {
    select: {
      name: true,
      role: true,
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
          clubRole: true,
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

function isCoordinatorRole(role?: string | null): role is 'CMAC_COORDINATOR' {
  return role === 'CMAC_COORDINATOR'
}

function formatExecutiveTitle(value?: PmacExecutiveTitle | null) {
  return value ? PMAC_EXECUTIVE_TITLE_LABELS[value] : null
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
  if (isCoordinatorRole(user.role) || isPmacAllowedRole(user.role)) {
    return {
      status: {
        in: ['APPROVED', 'COMPLETED'],
      },
    }
  }

  return { id: '__missing_member__' }
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

function getMissingCoverageRoles(
  sourceDocumentationType: DocumentationType | null | undefined,
  assignments: Array<{ assignmentRole: PmacEventDutyRole }>
) {
  if (!sourceDocumentationType) {
    return [] as const
  }

  const recommendedRoles = getRecommendedAssignmentRoles(sourceDocumentationType)
  const assignedRoles = new Set(assignments.map((assignment) => assignment.assignmentRole))

  return recommendedRoles.filter((role) => !assignedRoles.has(role))
}

function getPreferredDutyRolesForMember(params: {
  clubRole: PmacClubRole
  specialties: readonly PmacSpecialty[]
}): readonly PmacEventDutyRole[] {
  const specialtyRoles = getDutyRolesForSpecialties(params.specialties)

  if (specialtyRoles.length) {
    return specialtyRoles
  }

  const { clubRole } = params
  switch (clubRole) {
    case 'DIRECTOR':
    case 'ASSISTANT_DIRECTOR':
    case 'EXECUTIVE':
      return ['ALL_AROUND', 'JOURNALIST']
    case 'SECRETARY':
      return ['JOURNALIST', 'GRAPHIC_DESIGNER']
    case 'MEMBER':
    default:
      return ['PHOTOGRAPHER', 'VIDEOGRAPHER', 'JOURNALIST', 'GRAPHIC_DESIGNER', 'ALL_AROUND']
  }
}

function buildWorkloadTier(upcomingAssignments: number) {
  if (upcomingAssignments >= 4) {
    return 'High'
  }
  if (upcomingAssignments >= 2) {
    return 'Moderate'
  }
  return 'Light'
}

function buildMemberSuggestionReason(params: {
  matchedRoles: readonly PmacEventDutyRole[]
  upcomingAssignments: number
  attendanceRate: number
}) {
  const reasons: string[] = []

  if (params.matchedRoles.length) {
    reasons.push(`recently covered ${params.matchedRoles.map((role) => PMAC_EVENT_DUTY_ROLE_LABELS[role]).join(', ')}`)
  }

  if (params.upcomingAssignments === 0) {
    reasons.push('currently has no other upcoming assignment')
  } else if (params.upcomingAssignments === 1) {
    reasons.push('has a light upcoming schedule')
  }

  if (params.attendanceRate >= 0.9) {
    reasons.push('has strong attendance reliability')
  } else if (params.attendanceRate >= 0.75) {
    reasons.push('has a solid recent attendance record')
  }

  return reasons.length ? reasons.join(' and ') : 'is available as flexible PMAC support'
}

function buildWrapUpFilledCount(event: {
  deliveredOutputs?: string | null
  issuesEncountered?: string | null
  attachmentAuditNotes?: string | null
  wrapUpNotes?: string | null
}) {
  return [
    event.deliveredOutputs,
    event.issuesEncountered,
    event.attachmentAuditNotes,
    event.wrapUpNotes,
  ].filter((value) => !!value && value.trim().length > 0).length
}

function buildAssignmentTemplateRows(sourceDocumentationType: DocumentationType | null | undefined) {
  return PMAC_ASSIGNMENT_TEMPLATES.filter((template) => (
    !sourceDocumentationType || template.documentationTypes.some((type) => type === sourceDocumentationType)
  ))
}

function buildAssignmentSuggestions(params: {
  sourceDocumentationType: DocumentationType | null | undefined
  assignedMemberIds: readonly string[]
  members: Array<{
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
  }>
}) {
  const relevantRoles = getRecommendedAssignmentRoles(params.sourceDocumentationType)
  const assignedMemberIds = new Set(params.assignedMemberIds)
  const now = Date.now()

  return params.members
    .filter((member) => !assignedMemberIds.has(member.id))
    .map((member) => {
      const roleHistory = new Set(member.eventAssignments.map((assignment) => assignment.assignmentRole))
      const preferredRoles = getPreferredDutyRolesForMember({
        clubRole: member.clubRole,
        specialties: member.specialties.map((entry) => entry.specialty),
      })
      const matchedRoles = relevantRoles.filter((role) => roleHistory.has(role) || preferredRoles.includes(role))
      const upcomingAssignments = member.eventAssignments.filter((assignment) => assignment.event.startDateTime.getTime() >= now).length
      const completedAttendance = member.attendanceRecords.length
      const reliableAttendance = member.attendanceRecords.filter((record) => (
        record.status === 'PRESENT' || record.status === 'LATE'
      )).length
      const attendanceRate = completedAttendance > 0 ? reliableAttendance / completedAttendance : 1
      const score = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            40
            + (matchedRoles.length * 14)
            + (attendanceRate * 20)
            + Math.max(0, 22 - (upcomingAssignments * 6))
          )
        )
      )

      return {
        memberId: member.id,
        fullName: member.fullName,
        clubRole: member.clubRole,
        executiveTitle: member.executiveTitle,
        specialties: member.specialties.map((entry) => entry.specialty),
        matchedRoles,
        upcomingAssignments,
        attendanceRate: Math.round(attendanceRate * 100),
        score,
        workloadTier: buildWorkloadTier(upcomingAssignments),
        reason: buildMemberSuggestionReason({
          matchedRoles,
          upcomingAssignments,
          attendanceRate,
        }),
      }
    })
    .sort((left, right) => (
      right.score - left.score
      || left.upcomingAssignments - right.upcomingAssignments
      || left.fullName.localeCompare(right.fullName)
    ))
    .slice(0, 8)
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

  const assignments = await prisma.pmacEventAssignment.findMany({
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

  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const attendanceWindow = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 90))
  const memberIds = Array.from(new Set(assignments.map((assignment) => assignment.memberId)))

  const memberInsights = memberIds.length
    ? await prisma.pmacMember.findMany({
        where: {
          id: {
            in: memberIds,
          },
        },
        select: {
          id: true,
          eventAssignments: {
            where: {
              eventId: {
                notIn: assignments.map((assignment) => assignment.eventId),
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
      })
    : []

  const insightMap = new Map(
    memberInsights.map((member) => {
      const upcomingLoad = member.eventAssignments.filter((assignment) => assignment.event.startDateTime >= now).length
      const attendanceCount = member.attendanceRecords.length
      const attendanceRate = attendanceCount
        ? Math.round(
            (member.attendanceRecords.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').length / attendanceCount) * 100
          )
        : 100

      return [member.id, {
        upcomingLoad,
        attendanceRate,
        workloadTier: buildWorkloadTier(upcomingLoad),
      }]
    })
  )

  return assignments.map((assignment) => ({
    ...assignment,
    memberInsights: insightMap.get(assignment.memberId) ?? {
      upcomingLoad: 0,
      attendanceRate: 100,
      workloadTier: 'Light',
    },
  }))
}

export async function getPmacExecutiveTagBoard() {
  noStore()

  const session = await getViewerSession()
  if (!session || session.user.role !== 'PMAC_EXECUTIVE' || !session.user.pmacMemberId) {
    return null
  }

  const viewer = await prisma.pmacMember.findUnique({
    where: { id: session.user.pmacMemberId },
    select: {
      id: true,
      fullName: true,
      executiveTitle: true,
      specialties: {
        select: {
          specialty: true,
        },
        orderBy: {
          specialty: 'asc',
        },
      },
    },
  })

  if (!viewer) {
    return null
  }

  const members = await prisma.pmacMember.findMany({
    where: {
      id: {
        not: viewer.id,
      },
      clubRole: 'MEMBER',
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
      receivedTags: {
        include: {
          assignedByMember: {
            select: {
              id: true,
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
      { fullName: 'asc' },
    ],
  })

  return {
    viewer,
    members,
  }
}

export async function savePmacExecutiveTags(payload: PmacExecutiveTagPayload) {
  try {
    const session = await assertPmacActionSession(['PMAC_EXECUTIVE'])
    const executiveMemberId = session.user.pmacMemberId as string
    const memberId = sanitizeSingleLineText(payload.memberId, {
      fieldName: 'Member ID',
      maxLength: 191,
      required: true,
    })

    if (memberId === executiveMemberId) {
      return { success: false, error: 'Executive heads cannot tag their own member profile.' }
    }

    const normalizedTags = Array.from(
      new Map(
        (payload.tags ?? [])
          .map((tag) => sanitizeSingleLineText(tag, {
            fieldName: 'Tag',
            maxLength: 64,
          }))
          .filter(Boolean)
          .map((tag) => [tag.toLowerCase(), tag])
      ).values()
    )

    const [viewer, member] = await Promise.all([
      prisma.pmacMember.findUnique({
        where: { id: executiveMemberId },
        select: {
          id: true,
          fullName: true,
          executiveTitle: true,
        },
      }),
      prisma.pmacMember.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          fullName: true,
          clubRole: true,
          status: true,
          account: {
            select: {
              isActive: true,
            },
          },
        },
      }),
    ])

    if (!viewer?.executiveTitle) {
      return { success: false, error: 'This executive account is missing a branch head title.' }
    }

    if (!member) {
      return { success: false, error: 'PMAC member not found.' }
    }

    if (member.clubRole !== 'MEMBER' || member.status !== 'ACTIVE' || !member.account?.isActive) {
      return { success: false, error: 'Executive tags can only be assigned to active PMAC members.' }
    }

    const existing = await prisma.pmacMemberTag.findMany({
      where: {
        memberId,
        assignedByMemberId: executiveMemberId,
      },
      select: {
        id: true,
        label: true,
      },
    })

    const nextTagSet = new Set(normalizedTags.map((tag) => tag.toLowerCase()))

    await prisma.$transaction(async (tx) => {
      const removeIds = existing
        .filter((tag) => !nextTagSet.has(tag.label.toLowerCase()))
        .map((tag) => tag.id)

      if (removeIds.length) {
        await tx.pmacMemberTag.deleteMany({
          where: {
            id: {
              in: removeIds,
            },
          },
        })
      }

      for (const label of normalizedTags) {
        await tx.pmacMemberTag.upsert({
          where: {
            memberId_assignedByMemberId_label: {
              memberId,
              assignedByMemberId: executiveMemberId,
              label,
            },
          },
          update: {},
          create: {
            memberId,
            assignedByMemberId: executiveMemberId,
            label,
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'MEMBER',
        entityId: member.id,
        memberId: member.id,
        ...getActivityActor(session.user),
        action: 'MEMBER_TAGS_UPDATED',
        summary: `Updated ${formatExecutiveTitle(viewer.executiveTitle) || 'executive'} tags for ${member.fullName}.`,
        details: normalizedTags.length
          ? `Current tags: ${normalizedTags.join(', ')}.`
          : 'All tags from this branch head were cleared.',
      })
    })

    revalidatePmacViews(['/pmac/tags', '/pmac/executive', '/pmac/member', '/pmac/members'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update executive tags.' }
  }
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
        fullName: true,
        specialties: {
          select: {
            specialty: true,
          },
        },
      },
    })

    if (activeMembers.length !== memberIds.length) {
      return { success: false, error: 'All assigned PMAC members must be active.' }
    }

    const activeMemberById = new Map(activeMembers.map(member => [member.id, member]))
    for (const assignment of normalizedAssignments) {
      const member = activeMemberById.get(assignment.memberId)
      const allowedRoles = getDutyRolesForSpecialties(member?.specialties.map(entry => entry.specialty) ?? [])

      if (!allowedRoles.includes(assignment.assignmentRole)) {
        return {
          success: false,
          error: `${member?.fullName || 'Selected member'} can only be assigned duties linked to their PMAC specialty.`,
        }
      }
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
    const overlappingAssignments = memberIds.length
      ? await prisma.pmacEventAssignment.findMany({
          where: {
            memberId: {
              in: memberIds,
            },
            eventId: {
              not: sanitizedId,
            },
            event: {
              status: {
                in: ['APPROVED', 'COMPLETED'],
              },
              startDateTime: {
                lt: event.endDateTime,
              },
              endDateTime: {
                gt: event.startDateTime,
              },
            },
          },
          select: {
            memberId: true,
            event: {
              select: {
                id: true,
                title: true,
                startDateTime: true,
                endDateTime: true,
              },
            },
          },
        })
      : []

    if (overlappingAssignments.length) {
      const memberNames = new Map(activeMembers.map((member) => [member.id, member.fullName]))
      const conflictMessages = overlappingAssignments.map((assignment) => (
        `${memberNames.get(assignment.memberId) || 'A PMAC member'} is already assigned to "${assignment.event.title}" during the same time window.`
      ))

      return {
        success: false,
        error: conflictMessages.join(' '),
      }
    }

    const warnings: string[] = []
    const assignedRoleSet = new Set(normalizedAssignments.map((assignment) => assignment.assignmentRole))
    const missingRoles = event.sourceDocumentationType
      ? getRecommendedAssignmentRoles(event.sourceDocumentationType).filter((role) => !assignedRoleSet.has(role))
      : []
    if (missingRoles.length) {
      warnings.push(`Recommended coverage roles still missing: ${missingRoles.join(', ')}.`)
    }

    const rolesPerMember = normalizedAssignments.reduce<Map<string, number>>((totals, assignment) => {
      totals.set(assignment.memberId, (totals.get(assignment.memberId) ?? 0) + 1)
      return totals
    }, new Map())

    const multiplyAssignedMembers = Array.from(rolesPerMember.entries()).filter(([, count]) => count > 1)
    if (multiplyAssignedMembers.length && activeMembers.length > rolesPerMember.size) {
      const memberNames = new Map(activeMembers.map((member) => [member.id, member.fullName]))
      warnings.push(`Workload is concentrated on ${multiplyAssignedMembers.map(([memberId]) => memberNames.get(memberId) || 'one member').join(', ')} while other active members remain unassigned.`)
    }

    const weekAfterEvent = new Date(event.startDateTime.getTime() + (1000 * 60 * 60 * 24 * 7))
    const surroundingAssignments = memberIds.length
      ? await prisma.pmacEventAssignment.findMany({
          where: {
            memberId: {
              in: memberIds,
            },
            eventId: {
              not: sanitizedId,
            },
            event: {
              startDateTime: {
                gte: event.startDateTime,
                lte: weekAfterEvent,
              },
              status: {
                in: ['APPROVED', 'COMPLETED'],
              },
            },
          },
          select: {
            memberId: true,
          },
        })
      : []

    const surroundingAssignmentCounts = surroundingAssignments.reduce<Map<string, number>>((totals, assignment) => {
      totals.set(assignment.memberId, (totals.get(assignment.memberId) ?? 0) + 1)
      return totals
    }, new Map())

    const highLoadMembers = activeMembers.filter((member) => (
      (surroundingAssignmentCounts.get(member.id) ?? 0) + (rolesPerMember.get(member.id) ?? 0) >= 4
    ))

    if (highLoadMembers.length) {
      warnings.push(`High upcoming workload detected for ${highLoadMembers.map((member) => member.fullName).join(', ')} within seven days of "${event.title}".`)
    }

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
    return { success: true, warnings }
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

function parseProjectDate(value: string, fieldName: string) {
  const sanitized = sanitizeSingleLineText(value, {
    fieldName,
    maxLength: 20,
    required: true,
  })
  const parsed = new Date(`${sanitized}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid.`)
  }

  return parsed
}

async function getPmacProjectPeopleOptions() {
  const [executiveHeads, assignableMembers] = await Promise.all([
    prisma.pmacMember.findMany({
      where: {
        status: 'ACTIVE',
        clubRole: 'EXECUTIVE',
        executiveTitle: {
          not: null,
        },
      },
      select: {
        id: true,
        fullName: true,
        executiveTitle: true,
        email: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    }),
    prisma.pmacMember.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        clubRole: true,
        executiveTitle: true,
        email: true,
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
    }),
  ])

  return { executiveHeads, assignableMembers }
}

function buildProjectHealth(project: {
  status: PmacProjectStatusValue
  targetDate: Date
  outputSubmittedAt?: Date | null
  milestones: Array<{
    dueDate: Date
    status: PmacProjectMilestoneStatusValue
  }>
}) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const soon = new Date(now)
  soon.setDate(soon.getDate() + 3)
  const incompleteMilestones = project.milestones.filter(milestone => milestone.status !== 'DONE')
  const completedCount = project.milestones.length - incompleteMilestones.length
  const nextMilestone = incompleteMilestones
    .slice()
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0] ?? null

  if (project.status === 'COMPLETED') {
    return {
      label: 'Completed',
      tone: 'emerald',
      progress: 100,
      nextDueAt: null as Date | null,
    }
  }

  if (project.status === 'ON_HOLD') {
    return {
      label: 'On hold',
      tone: 'amber',
      progress: project.milestones.length ? Math.round((completedCount / project.milestones.length) * 100) : 0,
      nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
    }
  }

  const hasBlocked = project.milestones.some(milestone => milestone.status === 'BLOCKED')
  const hasOverdueMilestone = incompleteMilestones.some(milestone => milestone.dueDate < now)
  const isPastTarget = project.targetDate < now
  const isDueSoon = incompleteMilestones.some(milestone => milestone.dueDate >= now && milestone.dueDate <= soon)
    || (project.targetDate >= now && project.targetDate <= soon)
  const progress = project.milestones.length ? Math.round((completedCount / project.milestones.length) * 100) : 0

  if (hasBlocked || hasOverdueMilestone || isPastTarget) {
    return {
      label: 'Needs attention',
      tone: 'red',
      progress,
      nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
    }
  }

  if (isDueSoon) {
    return {
      label: 'Due soon',
      tone: 'orange',
      progress,
      nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
    }
  }

  return {
    label: 'On track',
    tone: 'emerald',
    progress,
    nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
  }
}

async function reconcilePmacProjectDeadlines(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const overdueProjects = await db.pmacProject.findMany({
    where: {
      status: {
        in: ['ACTIVE', 'PLANNED'],
      },
      targetDate: {
        lt: now,
      },
    },
    select: {
      id: true,
      title: true,
      outputSubmittedAt: true,
      outputSummary: true,
    },
  })

  for (const project of overdueProjects) {
    const nextStatus = project.outputSubmittedAt || project.outputSummary ? 'COMPLETED' : 'ON_HOLD'

    await db.pmacProject.update({
      where: { id: project.id },
      data: {
        status: nextStatus,
        completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
      },
    })

    await recordPmacActivity(db, {
      entityType: 'PROJECT',
      entityId: project.id,
      projectId: project.id,
      actorId: null,
      actorName: 'System',
      actorRole: 'CMAC_COORDINATOR',
      action: 'PROJECT_DEADLINE_RECONCILED',
      summary: nextStatus === 'COMPLETED'
        ? `Marked project "${project.title}" completed at deadline because output was submitted.`
        : `Placed project "${project.title}" on hold because no output was submitted by the deadline.`,
    })
  }
}

function mapProjectForClient<T extends {
  status: PmacProjectStatusValue
  targetDate: Date
  milestones: Array<{
    dueDate: Date
    status: PmacProjectMilestoneStatusValue
  }>
}>(project: T) {
  return {
    ...project,
    health: buildProjectHealth(project),
  }
}

async function assertPmacProjectAccess(projectId: string, user: SessionUser) {
  const project = await prisma.pmacProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      branch: true,
      title: true,
      headMemberId: true,
    },
  })

  if (!project) {
    throw new Error('Project not found.')
  }

  if (isPmacProjectLauncherRole(user.role)) {
    return project
  }

  if (user.role === 'PMAC_EXECUTIVE' && user.pmacMemberId && project.headMemberId === user.pmacMemberId) {
    return project
  }

  if (user.role === 'PMAC_EXECUTIVE' && !project.headMemberId) {
    const executiveBranch = await getExecutiveBranchForUser(user)
    if (executiveBranch && executiveBranch === project.branch) {
      return project
    }
  }

  throw new Error('Only the selected executive head or PMAC project launchers can manage this project.')
}

function canClosePmacProject(project: { headMemberId: string | null }, user: SessionUser) {
  if (user.role === 'CMAC_COORDINATOR') {
    return true
  }

  return user.role === 'PMAC_EXECUTIVE'
    && !!user.pmacMemberId
    && project.headMemberId === user.pmacMemberId
}

function isAssignedPmacProjectHead(project: { headMemberId: string | null }, user: SessionUser) {
  return user.role === 'PMAC_EXECUTIVE'
    && !!user.pmacMemberId
    && project.headMemberId === user.pmacMemberId
}

async function hasPmacDirectorClosureCheck(projectId: string) {
  const check = await prisma.pmacActivityLog.findFirst({
    where: {
      projectId,
      action: 'PROJECT_DIRECTOR_CHECKED',
      actorRole: 'PMAC_DIRECTOR',
    },
    select: {
      id: true,
    },
  })

  return !!check
}

function assertPmacProjectCloseAccess(project: { headMemberId: string | null }, user: SessionUser, directorChecked: boolean) {
  if (user.role === 'CMAC_COORDINATOR') {
    return
  }

  if (isAssignedPmacProjectHead(project, user) && directorChecked) {
    return
  }

  if (isAssignedPmacProjectHead(project, user)) {
    throw new Error('PMAC Director must check this project before the assigned head can close it.')
  }

  if (!canClosePmacProject(project, user)) {
    throw new Error('Only the assigned executive head can close this project. CMAC coordinator may bypass when needed.')
  }
}

export async function getPmacProjects() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return {
      projects: [],
      stats: {
        total: 0,
        active: 0,
        needsAttention: 0,
        dueSoon: 0,
      },
      canLaunch: false,
      viewerBranch: null as PmacExecutiveTitle | null,
      viewerMemberId: null as string | null,
      executiveHeads: [],
      assignableMembers: [],
    }
  }

  await reconcilePmacProjectDeadlines()

  const where = await getPmacProjectWhere(session.user)
  const projects = await prisma.pmacProject.findMany({
    where,
    include: {
      launchedBy: {
        select: {
          name: true,
          role: true,
        },
      },
      headMember: {
        select: {
          id: true,
          fullName: true,
          email: true,
          executiveTitle: true,
        },
      },
      memberAssignments: {
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              email: true,
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
            },
          },
          assignedBy: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      milestones: {
        orderBy: {
          dueDate: 'asc',
        },
      },
      links: {
        include: {
          addedBy: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      activityLogs: {
        where: {
          action: 'PROJECT_DIRECTOR_CHECKED',
          actorRole: 'PMAC_DIRECTOR',
        },
        select: {
          actorName: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
    orderBy: [
      { status: 'asc' },
      { targetDate: 'asc' },
      { createdAt: 'desc' },
    ],
  })
  const viewerBranch = await getExecutiveBranchForUser(session.user)
  const mappedProjects = projects.map(project => {
    const directorCheck = project.activityLogs[0] ?? null
    const hasDirectorCheck = !!directorCheck
    const hasLauncherAccess = isPmacProjectLauncherRole(session.user.role)
    const hasAssignedHeadAccess = session.user.role === 'PMAC_EXECUTIVE' && project.headMemberId === session.user.pmacMemberId
    const hasUnassignedBranchAccess = session.user.role === 'PMAC_EXECUTIVE' && !project.headMemberId && project.branch === viewerBranch

    return {
      ...mapProjectForClient(project),
      directorCheck: directorCheck
        ? {
            checkedBy: directorCheck.actorName,
            checkedAt: directorCheck.createdAt,
          }
        : null,
      canManageProject: hasLauncherAccess || hasAssignedHeadAccess || hasUnassignedBranchAccess,
      canManageMembers: hasLauncherAccess || hasAssignedHeadAccess || hasUnassignedBranchAccess,
      mustSelectProjectMembers: session.user.role === 'PMAC_EXECUTIVE' && (hasAssignedHeadAccess || hasUnassignedBranchAccess),
      canCloseProject: session.user.role === 'CMAC_COORDINATOR' || (hasAssignedHeadAccess && hasDirectorCheck),
      isWaitingForDirectorCheck: hasAssignedHeadAccess && !hasDirectorCheck && project.status !== 'COMPLETED',
      canDirectorCheckProject: session.user.role === 'PMAC_DIRECTOR' && !hasDirectorCheck && project.status !== 'COMPLETED',
    }
  })
  const peopleOptions = isPmacProjectLauncherRole(session.user.role) || session.user.role === 'PMAC_EXECUTIVE'
    ? await getPmacProjectPeopleOptions()
    : { executiveHeads: [], assignableMembers: [] }

  return {
    projects: mappedProjects,
    stats: {
      total: mappedProjects.length,
      active: mappedProjects.filter(project => project.status === 'ACTIVE').length,
      needsAttention: mappedProjects.filter(project => project.health.label === 'Needs attention').length,
      dueSoon: mappedProjects.filter(project => project.health.label === 'Due soon').length,
    },
    canLaunch: isPmacProjectLauncherRole(session.user.role),
    viewerBranch,
    viewerMemberId: session.user.pmacMemberId,
    executiveHeads: peopleOptions.executiveHeads,
    assignableMembers: peopleOptions.assignableMembers,
  }
}

export async function getPmacProjectCalendarItems() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  await reconcilePmacProjectDeadlines()

  const projects = await prisma.pmacProject.findMany({
    where: await getPmacProjectWhere(session.user),
    include: {
      milestones: {
        orderBy: {
          dueDate: 'asc',
        },
      },
    },
    orderBy: [
      { startDate: 'asc' },
      { targetDate: 'asc' },
    ],
  })

  return projects.flatMap(project => {
    const health = buildProjectHealth(project)
    return [
      {
        id: `${project.id}-window`,
        projectId: project.id,
        title: project.title,
        branch: project.branch,
        type: 'PROJECT' as const,
        status: project.status,
        health,
        startDate: project.startDate,
        endDate: project.targetDate,
      },
      ...project.milestones.map(milestone => ({
        id: milestone.id,
        projectId: project.id,
        title: milestone.title,
        branch: project.branch,
        type: 'MILESTONE' as const,
        status: milestone.status,
        health,
        startDate: milestone.dueDate,
        endDate: milestone.dueDate,
      })),
    ]
  })
}

export async function savePmacProject(payload: PmacProjectPayload) {
  try {
    const session = await assertPmacActionSession(PMAC_PROJECT_LAUNCHER_ROLES)
    const title = sanitizeSingleLineText(payload.title, {
      fieldName: 'Project title',
      maxLength: 191,
      required: true,
    })
    const summary = sanitizeMultilineText(payload.summary, {
      fieldName: 'Project summary',
      maxLength: 4000,
    })
    const startDate = parseProjectDate(payload.startDate, 'Start date')
    const targetDate = parseProjectDate(payload.targetDate, 'Target date')
    const status = payload.status ?? 'ACTIVE'
    const headMemberId = sanitizeSingleLineText(payload.headMemberId, {
      fieldName: 'Executive head',
      maxLength: 191,
      required: true,
    })

    if (targetDate < startDate) {
      throw new Error('Target date cannot be earlier than the start date.')
    }
    if (!PMAC_PROJECT_STATUSES.includes(status)) {
      throw new Error('Please select a valid project status.')
    }

    const headMember = await prisma.pmacMember.findFirst({
      where: {
        id: headMemberId,
        status: 'ACTIVE',
        clubRole: 'EXECUTIVE',
        executiveTitle: {
          not: null,
        },
      },
      select: {
        id: true,
        fullName: true,
        executiveTitle: true,
      },
    })

    if (!headMember?.executiveTitle || !PMAC_EXECUTIVE_TITLES.includes(headMember.executiveTitle)) {
      throw new Error('Please select an active executive head for this project.')
    }
    const headBranch = headMember.executiveTitle

    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
    })

    if (projectId) {
      const accessibleProject = await assertPmacProjectAccess(projectId, session.user)
      if (status === 'COMPLETED') {
        const directorChecked = await hasPmacDirectorClosureCheck(projectId)
        assertPmacProjectCloseAccess(accessibleProject, session.user, directorChecked)
      }

      await prisma.$transaction(async (tx) => {
        const current = await tx.pmacProject.findUnique({
          where: { id: projectId },
          select: { status: true, headMemberId: true },
        })

        await tx.pmacProject.update({
          where: { id: projectId },
          data: {
            title,
            summary: summary || null,
            branch: headBranch,
            headMemberId: headMember.id,
            startDate,
            targetDate,
            status,
            completedAt: status === 'COMPLETED' ? new Date() : null,
          },
        })

        if (current && current.status !== status) {
          await recordPmacActivity(tx, {
            entityType: 'PROJECT',
            entityId: projectId,
            projectId,
            ...getActivityActor(session.user),
            action: 'PROJECT_STATUS_UPDATED',
            summary: `Updated project "${title}" status from ${current.status} to ${status}.`,
          })
        }

        if (current && current.headMemberId !== headMember.id) {
          await recordPmacActivity(tx, {
            entityType: 'PROJECT',
            entityId: projectId,
            projectId,
            ...getActivityActor(session.user),
            action: 'PROJECT_HEAD_ASSIGNED',
            summary: `Assigned "${title}" to ${headMember.fullName} (${formatExecutiveTitle(headBranch)}).`,
          })
        }
      })
    } else {
      await prisma.$transaction(async (tx) => {
        const created = await tx.pmacProject.create({
          data: {
            title,
            summary: summary || null,
            branch: headBranch,
            headMemberId: headMember.id,
            startDate,
            targetDate,
            status: 'ACTIVE',
            launchedById: session.user.id,
          },
        })

        await recordPmacActivity(tx, {
          entityType: 'PROJECT',
          entityId: created.id,
          projectId: created.id,
          ...getActivityActor(session.user),
          action: 'PROJECT_LAUNCHED',
          summary: `Launched project "${created.title}" for ${headMember.fullName} (${formatExecutiveTitle(created.branch) || 'a PMAC branch'}).`,
        })
      })
    }

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save PMAC project.' }
  }
}

export async function updatePmacProjectStatus(projectId: string, status: PmacProjectStatus) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const sanitizedProjectId = sanitizeSingleLineText(projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })

    if (!PMAC_PROJECT_STATUSES.includes(status)) {
      throw new Error('Please select a valid project status.')
    }

    const accessibleProject = await assertPmacProjectAccess(sanitizedProjectId, session.user)
    if (status === 'COMPLETED') {
      const directorChecked = await hasPmacDirectorClosureCheck(sanitizedProjectId)
      assertPmacProjectCloseAccess(accessibleProject, session.user, directorChecked)
    }

    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: sanitizedProjectId },
        select: {
          title: true,
          status: true,
        },
      })

      await tx.pmacProject.update({
        where: { id: sanitizedProjectId },
        data: {
          status,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        },
      })

      if (project && project.status !== status) {
        await recordPmacActivity(tx, {
          entityType: 'PROJECT',
          entityId: sanitizedProjectId,
          projectId: sanitizedProjectId,
          ...getActivityActor(session.user),
          action: 'PROJECT_STATUS_UPDATED',
          summary: `Updated project "${project.title}" status from ${project.status} to ${status}.`,
        })
      }
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update project status.' }
  }
}

export async function checkPmacProjectForClosure(projectId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR'])
    const sanitizedProjectId = sanitizeSingleLineText(projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })

    await assertPmacProjectAccess(sanitizedProjectId, session.user)
    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: sanitizedProjectId },
        select: {
          title: true,
          status: true,
        },
      })

      if (!project) {
        throw new Error('Project not found.')
      }

      if (project.status === 'COMPLETED') {
        throw new Error('Completed projects are already closed.')
      }

      const existingCheck = await tx.pmacActivityLog.findFirst({
        where: {
          projectId: sanitizedProjectId,
          action: 'PROJECT_DIRECTOR_CHECKED',
          actorRole: 'PMAC_DIRECTOR',
        },
        select: {
          id: true,
        },
      })

      if (existingCheck) {
        return
      }

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: sanitizedProjectId,
        projectId: sanitizedProjectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_DIRECTOR_CHECKED',
        summary: `PMAC Director checked project "${project.title}" for closure.`,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check project for closure.' }
  }
}

export async function submitPmacProjectOutput(payload: PmacProjectOutputPayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const outputSummary = sanitizeMultilineText(payload.outputSummary, {
      fieldName: 'Project output',
      maxLength: 6000,
      required: true,
    })

    const accessibleProject = await assertPmacProjectAccess(projectId, session.user)
    const directorChecked = await hasPmacDirectorClosureCheck(projectId)
    assertPmacProjectCloseAccess(accessibleProject, session.user, directorChecked)

    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: projectId },
        select: {
          title: true,
          status: true,
        },
      })

      if (!project) {
        throw new Error('Project not found.')
      }

      await tx.pmacProject.update({
        where: { id: projectId },
        data: {
          outputSummary,
          outputSubmittedAt: new Date(),
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_OUTPUT_SUBMITTED',
        summary: `Submitted output and marked project "${project.title}" completed.`,
        details: outputSummary,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit project output.' }
  }
}

export async function attachPmacProjectLink(payload: PmacProjectLinkPayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const label = sanitizeSingleLineText(payload.label, {
      fieldName: 'Link label',
      maxLength: 191,
      required: true,
    })
    const url = sanitizeExternalHttpUrl(payload.url, 'Project link URL')

    if (!url) {
      throw new Error('Link URL is required.')
    }
    if (!PMAC_PROJECT_LINK_TYPES.includes(payload.type)) {
      throw new Error('Please select a valid project link type.')
    }

    await assertPmacProjectAccess(projectId, session.user)
    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: projectId },
        select: { title: true },
      })

      if (!project) {
        throw new Error('Project not found.')
      }

      await tx.pmacProjectLink.create({
        data: {
          projectId,
          label,
          url,
          type: payload.type,
          addedById: session.user.id,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_LINK_ATTACHED',
        summary: `Attached a ${payload.type.toLowerCase()} link to project "${project.title}".`,
        details: label,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to attach project link.' }
  }
}

export async function assignPmacProjectMembers(payload: PmacProjectMemberPayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const memberIds = Array.from(new Set((payload.memberIds ?? []).map(memberId => sanitizeSingleLineText(memberId, {
      fieldName: 'PMAC member',
      maxLength: 191,
      required: true,
    }))))

    const project = await assertPmacProjectAccess(projectId, session.user)
    const assignableMemberIds = memberIds.filter(memberId => memberId !== project.headMemberId)
    const requiredSpecialty = PMAC_EXECUTIVE_BRANCH_SPECIALTY[project.branch]

    if (session.user.role === 'PMAC_EXECUTIVE' && assignableMemberIds.length < 2) {
      throw new Error(`Please select at least two active ${PMAC_SPECIALTY_LABELS[requiredSpecialty]} members who will work together on this project.`)
    }

    const members = assignableMemberIds.length
      ? await prisma.pmacMember.findMany({
          where: {
            id: {
              in: assignableMemberIds,
            },
            status: 'ACTIVE',
            specialties: {
              some: {
                specialty: requiredSpecialty,
              },
            },
          },
          select: {
            id: true,
            fullName: true,
          },
        })
      : []

    if (members.length !== assignableMemberIds.length) {
      throw new Error(`All selected project members must be active PMAC members with ${PMAC_SPECIALTY_LABELS[requiredSpecialty]} specialty.`)
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacProjectAssignment.deleteMany({
        where: {
          projectId,
        },
      })

      for (const memberId of assignableMemberIds) {
        await tx.pmacProjectAssignment.create({
          data: {
            projectId,
            memberId,
            assignedById: session.user.id,
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_MEMBERS_ASSIGNED',
        summary: assignableMemberIds.length
          ? `Assigned ${assignableMemberIds.length} member(s) to project "${project.title}".`
          : `Cleared member assignments for project "${project.title}".`,
        details: members.map(member => member.fullName).join(', ') || null,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to assign project members.' }
  }
}

export async function savePmacProjectMilestone(payload: PmacProjectMilestonePayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const milestoneId = sanitizeSingleLineText(payload.milestoneId, {
      fieldName: 'Milestone ID',
      maxLength: 191,
    })
    const title = sanitizeSingleLineText(payload.title, {
      fieldName: 'Milestone title',
      maxLength: 191,
      required: true,
    })
    const notes = sanitizeMultilineText(payload.notes, {
      fieldName: 'Milestone notes',
      maxLength: 3000,
    })
    const dueDate = parseProjectDate(payload.dueDate, 'Due date')
    const status = payload.status ?? 'TODO'

    if (!PMAC_PROJECT_MILESTONE_STATUSES.includes(status)) {
      throw new Error('Please select a valid milestone status.')
    }

    await assertPmacProjectAccess(projectId, session.user)

    if (milestoneId) {
      await prisma.pmacProjectMilestone.update({
        where: { id: milestoneId },
        data: {
          title,
          dueDate,
          status,
          notes: notes || null,
        },
      })
    } else {
      await prisma.pmacProjectMilestone.create({
        data: {
          projectId,
          title,
          dueDate,
          status,
          notes: notes || null,
        },
      })
    }

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save milestone.' }
  }
}

export async function updatePmacProjectMilestoneStatus(milestoneId: string, status: PmacProjectMilestoneStatus) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const sanitizedMilestoneId = sanitizeSingleLineText(milestoneId, {
      fieldName: 'Milestone ID',
      maxLength: 191,
      required: true,
    })

    if (!PMAC_PROJECT_MILESTONE_STATUSES.includes(status)) {
      throw new Error('Please select a valid milestone status.')
    }

    const milestone = await prisma.pmacProjectMilestone.findUnique({
      where: { id: sanitizedMilestoneId },
      select: {
        projectId: true,
      },
    })

    if (!milestone) {
      throw new Error('Milestone not found.')
    }

    await assertPmacProjectAccess(milestone.projectId, session.user)
    await prisma.pmacProjectMilestone.update({
      where: { id: sanitizedMilestoneId },
      data: { status },
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update milestone status.' }
  }
}
