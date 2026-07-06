import type { Prisma } from '@prisma/client'
import type { Session } from 'next-auth'

import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { getRoleLabel } from '@/lib/roles'

type SessionUser = Session['user']
type PmacDbClient = Prisma.TransactionClient | typeof prisma

export type PmacActivityInput = {
  entityType: 'EVENT' | 'POLL' | 'MEMBER' | 'ACCOUNT' | 'ATTACHMENT' | 'REPORT' | 'PROJECT'
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

function buildPmacActivityWhere(user: SessionUser): Prisma.PmacActivityLogWhereInput {
  if (user.role === 'CMAC_COORDINATOR' || user.role === 'PMAC_DIRECTOR' || user.role === 'PMAC_ASSISTANT_DIRECTOR' || user.role === 'PMAC_SECRETARY') {
    return {}
  }

  if (user.role === 'PMAC_EXECUTIVE' || user.role === 'PMAC_MEMBER') {
    return {
      entityType: {
        in: ['EVENT', 'POLL', 'ATTACHMENT', 'PROJECT'],
      },
    }
  }

  return {
    id: '__never__',
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

export async function getPmacActivityFeed(user: SessionUser, limit = 60) {
  if (!hasPmacV4Delegates()) {
    return []
  }

  const entries = await prisma.pmacActivityLog.findMany({
    where: buildPmacActivityWhere(user),
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
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

  return entries.map((entry) => ({
    ...entry,
    actorRoleLabel: getRoleLabel(entry.actorRole),
    href: getPmacActivityHref(user, entry),
  }))
}
