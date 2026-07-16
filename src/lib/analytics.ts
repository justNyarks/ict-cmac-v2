import { SCHOOL_LABELS, SCHOOLS } from '@/lib/schools'
import { prisma } from '@/lib/prisma'
import { getRequestListWhere } from '@/lib/requestWorkflow'
import type { DocumentationType, RequestStatus, School, ServiceType } from '@/types'
import type { Session } from 'next-auth'
import type { Prisma } from '@prisma/client'

export { SCHOOL_LABELS, SCHOOLS }

export type AnalyticsSourceRequest = {
  school: School
  serviceType: ServiceType | null
  documentationType: DocumentationType
  status: RequestStatus
  eventDate: Date
  createdAt: Date
  directorApprovedAt: Date | null
  needsSameDayEdit: boolean
  needsSameDayPhoto: boolean
}

type AnalyticsMetric = {
  label: string
  value: number
}

export type AnalyticsSnapshot = {
  totalRequests: number
  approvalRate: number
  pendingReview: number
  rejected: number
  approved: number
  upcomingEvents: number
  overdueReview: number
  unassignedService: number
  sameDayRequirements: number
  averageApprovalHours: number | null
  bySchool: AnalyticsMetric[]
  statusBreakdown: AnalyticsMetric[]
  serviceTypeBreakdown: AnalyticsMetric[]
  documentationBreakdown: AnalyticsMetric[]
  byMonth: AnalyticsMetric[]
}

export type AnalyticsFilters = {
  from?: string
  to?: string
  school?: School
}

const monthFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

function createCounter<T extends string>(keys: readonly T[]) {
  return keys.reduce(
    (accumulator, key) => {
      accumulator[key] = 0
      return accumulator
    },
    {} as Record<T, number>
  )
}

