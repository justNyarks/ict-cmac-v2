import type { Prisma } from '@prisma/client'
import type { Session } from 'next-auth'

import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { buildPmacProjectWhere } from '@/lib/pmacProjects'
import { getRoleLabel } from '@/lib/roles'

type SessionUser = Session['user']
type PmacDbClient = Prisma.TransactionClient | typeof prisma

export const PMAC_ACTIVITY_ENTITY_TYPES = [
  'EVENT',
  'POLL',
  'PROJECT',
  'MEMBER',
  'ACCOUNT',
  'ATTACHMENT',
  'REPORT',
] as const

export type PmacActivityEntityType = (typeof PMAC_ACTIVITY_ENTITY_TYPES)[number]

export type PmacActivityFeedOptions = {
  page?: number
  pageSize?: number
  query?: string
  entityType?: string
  action?: string
  actorId?: string
  from?: string
  to?: string
}

export type PmacActivitySearchParams = Record<string, string | string[] | undefined>

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function parsePmacActivitySearchParams(searchParams: PmacActivitySearchParams): PmacActivityFeedOptions {
  return {
    page: Number(getSingleSearchParam(searchParams.page) ?? '1'),
    query: getSingleSearchParam(searchParams.query),
    entityType: getSingleSearchParam(searchParams.entityType),
    action: getSingleSearchParam(searchParams.action),
    actorId: getSingleSearchParam(searchParams.actorId),
    from: getSingleSearchParam(searchParams.from),
    to: getSingleSearchParam(searchParams.to),
  }
}

export type PmacActivityInput = {
  entityType: PmacActivityEntityType
  entityId: string
  eventId?: string | null
  pollId?: string | null
  projectId?: string | null
  memberId?: string | null
  actorId?: string | null
  actorName: string
  actorRole: SessionUser['role']
  action: string
  summary: string
  details?: string | null
}

const NO_ACTIVITY_ACCESS = { id: '__missing_activity_access__' } as const

export function buildPmacActivityWhere(user: SessionUser): Prisma.PmacActivityLogWhereInput {
  if (user.role === 'CMAC_COORDINATOR' || user.role === 'PMAC_DIRECTOR' || user.role === 'PMAC_ASSISTANT_DIRECTOR' || user.role === 'PMAC_SECRETARY') {
    return {}
  }

  if ((user.role !== 'PMAC_EXECUTIVE' && user.role !== 'PMAC_MEMBER') || !user.pmacMemberId) {
    return NO_ACTIVITY_ACCESS
  }

  return {
    OR: [
      {
        event: {
          is: {
            assignments: {
              some: {
                memberId: user.pmacMemberId,
              },
            },
          },
        },
      },
      {
        pollId: {
          not: null,
        },
      },
      {
        project: {
          is: buildPmacProjectWhere(user),
        },
      },
      {
        memberId: user.pmacMemberId,
      },
      {
        actorId: user.id,
      },
    ],
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return fallback
  }

  return Math.min(Math.floor(value), maximum)
}

function parseActivityDate(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildPmacActivityFilterWhere(options: PmacActivityFeedOptions): Prisma.PmacActivityLogWhereInput {
  const query = options.query?.trim().slice(0, 120) ?? ''
  const entityType = PMAC_ACTIVITY_ENTITY_TYPES.includes(options.entityType as PmacActivityEntityType)
    ? options.entityType as PmacActivityEntityType
    : null
  const action = options.action?.trim().slice(0, 100) ?? ''
  const actorId = options.actorId?.trim().slice(0, 191) ?? ''
  const from = parseActivityDate(options.from)
  const to = parseActivityDate(options.to, true)

  return {
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(actorId ? { actorId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            { summary: { contains: query } },
            { details: { contains: query } },
            { actorName: { contains: query } },
            { action: { contains: query } },
          ],
        }
      : {}),
  }
}

