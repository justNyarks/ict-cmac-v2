import { requireRoleAccess } from '@/lib/security'

import PmacManagementPageClient from '@/app/coordinator/pmac/PmacManagementPageClient'

export default async function PmacMembersPage() {
  await requireRoleAccess(['PMAC_DIRECTOR', 'PMAC_SECRETARY'], {
    nextPath: '/pmac/members',
  })

  return <PmacManagementPageClient canManageMembers />
}
