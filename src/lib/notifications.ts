import type { Prisma, RequestStatus } from '@prisma/client'
import type { Session } from 'next-auth'

import {
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_PROJECT_STATUS_LABELS,
  getRecommendedAssignmentRoles,
  isPmacAttendanceManagerRole,
  isPmacEventManagerRole,
  isPmacProjectLauncherRole,
  isPmacStaffingManagerRole,
} from '@/lib/pmac'
import { buildPmacActivityNotificationWhere, PMAC_PROJECT_NOTIFICATION_ACTIONS } from '@/lib/pmacNotificationPolicy'
import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { isCoreWorkflowRole, isPmacSystemRole } from '@/lib/roles'
import type { AppNotification } from '@/types/notifications'

type SessionUser = Session['user']
type NotificationPriority = AppNotification['priority']

function getPriorityWeight(priority: NotificationPriority) {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
    default:
      return 1
  }
}

function buildNotification(
  notification: Omit<AppNotification, 'isRead'> & { isRead?: boolean }
): AppNotification {
  return {
    ...notification,
    isRead: notification.isRead ?? false,
    dueLabel: notification.dueLabel ?? null,
  }
}

function isToday(date: Date) {
  const now = new Date()
  return (
    now.getFullYear() === date.getFullYear()
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate()
  )
}

