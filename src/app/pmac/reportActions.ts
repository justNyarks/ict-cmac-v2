'use server'

import { buildPmacReportSummary } from '@/lib/pmacReports'
import { assertActionAccess } from '@/lib/security'

export async function getPmacReportSummary() {
  await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'])
  return buildPmacReportSummary()
}
