import type { Role } from '@/types'
import { authOptions } from '@/lib/auth'
import {
  ZERO_TRUST_COOKIE_NAME,
  ZERO_TRUST_TTL_SECONDS,
  createZeroTrustToken,
  getZeroTrustRedirectPath,
  isPrivilegedRole,
  verifyZeroTrustToken,
} from '@/lib/zeroTrust'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

type AccessOptions = {
  nextPath?: string
  zeroTrust?: boolean
}

export async function requireAuthenticatedSession() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/auth/signin')
  }

  return session
}

export async function hasValidZeroTrustSession(userId: string, role: Role) {
  if (!isPrivilegedRole(role)) {
    return true
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(ZERO_TRUST_COOKIE_NAME)?.value

  if (!token) {
    return false
  }

  return verifyZeroTrustToken(token, userId, role)
}

export async function requireRoleAccess(allowedRoles: readonly Role[], options: AccessOptions = {}) {
  const session = await requireAuthenticatedSession()

  if (!allowedRoles.includes(session.user.role)) {
    redirect('/')
  }

  if (options.zeroTrust && isPrivilegedRole(session.user.role)) {
    const isZeroTrustValid = await hasValidZeroTrustSession(session.user.id, session.user.role)

    if (!isZeroTrustValid) {
      redirect(getZeroTrustRedirectPath(options.nextPath || '/'))
    }
  }

  return session
}

export async function assertActionAccess(allowedRoles: readonly Role[], options: AccessOptions = {}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    throw new Error('Not authenticated')
  }

  if (!allowedRoles.includes(session.user.role)) {
    throw new Error('Unauthorized')
  }

  if (options.zeroTrust && isPrivilegedRole(session.user.role)) {
    const isZeroTrustValid = await hasValidZeroTrustSession(session.user.id, session.user.role)

    if (!isZeroTrustValid) {
      throw new Error('Zero trust verification required')
    }
  }

  return session
}

export async function issueZeroTrustSession(userId: string, role: Role) {
  if (!isPrivilegedRole(role)) {
    return
  }

  const cookieStore = await cookies()
  const token = await createZeroTrustToken({
    userId,
    role,
    verifiedAt: Date.now(),
  })

  cookieStore.set(ZERO_TRUST_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ZERO_TRUST_TTL_SECONDS,
  })
}

export async function clearZeroTrustSession() {
  const cookieStore = await cookies()

  cookieStore.set(ZERO_TRUST_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}
