import { PMAC_OPERATIONAL_ROLES } from '@/lib/pmac'
import { requireRoleAccess } from '@/lib/security'

import PmacCalendarPageClient from './PmacCalendarPageClient'

export default async function PmacCalendarPage() {
  await requireRoleAccess(PMAC_OPERATIONAL_ROLES, {
    nextPath: '/pmac/calendar',
  })

  return <PmacCalendarPageClient />
}
