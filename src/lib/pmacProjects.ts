import type { Prisma } from '@prisma/client'

import { isPmacProjectLauncherRole } from '@/lib/pmac'
import { prisma } from '@/lib/prisma'
import type { PmacExecutiveTitle, Role } from '@/types'

type PmacProjectAccessUser = {
  role: Role
  pmacMemberId: string | null
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

export async function getPmacProjectWhere(user: PmacProjectAccessUser): Promise<Prisma.PmacProjectWhereInput> {
  if (isPmacProjectLauncherRole(user.role)) {
    return {}
  }

  if (!user.pmacMemberId) {
    return { id: '__missing_project_access__' }
  }

  const branch = await getExecutiveBranchForUser(user)

  if (user.role === 'PMAC_EXECUTIVE' && branch) {
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
        {
          AND: [
            { headMemberId: null },
            { branch },
          ],
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
