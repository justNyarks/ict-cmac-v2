import { requireRoleAccess } from '@/lib/security'

import PmacOfficerAssignmentsClient from './PmacOfficerAssignmentsClient'

export default async function CoordinatorPmacOfficersPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/officers',
  })

  return <PmacOfficerAssignmentsClient />
}
