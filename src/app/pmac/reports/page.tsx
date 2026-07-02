import PmacReportsPanel from '@/components/pmac/PmacReportsPanel'
import { hasPmacV4Delegates, prisma } from '@/lib/prisma'
import { requireRoleAccess } from '@/lib/security'

export default async function PmacReportsPage() {
  await requireRoleAccess(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    nextPath: '/pmac/reports',
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
      title="Operational PMAC Reporting"
      description="Download member, event, poll, and activity exports to support daily PMAC operations and continuity."
      stats={{ members, activeMembers, events, openPolls, attachments, activity }}
    />
  )
}
