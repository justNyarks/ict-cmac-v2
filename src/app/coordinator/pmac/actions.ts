'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

import { recordPmacActivity } from '@/lib/pmacActivity'
import { hasUserSecurityFields, prisma } from '@/lib/prisma'
import { PMAC_SYSTEM_ROLES } from '@/lib/roles'
import { assertActionAccess } from '@/lib/security'
import { sanitizeEmailAddress, sanitizeMultilineText, sanitizePasswordInput, sanitizeSingleLineText } from '@/lib/sanitization'
import type { PmacClubRole, PmacMemberStatus, Role } from '@/types'

type PmacSystemRole = Extract<Role, 'PMAC_DIRECTOR' | 'PMAC_ASSISTANT_DIRECTOR' | 'PMAC_SECRETARY' | 'PMAC_EXECUTIVE' | 'PMAC_MEMBER'>

type PmacMemberPayload = {
  id?: string
  fullName: string
  email: string
  phone?: string
  courseOrDepartment?: string
  notes?: string
  joinedAt?: string | null
  clubRole: PmacClubRole
  status: PmacMemberStatus
  systemRole: PmacSystemRole
  password?: string
}

type PmacOfficerAssignmentPayload = {
  memberId: string
  clubRole: PmacClubRole
  status: PmacMemberStatus
  systemRole: PmacSystemRole
}

function revalidatePmacViews() {
  revalidatePath('/coordinator/pmac')
  revalidatePath('/coordinator/pmac/officers')
}

function isPmacSystemRole(role: string): role is PmacSystemRole {
  return PMAC_SYSTEM_ROLES.includes(role as PmacSystemRole)
}

function normalizeJoinedAt(value?: string | null) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Joined date is invalid.')
  }

  return parsed
}

async function ensureUniquePmacIdentity(memberId: string | undefined, email: string, accountId?: string | null) {
  const [existingMember, existingUser] = await Promise.all([
    prisma.pmacMember.findUnique({
      where: { email },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { id: true },
    }),
  ])

  if (existingMember && existingMember.id !== memberId) {
    throw new Error('A PMAC member with this email already exists.')
  }

  if (existingUser && existingUser.id !== accountId) {
    throw new Error('A system account with this email already exists.')
  }
}

export async function getPmacMembers() {
  await assertActionAccess(['CMAC_COORDINATOR'])

  return prisma.pmacMember.findMany({
    include: {
      account: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          ...(hasUserSecurityFields() ? { mustChangePassword: true } : {}),
        },
      },
    },
    orderBy: [
      { clubRole: 'asc' },
      { fullName: 'asc' },
    ],
  })
}

