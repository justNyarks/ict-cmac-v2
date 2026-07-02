import { PMAC_POLL_CREATOR_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacNewPollClient from './PmacNewPollClient'

export default async function PmacNewPollPage() {
  await requireRoleAccess(PMAC_POLL_CREATOR_ROLES, {
    nextPath: '/pmac/polls/new',
  })

  return <PmacNewPollClient />
}
