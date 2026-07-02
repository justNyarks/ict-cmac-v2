'use server'

import type { Role, School } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assertActionAccess } from "@/lib/security"
import { sanitizeEmailAddress, sanitizePasswordInput, sanitizeSingleLineText } from "@/lib/sanitization"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

export async function getUsers() {
  await assertActionAccess(['ICT_DIRECTOR'])

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

  let sanitizedName: string
  let normalizedEmail: string
  let sanitizedPassword: string

  try {
    sanitizedName = sanitizeSingleLineText(data.name, {
      fieldName: 'Name',
      maxLength: 191,
      required: true,
    })
    normalizedEmail = sanitizeEmailAddress(data.email)
    sanitizedPassword = sanitizePasswordInput(data.password, {
      fieldName: 'Password',
      required: true,
      minLength: 8,
      maxLength: 255,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid user details.' }
  }

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return { success: false, error: 'A user with this email already exists.' }

  const hashedPassword = await bcrypt.hash(sanitizedPassword, 10)

  await prisma.user.create({
    data: {
      name: sanitizedName,
      email: normalizedEmail,
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

  let normalizedEmail: string

  try {
    normalizedEmail = sanitizeEmailAddress(email)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Please enter a valid email address.' }
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
