import clsx from 'clsx'

import {
  PMAC_ATTENDANCE_LABELS,
  PMAC_AVAILABILITY_LABELS,
  PMAC_EVENT_STATUS_LABELS,
  PMAC_POLL_STATUS_LABELS,
  PMAC_POLL_TYPE_LABELS,
  PMAC_VOTE_CHOICE_LABELS,
  getPmacAttendanceBadgeClass,
  getPmacAvailabilityBadgeClass,
  getPmacEventStatusBadgeClass,
  getPmacPollStatusBadgeClass,
  getPmacVoteChoiceBadgeClass,
  type PmacAttendanceStatus,
  type PmacAvailabilityStatus,
  type PmacEventStatus,
  type PmacPollStatus,
  type PmacPollType,
  type PmacVoteChoice,
} from '@/lib/pmac'

export function PmacEventStatusBadge({ status }: { status: PmacEventStatus }) {
  return (
    <span className={clsx('status-badge', getPmacEventStatusBadgeClass(status))}>
      {PMAC_EVENT_STATUS_LABELS[status]}
    </span>
  )
}

export function PmacAvailabilityBadge({ status }: { status: PmacAvailabilityStatus }) {
  return (
    <span className={clsx('status-badge', getPmacAvailabilityBadgeClass(status))}>
      {PMAC_AVAILABILITY_LABELS[status]}
    </span>
  )
}

export function PmacAttendanceBadge({ status }: { status: PmacAttendanceStatus }) {
  return (
    <span className={clsx('status-badge', getPmacAttendanceBadgeClass(status))}>
      {PMAC_ATTENDANCE_LABELS[status]}
    </span>
  )
}

export function PmacPollStatusBadge({ status }: { status: PmacPollStatus }) {
  return (
    <span className={clsx('status-badge', getPmacPollStatusBadgeClass(status))}>
      {PMAC_POLL_STATUS_LABELS[status]}
    </span>
  )
}

export function PmacPollTypeBadge({ type }: { type: PmacPollType }) {
  return (
    <span className="status-badge bg-indigo-50 text-indigo-700 border-indigo-200">
      {PMAC_POLL_TYPE_LABELS[type]}
    </span>
  )
}

export function PmacVoteChoiceBadge({ choice }: { choice: PmacVoteChoice }) {
  return (
    <span className={clsx('status-badge', getPmacVoteChoiceBadgeClass(choice))}>
      {PMAC_VOTE_CHOICE_LABELS[choice]}
    </span>
  )
}
