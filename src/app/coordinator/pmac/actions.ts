'use server'

import type { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { revalidatePath, revalidateTag } from 'next/cache'

import { PMAC_EXECUTIVE_TITLES, PMAC_SPECIALTIES } from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { formatCourseOrDepartment, isPmacDepartment, normalizePmacMemberName } from '@/lib/pmacMembers'
import { isPmacMemberStatus, normalizePmacPhone, parsePmacJoinedDate } from '@/lib/pmacMemberValidation'
import { getPmacActiveMemberWorkInclude, getPmacMemberTransitionProblem, toPmacMemberActiveWork } from '@/lib/pmacMemberTransitions'
import { hasUserSecurityFields, prisma } from '@/lib/prisma'
import { getDefaultClubRoleForSystemRole, PMAC_CLUB_ROLES, PMAC_SYSTEM_ROLES } from '@/lib/roles'
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

export type PmacMemberDirectoryQuery = {
  query?: string
  status?: string
  department?: string
  specialty?: string
  systemRole?: string
  sort?: string
  page?: number
  pageSize?: number
}

const PMAC_MEMBER_DIRECTORY_SORTS = ['NAME_ASC', 'NAME_DESC', 'JOINED_DESC', 'STATUS'] as const

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
    },
    orderBy: [
      { clubRole: 'asc' },
      { executiveTitle: 'asc' },
      { fullName: 'asc' },
    ],
  })
}

export async function getPmacMemberDirectory(input: PmacMemberDirectoryQuery = {}) {
  await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY'])

  const query = sanitizeSingleLineText(input.query, { fieldName: 'Member search', maxLength: 100 })
  const status = input.status && input.status !== 'ALL' ? input.status : ''
  const department = input.department && input.department !== 'ALL' ? input.department : ''
  const specialty = input.specialty && input.specialty !== 'ALL' ? input.specialty : ''
  const systemRole = input.systemRole && input.systemRole !== 'ALL' ? input.systemRole : ''
  const sort = PMAC_MEMBER_DIRECTORY_SORTS.includes(input.sort as (typeof PMAC_MEMBER_DIRECTORY_SORTS)[number])
    ? input.sort as (typeof PMAC_MEMBER_DIRECTORY_SORTS)[number]
    : 'NAME_ASC'
  const requestedPage = Number.isFinite(input.page) ? Math.max(1, Math.trunc(input.page as number)) : 1
  const pageSize = Number.isFinite(input.pageSize) ? Math.min(50, Math.max(10, Math.trunc(input.pageSize as number))) : 20

  if (status && !isPmacMemberStatus(status)) throw new Error('Invalid member status filter.')
  if (department && !isPmacDepartment(department)) throw new Error('Invalid department filter.')
  if (specialty && !isPmacSpecialty(specialty)) throw new Error('Invalid specialty filter.')
  if (systemRole && !isPmacSystemRole(systemRole)) throw new Error('Invalid access-role filter.')

  const memberStatus = status as PmacMemberStatus | ''
  const memberSpecialty = specialty as PmacSpecialty | ''
  const memberSystemRole = systemRole as PmacSystemRole | ''

  const where: Prisma.PmacMemberWhereInput = {
    ...(query
      ? {
          OR: [
            { fullName: { contains: query } },
            { email: { contains: query } },
            { phone: { contains: query } },
            { department: { contains: query } },
            { course: { contains: query } },
          ],
        }
      : {}),
    ...(memberStatus ? { status: memberStatus } : {}),
    ...(department ? { department } : {}),
    ...(memberSpecialty ? { specialties: { some: { specialty: memberSpecialty } } } : {}),
    ...(memberSystemRole ? { account: { is: { role: memberSystemRole } } } : {}),
  }

  const orderBy: Prisma.PmacMemberOrderByWithRelationInput[] = sort === 'NAME_DESC'
    ? [{ fullName: 'desc' }]
    : sort === 'JOINED_DESC'
      ? [{ joinedAt: 'desc' }, { fullName: 'asc' }]
      : sort === 'STATUS'
        ? [{ status: 'asc' }, { fullName: 'asc' }]
        : [{ fullName: 'asc' }]

  const [filteredTotal, summaryGroups] = await Promise.all([
    prisma.pmacMember.count({ where }),
    prisma.pmacMember.groupBy({
      by: ['status', 'clubRole'],
      _count: { _all: true },
    }),
  ])
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize))
  const page = Math.min(requestedPage, totalPages)

  const members = await prisma.pmacMember.findMany({
    where,
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
      specialties: { select: { specialty: true }, orderBy: { specialty: 'asc' } },
      _count: {
        select: {
          eventAssignments: { where: { event: { status: 'APPROVED' } } },
          projectAssignments: { where: { project: { status: { in: ['PLANNED', 'ACTIVE', 'ON_HOLD'] } } } },
          headedPmacProjects: { where: { status: { in: ['PLANNED', 'ACTIVE', 'ON_HOLD'] } } },
        },
      },
    },
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  const total = summaryGroups.reduce((sum, group) => sum + group._count._all, 0)
  const active = summaryGroups
    .filter(group => group.status === 'ACTIVE')
    .reduce((sum, group) => sum + group._count._all, 0)
  const officers = summaryGroups
    .filter(group => group.clubRole !== 'MEMBER')
    .reduce((sum, group) => sum + group._count._all, 0)

  return {
    members,
    syncedAt: new Date().toISOString(),
    total,
    active,
    inactive: total - active,
    officers,
    filteredTotal,
    page,
    pageSize,
    totalPages,
  }
}

