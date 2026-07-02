import PmacReportsPanel from '@/components/pmac/PmacReportsPanel'
import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { requireRoleAccess } from '@/lib/security'

export default async function CoordinatorPmacReportsPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/reports',
  })

  const [members, activeMembers, events, openPolls, attachments, activity] = await Promise.all([
    prisma.pmacMember.count(),
    prisma.user.count({
      where: {
        pmacMemberId: {
          not: null,
        },
        isActive: true,
      },
    }),
    prisma.pmacEvent.count(),
    prisma.pmacPoll.count({
      where: {
        status: 'OPEN',
      },
    }),
    hasPmacV4Delegates() ? prisma.pmacAttachment.count() : Promise.resolve(0),
    hasPmacV4Delegates() ? prisma.pmacActivityLog.count() : Promise.resolve(0),
  ])

  return (
    <PmacReportsPanel
      title="Coordinator PMAC Reporting"
      description="Export PMAC operations, governance, and roster data for oversight, backups, and administrative review."
      stats={{ members, activeMembers, events, openPolls, attachments, activity }}
    />
  )
}
