import type { DocumentationType, PmacEventDutyRole as DutyRoleType, PmacEventSourceType, PmacExecutiveTitle, PmacProjectLinkType, PmacProjectMilestoneStatus, PmacProjectStatus, PmacSpecialty, Role } from '@/types'

export const PMAC_EVENT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
] as const

export const PMAC_EVENT_DUTY_ROLES = [
  'PHOTOGRAPHER',
  'VIDEOGRAPHER',
  'JOURNALIST',
  'GRAPHIC_DESIGNER',
  'ALL_AROUND',
] as const

export const PMAC_AVAILABILITY_STATUSES = ['PENDING', 'YES', 'NO'] as const
export const PMAC_ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const
export const PMAC_POLL_TYPES = ['GENERAL', 'EVENT', 'SCHEDULE_PREFERENCE', 'OFFICER_DECISION'] as const
export const PMAC_POLL_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'] as const
export const PMAC_PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const satisfies readonly PmacProjectStatus[]
export const PMAC_PROJECT_MILESTONE_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const satisfies readonly PmacProjectMilestoneStatus[]
export const PMAC_PROJECT_LINK_TYPES = ['REFERENCE', 'SUBMISSION'] as const satisfies readonly PmacProjectLinkType[]
export const PMAC_POLL_RESULTS_VISIBILITY = ['IMMEDIATE', 'AFTER_CLOSE'] as const
export const PMAC_VOTE_CHOICES = ['YES', 'NO', 'ABSTAIN'] as const
export const PMAC_EXECUTIVE_TITLES = [
  'HEAD_PHOTOGRAPHER',
  'HEAD_VIDEOGRAPHER',
  'HEAD_GRAPHIC_DESIGNER',
  'HEAD_JOURNALIST',
  'TECHNICAL_HEAD',
] as const satisfies readonly PmacExecutiveTitle[]
export const PMAC_SPECIALTIES = [
  'PHOTOGRAPHY',
  'VIDEOGRAPHY',
  'GRAPHIC_DESIGN',
  'JOURNALISM',
  'TECHNICAL_SUPPORT',
  'ALL_AROUND',
] as const satisfies readonly PmacSpecialty[]

export type PmacEventStatus = (typeof PMAC_EVENT_STATUSES)[number]
export type PmacEventDutyRole = (typeof PMAC_EVENT_DUTY_ROLES)[number]
export type PmacAvailabilityStatus = (typeof PMAC_AVAILABILITY_STATUSES)[number]
export type PmacAttendanceStatus = (typeof PMAC_ATTENDANCE_STATUSES)[number]
export type PmacPollType = (typeof PMAC_POLL_TYPES)[number]
export type PmacPollStatus = (typeof PMAC_POLL_STATUSES)[number]
export type PmacProjectStatusValue = (typeof PMAC_PROJECT_STATUSES)[number]
export type PmacProjectMilestoneStatusValue = (typeof PMAC_PROJECT_MILESTONE_STATUSES)[number]
export type PmacProjectLinkTypeValue = (typeof PMAC_PROJECT_LINK_TYPES)[number]
export type PmacPollResultsVisibility = (typeof PMAC_POLL_RESULTS_VISIBILITY)[number]
export type PmacVoteChoice = (typeof PMAC_VOTE_CHOICES)[number]
export type PmacExecutiveTitleValue = (typeof PMAC_EXECUTIVE_TITLES)[number]
export type PmacSpecialtyValue = (typeof PMAC_SPECIALTIES)[number]

export const PMAC_EVENT_STATUS_LABELS: Record<PmacEventStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
}

export const PMAC_EVENT_SOURCE_LABELS: Record<PmacEventSourceType, string> = {
  MANUAL: 'PMAC Event',
  CMAC_REQUEST: 'Imported from CMAC',
}

export const PMAC_EVENT_DUTY_ROLE_LABELS: Record<PmacEventDutyRole, string> = {
  PHOTOGRAPHER: 'Photographer',
  VIDEOGRAPHER: 'Videographer',
  JOURNALIST: 'Journalist',
  GRAPHIC_DESIGNER: 'Graphic Designer',
  ALL_AROUND: 'All Around',
}

export const PMAC_EXECUTIVE_TITLE_LABELS: Record<PmacExecutiveTitleValue, string> = {
  HEAD_PHOTOGRAPHER: 'Head Photographer',
  HEAD_VIDEOGRAPHER: 'Head Videographer',
  HEAD_GRAPHIC_DESIGNER: 'Head Graphic Designer',
  HEAD_JOURNALIST: 'Head Journalist',
  TECHNICAL_HEAD: 'Technical Head',
}

