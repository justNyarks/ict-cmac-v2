'use server'

import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { getNotificationFeed } from "@/lib/notifications"

export async function getNotifications() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []

  return getNotificationFeed(session.user, 8)
}
