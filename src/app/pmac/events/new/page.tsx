import { requireRoleAccess } from '@/lib/security'

import PmacNewEventClient from './PmacNewEventClient'

export default async function PmacNewEventPage() {
  await requireRoleAccess(['PMAC_DIRECTOR'], {
    nextPath: '/pmac/events/new',
  })

  return <PmacNewEventClient />
}
