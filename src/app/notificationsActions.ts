'use server'

import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { getNotificationFeed, markNotificationRead, markNotificationsRead } from "@/lib/notifications"

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

export async function markNotificationAsRead(notificationId: string, module: 'CORE' | 'PMAC') {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false, error: 'Authentication required.' }
  }

  await markNotificationRead(session.user.id, notificationId, module)
  return { success: true }
}

export async function markAllNotificationsAsRead(notifications: Array<{ id: string; module: 'CORE' | 'PMAC' }>) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false, error: 'Authentication required.' }
  }

  await markNotificationsRead(session.user.id, notifications)
  return { success: true }
}