export function buildCoreNotificationWhere(user: SessionUser): Prisma.AuditLogWhereInput {
  if (user.role === 'SECRETARY') {
    return {
      OR: [
        {
          action: { in: ['COORDINATOR_APPROVED', 'DIRECTOR_APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'CANCELLED'] },
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
          action: { in: ['SUBMITTED', 'RESUBMITTED'] },
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
        {
          action: 'CANCELLED',
          request: {
            is: {
              deletedAt: null,
              status: 'CANCELLED',
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
      eventDate?: Date
    }
  }
): AppNotification {
  const isOwnRequest = log.request.secretaryId === user.id
  const dueLabel = log.request.eventDate && isToday(log.request.eventDate) ? 'Event day' : null
  const requestHref = `/requests?requestId=${encodeURIComponent(log.request.id)}`

  if (user.role === 'SECRETARY') {
    if (!isOwnRequest) {
      return buildNotification({
        id: `core-calendar-${log.id}`,
        title: 'New shared calendar event',
        description: `"${log.request.eventTitle}" was approved and added to the calendar.`,
        tone: 'info',
        priority: 'medium',
        createdAt: log.createdAt.toISOString(),
        href: '/calendar',
        module: 'CORE',
        dueLabel,
      })
    }

    if (log.action === 'COORDINATOR_APPROVED') {
      return buildNotification({
        id: `core-coordinator-approved-${log.id}`,
        title: `Coordinator approved "${log.request.eventTitle}"`,
        description: 'Awaiting final approval from the ICT Director.',
        tone: 'warning',
        priority: 'high',
        createdAt: log.createdAt.toISOString(),
        href: requestHref,
        module: 'CORE',
        dueLabel,
      })
    }

    if (log.action === 'REJECTED') {
      return buildNotification({
        id: `core-rejected-${log.id}`,
        title: `"${log.request.eventTitle}" was rejected`,
        description: 'Open Requests to read the latest note.',
        tone: 'danger',
        priority: 'critical',
        createdAt: log.createdAt.toISOString(),
        href: requestHref,
        module: 'CORE',
        dueLabel,
      })
    }

    if (log.action === 'REVISION_REQUESTED') {
      return buildNotification({
        id: `core-revision-${log.id}`,
        title: `Changes requested for "${log.request.eventTitle}"`,
        description: 'Open the request, correct its details, then resubmit it.',
        tone: 'warning',
        priority: 'high',
        createdAt: log.createdAt.toISOString(),
        href: requestHref,
        module: 'CORE',
        dueLabel,
      })
    }

    if (log.action === 'CANCELLED') {
      return buildNotification({
        id: `core-cancelled-${log.id}`,
        title: `"${log.request.eventTitle}" was cancelled`,
        description: 'The request and its operational history remain available.',
        tone: 'danger',
        priority: 'high',
        createdAt: log.createdAt.toISOString(),
        href: requestHref,
        module: 'CORE',
        dueLabel,
      })
    }

    return buildNotification({
      id: `core-approved-${log.id}`,
      title: `"${log.request.eventTitle}" is fully approved`,
      description: 'Ready to print the request receipt.',
      tone: 'success',
      priority: 'medium',
      createdAt: log.createdAt.toISOString(),
      href: requestHref,
      module: 'CORE',
      dueLabel,
    })
  }

  if (user.role === 'CMAC_COORDINATOR') {
    if (log.action === 'CANCELLED') {
      return buildNotification({
        id: `core-cancelled-coordinator-${log.id}`,
        title: 'Approved event cancelled',
        description: `"${log.request.eventTitle}" was closed by the ICT Director.`,
        tone: 'danger',
        priority: 'high',
        createdAt: log.createdAt.toISOString(),
        href: requestHref,
        module: 'CORE',
        dueLabel,
      })
    }

    if (log.action === 'DIRECT_BYPASS') {
      return buildNotification({
        id: `core-bypass-${log.id}`,
        title: 'Director skipped coordinator review',
        description: `"${log.request.eventTitle}" moved straight to the shared calendar.`,
        tone: 'info',
        priority: 'low',
        createdAt: log.createdAt.toISOString(),
        href: requestHref,
        module: 'CORE',
        dueLabel,
      })
    }

    return buildNotification({
      id: `core-review-${log.id}`,
      title: 'New request needs review',
      description: `"${log.request.eventTitle}" is waiting for coordinator approval.`,
      tone: 'warning',
      priority: 'high',
      createdAt: log.createdAt.toISOString(),
      href: requestHref,
      module: 'CORE',
      dueLabel,
    })
  }

  return buildNotification({
    id: `core-director-review-${log.id}`,
    title: 'Coordinator approved a request',
    description: `"${log.request.eventTitle}" is waiting for final sign-off.`,
    tone: 'warning',
    priority: 'high',
    createdAt: log.createdAt.toISOString(),
    href: requestHref,
    module: 'CORE',
    dueLabel,
  })
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
          eventDate: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return logs.map((log) => formatCoreNotification(user, log))
}

function getPmacProjectNotificationWhere(user: SessionUser): Prisma.PmacProjectWhereInput | null {
  if (isPmacProjectLauncherRole(user.role)) {
    return {}
  }

  if (!user.pmacMemberId || (user.role !== 'PMAC_EXECUTIVE' && user.role !== 'PMAC_MEMBER')) {
    return null
  }

  return {
    OR: [
      {
        headMemberId: user.pmacMemberId,
      },
      {
        memberAssignments: {
          some: {
            memberId: user.pmacMemberId,
          },
        },
      },
    ],
  }
}

async function getPmacNotificationFeed(user: SessionUser, limit: number) {
  if (!hasPmacV4Delegates()) {
    return []
  }

  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 48))
  const recent = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 7))
  const projectWhere = getPmacProjectNotificationWhere(user)
  const activityWhere = buildPmacActivityNotificationWhere(user, new Date(now.getTime() - (1000 * 60 * 60 * 24)))

  const [pendingEvents, assignments, polls, activity, staffingEvents, attendanceGaps, projectActivity] = await Promise.all([
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
    activityWhere
      ? prisma.pmacActivityLog.findMany({
          where: activityWhere,
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
        })
      : Promise.resolve([]),
    user.role === 'CMAC_COORDINATOR' || isPmacStaffingManagerRole(user.role)
      ? prisma.pmacEvent.findMany({
          where: {
            status: 'APPROVED',
            startDateTime: {
              gte: now,
              lte: soon,
            },
          },
          select: {
            id: true,
            title: true,
            startDateTime: true,
            sourceType: true,
            sourceDocumentationType: true,
            assignments: {
              select: {
                assignmentRole: true,
                availabilityResponse: true,
              },
            },
          },
          orderBy: {
            startDateTime: 'asc',
          },
          take: 4,
        })
      : Promise.resolve([]),
    isPmacAttendanceManagerRole(user.role) || isPmacEventManagerRole(user.role)
      ? prisma.pmacEvent.findMany({
          where: {
            status: 'COMPLETED',
            completedAt: {
              gte: recent,
            },
          },
          select: {
            id: true,
            title: true,
            completedAt: true,
            attendance: {
              select: {
                id: true,
              },
            },
            assignments: {
              select: {
                id: true,
              },
            },
          },
          orderBy: {
            completedAt: 'desc',
          },
          take: 2,
        })
      : Promise.resolve([]),
    projectWhere
      ? prisma.pmacActivityLog.findMany({
          where: {
            entityType: 'PROJECT',
            createdAt: {
              gte: recent,
            },
            action: {
              in: [...PMAC_PROJECT_NOTIFICATION_ACTIONS],
            },
            project: {
              is: projectWhere,
            },
          },
          select: {
            id: true,
            summary: true,
            createdAt: true,
            projectId: true,
            project: {
              select: {
                title: true,
                branch: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 4,
        })
      : Promise.resolve([]),
  ])

  const staffingNotifications = staffingEvents.flatMap((event) => {
    const assignedRoles = new Set(event.assignments.map((assignment) => assignment.assignmentRole))
    const pendingAssignmentResponses = event.assignments.filter((assignment) => assignment.availabilityResponse === 'PENDING').length
    const missingRoles = event.sourceDocumentationType
      ? getRecommendedAssignmentRoles(event.sourceDocumentationType).filter((role) => !assignedRoles.has(role))
      : []

    const reminders: AppNotification[] = []

    if (event.sourceType === 'CMAC_REQUEST' && event.assignments.length === 0) {
      reminders.push(buildNotification({
        id: `pmac-imported-${event.id}`,
        title: 'New CMAC-approved PMAC event needs staffing',
        description: `"${event.title}" was assigned to PMAC and still has no member assignments.`,
        tone: 'warning',
        priority: 'critical',
        createdAt: event.startDateTime.toISOString(),
        href: `/pmac/events/${event.id}`,
        module: 'PMAC',
        dueLabel: isToday(event.startDateTime) ? 'Event day' : 'Staffing overdue',
      }))
    }

    if (missingRoles.length || pendingAssignmentResponses > 0) {
      reminders.push(buildNotification({
        id: `pmac-staffing-${event.id}`,
        title: 'Upcoming PMAC event is not staffing-ready',
        description: missingRoles.length
          ? `"${event.title}" is still missing ${missingRoles.join(', ')} coverage.`
          : `"${event.title}" still has ${pendingAssignmentResponses} pending member response(s).`,
        tone: 'warning',
        priority: missingRoles.length ? 'high' : 'medium',
        createdAt: event.startDateTime.toISOString(),
        href: `/pmac/events/${event.id}`,
        module: 'PMAC',
        dueLabel: isToday(event.startDateTime) ? 'Event day' : 'Upcoming',
      }))
    }

    return reminders
  })

  const attendanceNotifications = attendanceGaps
    .filter((event) => event.assignments.length > 0 && event.attendance.length === 0)
    .map((event) => buildNotification({
      id: `pmac-attendance-gap-${event.id}`,
      title: 'Attendance still needs recording',
      description: `"${event.title}" has completed but no attendance has been logged yet.`,
      tone: 'info' as const,
      priority: 'high',
      createdAt: (event.completedAt ?? now).toISOString(),
      href: `/pmac/events/${event.id}`,
      module: 'PMAC' as const,
      dueLabel: 'Needs recording',
    }))

  const notifications: AppNotification[] = [
    ...pendingEvents.map((event) => buildNotification({
      id: `pmac-pending-${event.id}`,
      title: 'PMAC event awaiting approval',
      description: `"${event.title}" is ready for coordinator review.`,
      tone: 'warning' as const,
      priority: 'high',
      createdAt: (event.submittedAt ?? now).toISOString(),
      href: '/coordinator/pmac/events',
      module: 'PMAC' as const,
      dueLabel: 'Review queue',
    })),
    ...assignments.map((assignment) => buildNotification({
      id: `pmac-assignment-${assignment.id}`,
      title: 'PMAC assignment needs response',
      description: `"${assignment.event.title}" is coming up soon. Confirm your availability.`,
      tone: 'warning' as const,
      priority: 'high',
      createdAt: assignment.event.startDateTime.toISOString(),
      href: `/pmac/events/${assignment.event.id}`,
      module: 'PMAC' as const,
      dueLabel: isToday(assignment.event.startDateTime) ? 'Today' : 'Awaiting response',
    })),
    ...polls.map((poll) => buildNotification({
      id: `pmac-poll-${poll.id}`,
      title: 'Open PMAC poll awaiting your vote',
      description: `"${poll.title}" closes soon.`,
      tone: 'info' as const,
      priority: 'medium',
      createdAt: (poll.closesAt ?? now).toISOString(),
      href: `/pmac/polls/${poll.id}`,
      module: 'PMAC' as const,
      dueLabel: poll.closesAt && isToday(poll.closesAt) ? 'Closes today' : 'Open vote',
    })),
    ...activity.map((entry) => buildNotification({
      id: `pmac-activity-${entry.id}`,
      title: 'Recent PMAC activity',
      description: entry.summary,
      tone: 'success' as const,
      priority: 'low',
      createdAt: entry.createdAt.toISOString(),
      href: entry.pollId
        ? `/pmac/polls/${entry.pollId}`
        : entry.eventId
          ? `/pmac/events/${entry.eventId}`
          : user.role === 'CMAC_COORDINATOR'
            ? '/coordinator/pmac'
            : user.role === 'PMAC_DIRECTOR' || user.role === 'PMAC_SECRETARY'
              ? '/pmac/members'
              : '/pmac/activity',
      module: 'PMAC' as const,
    })),
    ...projectActivity.flatMap((entry) => {
      if (!entry.project) {
        return []
      }

      const project = entry.project
      return [buildNotification({
        id: `pmac-project-${entry.id}`,
        title: entry.summary.includes('link') ? 'Branch project link attached' : 'Branch project status updated',
        description: entry.summary,
        tone: project.status === 'ON_HOLD'
          ? 'warning' as const
          : project.status === 'COMPLETED'
            ? 'success' as const
            : 'info' as const,
        priority: project.status === 'ON_HOLD' ? 'high' : 'medium',
        createdAt: entry.createdAt.toISOString(),
        href: '/pmac/projects',
        module: 'PMAC' as const,
        dueLabel: `${PMAC_EXECUTIVE_TITLE_LABELS[project.branch]} · ${PMAC_PROJECT_STATUS_LABELS[project.status]}`,
      })]
    }),
    ...staffingNotifications,
    ...attendanceNotifications,
  ]

  return notifications
    .sort((left, right) => {
      const priorityDelta = getPriorityWeight(right.priority) - getPriorityWeight(left.priority)
      if (priorityDelta !== 0) {
        return priorityDelta
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
    .slice(0, limit)
}

async function applyReadState(userId: string, notifications: AppNotification[]) {
  if (!notifications.length) {
    return notifications
  }

  const receipts = await prisma.notificationReceipt.findMany({
    where: {
      userId,
      notificationId: {
        in: notifications.map((notification) => notification.id),
      },
    },
    select: {
      notificationId: true,
    },
  })

  const readIds = new Set(receipts.map((receipt) => receipt.notificationId))

  return notifications.map((notification) => ({
    ...notification,
    isRead: readIds.has(notification.id),
  }))
}

export async function markNotificationRead(userId: string, notificationId: string, module: AppNotification['module']) {
  await prisma.notificationReceipt.upsert({
    where: {
      userId_notificationId: {
        userId,
        notificationId,
      },
    },
    update: {
      readAt: new Date(),
      module,
    },
    create: {
      userId,
      notificationId,
      module,
      readAt: new Date(),
    },
  })
}

export async function markNotificationsRead(userId: string, notifications: Array<Pick<AppNotification, 'id' | 'module'>>) {
  if (!notifications.length) {
    return
  }

  await prisma.$transaction(
    notifications.map((notification) => (
      prisma.notificationReceipt.upsert({
        where: {
          userId_notificationId: {
            userId,
            notificationId: notification.id,
          },
        },
        update: {
          readAt: new Date(),
          module: notification.module,
        },
        create: {
          userId,
          notificationId: notification.id,
          module: notification.module,
          readAt: new Date(),
        },
      })
    ))
  )
}

export async function getNotificationFeed(user: SessionUser, limit = 8): Promise<AppNotification[]> {
  const [coreNotifications, pmacNotifications] = await Promise.all([
    isCoreWorkflowRole(user.role) ? getCoreNotificationFeed(user, limit) : Promise.resolve([]),
    (isPmacSystemRole(user.role) || user.role === 'CMAC_COORDINATOR') ? getPmacNotificationFeed(user, limit) : Promise.resolve([]),
  ])

  const ranked = [...coreNotifications, ...pmacNotifications]
    .sort((left, right) => {
      const priorityDelta = getPriorityWeight(right.priority) - getPriorityWeight(left.priority)
      if (priorityDelta !== 0) {
        return priorityDelta
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
    .slice(0, limit)

  return applyReadState(user.id, ranked)
}
