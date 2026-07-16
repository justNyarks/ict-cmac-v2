import PmacReportsPanel from '@/components/pmac/PmacReportsPanel'
import { getPmacReportPageData } from '@/app/pmac/reportActions'
import { parsePmacReportSearchParams, type PmacReportSearchParams } from '@/lib/pmacReportFilters'
import { requireRoleAccess } from '@/lib/security'

export default async function CoordinatorPmacReportsPage({ searchParams }: { searchParams: Promise<PmacReportSearchParams> }) {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/reports',
  })

  const filters = parsePmacReportSearchParams(await searchParams)
  const { stats, filterOptions, counts, analytics } = await getPmacReportPageData(filters)

  return (
    <PmacReportsPanel
      title="Coordinator PMAC Reporting"
      description="Export PMAC operations, governance, and roster data for oversight, backups, and administrative review."
      stats={stats}
      filterOptions={filterOptions}
      counts={counts}
      analytics={analytics}
      appliedFilters={filters}
    />
  )
}
