'use server'

import { getAuthenticatedSession } from '@/lib/security'

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { sanitizePasswordInput, sanitizeSingleLineText } from "@/lib/sanitization"

export async function updateProfile(data: { name: string; currentPassword?: string; newPassword?: string }) {
  // This is the only account mutation available before replacing a temporary password.
  const session = await getAuthenticatedSession({ allowPasswordChange: true })
  if (!session?.user) return { success: false, error: 'Not authenticated' }

  const userId = session.user.id
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { success: false, error: 'User not found' }
  if (user.mustChangePassword && !data.newPassword) {
    return { success: false, error: 'Set a new password before continuing.' }
  }

  const updateData: Prisma.UserUpdateInput = {}

  let sanitizedName = ''

  try {
    sanitizedName = sanitizeSingleLineText(data.name, {
      fieldName: 'Name',
      maxLength: 191,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid profile details.' }
  }

  if (sanitizedName) {
    updateData.name = sanitizedName
  }

  if (data.newPassword) {
    if (!data.currentPassword) return { success: false, error: 'Current password is required to set a new one.' }

    let currentPassword: string
    let newPassword: string

    try {
      currentPassword = sanitizePasswordInput(data.currentPassword, {
        fieldName: 'Current password',
        required: true,
        maxLength: 255,
      })
      newPassword = sanitizePasswordInput(data.newPassword, {
        fieldName: 'New password',
        required: true,
        minLength: 8,
        maxLength: 255,
      })
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Invalid password input.' }
    }

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) return { success: false, error: 'Current password is incorrect.' }
    if (await bcrypt.compare(newPassword, user.password)) {
      return { success: false, error: 'Choose a password different from your current password.' }
    }
    updateData.password = await bcrypt.hash(newPassword, 10)
    updateData.mustChangePassword = false
    updateData.passwordUpdatedAt = new Date()
  }

  await prisma.user.update({ where: { id: userId }, data: updateData })
  return { success: true }
}
