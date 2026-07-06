import PmacReportsPanel from '@/components/pmac/PmacReportsPanel'
import { buildPmacReportSummary } from '@/lib/pmacReports'
import { requireRoleAccess } from '@/lib/security'

export default async function PmacReportsPage() {
  await requireRoleAccess(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    nextPath: '/pmac/reports',
  })

  const stats = await buildPmacReportSummary()

  return (
    <PmacReportsPanel
      title="Operational PMAC Reporting"
      description="Download member, event, poll, and activity exports to support daily PMAC operations and continuity."
      stats={stats}
    />
  )
}
