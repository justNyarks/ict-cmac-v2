import { requireRoleAccess } from '@/lib/security'

import PmacManagementPageClient from './PmacManagementPageClient'

export default async function CoordinatorPmacPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac',
  })

  return <PmacManagementPageClient />
}
