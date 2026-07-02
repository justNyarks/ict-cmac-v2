import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacPollWorkspaceClient from './PmacPollWorkspaceClient'

export default async function PmacPollWorkspacePage({
  params,
}: {
  params: Promise<{ pollId: string }>
}) {
  await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/polls',
  })

  const { pollId } = await params

  return <PmacPollWorkspaceClient pollId={pollId} />
}
