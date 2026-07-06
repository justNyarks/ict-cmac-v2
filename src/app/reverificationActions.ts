'use server'

import bcrypt from 'bcryptjs'

import { assertActionAccess, issueZeroTrustSession } from '@/lib/security'
import { prisma } from '@/lib/prisma'
import { sanitizePasswordInput } from '@/lib/sanitization'
import { isPrivilegedRole } from '@/lib/zeroTrust'

export async function verifySensitiveActionPassword(input: { password: string }) {
  let session: Awaited<ReturnType<typeof assertActionAccess>> | undefined
  try {
    session = await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'])
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Your session has expired. Please sign in again.' }
  }

  if (!isPrivilegedRole(session.user.role)) {
    return { success: false, error: 'This verification step is only required for privileged accounts.' }
  }

  let password: string

  try {
    password = sanitizePasswordInput(input.password, {
      fieldName: 'Current password',
      required: true,
      maxLength: 255,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Enter your current password to continue.' }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  })

  if (!user?.password) {
    return { success: false, error: 'Password verification is unavailable for this account.' }
  }

  const isPasswordValid = await bcrypt.compare(password, user.password)

  if (!isPasswordValid) {
    return { success: false, error: 'Password verification failed.' }
  }

  await issueZeroTrustSession(session.user.id, session.user.role)
  return { success: true }
}
