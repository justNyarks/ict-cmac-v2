'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath, revalidateTag } from 'next/cache'

import { PMAC_EXECUTIVE_TITLES, PMAC_SPECIALTIES } from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { formatCourseOrDepartment, isPmacDepartment, normalizePmacMemberName } from '@/lib/pmacMembers'
import { hasUserSecurityFields, prisma } from '@/lib/prisma'
import { getDefaultClubRoleForSystemRole, PMAC_SYSTEM_ROLES } from '@/lib/roles'
import { assertActionAccess } from '@/lib/security'
import { sanitizeEmailAddress, sanitizePasswordInput, sanitizeSingleLineText } from '@/lib/sanitization'
import type { PmacClubRole, PmacExecutiveTitle, PmacMemberStatus, PmacSpecialty, Role } from '@/types'

type PmacSystemRole = Extract<Role, 'PMAC_DIRECTOR' | 'PMAC_ASSISTANT_DIRECTOR' | 'PMAC_SECRETARY' | 'PMAC_EXECUTIVE' | 'PMAC_MEMBER'>

type PmacMemberPayload = {
  id?: string
  fullName: string
  email: string
  phone?: string
  department?: string
  course?: string
  courseOrDepartment?: string
  joinedAt?: string | null
  clubRole?: PmacClubRole
  status: PmacMemberStatus
  executiveTitle?: PmacExecutiveTitle | null
  specialties: PmacSpecialty[]
  systemRole: PmacSystemRole
  password?: string
}

type PmacOfficerAssignmentPayload = {
  memberId: string
  clubRole: PmacClubRole
  status: PmacMemberStatus
  executiveTitle?: PmacExecutiveTitle | null
  systemRole: PmacSystemRole
}

function revalidatePmacViews() {
  revalidateTag('pmac-reports', 'max')
  revalidatePath('/coordinator/pmac')
  revalidatePath('/coordinator/pmac/officers')
  revalidatePath('/pmac/members')
  revalidatePath('/pmac/director')
  revalidatePath('/pmac/assistant-director')
  revalidatePath('/pmac/secretary')
  revalidatePath('/pmac/executive')
  revalidatePath('/pmac/member')
  revalidatePath('/pmac/tags')
  revalidatePath('/pmac/activity')
  revalidatePath('/pmac/reports')
}

function isPmacSystemRole(role: string): role is PmacSystemRole {
  return PMAC_SYSTEM_ROLES.includes(role as PmacSystemRole)
}

function isPmacExecutiveTitle(value: string): value is PmacExecutiveTitle {
  return PMAC_EXECUTIVE_TITLES.includes(value as PmacExecutiveTitle)
}

