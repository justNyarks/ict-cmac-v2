  'use server'

import { unstable_noStore as noStore } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getNotificationFeed } from "@/lib/notifications"
import { isCoreWorkflowRole } from "@/lib/roles"

function getWorkflowStageLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return 'Submitted'
    case 'COORDINATOR_APPROVED':
      return 'Coordinator Approved'
    case 'DIRECTOR_APPROVED':
      return 'Director Approved'
    case 'REVISION_REQUESTED':
      return 'Revision Requested'
    case 'WITHDRAWN':
      return 'Withdrawn'
    case 'CANCELLED':
      return 'Cancelled'
    case 'REJECTED':
      return 'Rejected'
    case 'ARCHIVED':
      return 'Archived'
    default:
      return status
  }
}

function getSlaLabel(request: { status: string; createdAt: Date; coordinatorApprovedAt: Date | null; eventDate: Date }) {
  const now = new Date()
  const stageStartedAt = request.status === 'COORDINATOR_APPROVED'
    ? request.coordinatorApprovedAt ?? request.createdAt
    : request.createdAt
  const ageHours = Math.floor((now.getTime() - stageStartedAt.getTime()) / 3600000)
  const daysUntilEvent = Math.ceil((request.eventDate.getTime() - now.getTime()) / 86400000)

  if (request.status === 'PENDING' && ageHours >= 24) {
    return 'Needs coordinator review'
  }

  if (request.status === 'COORDINATOR_APPROVED' && ageHours >= 48) {
    return 'Needs director sign-off'
  }

  if (request.status === 'DIRECTOR_APPROVED' && daysUntilEvent <= 0) {
    return 'Event day'
  }

  if (request.status === 'DIRECTOR_APPROVED' && daysUntilEvent <= 2) {
    return 'Upcoming soon'
  }

  if (['REVISION_REQUESTED', 'WITHDRAWN', 'CANCELLED', 'REJECTED', 'ARCHIVED'].includes(request.status)) {
    return 'Closed'
  }

  return 'On track'
}

export async function getDashboardStats() {
  noStore()
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return null
  if (!isCoreWorkflowRole(session.user.role)) return null

    const emptyStats = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    coordApproved: 0,
    pmacApproved: 0,
    cmacApproved: 0,
    unassignedService: 0,
    photoCount: 0,
    videoCount: 0,
    bothCount: 0,
    recent: [],
      notifications: [],
      workflowTimeline: [],
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
      select: { status: true, serviceType: true, documentationType: true }
    })

    const total = allRequests.length
    const pending = allRequests.filter(r => r.status === 'PENDING').length
    const approvedRequests = allRequests.filter(r => r.status === 'DIRECTOR_APPROVED')
    const approved = approvedRequests.length
    const rejected = allRequests.filter(r => r.status === 'REJECTED').length
    const coordApproved = allRequests.filter(r => r.status === 'COORDINATOR_APPROVED').length
    const pmacApproved = approvedRequests.filter(r => r.serviceType === 'PMAC').length
    const cmacApproved = approvedRequests.filter(r => r.serviceType === 'CMAC').length
    const closedStatuses = ['REVISION_REQUESTED', 'WITHDRAWN', 'CANCELLED', 'REJECTED', 'ARCHIVED']
    const unassignedService = allRequests.filter(r => !r.serviceType && !closedStatuses.includes(r.status)).length
    const photoCount = allRequests.filter(r => r.documentationType === 'PHOTO').length
    const videoCount = allRequests.filter(r => r.documentationType === 'VIDEO').length
    const bothCount = allRequests.filter(r => r.documentationType === 'BOTH').length

    const recent = await prisma.serviceRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, eventTitle: true, school: true, eventDate: true, status: true, serviceType: true, createdAt: true, coordinatorApprovedAt: true, secretaryId: true, secretary: { select: { name: true } } }
    })
    
    const notifications = await getNotificationFeed(user, 5)
    const workflowTimeline = recent.map((request) => ({
      id: request.id,
      title: request.eventTitle,
      school: request.school,
      status: request.status,
      stageLabel: getWorkflowStageLabel(request.status),
      slaLabel: getSlaLabel(request),
      eventDate: request.eventDate,
      createdAt: request.createdAt,
      href: `/requests?requestId=${encodeURIComponent(request.id)}`,
    }))

    return {
      total, pending, approved, rejected, coordApproved, pmacApproved, cmacApproved, unassignedService, photoCount, videoCount, bothCount,
      recent, notifications, workflowTimeline, user, dbUnavailable: false
    }
  } catch (error) {
    console.error('DASHBOARD_STATS_ERROR:', error)
    return {
      ...emptyStats,
      dbUnavailable: true,
    }
  }
}
