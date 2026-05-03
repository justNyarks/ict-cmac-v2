'use server'

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

export async function getUsers() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return []
  
  const role = (session.user as any).role
  if (role !== 'ICT_DIRECTOR' && role !== 'CMAC_COORDINATOR') return []

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

export async function addUser(data: { name: string; email: string; password: string; role: string; school?: string }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { success: false, error: 'Not authenticated' }
  
  const myRole = (session.user as any).role
  if (myRole !== 'ICT_DIRECTOR') return { success: false, error: 'Only the ICT Director can add users.' }

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
      role: data.role as any,
      school: (data.role === 'SECRETARY' ? data.school || null : null) as any,
    }
  })

  revalidatePath('/admin')
  return { success: true }
}

export async function removeUser(id: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { success: false, error: 'Not authenticated' }
  
  const myRole = (session.user as any).role
  const myId = (session.user as any).id
  if (myRole !== 'ICT_DIRECTOR') return { success: false, error: 'Only the ICT Director can remove users.' }
  if (id === myId) return { success: false, error: 'You cannot remove yourself.' }

  await prisma.user.delete({ where: { id } })
  
  revalidatePath('/admin')
  return { success: true }
}
