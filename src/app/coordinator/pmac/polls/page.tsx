import { requireRoleAccess } from '@/lib/security'

import PmacCoordinatorPollsClient from './PmacCoordinatorPollsClient'

export default async function CoordinatorPmacPollsPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/polls',
  })

  return <PmacCoordinatorPollsClient />
}
