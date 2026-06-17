import { requireRoleAccess } from '@/lib/security'
import LogsPageClient from './LogsPageClient'

export default async function LogsPage() {
  await requireRoleAccess(['CMAC_COORDINATOR'], {
    nextPath: '/logs',
    zeroTrust: true,
  })

  return <LogsPageClient />
}
