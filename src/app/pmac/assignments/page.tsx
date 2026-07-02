import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacAssignmentsPageClient from './PmacAssignmentsPageClient'

export default async function PmacAssignmentsPage() {
  const session = await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/assignments',
  })

  return <PmacAssignmentsPageClient role={session.user.role} />
}
