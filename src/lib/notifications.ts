import type { Prisma, RequestStatus } from '@prisma/client'
import type { Session } from 'next-auth'

import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { isCoreWorkflowRole, isPmacSystemRole } from '@/lib/roles'
import type { AppNotification } from '@/types/notifications'

type SessionUser = Session['user']

function buildCoreNotificationWhere(user: SessionUser): Prisma.AuditLogWhereInput {
  if (user.role === 'SECRETARY') {
    return {
      OR: [
        {
          action: { in: ['COORDINATOR_APPROVED', 'DIRECTOR_APPROVED', 'REJECTED'] },
          request: {
            is: {
              deletedAt: null,
              secretaryId: user.id,
            },
          },
        },
        {
          action: { in: ['DIRECTOR_APPROVED', 'DIRECT_BYPASS'] },
          request: {
            is: {
              deletedAt: null,
              status: 'DIRECTOR_APPROVED',
            },
          },
        },
      ],
    }
  }

  if (user.role === 'CMAC_COORDINATOR') {
    return {
      OR: [
        {
          action: 'SUBMITTED',
          request: {
            is: {
              deletedAt: null,
              status: 'PENDING',
            },
          },
        },
        {
          action: 'DIRECT_BYPASS',
          request: {
            is: {
              deletedAt: null,
              status: 'DIRECTOR_APPROVED',
            },
          },
        },
      ],
    }
  }

  if (user.role === 'ICT_DIRECTOR') {
    return {
      action: 'COORDINATOR_APPROVED',
      request: {
        is: {
          deletedAt: null,
          status: 'COORDINATOR_APPROVED',
        },
      },
    }
  }

  return {
    id: '__never__',
  }
}

function formatCoreNotification(
  user: SessionUser,
  log: {
    id: string
    action: string
    createdAt: Date
    request: {
      id: string
      eventTitle: string
      status: RequestStatus
      secretaryId: string
    }
  }
): AppNotification {
  const isOwnRequest = log.request.secretaryId === user.id

  if (user.role === 'SECRETARY') {
    if (!isOwnRequest) {
      return {
        id: log.id,
        title: 'New shared calendar event',
        description: `"${log.request.eventTitle}" was approved and added to the calendar.`,
        tone: 'info',
        createdAt: log.createdAt.toISOString(),
        href: '/calendar',
        module: 'CORE',
      }
    }

    if (log.action === 'COORDINATOR_APPROVED') {
      return {
        id: log.id,
        title: `Coordinator approved "${log.request.eventTitle}"`,
        description: 'Awaiting final approval from the ICT Director.',
        tone: 'warning',
        createdAt: log.createdAt.toISOString(),
        href: '/requests',
        module: 'CORE',
      }
    }

    if (log.action === 'REJECTED') {
      return {
        id: log.id,
        title: `"${log.request.eventTitle}" was rejected`,
        description: 'Open Requests to read the latest note.',
        tone: 'danger',
        createdAt: log.createdAt.toISOString(),
        href: '/requests',
        module: 'CORE',
      }
    }

    return {
      id: log.id,
      title: `"${log.request.eventTitle}" is fully approved`,
      description: 'Ready to print the request receipt.',
      tone: 'success',
      createdAt: log.createdAt.toISOString(),
      href: '/requests',
      module: 'CORE',
    }
  }

  if (user.role === 'CMAC_COORDINATOR') {
    if (log.action === 'DIRECT_BYPASS') {
      return {
        id: log.id,
        title: 'Director skipped coordinator review',
        description: `"${log.request.eventTitle}" moved straight to the shared calendar.`,
        tone: 'info',
        createdAt: log.createdAt.toISOString(),
        href: '/requests',
        module: 'CORE',
      }
    }

    return {
      id: log.id,
      title: 'New request needs review',
      description: `"${log.request.eventTitle}" is waiting for coordinator approval.`,
      tone: 'warning',
      createdAt: log.createdAt.toISOString(),
      href: '/requests',
      module: 'CORE',
    }
  }

  return {
    id: log.id,
    title: 'Coordinator approved a request',
    description: `"${log.request.eventTitle}" is waiting for final sign-off.`,
    tone: 'warning',
    createdAt: log.createdAt.toISOString(),
    href: '/requests',
    module: 'CORE',
  }
}

