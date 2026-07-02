'use server'

import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { getNotificationFeed } from "@/lib/notifications"

export async function getNotifications() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []

  try {
    return await getNotificationFeed(session.user, 8)
  } catch (error) {
    console.error('GET_NOTIFICATIONS_ERROR:', error)
    return []
  }
}
