import { getPmacActivityFeed, parsePmacActivitySearchParams, type PmacActivitySearchParams } from '@/lib/pmacActivity'
import { requireRoleAccess } from '@/lib/security'

import PmacActivityPageClient from '@/app/pmac/activity/PmacActivityPageClient'

export default async function CoordinatorPmacActivityPage({
  searchParams,
}: {
  searchParams: Promise<PmacActivitySearchParams>
}) {
  const session = await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/activity',
  })

  const filters = parsePmacActivitySearchParams(await searchParams)
  const feed = await getPmacActivityFeed(session.user, filters)

  return (
    <PmacActivityPageClient
      {...feed}
      filters={filters}
      basePath="/coordinator/pmac/activity"
      title="Coordinator PMAC Activity Oversight"
      description="Audit-style visibility for PMAC member management, events, polls, attachments, and exported reports."
    />
  )
}