export const PMAC_SPECIALTY_LABELS: Record<PmacSpecialtyValue, string> = {
  PHOTOGRAPHY: 'Photography',
  VIDEOGRAPHY: 'Videography',
  GRAPHIC_DESIGN: 'Graphic Design',
  JOURNALISM: 'Journalism',
  TECHNICAL_SUPPORT: 'Technical Support',
  ALL_AROUND: 'All Around',
}

const PMAC_SPECIALTY_DUTY_ROLE_MAP: Record<PmacSpecialtyValue, readonly DutyRoleType[]> = {
  PHOTOGRAPHY: ['PHOTOGRAPHER'],
  VIDEOGRAPHY: ['VIDEOGRAPHER'],
  GRAPHIC_DESIGN: ['GRAPHIC_DESIGNER'],
  JOURNALISM: ['JOURNALIST'],
  TECHNICAL_SUPPORT: ['ALL_AROUND'],
  ALL_AROUND: ['ALL_AROUND', 'PHOTOGRAPHER', 'VIDEOGRAPHER', 'JOURNALIST', 'GRAPHIC_DESIGNER'],
}

export const PMAC_ASSIGNMENT_TEMPLATES = [
  {
    id: 'PHOTO_COVERAGE',
    label: 'Photo Coverage',
    description: 'Photographer plus journalist support.',
    documentationTypes: ['PHOTO', 'BOTH'] as const satisfies readonly DocumentationType[],
    roles: ['PHOTOGRAPHER', 'JOURNALIST'] as const satisfies readonly PmacEventDutyRole[],
  },
  {
    id: 'VIDEO_COVERAGE',
    label: 'Video Coverage',
    description: 'Videographer plus journalist support.',
    documentationTypes: ['VIDEO', 'BOTH'] as const satisfies readonly DocumentationType[],
    roles: ['VIDEOGRAPHER', 'JOURNALIST'] as const satisfies readonly PmacEventDutyRole[],
  },
  {
    id: 'FULL_COVERAGE',
    label: 'Full Coverage',
    description: 'Photo, video, journalism, and graphic support.',
    documentationTypes: ['BOTH'] as const satisfies readonly DocumentationType[],
    roles: ['PHOTOGRAPHER', 'VIDEOGRAPHER', 'JOURNALIST', 'GRAPHIC_DESIGNER'] as const satisfies readonly PmacEventDutyRole[],
  },
  {
    id: 'LEAN_TEAM',
    label: 'Lean Team',
    description: 'A compact all-around setup for smaller events.',
    documentationTypes: ['PHOTO', 'VIDEO', 'BOTH'] as const satisfies readonly DocumentationType[],
    roles: ['ALL_AROUND', 'JOURNALIST'] as const satisfies readonly PmacEventDutyRole[],
  },
] as const

export const PMAC_AVAILABILITY_LABELS: Record<PmacAvailabilityStatus, string> = {
  PENDING: 'Pending',
  YES: 'Yes',
  NO: 'No',
}

export const PMAC_ATTENDANCE_LABELS: Record<PmacAttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  EXCUSED: 'Excused',
}

export const PMAC_POLL_TYPE_LABELS: Record<PmacPollType, string> = {
  GENERAL: 'General Poll',
  EVENT: 'Event Poll',
  SCHEDULE_PREFERENCE: 'Schedule Preference',
  OFFICER_DECISION: 'Officer Decision',
}

export const PMAC_POLL_STATUS_LABELS: Record<PmacPollStatus, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
}

export const PMAC_PROJECT_STATUS_LABELS: Record<PmacProjectStatusValue, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
}

export const PMAC_PROJECT_MILESTONE_STATUS_LABELS: Record<PmacProjectMilestoneStatusValue, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
}

export const PMAC_PROJECT_LINK_TYPE_LABELS: Record<PmacProjectLinkTypeValue, string> = {
  REFERENCE: 'Reference',
  SUBMISSION: 'Submission',
}

export const PMAC_POLL_RESULTS_VISIBILITY_LABELS: Record<PmacPollResultsVisibility, string> = {
  IMMEDIATE: 'Visible Immediately',
  AFTER_CLOSE: 'Visible After Close',
}

export const PMAC_VOTE_CHOICE_LABELS: Record<PmacVoteChoice, string> = {
  YES: 'Yes',
  NO: 'No',
  ABSTAIN: 'Abstain',
}

