import { requireRoleAccess } from '@/lib/security'

import PmacCoordinatorEventsClient from './PmacCoordinatorEventsClient'

export default async function CoordinatorPmacEventsPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/events',
  })

  return <PmacCoordinatorEventsClient />
}
