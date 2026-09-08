import { requireRoleAccess } from '@/lib/security'

import { redirect } from 'next/navigation'

export default async function CoordinatorPmacPollsPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/coordinator/pmac/polls',
  })

  redirect('/pmac/polls')
}