function isPmacSpecialty(value: string): value is PmacSpecialty {
  return PMAC_SPECIALTIES.includes(value as PmacSpecialty)
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

async function ensureExecutiveTitleAvailability(memberId: string | undefined, executiveTitle: PmacExecutiveTitle | null) {
  if (!executiveTitle) {
    return
  }

  const existingExecutive = await prisma.pmacMember.findFirst({
    where: {
      executiveTitle,
      ...(memberId
        ? {
            id: {
              not: memberId,
            },
          }
        : {}),
    },
    select: {
      fullName: true,
    },
  })

  if (existingExecutive) {
    throw new Error(`${executiveTitle.replaceAll('_', ' ')} is already assigned to ${existingExecutive.fullName}.`)
  }
}

export async function getPmacMembers() {
  await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY'])

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
      specialties: {
        select: {
          specialty: true,
        },
        orderBy: {
          specialty: 'asc',
        },
      },
      receivedTags: {
        include: {
          assignedByMember: {
            select: {
              id: true,
              fullName: true,
              executiveTitle: true,
            },
          },
        },
        orderBy: [
          { label: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
    orderBy: [
      { clubRole: 'asc' },
      { executiveTitle: 'asc' },
      { fullName: 'asc' },
    ],
  })
}

export async function savePmacMember(payload: PmacMemberPayload) {
  let session: Awaited<ReturnType<typeof assertActionAccess>> | undefined

  try {
    session = await assertActionAccess(['PMAC_DIRECTOR', 'PMAC_SECRETARY'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  const fullName = normalizePmacMemberName(sanitizeSingleLineText(payload.fullName, {
    fieldName: 'Full name',
    maxLength: 191,
    required: true,
  }))
  const email = sanitizeEmailAddress(payload.email)
  const phone = sanitizeSingleLineText(payload.phone, {
    fieldName: 'Phone',
    maxLength: 50,
  })
  const department = sanitizeSingleLineText(payload.department, {
    fieldName: 'Department',
    maxLength: 20,
    required: true,
  })
  if (!isPmacDepartment(department)) {
    return { success: false, error: 'Please choose a valid PMAC department.' }
  }
  const course = sanitizeSingleLineText(payload.course ?? payload.courseOrDepartment, {
    fieldName: 'Course',
    maxLength: 120,
    required: true,
  })
  const courseOrDepartment = formatCourseOrDepartment(department, course)
  const specialties = Array.from(new Set((payload.specialties ?? []).map((specialty) => String(specialty).trim()).filter(Boolean)))
  if (specialties.some((specialty) => !isPmacSpecialty(specialty))) {
    return { success: false, error: 'Please choose valid PMAC specialties.' }
  }
  const executiveTitleValue = sanitizeSingleLineText(payload.executiveTitle, {
    fieldName: 'Executive title',
    maxLength: 64,
  })
  if (executiveTitleValue && !isPmacExecutiveTitle(executiveTitleValue)) {
    return { success: false, error: 'Please choose a valid executive title.' }
  }
  if (!isPmacSystemRole(payload.systemRole)) {
    return { success: false, error: 'Please choose a valid PMAC system role.' }
  }
  const executiveTitle = executiveTitleValue ? executiveTitleValue as PmacExecutiveTitle : null
  const clubRole = getDefaultClubRoleForSystemRole(payload.systemRole)
  const needsExecutiveTitle = clubRole === 'EXECUTIVE'

  if (needsExecutiveTitle && !executiveTitle) {
    return { success: false, error: 'Executive accounts must have a branch head title.' }
  }

  if (!needsExecutiveTitle && executiveTitle) {
    return { success: false, error: 'Executive titles can only be used for executive members.' }
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
                role: true,
                isActive: true,
              },
            },
          },
        })
      : null

    if (payload.id && !existing) {
      return { success: false, error: 'PMAC member not found.' }
    }

    await ensureUniquePmacIdentity(payload.id, email, existing?.account?.id)
    await ensureExecutiveTitleAvailability(payload.id, executiveTitle)
    const supportsUserSecurityFields = hasUserSecurityFields()

    await prisma.$transaction(async (tx) => {
      const member = existing
        ? await tx.pmacMember.update({
            where: { id: existing.id },
            data: {
              fullName,
              email,
              phone: phone || null,
              department,
              course,
              courseOrDepartment: courseOrDepartment || null,
              notes: null,
              joinedAt,
              clubRole,
              status: payload.status,
              executiveTitle,
            },
          })
        : await tx.pmacMember.create({
            data: {
              fullName,
              email,
              phone: phone || null,
              department,
              course,
              courseOrDepartment: courseOrDepartment || null,
              notes: null,
              joinedAt,
              clubRole,
              status: payload.status,
              executiveTitle,
            },
          })

      await tx.pmacMemberSpecialty.deleteMany({
        where: {
          memberId: member.id,
        },
      })

      if (specialties.length) {
        await tx.pmacMemberSpecialty.createMany({
          data: specialties.map((specialty) => ({
            memberId: member.id,
            specialty: specialty as PmacSpecialty,
          })),
        })
      }

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
        actorName: session.user.name || 'PMAC Officer',
        actorRole: session.user.role,
        action: existing ? 'MEMBER_UPDATED' : 'MEMBER_CREATED',
        summary: existing
          ? `Updated PMAC member record for ${fullName}.`
          : `Created PMAC member record for ${fullName}.`,
        details: [
          executiveTitle ? `Executive title: ${executiveTitle}.` : null,
          specialties.length ? `Specialties: ${specialties.join(', ')}.` : null,
          password ? 'Credentials were issued or reset and the account will be asked to change its password.' : null,
        ].filter(Boolean).join(' ') || null,
        changes: {
          fullName: { before: existing?.fullName ?? null, after: fullName },
          email: { before: existing?.email ?? null, after: email },
          department: { before: existing?.department ?? null, after: department },
          course: { before: existing?.course ?? null, after: course },
          clubRole: { before: existing?.clubRole ?? null, after: clubRole },
          systemRole: { before: existing?.account?.role ?? null, after: payload.systemRole },
          status: { before: existing?.status ?? null, after: payload.status },
          executiveTitle: { before: existing?.executiveTitle ?? null, after: executiveTitle },
        },
      })
    })

    revalidatePmacViews()
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save PMAC member.' }
  }
}

