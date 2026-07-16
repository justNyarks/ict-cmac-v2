import { PMAC_EXECUTIVE_TITLES } from '@/lib/pmac'
import { isPmacDepartment, type PmacDepartment } from '@/lib/pmacMembers'

export const PMAC_REPORT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'PLANNED',
  'ON_HOLD',
  'ARCHIVED',
  'OPEN',
  'CLOSED',
  'PRESENT',
  'LATE',
  'ABSENT',
  'EXCUSED',
] as const

export type PmacReportFilters = {
  from?: string
  to?: string
  status?: string
  branch?: (typeof PMAC_EXECUTIVE_TITLES)[number]
  department?: PmacDepartment
  subject?: string
}

type SearchParamsReader = Pick<URLSearchParams, 'get'>

function parseDate(value: string | null, fieldName: string) {
  if (!value) {
    return undefined
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const year = Number(match?.[1])
  const month = Number(match?.[2])
  const day = Number(match?.[3])
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  const isExactDate = !!match
    && calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day

  if (!isExactDate) {
    throw new Error(`Invalid report filter: ${fieldName} must be a valid date.`)
  }

  return value
}

function parseSubject(value: string | null) {
  if (!value) {
    return undefined
  }

  const separator = value.indexOf(':')
  const type = value.slice(0, separator)
  const id = value.slice(separator + 1)

  if (!['EVENT', 'PROJECT'].includes(type) || !/^[A-Za-z0-9_-]{1,191}$/.test(id)) {
    throw new Error('Invalid report filter: event or project selection is invalid.')
  }

  return `${type}:${id}`
}

export function parsePmacReportFilters(searchParams: SearchParamsReader): PmacReportFilters {
  const from = parseDate(searchParams.get('from'), 'From')
  const to = parseDate(searchParams.get('to'), 'To')
  const status = searchParams.get('status') || undefined
  const branch = searchParams.get('branch') || undefined
  const department = searchParams.get('department') || undefined
  const subject = parseSubject(searchParams.get('subject'))

  if (from && to && from > to) {
    throw new Error('Invalid report filter: From date must be before or equal to To date.')
  }

  if (status && !PMAC_REPORT_STATUSES.includes(status as (typeof PMAC_REPORT_STATUSES)[number])) {
    throw new Error('Invalid report filter: status is unsupported.')
  }

  if (branch && !PMAC_EXECUTIVE_TITLES.includes(branch as (typeof PMAC_EXECUTIVE_TITLES)[number])) {
    throw new Error('Invalid report filter: executive branch is unsupported.')
  }

  if (department && !isPmacDepartment(department)) {
    throw new Error('Invalid report filter: department is unsupported.')
  }

  return {
    from,
    to,
    status,
    branch: branch as PmacReportFilters['branch'],
    department: department as PmacReportFilters['department'],
    subject,
  }
}

export function getPmacReportDateRange(filters: PmacReportFilters) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000+08:00`) : undefined
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999+08:00`) : undefined

  return from || to
    ? {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      }
    : undefined
}

export function getPmacReportSubject(filters: PmacReportFilters) {
  if (!filters.subject) {
    return null
  }

  const [type, id] = filters.subject.split(':', 2)
  return { type: type as 'EVENT' | 'PROJECT', id }
}

export function describePmacReportPeriod(filters: PmacReportFilters) {
  if (filters.from && filters.to) {
    return `${filters.from} to ${filters.to}`
  }

  if (filters.from) {
    return `From ${filters.from}`
  }

  if (filters.to) {
    return `Through ${filters.to}`
  }

  return 'All available dates'
}
