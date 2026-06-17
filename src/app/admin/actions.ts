'use server'

import type { Role, School } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertActionAccess } from "@/lib/security"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

export async function getUsers() {
  await assertActionAccess(['ICT_DIRECTOR'], { zeroTrust: true })

  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      school: true,
    },
    orderBy: [
      { role: 'asc' },
      { name: 'asc' }
    ]
  })
}

export async function addUser(data: { name: string; email: string; password: string; role: Role; school?: School | '' }) {
  try {
    await assertActionAccess(['ICT_DIRECTOR'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  if (!data.name.trim() || !data.email.trim() || !data.password.trim()) {
    return { success: false, error: 'Name, email, and password are required.' }
  }

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) return { success: false, error: 'A user with this email already exists.' }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      password: hashedPassword,
      role: data.role,
      school: data.role === 'SECRETARY' ? data.school || null : null,
    }
  })

  revalidatePath('/admin')
  return { success: true }
}

export async function removeUser(id: string) {
  let session
  try {
    session = await assertActionAccess(['ICT_DIRECTOR'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  const myId = session.user.id
  if (id === myId) return { success: false, error: 'You cannot remove yourself.' }

  await prisma.user.delete({ where: { id } })
  
  revalidatePath('/admin')
  return { success: true }
}

export async function updateUserEmail(id: string, email: string) {
  try {
    await assertActionAccess(['ICT_DIRECTOR'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    return { success: false, error: 'Email is required.' }
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(normalizedEmail)) {
    return { success: false, error: 'Please enter a valid email address.' }
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true }
  })

  if (!user) return { success: false, error: 'User not found.' }
  if (user.email === normalizedEmail) {
    return { success: true }
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true }
  })
  if (existing && existing.id !== id) {
    return { success: false, error: 'A user with this email already exists.' }
  }

  await prisma.user.update({
    where: { id },
    data: { email: normalizedEmail }
  })

  revalidatePath('/admin')
  return { success: true }
}
