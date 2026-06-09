'use server'

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import bcrypt from "bcryptjs"

export async function updateProfile(data: { name: string; currentPassword?: string; newPassword?: string }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { success: false, error: 'Not authenticated' }

  const userId = session.user.id
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { success: false, error: 'User not found' }

  const updateData: Prisma.UserUpdateInput = {}

  if (data.name.trim()) {
    updateData.name = data.name.trim()
  }

  if (data.newPassword) {
    if (!data.currentPassword) return { success: false, error: 'Current password is required to set a new one.' }
    const valid = await bcrypt.compare(data.currentPassword, user.password)
    if (!valid) return { success: false, error: 'Current password is incorrect.' }
    if (data.newPassword.length < 8) return { success: false, error: 'New password must be at least 8 characters.' }
    updateData.password = await bcrypt.hash(data.newPassword, 10)
  }

  await prisma.user.update({ where: { id: userId }, data: updateData })
  return { success: true }
}
