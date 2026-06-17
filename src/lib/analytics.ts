import { prisma } from '@/lib/prisma'
import { getRequestListWhere } from '@/lib/requestWorkflow'
import type { DocumentationType, RequestStatus, School, ServiceType } from '@/types'
import type { Session } from 'next-auth'

export const SCHOOLS: School[] = ['SNAHS', 'SBAHM', 'SITE', 'SASTE', 'MEDICINE', 'BEU', 'UNIVERSITY', 'HR']

export const SCHOOL_LABELS: Record<School, string> = {
  SNAHS: 'SNAHS',
  SBAHM: 'SBAHM',
  SITE: 'SITE',
  SASTE: 'SASTE',
  MEDICINE: 'SOM',
  BEU: 'BEU',
  UNIVERSITY: 'UNIVERSITY',
  HR: 'HR',
}

type AnalyticsSourceRequest = {
  school: School
  serviceType: ServiceType | null
  documentationType: DocumentationType
  status: RequestStatus
  eventDate: Date
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
  bySchool: AnalyticsMetric[]
  statusBreakdown: AnalyticsMetric[]
  serviceTypeBreakdown: AnalyticsMetric[]
  documentationBreakdown: AnalyticsMetric[]
  byMonth: AnalyticsMetric[]
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

export function buildAnalyticsSnapshot(requests: AnalyticsSourceRequest[]): AnalyticsSnapshot {
  const schoolCounts = createCounter(SCHOOLS)
  const serviceTypeCounts = createCounter(['CMAC', 'PMAC', 'Unassigned'] as const)
  const documentationCounts = createCounter(['PHOTO', 'VIDEO', 'BOTH'] as const)
  const statusCounts = createCounter(['PENDING', 'COORDINATOR_APPROVED', 'DIRECTOR_APPROVED', 'REJECTED'] as const)
  const monthCounts: Record<string, number> = {}

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
    }

    const monthKey = getMonthKey(request.eventDate)
    monthCounts[monthKey] = (monthCounts[monthKey] ?? 0) + 1
  }

  const totalRequests = requests.length
  const directorApproved = statusCounts.DIRECTOR_APPROVED

  return {
    totalRequests,
    approvalRate: totalRequests > 0 ? Math.round((directorApproved / totalRequests) * 100) : 0,
    pendingReview: statusCounts.PENDING + statusCounts.COORDINATOR_APPROVED,
    rejected: statusCounts.REJECTED,
    bySchool: SCHOOLS.map(school => ({
      label: SCHOOL_LABELS[school],
      value: schoolCounts[school],
    })),
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
      .map(([monthKey, value]) => ({
        label: formatMonthLabel(monthKey),
        value,
      })),
  }
}

export async function getAnalyticsSnapshot(user: Session['user']) {
  const requests = await prisma.serviceRequest.findMany({
    where: getRequestListWhere(user),
    select: {
      school: true,
      serviceType: true,
      documentationType: true,
      status: true,
      eventDate: true,
    },
    orderBy: {
      eventDate: 'asc',
    },
  })

  return buildAnalyticsSnapshot(requests)
}
