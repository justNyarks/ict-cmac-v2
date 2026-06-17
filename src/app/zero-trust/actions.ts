'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { issueZeroTrustSession } from '@/lib/security'
import { prisma } from '@/lib/prisma'
import { isPrivilegedRole, sanitizeNextPath } from '@/lib/zeroTrust'

export async function verifyZeroTrustAccess(input: { password: string; nextPath?: string }) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return { error: 'Your session has expired. Please sign in again.' }
  }

  if (!isPrivilegedRole(session.user.role)) {
    return { error: 'This verification flow is only available to privileged accounts.' }
  }

  const password = input.password.trim()
  const nextPath = sanitizeNextPath(input.nextPath, '/')

  if (!password) {
    return { error: 'Enter your current password to continue.' }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  })

  if (!user?.password) {
    return { error: 'Password verification is unavailable for this account.' }
  }

  const isPasswordValid = await bcrypt.compare(password, user.password)

  if (!isPasswordValid) {
    return { error: 'Password verification failed.' }
  }

  await issueZeroTrustSession(session.user.id, session.user.role)
  redirect(nextPath)
}
