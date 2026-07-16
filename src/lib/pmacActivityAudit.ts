export type PmacActivityChangeSet = Record<string, {
  before?: unknown
  after?: unknown
}>

const SECRET_KEY_PATTERN = /(api[-_]?key|attachmentcontent|authorization|body|buffer|bytes|content|cookie|credential|filecontent|passcode|password|private[-_]?key|secret|session|token)/i

const ACTION_LABELS: Record<string, string> = {
  ASSIGNMENT_RESPONSE_UPDATED: 'Availability response updated',
  ASSIGNMENTS_UPDATED: 'Event team assigned',
  ATTENDANCE_UPDATED: 'Attendance recorded',
  EVENT_APPROVED: 'Event approved',
  EVENT_COMPLETED: 'Event completed',
  EVENT_CREATED: 'Event created',
  EVENT_IMPORTED_FROM_CMAC: 'Imported from CMAC',
  EVENT_REJECTED: 'Event rejected',
  EVENT_REMOVED_FROM_CMAC_SYNC: 'Removed from CMAC sync',
  EVENT_SUBMITTED: 'Submitted for approval',
  EVENT_UPDATED: 'Event details updated',
  EVENT_UPDATED_FROM_CMAC: 'Synced from CMAC',
  EVENT_WRAP_UP_UPDATED: 'Event wrap-up updated',
  MEMBER_CREATED: 'Member created',
  MEMBER_TAGS_UPDATED: 'Member tags updated',
  MEMBER_UPDATED: 'Member profile updated',
  OFFICER_ASSIGNMENT_UPDATED: 'Leadership role updated',
  POLL_ARCHIVED: 'Poll archived',
  POLL_CLOSED: 'Poll closed',
  POLL_CREATED: 'Poll created',
  POLL_OPENED: 'Poll opened',
  POLL_UPDATED: 'Poll details updated',
  PROJECT_DEADLINE_RECONCILED: 'Deadline status reconciled',
  PROJECT_DIRECTOR_CHECKED: 'Director review completed',
  PROJECT_HEAD_ASSIGNED: 'Executive head assigned',
  PROJECT_LAUNCHED: 'Project launched',
  PROJECT_LINK_ATTACHED: 'Project link attached',
  PROJECT_MEMBERS_ASSIGNED: 'Team assigned',
  PROJECT_MILESTONE_CREATED: 'Milestone created',
  PROJECT_MILESTONE_STATUS_UPDATED: 'Milestone status updated',
  PROJECT_MILESTONE_UPDATED: 'Milestone updated',
  PROJECT_OUTPUT_SUBMITTED: 'Project output submitted',
  PROJECT_STATUS_UPDATED: 'Project status updated',
  PROJECT_UPDATED: 'Project details updated',
  VOTE_CAST: 'Vote recorded',
}

const ACRONYMS = new Set(['CMAC', 'CSV', 'ID', 'PMAC', 'URL'])

export function getPmacActivityActionLabel(action: string) {
  const mapped = ACTION_LABELS[action]
  if (mapped) {
    return mapped
  }

  return action.split('_').map((part) => {
    if (ACRONYMS.has(part)) {
      return part
    }

    return `${part.charAt(0)}${part.slice(1).toLowerCase()}`
  }).join(' ')
}

export function redactPmacActivityText(value: string) {
  return value
    .replace(/\b(authorization)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passcode|secret|token|api[-_ ]?key|cookie|credential)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
}

function sanitizeAuditValue(value: unknown, key: string, depth: number): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return '[REDACTED]'
  }

  if (depth > 6) {
    return '[TRUNCATED]'
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return redactPmacActivityText(value).slice(0, 2_000)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeAuditValue(entry, key, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([childKey, childValue]) => [childKey, sanitizeAuditValue(childValue, childKey, depth + 1)]),
    )
  }

  return String(value)
}

export function sanitizePmacActivityChanges(changes?: PmacActivityChangeSet | null) {
  if (!changes || !Object.keys(changes).length) {
    return null
  }

  return sanitizeAuditValue(changes, 'changes', 0) as Record<string, unknown>
}
