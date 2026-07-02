import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { getRequestListWhere } from '@/lib/requestWorkflow'
import { sanitizeCsvCell } from '@/lib/sanitization'
import type { Session } from 'next-auth'

type ExportRequest = Prisma.ServiceRequestGetPayload<{
  include: {
    secretary: {
      select: {
        name: true
        email: true
      }
    }
    coordinator: {
      select: {
        name: true
        email: true
      }
    }
    director: {
      select: {
        name: true
        email: true
      }
    }
    logs: {
      select: {
        action: true
        actorName: true
        actorRole: true
        details: true
        createdAt: true
      }
      orderBy: {
        createdAt: 'asc'
      }
    }
  }
}>

const monthFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDateTime(value?: Date | null) {
  if (!value) {
    return ''
  }

  return value.toISOString()
}

function formatDateOnly(value?: Date | null) {
  if (!value) {
    return ''
  }

  return value.toISOString().slice(0, 10)
}

function getRollingWindowStart(referenceDate: Date) {
  return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 3, 1))
}

function getRollingWindowEnd(referenceDate: Date) {
  return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1))
}

function getMonthKey(value: Date) {
  const year = value.getUTCFullYear()
  const month = `${value.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function getMonthLabel(value: Date) {
  return monthFormatter.format(value)
}

function buildAuditCommentTrail(request: ExportRequest) {
  return request.logs
    .map(log =>
      [
        formatDateTime(log.createdAt),
        log.action,
        log.actorRole,
        log.actorName,
        log.details || '',
      ].join(' | ')
    )
    .join('\n')
}

function buildAllComments(request: ExportRequest) {
  const comments = [
    request.coordinatorNote ? `Coordinator Note: ${request.coordinatorNote}` : '',
    request.directorNote ? `Director Note: ${request.directorNote}` : '',
    ...request.logs
      .filter(log => Boolean(log.details))
      .map(log => `${formatDateTime(log.createdAt)} ${log.actorRole} ${log.actorName}: ${log.details}`),
  ].filter(Boolean)

  return comments.join('\n')
}

function getPastEventsWhere(user: Session['user']): Prisma.ServiceRequestWhereInput {
  const now = new Date()
  const windowStart = getRollingWindowStart(now)
  const windowEnd = getRollingWindowEnd(now)

  return {
    AND: [
      getRequestListWhere(user),
      {
        eventDate: {
          gte: windowStart,
          lt: windowEnd,
        },
      },
    ],
  }
}

export async function getPastEventRequestsForExport(user: Session['user']) {
  return prisma.serviceRequest.findMany({
    where: getPastEventsWhere(user),
    include: {
      secretary: {
        select: {
          name: true,
          email: true,
        },
      },
      coordinator: {
        select: {
          name: true,
          email: true,
        },
      },
      director: {
        select: {
          name: true,
          email: true,
        },
      },
      logs: {
        select: {
          action: true,
          actorName: true,
          actorRole: true,
          details: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
    orderBy: [
      { eventDate: 'desc' },
      { createdAt: 'desc' },
    ],
  })
}

export function buildPastEventsCsv(requests: ExportRequest[]) {
  const monthCounts = requests.reduce<Record<string, number>>((accumulator, request) => {
    const monthKey = getMonthKey(request.eventDate)
    accumulator[monthKey] = (accumulator[monthKey] ?? 0) + 1
    return accumulator
  }, {})

  const headers = [
    'Compilation Month',
    'Monthly Activity Count',
    'Request ID',
    'Event Title',
    'Event Date',
    'End Date',
    'Start Time',
    'End Time',
    'Venue',
    'School',
    'Status',
    'Service Type',
    'Documentation Type',
    'Campus Type',
    'Requester Name',
    'Requester Email',
    'Coordinator Name',
    'Coordinator Email',
    'Coordinator Approved At',
    'Coordinator Note',
    'Director Name',
    'Director Email',
    'Director Approved At',
    'Director Note',
    'Needs Same Day Edit',
    'Needs Same Day Photo',
    'Request Letter',
    'Attachment URL',
    'Event Details',
    'All Comments',
    'Audit Trail',
    'Created At',
    'Updated At',
  ]

  const rows = requests.map(request => [
    getMonthLabel(request.eventDate),
    monthCounts[getMonthKey(request.eventDate)] ?? 0,
    request.id,
    request.eventTitle,
    formatDateOnly(request.eventDate),
    formatDateOnly(request.endDate),
    request.startTime || '',
    request.endTime || '',
    request.eventVenue,
    request.school,
    request.status,
    request.serviceType || 'Unassigned',
    request.documentationType,
    request.campusType,
    request.secretary?.name || '',
    request.secretary?.email || '',
    request.coordinator?.name || '',
    request.coordinator?.email || '',
    formatDateTime(request.coordinatorApprovedAt),
    request.coordinatorNote || '',
    request.director?.name || '',
    request.director?.email || '',
    formatDateTime(request.directorApprovedAt),
    request.directorNote || '',
    request.needsSameDayEdit ? 'Yes' : 'No',
    request.needsSameDayPhoto ? 'Yes' : 'No',
    request.letterContent || '',
    request.letterUrl || '',
    request.eventDetails || '',
    buildAllComments(request),
    buildAuditCommentTrail(request),
    formatDateTime(request.createdAt),
    formatDateTime(request.updatedAt),
  ])

  return [headers, ...rows]
    .map(row => row.map(sanitizeCsvCell).join(','))
    .join('\n')
}