export function getPmacActivityHref(
  user: SessionUser,
  entry: {
  entityType: PmacActivityInput['entityType']
  eventId: string | null
  pollId: string | null
  projectId?: string | null
  memberId: string | null
  entityId: string
}) {
  if (entry.eventId) {
    return `/pmac/events/${entry.eventId}`
  }

  if (entry.pollId) {
    return `/pmac/polls/${entry.pollId}`
  }

  if (entry.projectId || entry.entityType === 'PROJECT') {
    return '/pmac/projects'
  }

  if (entry.entityType === 'MEMBER' || entry.entityType === 'ACCOUNT') {
    if (user.role === 'CMAC_COORDINATOR') {
      return '/coordinator/pmac'
    }

    if (user.role === 'PMAC_DIRECTOR' || user.role === 'PMAC_SECRETARY') {
      return '/pmac/members'
    }

    if (user.role === 'PMAC_EXECUTIVE') {
      return '/pmac/tags'
    }

    return '/pmac/activity'
  }

  if (entry.entityType === 'REPORT') {
    return user.role === 'CMAC_COORDINATOR' ? '/coordinator/pmac/reports' : '/pmac/reports'
  }

  return '/pmac/events'
}

export async function recordPmacActivity(db: PmacDbClient, input: PmacActivityInput) {
  const activityDelegate = (db as unknown as Record<string, unknown>).pmacActivityLog as {
    create?: (args: {
      data: {
        entityType: PmacActivityInput['entityType']
        entityId: string
        eventId: string | null
        pollId: string | null
        projectId: string | null
        memberId: string | null
        actorId: string | null
        actorName: string
        actorRole: SessionUser['role']
        action: string
        summary: string
        details: string | null
      }
    }) => Promise<unknown>
  } | undefined

  if (typeof activityDelegate?.create !== 'function') {
    return
  }

  await activityDelegate.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      eventId: input.eventId ?? null,
      pollId: input.pollId ?? null,
      projectId: input.projectId ?? null,
      memberId: input.memberId ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.action,
      summary: input.summary,
      details: input.details ?? null,
    },
  })
}

export async function getPmacActivityFeed(user: SessionUser, options: PmacActivityFeedOptions = {}) {
  if (!hasPmacV4Delegates()) {
    return {
      entries: [],
      actions: [],
      actors: [],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
      },
    }
  }

  const accessWhere = buildPmacActivityWhere(user)
  const filterWhere = buildPmacActivityFilterWhere(options)
  const where: Prisma.PmacActivityLogWhereInput = {
    AND: [accessWhere, filterWhere],
  }
  const requestedPage = normalizePositiveInteger(options.page, 1, 100_000)
  const pageSize = normalizePositiveInteger(options.pageSize, 25, 50)

  const [total, actionRows, actorRows] = await Promise.all([
    prisma.pmacActivityLog.count({ where }),
    prisma.pmacActivityLog.findMany({
      where: accessWhere,
      distinct: ['action'],
      orderBy: { action: 'asc' },
      select: { action: true },
    }),
    prisma.pmacActivityLog.findMany({
      where: {
        AND: [
          accessWhere,
          { actorId: { not: null } },
        ],
      },
      distinct: ['actorId'],
      orderBy: { actorName: 'asc' },
      select: {
        actorId: true,
        actorName: true,
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const entries = await prisma.pmacActivityLog.findMany({
    where,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      eventId: true,
      pollId: true,
      projectId: true,
      memberId: true,
      actorName: true,
      actorRole: true,
      action: true,
      summary: true,
      details: true,
      createdAt: true,
    },
  })

  return {
    entries: entries.map((entry) => ({
      ...entry,
      actorRoleLabel: getRoleLabel(entry.actorRole),
      href: getPmacActivityHref(user, entry),
    })),
    actions: actionRows.map((entry) => entry.action),
    actors: actorRows.flatMap((entry) => entry.actorId ? [{ id: entry.actorId, name: entry.actorName }] : []),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  }
}
