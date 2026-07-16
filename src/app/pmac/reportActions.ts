'use server'

import type { PmacReportFilters } from '@/lib/pmacReportFilters'
import {
  buildPmacReportAnalytics,
  buildPmacReportCounts,
  buildPmacReportFilterOptions,
  getCachedPmacReportSummary,
} from '@/lib/pmacReports'
import { assertActionAccess } from '@/lib/security'

export async function getPmacReportSummary() {
  await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'])
  return getCachedPmacReportSummary()
}

export async function getPmacReportPageData(filters: PmacReportFilters = {}) {
  await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'])

  const [stats, filterOptions, counts, analytics] = await Promise.all([
    getCachedPmacReportSummary(),
    buildPmacReportFilterOptions(),
    buildPmacReportCounts(filters),
    buildPmacReportAnalytics(filters),
  ])

  return { stats, filterOptions, counts, analytics }
}

export async function getPmacReportFilterOptions() {
  await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'])
  return buildPmacReportFilterOptions()
}
