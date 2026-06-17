import { requireRoleAccess } from '@/lib/security'
import AdminPageClient from './AdminPageClient'

export default async function AdminPage() {
  await requireRoleAccess(['ICT_DIRECTOR'], {
    nextPath: '/admin',
    zeroTrust: true,
  })

  return <AdminPageClient />
}
