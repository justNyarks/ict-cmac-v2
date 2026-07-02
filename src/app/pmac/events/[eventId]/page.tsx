import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacEventWorkspaceClient from './PmacEventWorkspaceClient'

export default async function PmacEventWorkspacePage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/events',
  })

  const { eventId } = await params

  return <PmacEventWorkspaceClient eventId={eventId} />
}