export const PMAC_EVENT_CREATOR_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'] as const satisfies readonly Role[]
export const PMAC_EVENT_MANAGER_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'] as const satisfies readonly Role[]
export const PMAC_STAFFING_MANAGER_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'] as const satisfies readonly Role[]
export const PMAC_ATTENDANCE_MANAGER_ROLES = ['PMAC_SECRETARY'] as const satisfies readonly Role[]
export const PMAC_ASSIGNMENT_RESPONDER_ROLES = ['PMAC_EXECUTIVE', 'PMAC_MEMBER'] as const satisfies readonly Role[]
export const PMAC_POLL_CREATOR_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'] as const satisfies readonly Role[]
export const PMAC_POLL_MANAGER_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'] as const satisfies readonly Role[]
export const PMAC_POLL_MONITOR_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY', 'CMAC_COORDINATOR'] as const satisfies readonly Role[]
export const PMAC_PROJECT_LAUNCHER_ROLES = ['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY'] as const satisfies readonly Role[]
export const PMAC_POLL_VOTER_ROLES = [
  'PMAC_DIRECTOR',
  'PMAC_ASSISTANT_DIRECTOR',
  'PMAC_SECRETARY',
  'PMAC_EXECUTIVE',
  'PMAC_MEMBER',
] as const satisfies readonly Role[]
export const PMAC_OVERSIGHT_ROLES = ['CMAC_COORDINATOR'] as const satisfies readonly Role[]
export const PMAC_OPERATIONAL_ROLES = [
  'PMAC_DIRECTOR',
  'PMAC_ASSISTANT_DIRECTOR',
  'PMAC_SECRETARY',
  'PMAC_EXECUTIVE',
  'PMAC_MEMBER',
] as const satisfies readonly Role[]

export function isPmacEventManagerRole(role?: string | null): role is (typeof PMAC_EVENT_MANAGER_ROLES)[number] {
  return !!role && PMAC_EVENT_MANAGER_ROLES.includes(role as (typeof PMAC_EVENT_MANAGER_ROLES)[number])
}

export function isPmacCreatorRole(role?: string | null): role is (typeof PMAC_EVENT_CREATOR_ROLES)[number] {
  return !!role && PMAC_EVENT_CREATOR_ROLES.includes(role as (typeof PMAC_EVENT_CREATOR_ROLES)[number])
}

export function isPmacStaffingManagerRole(role?: string | null): role is (typeof PMAC_STAFFING_MANAGER_ROLES)[number] {
  return !!role && PMAC_STAFFING_MANAGER_ROLES.includes(role as (typeof PMAC_STAFFING_MANAGER_ROLES)[number])
}

export function isPmacAttendanceManagerRole(role?: string | null): role is (typeof PMAC_ATTENDANCE_MANAGER_ROLES)[number] {
  return !!role && PMAC_ATTENDANCE_MANAGER_ROLES.includes(role as (typeof PMAC_ATTENDANCE_MANAGER_ROLES)[number])
}

export function isPmacAssignmentResponderRole(role?: string | null): role is (typeof PMAC_ASSIGNMENT_RESPONDER_ROLES)[number] {
  return !!role && PMAC_ASSIGNMENT_RESPONDER_ROLES.includes(role as (typeof PMAC_ASSIGNMENT_RESPONDER_ROLES)[number])
}

export function isPmacPollManagerRole(role?: string | null): role is (typeof PMAC_POLL_MANAGER_ROLES)[number] {
  return !!role && PMAC_POLL_MANAGER_ROLES.includes(role as (typeof PMAC_POLL_MANAGER_ROLES)[number])
}

export function isPmacPollMonitorRole(role?: string | null): role is (typeof PMAC_POLL_MONITOR_ROLES)[number] {
  return !!role && PMAC_POLL_MONITOR_ROLES.includes(role as (typeof PMAC_POLL_MONITOR_ROLES)[number])
}

export function isPmacPollVoterRole(role?: string | null): role is (typeof PMAC_POLL_VOTER_ROLES)[number] {
  return !!role && PMAC_POLL_VOTER_ROLES.includes(role as (typeof PMAC_POLL_VOTER_ROLES)[number])
}

export function isPmacProjectLauncherRole(role?: string | null): role is (typeof PMAC_PROJECT_LAUNCHER_ROLES)[number] {
  return !!role && PMAC_PROJECT_LAUNCHER_ROLES.includes(role as (typeof PMAC_PROJECT_LAUNCHER_ROLES)[number])
}

export function getPmacEventStatusBadgeClass(status: PmacEventStatus) {
  switch (status) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'PENDING_APPROVAL':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'REJECTED':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'COMPLETED':
      return 'bg-sky-50 text-sky-700 border-sky-200'
  }
}

