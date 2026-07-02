import type { Role } from '@/types'

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
export const PMAC_POLL_RESULTS_VISIBILITY = ['IMMEDIATE', 'AFTER_CLOSE'] as const
export const PMAC_VOTE_CHOICES = ['YES', 'NO', 'ABSTAIN'] as const

export type PmacEventStatus = (typeof PMAC_EVENT_STATUSES)[number]
export type PmacEventDutyRole = (typeof PMAC_EVENT_DUTY_ROLES)[number]
export type PmacAvailabilityStatus = (typeof PMAC_AVAILABILITY_STATUSES)[number]
export type PmacAttendanceStatus = (typeof PMAC_ATTENDANCE_STATUSES)[number]
export type PmacPollType = (typeof PMAC_POLL_TYPES)[number]
export type PmacPollStatus = (typeof PMAC_POLL_STATUSES)[number]
export type PmacPollResultsVisibility = (typeof PMAC_POLL_RESULTS_VISIBILITY)[number]
export type PmacVoteChoice = (typeof PMAC_VOTE_CHOICES)[number]

export const PMAC_EVENT_STATUS_LABELS: Record<PmacEventStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
}

export const PMAC_EVENT_DUTY_ROLE_LABELS: Record<PmacEventDutyRole, string> = {
  PHOTOGRAPHER: 'Photographer',
  VIDEOGRAPHER: 'Videographer',
  JOURNALIST: 'Journalist',
  GRAPHIC_DESIGNER: 'Graphic Designer',
  ALL_AROUND: 'All Around',
}

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

export const PMAC_POLL_RESULTS_VISIBILITY_LABELS: Record<PmacPollResultsVisibility, string> = {
  IMMEDIATE: 'Visible Immediately',
  AFTER_CLOSE: 'Visible After Close',
}

export const PMAC_VOTE_CHOICE_LABELS: Record<PmacVoteChoice, string> = {
  YES: 'Yes',
  NO: 'No',
  ABSTAIN: 'Abstain',
}

export const PMAC_EVENT_CREATOR_ROLES = ['PMAC_DIRECTOR'] as const satisfies readonly Role[]
export const PMAC_EVENT_MANAGER_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'] as const satisfies readonly Role[]
export const PMAC_STAFFING_MANAGER_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'] as const satisfies readonly Role[]
export const PMAC_ATTENDANCE_MANAGER_ROLES = ['PMAC_SECRETARY'] as const satisfies readonly Role[]
export const PMAC_ASSIGNMENT_RESPONDER_ROLES = ['PMAC_EXECUTIVE', 'PMAC_MEMBER'] as const satisfies readonly Role[]
export const PMAC_POLL_CREATOR_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'] as const satisfies readonly Role[]
export const PMAC_POLL_MANAGER_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'] as const satisfies readonly Role[]
export const PMAC_POLL_MONITOR_ROLES = ['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY', 'CMAC_COORDINATOR'] as const satisfies readonly Role[]
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

export function isPmacStaffingManagerRole(role?: string | null): role is (typeof PMAC_STAFFING_MANAGER_ROLES)[number] {
  return !!role && PMAC_STAFFING_MANAGER_ROLES.includes(role as (typeof PMAC_STAFFING_MANAGER_ROLES)[number])
}

export function isPmacAttendanceManagerRole(role?: string | null): role is (typeof PMAC_ATTENDANCE_MANAGER_ROLES)[number] {
  return !!role && PMAC_ATTENDANCE_MANAGER_ROLES.includes(role as (typeof PMAC_ATTENDANCE_MANAGER_ROLES)[number])
}

export function isPmacAssignmentResponderRole(role?: string | null): role is (typeof PMAC_ASSIGNMENT_RESPONDER_ROLES)[number] {
  return !!role && PMAC_ASSIGNMENT_RESPONDER_ROLES.includes(role as (typeof PMAC_ASSIGNMENT_RESPONDER_ROLES)[number])
}

export function isPmacPollCreatorRole(role?: string | null): role is (typeof PMAC_POLL_CREATOR_ROLES)[number] {
  return !!role && PMAC_POLL_CREATOR_ROLES.includes(role as (typeof PMAC_POLL_CREATOR_ROLES)[number])
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