export async function savePmacMember(payload: PmacMemberPayload) {
  let session

  try {
    session = await assertActionAccess(['CMAC_COORDINATOR'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  const fullName = sanitizeSingleLineText(payload.fullName, {
    fieldName: 'Full name',
    maxLength: 191,
    required: true,
  })
  const email = sanitizeEmailAddress(payload.email)
  const phone = sanitizeSingleLineText(payload.phone, {
    fieldName: 'Phone',
    maxLength: 50,
  })
  const courseOrDepartment = sanitizeSingleLineText(payload.courseOrDepartment, {
    fieldName: 'Course or department',
    maxLength: 191,
  })
  const notes = sanitizeMultilineText(payload.notes, {
    fieldName: 'Notes',
    maxLength: 2000,
  })

  if (!isPmacSystemRole(payload.systemRole)) {
    return { success: false, error: 'Please choose a valid PMAC system role.' }
  }

  let password = ''
  try {
    password = sanitizePasswordInput(payload.password, {
      fieldName: payload.id ? 'Password update' : 'Password',
      required: !payload.id,
      minLength: payload.password ? 8 : 1,
      maxLength: 255,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid password input.' }
  }

  let joinedAt: Date | null
  try {
    joinedAt = normalizeJoinedAt(payload.joinedAt)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Joined date is invalid.' }
  }

  try {
    const existing = payload.id
      ? await prisma.pmacMember.findUnique({
          where: { id: payload.id },
          include: {
            account: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        })
      : null

    if (payload.id && !existing) {
      return { success: false, error: 'PMAC member not found.' }
    }

    await ensureUniquePmacIdentity(payload.id, email, existing?.account?.id)
    const supportsUserSecurityFields = hasUserSecurityFields()

    await prisma.$transaction(async (tx) => {
      const member = existing
        ? await tx.pmacMember.update({
            where: { id: existing.id },
            data: {
              fullName,
              email,
              phone: phone || null,
              courseOrDepartment: courseOrDepartment || null,
              notes: notes || null,
              joinedAt,
              clubRole: payload.clubRole,
              status: payload.status,
            },
          })
        : await tx.pmacMember.create({
            data: {
              fullName,
              email,
              phone: phone || null,
              courseOrDepartment: courseOrDepartment || null,
              notes: notes || null,
              joinedAt,
              clubRole: payload.clubRole,
              status: payload.status,
            },
          })

      const hashedPassword = password ? await bcrypt.hash(password, 10) : null

      if (existing?.account?.id) {
        await tx.user.update({
          where: { id: existing.account.id },
          data: {
            name: fullName,
            email,
            role: payload.systemRole,
            isActive: payload.status === 'ACTIVE',
            school: null,
            pmacMemberId: member.id,
            ...(hashedPassword
              ? {
                  password: hashedPassword,
                  ...(supportsUserSecurityFields
                    ? {
                        mustChangePassword: true,
                        passwordUpdatedAt: new Date(),
                      }
                    : {}),
                }
              : {}),
          },
        })
      } else {
        await tx.user.create({
          data: {
            name: fullName,
            email,
            password: hashedPassword as string,
            role: payload.systemRole,
            school: null,
            isActive: payload.status === 'ACTIVE',
            pmacMemberId: member.id,
            ...(supportsUserSecurityFields
              ? {
                  mustChangePassword: true,
                  passwordUpdatedAt: new Date(),
                }
              : {}),
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'MEMBER',
        entityId: member.id,
        memberId: member.id,
        actorId: session.user.id,
        actorName: session.user.name || 'CMAC Coordinator',
        actorRole: session.user.role,
        action: existing ? 'MEMBER_UPDATED' : 'MEMBER_CREATED',
        summary: existing
          ? `Updated PMAC member record for ${fullName}.`
          : `Created PMAC member record for ${fullName}.`,
        details: password
          ? 'Credentials were issued or reset and the account will be asked to change its password.'
          : null,
      })
    })

    revalidatePmacViews()
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save PMAC member.' }
  }
}

export async function assignPmacOfficerRole(payload: PmacOfficerAssignmentPayload) {
  let session

  try {
    session = await assertActionAccess(['CMAC_COORDINATOR'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  if (!isPmacSystemRole(payload.systemRole)) {
    return { success: false, error: 'Please choose a valid PMAC system role.' }
  }

  try {
    const member = await prisma.pmacMember.findUnique({
      where: { id: payload.memberId },
      include: {
        account: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!member || !member.account?.id) {
      return { success: false, error: 'PMAC member account is missing.' }
    }

    const accountId = member.account.id

    await prisma.$transaction(async (tx) => {
      await tx.pmacMember.update({
        where: { id: payload.memberId },
        data: {
          clubRole: payload.clubRole,
          status: payload.status,
        },
      })
      await tx.user.update({
        where: { id: accountId },
        data: {
          role: payload.systemRole,
          isActive: payload.status === 'ACTIVE',
        },
      })
      await recordPmacActivity(tx, {
        entityType: 'MEMBER',
        entityId: payload.memberId,
        memberId: payload.memberId,
        actorId: session.user.id,
        actorName: session.user.name || 'CMAC Coordinator',
        actorRole: session.user.role,
        action: 'OFFICER_ASSIGNMENT_UPDATED',
        summary: `Updated PMAC leadership assignment to ${payload.clubRole}.`,
        details: `System role set to ${payload.systemRole} and status set to ${payload.status}.`,
      })
    })

    revalidatePmacViews()
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update PMAC assignment.' }
  }
}