export async function savePmacMember(payload: PmacMemberPayload) {
  let session: Awaited<ReturnType<typeof assertActionAccess>> | undefined

  try {
    session = await assertActionAccess(['PMAC_DIRECTOR', 'PMAC_SECRETARY'], { zeroTrust: true })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' }
  }

  const memberId = payload.id ? sanitizeSingleLineText(payload.id, {
    fieldName: 'Member ID',
    maxLength: 191,
    required: true,
  }) : undefined
  const fullName = normalizePmacMemberName(sanitizeSingleLineText(payload.fullName, {
    fieldName: 'Full name',
    maxLength: 191,
    required: true,
  }))
  const email = sanitizeEmailAddress(payload.email)
  let phone = ''
  try {
    phone = normalizePmacPhone(sanitizeSingleLineText(payload.phone, {
      fieldName: 'Phone',
      maxLength: 50,
    }))
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid phone number.' }
  }
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
  if (!specialties.length) {
    return { success: false, error: 'Select at least one PMAC specialty.' }
  }
  if (!isPmacMemberStatus(payload.status)) {
    return { success: false, error: 'Please choose a valid member status.' }
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
      minLength: payload.password ? 12 : 1,
      maxLength: 255,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid password input.' }
  }

  let joinedAt: Date | null
  try {
    joinedAt = parsePmacJoinedDate(payload.joinedAt)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Joined date is invalid.' }
  }

  try {
    const existing = memberId
      ? await prisma.pmacMember.findUnique({
          where: { id: memberId },
          include: {
            account: {
              select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
              },
            },
            specialties: { select: { specialty: true } },
            ...getPmacActiveMemberWorkInclude(),
          },
        })
      : null

    if (memberId && !existing) {
      return { success: false, error: 'PMAC member not found.' }
    }

    if (existing && !existing.account && !password) {
      return { success: false, error: 'A temporary password is required because this member does not have a system account yet.' }
    }

    await ensureUniquePmacIdentity(memberId, email, existing?.account?.id)
    await ensureExecutiveTitleAvailability(memberId, executiveTitle)
    const transitionProblem = getPmacMemberTransitionProblem({
      currentClubRole: existing?.clubRole ?? null,
      nextClubRole: clubRole,
      currentExecutiveTitle: existing?.executiveTitle ?? null,
      nextExecutiveTitle: executiveTitle,
      nextStatus: payload.status,
      nextSpecialties: specialties as PmacSpecialty[],
      activeWork: existing
        ? toPmacMemberActiveWork(existing)
        : { eventDuties: [], projectAssignments: [], headedProjects: [] },
    })
    if (transitionProblem) return { success: false, error: transitionProblem }

    const supportsUserSecurityFields = hasUserSecurityFields()
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null

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

  const memberId = sanitizeSingleLineText(payload.memberId, {
    fieldName: 'Member ID',
    maxLength: 191,
    required: true,
  })

  if (!isPmacSystemRole(payload.systemRole)) {
    return { success: false, error: 'Please choose a valid PMAC system role.' }
  }
  if (!PMAC_CLUB_ROLES.includes(payload.clubRole)) {
    return { success: false, error: 'Please choose a valid PMAC club role.' }
  }
  if (!isPmacMemberStatus(payload.status)) {
    return { success: false, error: 'Please choose a valid member status.' }
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
    await ensureExecutiveTitleAvailability(memberId, executiveTitle)

    const member = await prisma.pmacMember.findUnique({
      where: { id: memberId },
      include: {
        account: {
          select: {
            id: true,
            role: true,
            isActive: true,
          },
        },
        specialties: { select: { specialty: true } },
        ...getPmacActiveMemberWorkInclude(),
      },
    })

    if (!member || !member.account?.id) {
      return { success: false, error: 'PMAC member account is missing.' }
    }

    const account = member.account
    const accountId = account.id
    const transitionProblem = getPmacMemberTransitionProblem({
      currentClubRole: member.clubRole,
      nextClubRole: payload.clubRole,
      currentExecutiveTitle: member.executiveTitle,
      nextExecutiveTitle: executiveTitle,
      nextStatus: payload.status,
      nextSpecialties: member.specialties.map(entry => entry.specialty),
      activeWork: toPmacMemberActiveWork(member),
    })
    if (transitionProblem) return { success: false, error: transitionProblem }

    await prisma.$transaction(async (tx) => {
      await tx.pmacMember.update({
        where: { id: memberId },
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
        entityId: memberId,
        memberId,
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
