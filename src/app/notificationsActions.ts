'use server'

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function getNotifications() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return []

  const role = (session.user as any).role
  const userId = (session.user as any).id

  if (role === 'SECRETARY') {
    // Secretary: see their own requests with any status change + global approved (shared calendar)
    return await prisma.serviceRequest.findMany({
      where: {
        deletedAt: null,
        OR: [
          // Own requests that have been acted on (not just sitting pending)
          {
            secretaryId: userId,
            status: { in: ['DIRECTOR_APPROVED', 'COORDINATOR_APPROVED', 'REJECTED'] }
          },
          // Any fully approved request for shared calendar awareness
          { status: 'DIRECTOR_APPROVED' }
        ]
      },
      select: {
        id: true, eventTitle: true, status: true, secretaryId: true, updatedAt: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 8
    })
  }

  if (role === 'CMAC_COORDINATOR') {
    // Coordinator: new PENDING requests needing their review + DIRECTLY APPROVED by Director
    return await prisma.serviceRequest.findMany({
      where: { 
        deletedAt: null,
        status: { in: ['PENDING', 'DIRECTOR_APPROVED'] } 
      },
      select: {
        id: true, eventTitle: true, status: true, secretaryId: true, createdAt: true,
        secretary: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 8
    })
  }

  if (role === 'ICT_DIRECTOR') {
    // Director: COORDINATOR_APPROVED requests ready for final sign-off
    return await prisma.serviceRequest.findMany({
      where: { deletedAt: null, status: 'COORDINATOR_APPROVED' },
      select: {
        id: true, eventTitle: true, status: true, secretaryId: true, updatedAt: true,
        secretary: { select: { name: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: 8
    })
  }

  return []
}
