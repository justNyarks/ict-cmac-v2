import type { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDutyRolesForSpecialties, PMAC_EXECUTIVE_TITLE_LABELS, getRecommendedAssignmentRoles, isPmacAssignmentResponderRole, isPmacAttendanceManagerRole, isPmacCreatorRole, isPmacEventManagerRole, isPmacPollManagerRole, isPmacPollMonitorRole, isPmacPollVoterRole, isPmacStaffingManagerRole, PMAC_ASSIGNMENT_TEMPLATES, PMAC_ATTENDANCE_STATUSES, PMAC_EVENT_DUTY_ROLES, PMAC_EVENT_DUTY_ROLE_LABELS, PMAC_OPERATIONAL_ROLES, PMAC_OVERSIGHT_ROLES, PMAC_POLL_RESULTS_VISIBILITY, PMAC_POLL_TYPES, PMAC_POLL_VOTER_ROLES, PMAC_PROJECT_MILESTONE_STATUSES, PMAC_PROJECT_STATUSES, PMAC_VOTE_CHOICES } from '@/lib/pmac'
import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { assertActionAccess } from '@/lib/security'
import { sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'
import type { DocumentationType, PmacClubRole, PmacExecutiveTitle, PmacProjectLinkType, PmacProjectMilestoneStatus, PmacProjectStatus, PmacSpecialty, Role } from '@/types'

export type PmacEventDutyRole = (typeof PMAC_EVENT_DUTY_ROLES)[number]

export type PmacAttendanceStatus = (typeof PMAC_ATTENDANCE_STATUSES)[number]

export type PmacPollType = (typeof PMAC_POLL_TYPES)[number]

export type PmacPollResultsVisibility = (typeof PMAC_POLL_RESULTS_VISIBILITY)[number]

export type PmacVoteChoice = (typeof PMAC_VOTE_CHOICES)[number]

export type PmacProjectStatusValue = (typeof PMAC_PROJECT_STATUSES)[number]

export type PmacProjectMilestoneStatusValue = (typeof PMAC_PROJECT_MILESTONE_STATUSES)[number]

export type PmacAllowedRole = (typeof PMAC_OPERATIONAL_ROLES)[number] | (typeof PMAC_OVERSIGHT_ROLES)[number]

export type PmacEventPayload = {
  eventId?: string
  title: string
  description?: string
  venue: string
  startDateTime: string
  endDateTime: string
}

export type PmacAssignmentInput = {
  memberId: string
  assignmentRole: PmacEventDutyRole
  assignmentNotes?: string
}

export type PmacAttendanceInput = {
  eventId: string
  memberId: string
  status: PmacAttendanceStatus
  notes?: string
}

export type PmacPollPayload = {
  pollId?: string
  title: string
  description?: string
  type: PmacPollType
  opensAt?: string | null
  closesAt?: string | null
  linkedEventId?: string | null
  resultsVisibility: PmacPollResultsVisibility
}

export type PmacProjectPayload = {
  projectId?: string
  title: string
  summary?: string
  branch: PmacExecutiveTitle
  headMemberId?: string
  status?: PmacProjectStatus
  startDate: string
  targetDate: string
}

export type PmacProjectMemberPayload = {
  projectId: string
  memberIds: string[]
}

export type PmacProjectMilestonePayload = {
  projectId: string
  milestoneId?: string
  title: string
  dueDate: string
  status?: PmacProjectMilestoneStatus
  notes?: string
}

export type PmacProjectOutputPayload = {
  projectId: string
  outputSummary: string
}

export type PmacProjectLinkPayload = {
  projectId: string
  label: string
  url: string
  type: PmacProjectLinkType
}

export type SessionUser = {
  id: string
  name?: string | null
  role: Role
  pmacMemberId: string | null
}

export type StaffingFocusEvent = {
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

export type PmacWrapUpPayload = {
  deliveredOutputs?: string
  issuesEncountered?: string
  attachmentAuditNotes?: string
  wrapUpNotes?: string
}

export const PMAC_ALLOWED_ROLES = [...PMAC_OPERATIONAL_ROLES, ...PMAC_OVERSIGHT_ROLES] as const satisfies readonly Role[]

export const PMAC_EVENT_LIST_SELECT = {
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
      email: true,
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

export const PMAC_EVENT_WORKSPACE_INCLUDE_BASE = {
  createdBy: {
    select: {
      name: true,
      email: true,
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

export const PMAC_EVENT_WORKSPACE_INCLUDE_V4 = {
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

const PMAC_EVENT_WORKSPACE_INCLUDE = {
  ...PMAC_EVENT_WORKSPACE_INCLUDE_BASE,
  ...PMAC_EVENT_WORKSPACE_INCLUDE_V4,
} satisfies Prisma.PmacEventInclude

export type PmacEventWorkspaceRecord = Prisma.PmacEventGetPayload<{
  include: typeof PMAC_EVENT_WORKSPACE_INCLUDE
}>

export const PMAC_POLL_WORKSPACE_INCLUDE_BASE = {
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

export const PMAC_POLL_WORKSPACE_INCLUDE_V4 = {
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

const PMAC_POLL_WORKSPACE_INCLUDE = {
  ...PMAC_POLL_WORKSPACE_INCLUDE_BASE,
  ...PMAC_POLL_WORKSPACE_INCLUDE_V4,
} satisfies Prisma.PmacPollInclude

export type PmacPollWorkspaceRecord = Prisma.PmacPollGetPayload<{
  include: typeof PMAC_POLL_WORKSPACE_INCLUDE
}>

export function isPmacV4RelationValidationError(error: unknown) {
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

export function isPmacAllowedRole(role?: string | null): role is PmacAllowedRole {
  return !!role && PMAC_ALLOWED_ROLES.includes(role as PmacAllowedRole)
}

export function isCoordinatorRole(role?: string | null): role is 'CMAC_COORDINATOR' {
  return role === 'CMAC_COORDINATOR'
}

export function formatExecutiveTitle(value?: PmacExecutiveTitle | null) {
  return value ? PMAC_EXECUTIVE_TITLE_LABELS[value] : null
}

export function parseDateTime(value: string, fieldName: string) {
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

export function parseOptionalDateTime(value: string | null | undefined, fieldName: string) {
  if (!value) {
    return null
  }

  return parseDateTime(value, fieldName)
}

export function ensureEventPayload(payload: PmacEventPayload) {
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

export function ensurePollPayload(payload: PmacPollPayload) {
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

export function isPollOpenForVoting(
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

export function isPollClosedForResults(
  poll: Pick<Prisma.PmacPollUncheckedCreateInput, 'status' | 'closesAt'>,
  now = new Date()
) {
  return poll.status === 'CLOSED' || poll.status === 'ARCHIVED' || (!!poll.closesAt && poll.closesAt <= now)
}

export function canViewPollResults(
  poll: Pick<Prisma.PmacPollUncheckedCreateInput, 'status' | 'closesAt' | 'resultsVisibility'>,
  now = new Date()
) {
  return poll.resultsVisibility === 'IMMEDIATE' || isPollClosedForResults(poll, now)
}

export function getPmacEventWhere(user: SessionUser): Prisma.PmacEventWhereInput {
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

export function getPmacCalendarWhere(user: SessionUser): Prisma.PmacEventWhereInput {
  if (isCoordinatorRole(user.role) || isPmacAllowedRole(user.role)) {
    return {
      status: {
        in: ['APPROVED', 'COMPLETED'],
      },
    }
  }

  return { id: '__missing_member__' }
}

export async function getViewerSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isPmacAllowedRole(session.user.role)) {
    return null
  }
  if (isCoordinatorRole(session.user.role)) {
    return assertActionAccess(['CMAC_COORDINATOR'])
  }
  return session
}

export async function assertPmacActionSession(allowedRoles: readonly Role[]) {
  const session = await assertActionAccess(allowedRoles, {
    zeroTrust: allowedRoles.includes('CMAC_COORDINATOR'),
  })

  if (!isCoordinatorRole(session.user.role) && !session.user.pmacMemberId) {
    throw new Error('PMAC member profile is missing for this account.')
  }

  return session
}

export function getActivityActor(user: SessionUser) {
  return {
    actorId: user.id,
    actorName: sanitizeSingleLineText(user.name, {
      fieldName: 'Actor name',
      maxLength: 191,
    }) || 'Unknown PMAC user',
    actorRole: user.role,
  }
}

export async function findPmacEventForUser(
  eventId: string,
  user: SessionUser,
): Promise<PmacEventWorkspaceRecord | null> {
  try {
    return await prisma.pmacEvent.findFirst({
      where: {
        id: eventId,
        ...getPmacEventWhere(user),
      },
      include: PMAC_EVENT_WORKSPACE_INCLUDE,
    })
  } catch (error) {
    if (!isPmacV4RelationValidationError(error)) {
      throw error
    }

    const event = await prisma.pmacEvent.findFirst({
      where: {
        id: eventId,
        ...getPmacEventWhere(user),
      },
      include: PMAC_EVENT_WORKSPACE_INCLUDE_BASE,
    })

    return event ? { ...event, attachments: [], activityLogs: [] } : null
  }
}

export function buildWorkspacePermissions(user: SessionUser, event: Awaited<ReturnType<typeof findPmacEventForUser>>) {
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

export async function countEligiblePmacVoters() {
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

export function getPmacPollWhere(user: SessionUser): Prisma.PmacPollWhereInput {
  if (isCoordinatorRole(user.role) || isPmacPollManagerRole(user.role) || isPmacPollMonitorRole(user.role)) {
    return {}
  }

  return {
    status: {
      in: ['OPEN', 'CLOSED', 'ARCHIVED'],
    },
  }
}

export async function findPmacPollForUser(
  pollId: string,
  user: SessionUser,
): Promise<PmacPollWorkspaceRecord | null> {
  try {
    return await prisma.pmacPoll.findFirst({
      where: { id: pollId, ...getPmacPollWhere(user) },
      include: PMAC_POLL_WORKSPACE_INCLUDE,
    })
  } catch (error) {
    if (!isPmacV4RelationValidationError(error)) {
      throw error
    }

    const poll = await prisma.pmacPoll.findFirst({
      where: { id: pollId, ...getPmacPollWhere(user) },
      include: PMAC_POLL_WORKSPACE_INCLUDE_BASE,
    })

    return poll ? { ...poll, attachments: [], activityLogs: [] } : null
  }
}

export function buildPollWorkspacePermissions(
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

export function getMissingCoverageRoles(
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

export function getPreferredDutyRolesForMember(params: {
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

export function buildWorkloadTier(upcomingAssignments: number) {
  if (upcomingAssignments >= 4) {
    return 'High'
  }
  if (upcomingAssignments >= 2) {
    return 'Moderate'
  }
  return 'Light'
}

export function buildMemberSuggestionReason(params: {
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

export function buildWrapUpFilledCount(event: {
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

export function buildAssignmentTemplateRows(sourceDocumentationType: DocumentationType | null | undefined) {
  return PMAC_ASSIGNMENT_TEMPLATES.filter((template) => (
    !sourceDocumentationType || template.documentationTypes.some((type) => type === sourceDocumentationType)
  ))
}

export function buildAssignmentSuggestions(params: {
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