export function getPmacEventSourceBadgeClass(sourceType: PmacEventSourceType) {
  switch (sourceType) {
    case 'CMAC_REQUEST':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'MANUAL':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

export function getRecommendedAssignmentRoles(sourceDocumentationType?: DocumentationType | null) {
  switch (sourceDocumentationType) {
    case 'PHOTO':
      return ['PHOTOGRAPHER', 'JOURNALIST'] as const satisfies readonly PmacEventDutyRole[]
    case 'VIDEO':
      return ['VIDEOGRAPHER', 'JOURNALIST'] as const satisfies readonly PmacEventDutyRole[]
    case 'BOTH':
      return ['PHOTOGRAPHER', 'VIDEOGRAPHER', 'JOURNALIST'] as const satisfies readonly PmacEventDutyRole[]
    default:
      return ['ALL_AROUND'] as const satisfies readonly PmacEventDutyRole[]
  }
}

export function getDutyRolesForSpecialties(specialties: readonly PmacSpecialtyValue[]) {
  const roles = new Set<PmacEventDutyRole>()

  for (const specialty of specialties) {
    for (const role of PMAC_SPECIALTY_DUTY_ROLE_MAP[specialty] ?? []) {
      roles.add(role)
    }
  }

  return Array.from(roles)
}

export function getPmacReadinessLabel(score: number) {
  if (score >= 85) {
    return 'Ready'
  }
  if (score >= 65) {
    return 'Needs follow-up'
  }
  return 'At risk'
}

export function calculatePmacReadinessScore(params: {
  sourceDocumentationType: DocumentationType | null | undefined
  assignments: Array<{ assignmentRole: PmacEventDutyRole; availabilityResponse?: 'PENDING' | 'YES' | 'NO' | null }>
  attendanceCount?: number
  eventStatus?: PmacEventStatus
  wrapUpFilledCount?: number
}) {
  const relevantRoles = getRecommendedAssignmentRoles(params.sourceDocumentationType)
  const assignedRoles = new Set(params.assignments.map((assignment) => assignment.assignmentRole))
  const coverageRatio = Math.min(assignedRoles.size, relevantRoles.length) / relevantRoles.length
  const assignmentCount = params.assignments.length
  const yesCount = params.assignments.filter((assignment) => assignment.availabilityResponse === 'YES').length
  const noCount = params.assignments.filter((assignment) => assignment.availabilityResponse === 'NO').length
  const confirmationRatio = assignmentCount > 0 ? yesCount / assignmentCount : 0
  const rejectionRatio = assignmentCount > 0 ? noCount / assignmentCount : 0
  const attendanceRatio = assignmentCount > 0 ? Math.min(params.attendanceCount ?? 0, assignmentCount) / assignmentCount : 0
  const wrapUpRatio = Math.min(params.wrapUpFilledCount ?? 0, 4) / 4
  const workflowBonus = params.eventStatus === 'COMPLETED'
    ? (attendanceRatio * 10) + (wrapUpRatio * 10)
    : 20

  return Math.max(
    0,
    Math.min(
      100,
      Math.round((coverageRatio * 45) + (confirmationRatio * 25) + ((1 - rejectionRatio) * 10) + workflowBonus)
    )
  )
}

export function getPmacAvailabilityBadgeClass(status: PmacAvailabilityStatus) {
  switch (status) {
    case 'PENDING':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'YES':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'NO':
      return 'bg-red-50 text-red-700 border-red-200'
  }
}

export function getPmacAttendanceBadgeClass(status: PmacAttendanceStatus) {
  switch (status) {
    case 'PRESENT':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'LATE':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'ABSENT':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'EXCUSED':
      return 'bg-sky-50 text-sky-700 border-sky-200'
  }
}

export function getPmacPollStatusBadgeClass(status: PmacPollStatus) {
  switch (status) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'OPEN':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'CLOSED':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'ARCHIVED':
      return 'bg-sky-50 text-sky-700 border-sky-200'
  }
}

export function getPmacProjectStatusBadgeClass(status: PmacProjectStatusValue) {
  switch (status) {
    case 'PLANNED':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'ACTIVE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'ON_HOLD':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'COMPLETED':
      return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'ARCHIVED':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200'
  }
}

export function getPmacProjectMilestoneStatusBadgeClass(status: PmacProjectMilestoneStatusValue) {
  switch (status) {
    case 'TODO':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'IN_PROGRESS':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    case 'DONE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'BLOCKED':
      return 'bg-red-50 text-red-700 border-red-200'
  }
}

export function getPmacVoteChoiceBadgeClass(choice: PmacVoteChoice) {
  switch (choice) {
    case 'YES':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'NO':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'ABSTAIN':
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}
