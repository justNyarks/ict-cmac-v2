import PmacReportsPanel from '@/components/pmac/PmacReportsPanel'
import { parsePmacReportSearchParams, type PmacReportSearchParams } from '@/lib/pmacReportFilters'
import { requireRoleAccess } from '@/lib/security'

import { getPmacReportPageData } from '../reportActions'

export default async function PmacReportsPage({ searchParams }: { searchParams: Promise<PmacReportSearchParams> }) {
  await requireRoleAccess(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    nextPath: '/pmac/reports',
  })

  const filters = parsePmacReportSearchParams(await searchParams)
  const { stats, filterOptions, counts, analytics } = await getPmacReportPageData(filters)

  return (
    <PmacReportsPanel
      title="Operational PMAC Reporting"
      description="Download member, event, poll, and activity exports to support daily PMAC operations and continuity."
      stats={stats}
      filterOptions={filterOptions}
      counts={counts}
      analytics={analytics}
      appliedFilters={filters}
    />
  )
}
