import { redirect } from 'next/navigation'

import DashboardPageClient from './DashboardPageClient'
import { getHomePathForRole } from '@/lib/roles'
import { requireAuthenticatedSession } from '@/lib/security'

export default async function DashboardPage() {
  const session = await requireAuthenticatedSession()
  const homePath = getHomePathForRole(session.user.role)

  if (homePath !== '/') {
    redirect(homePath)
  }

  return <DashboardPageClient />
}