export async function assignPmacOfficerRole(payload: PmacOfficerAssignmentPayload) {
  let session: Awaited<ReturnType<typeof assertActionAccess>> | undefined

  try {
    session = await assertActionAccess(['CMAC_COORDINATOR'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  if (!isPmacSystemRole(payload.systemRole)) {
    return { success: false, error: 'Please choose a valid PMAC system role.' }
  }

  const executiveTitleValue = sanitizeSingleLineText(payload.executiveTitle, {
    fieldName: 'Executive title',
    maxLength: 64,
  })
  if (executiveTitleValue && !isPmacExecutiveTitle(executiveTitleValue)) {
    return { success: false, error: 'Please choose a valid executive title.' }
  }
  const executiveTitle = executiveTitleValue ? executiveTitleValue as PmacExecutiveTitle : null
  const needsExecutiveTitle = payload.clubRole === 'EXECUTIVE' || payload.systemRole === 'PMAC_EXECUTIVE'
  if ((payload.clubRole === 'EXECUTIVE') !== (payload.systemRole === 'PMAC_EXECUTIVE')) {
    return { success: false, error: 'Executive assignments must keep the Executive club role and PMAC Executive system role aligned.' }
  }
  if (needsExecutiveTitle && !executiveTitle) {
    return { success: false, error: 'Executive assignments must include a branch head title.' }
  }
  if (!needsExecutiveTitle && executiveTitle) {
    return { success: false, error: 'Only executive assignments can keep an executive title.' }
  }

  try {
    await ensureExecutiveTitleAvailability(payload.memberId, executiveTitle)

    const member = await prisma.pmacMember.findUnique({
      where: { id: payload.memberId },
      include: {
        account: {
          select: {
            id: true,
            role: true,
            isActive: true,
          },
        },
      },
    })

    if (!member || !member.account?.id) {
      return { success: false, error: 'PMAC member account is missing.' }
    }

    const account = member.account
    const accountId = account.id

    await prisma.$transaction(async (tx) => {
      await tx.pmacMember.update({
        where: { id: payload.memberId },
        data: {
          clubRole: payload.clubRole,
          status: payload.status,
          executiveTitle,
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
        details: `System role set to ${payload.systemRole}, status set to ${payload.status}, executive title set to ${executiveTitle ?? 'none'}.`,
        changes: {
          clubRole: { before: member.clubRole, after: payload.clubRole },
          systemRole: { before: account.role, after: payload.systemRole },
          status: { before: member.status, after: payload.status },
          executiveTitle: { before: member.executiveTitle, after: executiveTitle },
          accountActive: { before: account.isActive, after: payload.status === 'ACTIVE' },
        },
      })
    })

    revalidatePmacViews()
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update PMAC assignment.' }
  }
}
