import { redirect } from 'next/navigation'

import { requireAuthenticatedSession, hasValidZeroTrustSession } from '@/lib/security'
import { isPrivilegedRole, sanitizeNextPath, ZERO_TRUST_TTL_SECONDS } from '@/lib/zeroTrust'
import ZeroTrustPageClient from './ZeroTrustPageClient'

type ZeroTrustPageProps = {
  searchParams: Promise<{
    next?: string | string[]
  }>
}

export default async function ZeroTrustPage({ searchParams }: ZeroTrustPageProps) {
  const session = await requireAuthenticatedSession()

  if (!isPrivilegedRole(session.user.role)) {
    redirect('/')
  }

  const params = await searchParams
  const nextPath = sanitizeNextPath(params.next, '/')
  const hasActiveVerification = await hasValidZeroTrustSession(session.user.id, session.user.role)

  return (
    <ZeroTrustPageClient
      hasActiveVerification={hasActiveVerification}
      nextPath={nextPath}
      roleLabel={session.user.role.replace('_', ' ')}
      ttlMinutes={Math.floor(ZERO_TRUST_TTL_SECONDS / 60)}
      userName={session.user.name || 'Privileged User'}
    />
  )
}
