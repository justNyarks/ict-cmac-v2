import { requireRoleAccess } from '@/lib/security'

import PmacExecutiveTagsPageClient from './PmacExecutiveTagsPageClient'

export default async function PmacTagsPage() {
  await requireRoleAccess(['PMAC_EXECUTIVE'], {
    nextPath: '/pmac/tags',
  })

  return <PmacExecutiveTagsPageClient />
}
