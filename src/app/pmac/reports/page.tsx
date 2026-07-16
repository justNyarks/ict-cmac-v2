import PmacReportsPanel from '@/components/pmac/PmacReportsPanel'
import { requireRoleAccess } from '@/lib/security'

import { getPmacReportSummary } from '../reportActions'

export default async function PmacReportsPage() {
  await requireRoleAccess(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    nextPath: '/pmac/reports',
  })

  const stats = await getPmacReportSummary()

  return (
    <PmacReportsPanel
      title="Operational PMAC Reporting"
      description="Download member, event, poll, and activity exports to support daily PMAC operations and continuity."
      stats={stats}
    />
  )
}
