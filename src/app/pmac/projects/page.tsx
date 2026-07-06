import { requireRoleAccess } from '@/lib/security'

import PmacProjectsPageClient from './PmacProjectsPageClient'

export default async function PmacProjectsPage() {
  await requireRoleAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'], {
    nextPath: '/pmac/projects',
  })

  return <PmacProjectsPageClient />
}
