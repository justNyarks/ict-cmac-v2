import type { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import type { Session } from "next-auth"

type SessionUser = Session["user"]

const REQUEST_PATHS = ["/", "/requests", "/calendar"] as const
const REQUEST_PATHS_WITH_LOGS = ["/", "/requests", "/calendar", "/logs"] as const

export function getRequestListWhere(user: SessionUser): Prisma.ServiceRequestWhereInput {
  if (user.role === "SECRETARY") {
    return {
      deletedAt: null,
      secretaryId: user.id,
    }
  }

  return { deletedAt: null }
}

export function getCalendarWhere(user: SessionUser): Prisma.ServiceRequestWhereInput {
  if (user.role === "SECRETARY") {
    return {
      deletedAt: null,
      OR: [
        { secretaryId: user.id },
        { status: "DIRECTOR_APPROVED" },
      ],
    }
  }

  return { deletedAt: null }
}

export function revalidateRequestViews(includeLogs = false) {
  const paths = includeLogs ? REQUEST_PATHS_WITH_LOGS : REQUEST_PATHS

  for (const path of paths) {
    revalidatePath(path)
  }
}
