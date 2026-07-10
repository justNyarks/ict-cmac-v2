import type { Role } from '@/types'
import { authOptions } from '@/lib/auth'
import { hasUserSecurityFields, prisma } from '@/lib/prisma'
import {
  ZERO_TRUST_COOKIE_NAME,
  ZERO_TRUST_TTL_SECONDS,
  createZeroTrustToken,
  getZeroTrustRedirectPath,
  isPrivilegedRole,
  shouldEnforceZeroTrust,
  verifyZeroTrustToken,
} from '@/lib/zeroTrust'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { getServerSession, type Session } from 'next-auth'

type AccessOptions = {
  nextPath?: string
  zeroTrust?: boolean
}

type AuthSession = Session & {
  user: NonNullable<Session['user']>
}

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null
  }

  try {
    return new URL(value.includes('://') ? value : `https://${value}`).origin
  } catch {
    return null
  }
}

function getRequestOriginFromReferer(value: string | null) {
  if (!value) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getTrustedRequestOrigins(request: Pick<NextRequest, 'nextUrl'>) {
  const origins = [
    request.nextUrl.origin,
    normalizeOrigin(process.env.NEXTAUTH_URL),
    normalizeOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null),
  ].filter(Boolean) as string[]

  return new Set(origins)
}

export function assertSameOriginMutation(request: Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>) {
  if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) {
    return
  }

  const requestOrigin = normalizeOrigin(request.headers.get('origin'))
    ?? getRequestOriginFromReferer(request.headers.get('referer'))

  if (!requestOrigin) {
    throw new Error('Invalid request origin')
  }

  if (!getTrustedRequestOrigins(request).has(requestOrigin)) {
    throw new Error('Invalid request origin')
  }
}

async function resolveCurrentSession(session: Session | null): Promise<AuthSession | null> {
  if (!session?.user) {
    return null
  }

  const userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    school: true,
    isActive: true,
    pmacMemberId: true,
    ...(hasUserSecurityFields() ? { mustChangePassword: true } : {}),
  }

  let freshUser = session.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: userSelect,
      })
    : null

  if (!freshUser && session.user.email) {
    freshUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: userSelect,
    })
  }

  if (!freshUser || !freshUser.isActive) {
    return null
  }

  session.user.id = freshUser.id
  session.user.email = freshUser.email
  session.user.name = freshUser.name
  session.user.role = freshUser.role
  session.user.school = freshUser.school
  session.user.isActive = freshUser.isActive
  session.user.pmacMemberId = freshUser.pmacMemberId
  session.user.mustChangePassword = hasUserSecurityFields() ? freshUser.mustChangePassword : false

  return session
}

export async function requireAuthenticatedSession(): Promise<AuthSession> {
  const session = await resolveCurrentSession(await getServerSession(authOptions))

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

export async function requireRoleAccess(allowedRoles: readonly Role[], options: AccessOptions = {}): Promise<AuthSession> {
  const session = await requireAuthenticatedSession()

  if (!allowedRoles.includes(session.user.role)) {
    redirect('/')
  }

  const needsZeroTrust = options.zeroTrust || shouldEnforceZeroTrust(session.user.role, options.nextPath ?? '')
  if (needsZeroTrust && isPrivilegedRole(session.user.role)) {
    const isZeroTrustValid = await hasValidZeroTrustSession(session.user.id, session.user.role)

    if (!isZeroTrustValid) {
      redirect(getZeroTrustRedirectPath(options.nextPath || '/'))
    }
  }

  return session
}

export async function assertActionAccess(allowedRoles: readonly Role[], options: AccessOptions = {}): Promise<AuthSession> {
  const session = await resolveCurrentSession(await getServerSession(authOptions))

  if (!session?.user) {
    throw new Error('Authentication required. Please sign out and sign back in.')
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
