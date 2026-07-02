function normalizeValue(value: unknown) {
  return String(value ?? '').toLowerCase()
}

function matchesQuery<T extends object>(record: T, query: string, keys: Array<keyof T>) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return keys.some((key) => normalizeValue(record[key]).includes(normalizedQuery))
}

export function filterPmacMembers<T extends {
  fullName: string
  email: string
  courseOrDepartment: string | null | undefined
  notes: string | null | undefined
  clubRole: string
  status: string
}>(members: T[], query: string, status: string, clubRole: string) {
  return members.filter((member) => (
    matchesQuery(member, query, ['fullName', 'email', 'courseOrDepartment', 'notes'])
    && (status === 'ALL' || member.status === status)
    && (clubRole === 'ALL' || member.clubRole === clubRole)
  ))
}

export function filterPmacEvents<T extends {
  title: string
  venue: string
  description?: string | null
  status: string
}>(events: T[], query: string, status: string) {
  return events.filter((event) => (
    matchesQuery(event, query, ['title', 'venue', 'description'])
    && (status === 'ALL' || event.status === status)
  ))
}

export function filterPmacPolls<T extends {
  title: string
  description?: string | null
  status: string
  type: string
}>(polls: T[], query: string, status: string, pollType: string) {
  return polls.filter((poll) => (
    matchesQuery(poll, query, ['title', 'description'])
    && (status === 'ALL' || poll.status === status)
    && (pollType === 'ALL' || poll.type === pollType)
  ))
}

export function filterPmacActivity<T extends {
  summary: string
  details?: string | null
  actorName: string
  action: string
  entityType: string
}>(entries: T[], query: string, entityType: string) {
  return entries.filter((entry) => (
    matchesQuery(entry, query, ['summary', 'details', 'actorName', 'action'])
    && (entityType === 'ALL' || entry.entityType === entityType)
  ))
}
