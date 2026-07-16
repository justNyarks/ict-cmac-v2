import { getPmacActivityFeed, parsePmacActivitySearchParams, type PmacActivitySearchParams } from '@/lib/pmacActivity'
import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacActivityPageClient from './PmacActivityPageClient'

export default async function PmacActivityPage({
  searchParams,
}: {
  searchParams: Promise<PmacActivitySearchParams>
}) {
  const session = await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/activity',
  })

  const filters = parsePmacActivitySearchParams(await searchParams)
  const feed = await getPmacActivityFeed(session.user, filters)

  return (
    <PmacActivityPageClient
      {...feed}
      filters={filters}
      basePath="/pmac/activity"
      title="Internal Activity History"
      description="Recent PMAC actions across events, polls, attachments, and internal workflow records."
    />
  )
}
