import PmacReportsPanel from '@/components/pmac/PmacReportsPanel'
import { getPmacReportFilterOptions, getPmacReportSummary } from '@/app/pmac/reportActions'
import { requireRoleAccess } from '@/lib/security'

export default async function CoordinatorPmacReportsPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/reports',
  })

  const [stats, filterOptions] = await Promise.all([
    getPmacReportSummary(),
    getPmacReportFilterOptions(),
  ])

  return (
    <PmacReportsPanel
      title="Coordinator PMAC Reporting"
      description="Export PMAC operations, governance, and roster data for oversight, backups, and administrative review."
      stats={stats}
      filterOptions={filterOptions}
    />
  )
}
