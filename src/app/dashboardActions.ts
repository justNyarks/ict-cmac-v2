  'use server'

import { unstable_noStore as noStore } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getNotificationFeed } from "@/lib/notifications"

export async function getDashboardStats() {
  noStore()
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return null

  const emptyStats = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    coordApproved: 0,
    photoCount: 0,
    videoCount: 0,
    bothCount: 0,
    recent: [],
    notifications: [],
    user: session.user,
    dbUnavailable: false,
  }

  try {
    const { user } = session
    const whereClause = user.role === 'SECRETARY'
      ? { secretaryId: user.id, deletedAt: null }
      : { deletedAt: null }

    // Use a single query to prevent Prisma connection pool timeouts
    const allRequests = await prisma.serviceRequest.findMany({
      where: whereClause,
      select: { status: true, documentationType: true }
    })

    const total = allRequests.length
    const pending = allRequests.filter(r => r.status === 'PENDING').length
    const approved = allRequests.filter(r => r.status === 'DIRECTOR_APPROVED').length
    const rejected = allRequests.filter(r => r.status === 'REJECTED').length
    const coordApproved = allRequests.filter(r => r.status === 'COORDINATOR_APPROVED').length
    const photoCount = allRequests.filter(r => r.documentationType === 'PHOTO').length
    const videoCount = allRequests.filter(r => r.documentationType === 'VIDEO').length
    const bothCount = allRequests.filter(r => r.documentationType === 'BOTH').length

    const recent = await prisma.serviceRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, eventTitle: true, school: true, eventDate: true, status: true, secretaryId: true, secretary: { select: { name: true } } }
    })
    
    const notifications = user.role === 'SECRETARY'
      ? await getNotificationFeed(user, 3)
      : []

    return {
      total, pending, approved, rejected, coordApproved, photoCount, videoCount, bothCount,
      recent, notifications, user, dbUnavailable: false
    }
  } catch (error) {
    console.error('DASHBOARD_STATS_ERROR:', error)
    return {
      ...emptyStats,
      dbUnavailable: true,
    }
  }
}