function getMonthKey(eventDate: Date) {
  const year = eventDate.getUTCFullYear()
  const month = `${eventDate.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)))
}

export function buildAnalyticsSnapshot(requests: AnalyticsSourceRequest[], now = new Date()): AnalyticsSnapshot {
  const schoolCounts = createCounter(SCHOOLS)
  const serviceTypeCounts = createCounter(['CMAC', 'PMAC', 'Unassigned'] as const)
  const documentationCounts = createCounter(['PHOTO', 'VIDEO', 'BOTH'] as const)
  const statusCounts = createCounter(['PENDING', 'COORDINATOR_APPROVED', 'DIRECTOR_APPROVED', 'REJECTED'] as const)
  const monthCounts: Record<string, number> = {}

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const upcomingLimit = todayUtc + (30 * 24 * 60 * 60 * 1000)
  let upcomingEvents = 0
  let overdueReview = 0
  let unassignedService = 0
  let sameDayRequirements = 0
  let approvalHoursTotal = 0
  let approvalHoursCount = 0

  for (const request of requests) {
    schoolCounts[request.school] += 1
    documentationCounts[request.documentationType] += 1
    statusCounts[request.status] += 1

    if (request.serviceType === 'CMAC') {
      serviceTypeCounts.CMAC += 1
    } else if (request.serviceType === 'PMAC') {
      serviceTypeCounts.PMAC += 1
    } else {
      serviceTypeCounts.Unassigned += 1
      unassignedService += 1
    }

    if (request.needsSameDayEdit || request.needsSameDayPhoto) {
      sameDayRequirements += 1
    }

    const eventTime = request.eventDate.getTime()
    if (request.status === 'DIRECTOR_APPROVED' && eventTime >= todayUtc && eventTime < upcomingLimit) {
      upcomingEvents += 1
    }

    if ((request.status === 'PENDING' || request.status === 'COORDINATOR_APPROVED') && eventTime < todayUtc) {
      overdueReview += 1
    }

    if (request.directorApprovedAt) {
      const approvalHours = (request.directorApprovedAt.getTime() - request.createdAt.getTime()) / (60 * 60 * 1000)
      if (approvalHours >= 0) {
        approvalHoursTotal += approvalHours
        approvalHoursCount += 1
      }
    }

    const monthKey = getMonthKey(request.eventDate)
    monthCounts[monthKey] = (monthCounts[monthKey] ?? 0) + 1
  }

  const totalRequests = requests.length
  const directorApproved = statusCounts.DIRECTOR_APPROVED
  const decidedRequests = directorApproved + statusCounts.REJECTED

  return {
    totalRequests,
    approvalRate: decidedRequests > 0 ? Math.round((directorApproved / decidedRequests) * 100) : 0,
    pendingReview: statusCounts.PENDING + statusCounts.COORDINATOR_APPROVED,
    rejected: statusCounts.REJECTED,
    approved: directorApproved,
    upcomingEvents,
    overdueReview,
    unassignedService,
    sameDayRequirements,
    averageApprovalHours: approvalHoursCount > 0
      ? Math.round((approvalHoursTotal / approvalHoursCount) * 10) / 10
      : null,
    bySchool: SCHOOLS.map(school => ({
      label: SCHOOL_LABELS[school],
      value: schoolCounts[school],
    })).filter(metric => metric.value > 0).sort((left, right) => right.value - left.value),
    statusBreakdown: [
      { label: 'Fully Approved', value: statusCounts.DIRECTOR_APPROVED },
      { label: 'Coord. Approved', value: statusCounts.COORDINATOR_APPROVED },
      { label: 'Pending', value: statusCounts.PENDING },
      { label: 'Rejected', value: statusCounts.REJECTED },
    ],
    serviceTypeBreakdown: [
      { label: 'CMAC', value: serviceTypeCounts.CMAC },
      { label: 'PMAC', value: serviceTypeCounts.PMAC },
      { label: 'Unassigned', value: serviceTypeCounts.Unassigned },
    ],
    documentationBreakdown: [
      { label: 'Photo', value: documentationCounts.PHOTO },
      { label: 'Video', value: documentationCounts.VIDEO },
      { label: 'Both', value: documentationCounts.BOTH },
    ],
    byMonth: Object.entries(monthCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-12)
      .map(([monthKey, value]) => ({
        label: formatMonthLabel(monthKey),
        value,
      })),
  }
}

function parseDateBoundary(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function parseAnalyticsFilters(input: Record<string, string | string[] | undefined>): AnalyticsFilters {
  let from = typeof input.from === 'string' && parseDateBoundary(input.from) ? input.from : undefined
  let to = typeof input.to === 'string' && parseDateBoundary(input.to, true) ? input.to : undefined
  const school = typeof input.school === 'string' && SCHOOLS.includes(input.school as School)
    ? input.school as School
    : undefined

  if (from && to && from > to) {
    [from, to] = [to, from]
  }

  return { from, to, school }
}

export function getAnalyticsPeriodLabel(filters: AnalyticsFilters) {
  if (!filters.from && !filters.to) return 'All event dates'
  if (filters.from && filters.to) return `${filters.from} to ${filters.to}`
  if (filters.from) return `From ${filters.from}`
  return `Through ${filters.to}`
}

export async function getAnalyticsSnapshot(user: Session['user'], filters: AnalyticsFilters = {}) {
  const eventDate: Prisma.DateTimeFilter | undefined = filters.from || filters.to
    ? {
        gte: parseDateBoundary(filters.from),
        lte: parseDateBoundary(filters.to, true),
      }
    : undefined

  const requests = await prisma.serviceRequest.findMany({
    where: {
      AND: [
        getRequestListWhere(user),
        filters.school ? { school: filters.school } : {},
        eventDate ? { eventDate } : {},
      ],
    },
    select: {
      school: true,
      serviceType: true,
      documentationType: true,
      status: true,
      eventDate: true,
      createdAt: true,
      directorApprovedAt: true,
      needsSameDayEdit: true,
      needsSameDayPhoto: true,
    },
    orderBy: {
      eventDate: 'asc',
    },
  })

  return buildAnalyticsSnapshot(requests)
}
