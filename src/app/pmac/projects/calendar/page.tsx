import { requireRoleAccess } from '@/lib/security'

import PmacProjectCalendarPageClient from './PmacProjectCalendarPageClient'

export default async function PmacProjectCalendarPage() {
  await requireRoleAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE', 'PMAC_MEMBER'], {
    nextPath: '/pmac/projects/calendar',
  })

  return <PmacProjectCalendarPageClient />
}
