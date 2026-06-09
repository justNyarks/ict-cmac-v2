import type { Prisma, RequestStatus } from "@prisma/client"
import type { Session } from "next-auth"

import { prisma } from "@/lib/prisma"
import type { AppNotification } from "@/types/notifications"

type SessionUser = Session["user"]

function buildNotificationWhere(user: SessionUser): Prisma.AuditLogWhereInput {
  if (user.role === "SECRETARY") {
    return {
      OR: [
        {
          action: { in: ["COORDINATOR_APPROVED", "DIRECTOR_APPROVED", "REJECTED"] },
          request: {
            is: {
              deletedAt: null,
              secretaryId: user.id,
            },
          },
        },
        {
          action: { in: ["DIRECTOR_APPROVED", "DIRECT_BYPASS"] },
          request: {
            is: {
              deletedAt: null,
              status: "DIRECTOR_APPROVED",
            },
          },
        },
      ],
    }
  }

  if (user.role === "CMAC_COORDINATOR") {
    return {
      OR: [
        {
          action: "SUBMITTED",
          request: {
            is: {
              deletedAt: null,
              status: "PENDING",
            },
          },
        },
        {
          action: "DIRECT_BYPASS",
          request: {
            is: {
              deletedAt: null,
              status: "DIRECTOR_APPROVED",
            },
          },
        },
      ],
    }
  }

  if (user.role === "ICT_DIRECTOR") {
    return {
      action: "COORDINATOR_APPROVED",
      request: {
        is: {
          deletedAt: null,
          status: "COORDINATOR_APPROVED",
        },
      },
    }
  }

  return {
    id: "__never__",
  }
}

function formatNotification(
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

  if (user.role === "SECRETARY") {
    if (!isOwnRequest) {
      return {
        id: log.id,
        requestId: log.request.id,
        eventTitle: log.request.eventTitle,
        status: log.request.status,
        title: "New shared calendar event",
        description: `"${log.request.eventTitle}" was approved and added to the calendar.`,
        tone: "info",
        createdAt: log.createdAt.toISOString(),
      }
    }

    if (log.action === "COORDINATOR_APPROVED") {
      return {
        id: log.id,
        requestId: log.request.id,
        eventTitle: log.request.eventTitle,
        status: log.request.status,
        title: `Coordinator approved "${log.request.eventTitle}"`,
        description: "Awaiting final approval from the ICT Director.",
        tone: "warning",
        createdAt: log.createdAt.toISOString(),
      }
    }

    if (log.action === "REJECTED") {
      return {
        id: log.id,
        requestId: log.request.id,
        eventTitle: log.request.eventTitle,
        status: log.request.status,
        title: `"${log.request.eventTitle}" was rejected`,
        description: "Open Requests to read the latest note.",
        tone: "danger",
        createdAt: log.createdAt.toISOString(),
      }
    }

    return {
      id: log.id,
      requestId: log.request.id,
      eventTitle: log.request.eventTitle,
      status: log.request.status,
      title: `"${log.request.eventTitle}" is fully approved`,
      description: "Ready to print the request receipt.",
      tone: "success",
      createdAt: log.createdAt.toISOString(),
    }
  }

  if (user.role === "CMAC_COORDINATOR") {
    if (log.action === "DIRECT_BYPASS") {
      return {
        id: log.id,
        requestId: log.request.id,
        eventTitle: log.request.eventTitle,
        status: log.request.status,
        title: "Director skipped coordinator review",
        description: `"${log.request.eventTitle}" moved straight to the shared calendar.`,
        tone: "info",
        createdAt: log.createdAt.toISOString(),
      }
    }

    return {
      id: log.id,
      requestId: log.request.id,
      eventTitle: log.request.eventTitle,
      status: log.request.status,
      title: "New request needs review",
      description: `"${log.request.eventTitle}" is waiting for coordinator approval.`,
      tone: "warning",
      createdAt: log.createdAt.toISOString(),
    }
  }

  return {
    id: log.id,
    requestId: log.request.id,
    eventTitle: log.request.eventTitle,
    status: log.request.status,
    title: "Coordinator approved a request",
    description: `"${log.request.eventTitle}" is waiting for final sign-off.`,
    tone: "warning",
    createdAt: log.createdAt.toISOString(),
  }
}

export async function getNotificationFeed(user: SessionUser, limit = 8): Promise<AppNotification[]> {
  const logs = await prisma.auditLog.findMany({
    where: buildNotificationWhere(user),
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
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return logs.map((log) => formatNotification(user, log))
}
