import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacPollsPageClient from './PmacPollsPageClient'

export default async function PmacPollsPage() {
  const session = await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/polls',
  })

  return <PmacPollsPageClient role={session.user.role} />
}
