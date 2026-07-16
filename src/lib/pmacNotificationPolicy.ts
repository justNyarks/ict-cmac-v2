import type { Prisma } from '@prisma/client'

import type { Role } from '@/types'

type PmacNotificationUser = {
  role: Role
  pmacMemberId: string | null
}

export const PMAC_PROJECT_NOTIFICATION_ACTIONS = [
  'PROJECT_LAUNCHED',
  'PROJECT_HEAD_ASSIGNED',
  'PROJECT_MEMBERS_ASSIGNED',
  'PROJECT_STATUS_UPDATED',
  'PROJECT_DEADLINE_RECONCILED',
  'PROJECT_DIRECTOR_CHECKED',
  'PROJECT_OUTPUT_SUBMITTED',
  'PROJECT_LINK_ATTACHED',
  'PROJECT_MILESTONE_CREATED',
  'PROJECT_MILESTONE_UPDATED',
  'PROJECT_MILESTONE_STATUS_UPDATED',
] as const

export function buildPmacActivityNotificationWhere(
  user: PmacNotificationUser,
  since: Date,
): Prisma.PmacActivityLogWhereInput | null {
  const baseWhere: Prisma.PmacActivityLogWhereInput = {
    createdAt: { gte: since },
    entityType: { not: 'PROJECT' },
  }

  if (user.role === 'PMAC_DIRECTOR' || user.role === 'PMAC_ASSISTANT_DIRECTOR' || user.role === 'PMAC_SECRETARY') {
    return baseWhere
  }

  if (user.role === 'CMAC_COORDINATOR') {
    return {
      ...baseWhere,
      entityType: 'EVENT',
    }
  }

  if ((user.role !== 'PMAC_EXECUTIVE' && user.role !== 'PMAC_MEMBER') || !user.pmacMemberId) {
    return null
  }

  return {
    ...baseWhere,
    OR: [
      {
        event: {
          is: {
            assignments: {
              some: {
                memberId: user.pmacMemberId,
              },
            },
          },
        },
      },
      {
        pollId: {
          not: null,
        },
      },
      {
        memberId: user.pmacMemberId,
      },
    ],
  }
}
