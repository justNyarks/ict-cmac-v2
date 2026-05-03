'use server'

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function getDashboardStats() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return null

  const role = (session.user as any).role
  const userId = (session.user as any).id
  const whereClause = role === 'SECRETARY' ? { secretaryId: userId } : {}

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
  
  const newlyApproved = await prisma.serviceRequest.findMany({
    where: role === 'SECRETARY' 
      ? { 
          OR: [
            { secretaryId: userId, status: { in: ['DIRECTOR_APPROVED', 'COORDINATOR_APPROVED', 'REJECTED'] } },
            { status: 'DIRECTOR_APPROVED' }
          ]
        }
      : { ...whereClause, status: 'DIRECTOR_APPROVED' },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: { id: true, eventTitle: true, status: true, secretaryId: true, secretary: { select: { name: true } } }
  })

  return {
    total, pending, approved, rejected, coordApproved, photoCount, videoCount, bothCount,
    recent, newlyApproved, user: session.user
  }
}

