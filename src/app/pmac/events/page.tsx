import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacEventsPageClient from './PmacEventsPageClient'

export default async function PmacEventsPage() {
  const session = await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/events',
  })

  return <PmacEventsPageClient role={session.user.role} />
}
