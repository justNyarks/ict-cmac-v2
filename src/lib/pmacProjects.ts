import type { Prisma } from '@prisma/client'

import { isPmacProjectLauncherRole } from '@/lib/pmac'
import { prisma } from '@/lib/prisma'
import type { PmacExecutiveTitle, Role } from '@/types'

type PmacProjectAccessUser = {
  role: Role
  pmacMemberId: string | null
}

const NO_PROJECT_ACCESS = { id: '__missing_project_access__' } as const

export function buildPmacProjectWhere(user: PmacProjectAccessUser): Prisma.PmacProjectWhereInput {
  if (isPmacProjectLauncherRole(user.role)) {
    return {}
  }

  if (!user.pmacMemberId) {
    return NO_PROJECT_ACCESS
  }

  if (user.role === 'PMAC_EXECUTIVE') {
    return {
      OR: [
        { headMemberId: user.pmacMemberId },
        {
          memberAssignments: {
            some: {
              memberId: user.pmacMemberId,
            },
          },
        },
      ],
    }
  }

  return {
    memberAssignments: {
      some: {
        memberId: user.pmacMemberId,
      },
    },
  }
}

export async function getExecutiveBranchForUser(user: PmacProjectAccessUser): Promise<PmacExecutiveTitle | null> {
  if (user.role !== 'PMAC_EXECUTIVE' || !user.pmacMemberId) {
    return null
  }

  const member = await prisma.pmacMember.findUnique({
    where: { id: user.pmacMemberId },
    select: { executiveTitle: true },
  })

  return member?.executiveTitle ?? null
}

export function getPmacProjectWhere(user: PmacProjectAccessUser): Prisma.PmacProjectWhereInput {
  return buildPmacProjectWhere(user)
}
