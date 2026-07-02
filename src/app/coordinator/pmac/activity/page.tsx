import { getPmacActivityFeed } from '@/lib/pmacActivity'
import { requireRoleAccess } from '@/lib/security'

import PmacActivityPageClient from '@/app/pmac/activity/PmacActivityPageClient'

export default async function CoordinatorPmacActivityPage() {
  const session = await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/activity',
  })

  const entries = await getPmacActivityFeed(session.user, 120)

  return (
    <PmacActivityPageClient
      entries={entries}
      title="Coordinator PMAC Activity Oversight"
      description="Audit-style visibility for PMAC member management, events, polls, attachments, and exported reports."
    />
  )
}
