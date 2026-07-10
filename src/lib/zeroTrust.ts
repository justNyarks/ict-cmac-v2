import type { Role } from '@/types'

export const ZERO_TRUST_COOKIE_NAME = 'ict_cmac_zero_trust'
export const ZERO_TRUST_PATH = '/zero-trust'
export const ZERO_TRUST_TTL_SECONDS = 15 * 60

const ZERO_TRUST_PROTECTED_PREFIXES = [
  '/admin',
  '/analytics',
  '/logs',
  '/requests',
  '/coordinator/pmac',
  '/pmac/members',
  '/pmac/reports',
] as const
export const SENSITIVE_ACTION_ROLES: Role[] = [
  'CMAC_COORDINATOR',
  'ICT_DIRECTOR',
  'PMAC_DIRECTOR',
  'PMAC_ASSISTANT_DIRECTOR',
  'PMAC_SECRETARY',
]
const PRIVILEGED_ROLES = SENSITIVE_ACTION_ROLES
const textEncoder = new TextEncoder()

type ZeroTrustPayload = {
  userId: string
  role: Role
  verifiedAt: number
}

function getZeroTrustSecret() {
  const secret = process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for zero trust verification.')
  }

  return secret
}

function encodeBase64Url(input: string | Uint8Array | ArrayBuffer) {
  const bytes =
    typeof input === 'string'
      ? textEncoder.encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input)

  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(getZeroTrustSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function parsePayload(input: string): ZeroTrustPayload | null {
  try {
    const parsed = JSON.parse(input) as Partial<ZeroTrustPayload>

    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.role !== 'string' ||
      typeof parsed.verifiedAt !== 'number'
    ) {
      return null
    }

    return parsed as ZeroTrustPayload
  } catch {
    return null
  }
}

export function isPrivilegedRole(role?: string | null): role is Role {
  return typeof role === 'string' && PRIVILEGED_ROLES.includes(role as Role)
}

export function sanitizeNextPath(input?: string | string[] | null, fallback = '/') {
  const candidate = Array.isArray(input) ? input[0] : input

  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith(ZERO_TRUST_PATH)) {
    return fallback
  }

  return candidate
}

export function getZeroTrustRedirectPath(nextPath: string) {
  const safeNextPath = sanitizeNextPath(nextPath)
  return `${ZERO_TRUST_PATH}?next=${encodeURIComponent(safeNextPath)}`
}

export function requiresZeroTrustForPath(pathname: string) {
  return ZERO_TRUST_PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function shouldEnforceZeroTrust(role: string | null | undefined, pathname: string) {
  return isPrivilegedRole(role) && requiresZeroTrustForPath(pathname)
}

export async function createZeroTrustToken(payload: ZeroTrustPayload) {
  const body = JSON.stringify(payload)
  const key = await getSigningKey()
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(body))

  return `${encodeBase64Url(body)}.${encodeBase64Url(signature)}`
}

export async function verifyZeroTrustToken(
  token: string,
  expectedUserId?: string | null,
  expectedRole?: string | null
) {
  const [encodedBody, encodedSignature] = token.split('.')

  if (!encodedBody || !encodedSignature) {
    return false
  }

  const bodyBytes = decodeBase64Url(encodedBody)
  const body = new TextDecoder().decode(bodyBytes)
  const payload = parsePayload(body)

  if (!payload) {
    return false
  }

  const key = await getSigningKey()
  const isSignatureValid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(encodedSignature), bodyBytes)

  if (!isSignatureValid) {
    return false
  }

  if (Date.now() - payload.verifiedAt > ZERO_TRUST_TTL_SECONDS * 1000) {
    return false
  }

  if (expectedUserId && payload.userId !== expectedUserId) {
    return false
  }

  if (expectedRole && payload.role !== expectedRole) {
    return false
  }

  return true
}