async function getCoreNotificationFeed(user: SessionUser, limit: number) {
  const logs = await prisma.auditLog.findMany({
    where: buildCoreNotificationWhere(user),
    select: {
      id: true,
      action: true,
      createdAt: true,
      request: {
        select: {
          id: true,
          eventTitle: true,
          status: true,
          secretaryId: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return logs.map((log) => formatCoreNotification(user, log))
}

async function getPmacNotificationFeed(user: SessionUser, limit: number) {
  if (!hasPmacV4Delegates()) {
    return []
  }

  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 48))

  const [pendingEvents, assignments, polls, activity] = await Promise.all([
    user.role === 'CMAC_COORDINATOR'
      ? prisma.pmacEvent.findMany({
          where: {
            status: 'PENDING_APPROVAL',
          },
          select: {
            id: true,
            title: true,
            submittedAt: true,
          },
          orderBy: {
            submittedAt: 'desc',
          },
          take: 3,
        })
      : Promise.resolve([]),
    user.pmacMemberId
      ? prisma.pmacEventAssignment.findMany({
          where: {
            memberId: user.pmacMemberId,
            availabilityResponse: 'PENDING',
            event: {
              status: 'APPROVED',
              startDateTime: {
                gte: now,
                lte: soon,
              },
            },
          },
          select: {
            id: true,
            event: {
              select: {
                id: true,
                title: true,
                startDateTime: true,
              },
            },
          },
          orderBy: {
            event: {
              startDateTime: 'asc',
            },
          },
          take: 2,
        })
      : Promise.resolve([]),
    isPmacSystemRole(user.role)
      ? prisma.pmacPoll.findMany({
          where: {
            status: 'OPEN',
            closesAt: {
              gte: now,
              lte: soon,
            },
            votes: user.id
              ? {
                  none: {
                    voterId: user.id,
                  },
                }
              : undefined,
          },
          select: {
            id: true,
            title: true,
            closesAt: true,
          },
          orderBy: {
            closesAt: 'asc',
          },
          take: 2,
        })
      : Promise.resolve([]),
    prisma.pmacActivityLog.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - (1000 * 60 * 60 * 24)),
        },
        ...(user.role === 'PMAC_EXECUTIVE' || user.role === 'PMAC_MEMBER'
          ? {
              entityType: {
                in: ['EVENT', 'POLL', 'ATTACHMENT'],
              },
            }
          : {}),
      },
      select: {
        id: true,
        summary: true,
        createdAt: true,
        eventId: true,
        pollId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 2,
    }),
  ])

  const notifications: AppNotification[] = [
    ...pendingEvents.map((event) => ({
      id: `pmac-pending-${event.id}`,
      title: 'PMAC event awaiting approval',
      description: `"${event.title}" is ready for coordinator review.`,
      tone: 'warning' as const,
      createdAt: (event.submittedAt ?? now).toISOString(),
      href: '/coordinator/pmac/events',
      module: 'PMAC' as const,
    })),
    ...assignments.map((assignment) => ({
      id: `pmac-assignment-${assignment.id}`,
      title: 'PMAC assignment needs response',
      description: `"${assignment.event.title}" is coming up soon. Confirm your availability.`,
      tone: 'warning' as const,
      createdAt: assignment.event.startDateTime.toISOString(),
      href: `/pmac/events/${assignment.event.id}`,
      module: 'PMAC' as const,
    })),
    ...polls.map((poll) => ({
      id: `pmac-poll-${poll.id}`,
      title: 'Open PMAC poll awaiting your vote',
      description: `"${poll.title}" closes soon.`,
      tone: 'info' as const,
      createdAt: (poll.closesAt ?? now).toISOString(),
      href: `/pmac/polls/${poll.id}`,
      module: 'PMAC' as const,
    })),
    ...activity.map((entry) => ({
      id: `pmac-activity-${entry.id}`,
      title: 'Recent PMAC activity',
      description: entry.summary,
      tone: 'success' as const,
      createdAt: entry.createdAt.toISOString(),
      href: entry.pollId ? `/pmac/polls/${entry.pollId}` : entry.eventId ? `/pmac/events/${entry.eventId}` : '/coordinator/pmac',
      module: 'PMAC' as const,
    })),
  ]

  return notifications
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit)
}

export async function getNotificationFeed(user: SessionUser, limit = 8): Promise<AppNotification[]> {
  const [coreNotifications, pmacNotifications] = await Promise.all([
    isCoreWorkflowRole(user.role) ? getCoreNotificationFeed(user, limit) : Promise.resolve([]),
    (isPmacSystemRole(user.role) || user.role === 'CMAC_COORDINATOR') ? getPmacNotificationFeed(user, limit) : Promise.resolve([]),
  ])

  return [...coreNotifications, ...pmacNotifications]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit)
}
