import { getPmacActivityFeed } from '@/lib/pmacActivity'
import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacActivityPageClient from './PmacActivityPageClient'

export default async function PmacActivityPage() {
  const session = await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/activity',
  })

  const entries = await getPmacActivityFeed(session.user, 80)

  return (
    <PmacActivityPageClient
      entries={entries}
      title="Internal Activity History"
      description="Recent PMAC actions across events, polls, attachments, and internal workflow records."
    />
  )
}
