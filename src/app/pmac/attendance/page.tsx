import { requireRoleAccess } from '@/lib/security'

import PmacAttendancePageClient from './PmacAttendancePageClient'

export default async function PmacAttendancePage() {
  await requireRoleAccess(['PMAC_SECRETARY'], {
    nextPath: '/pmac/attendance',
  })

  return <PmacAttendancePageClient />
}
