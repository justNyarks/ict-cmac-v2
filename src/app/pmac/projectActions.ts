'use server'

import type { Prisma } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache'
import { PMAC_EXECUTIVE_BRANCH_SPECIALTY, PMAC_EXECUTIVE_TITLES, PMAC_PROJECT_LAUNCHER_ROLES, PMAC_PROJECT_LINK_TYPES, PMAC_PROJECT_MILESTONE_STATUSES, PMAC_PROJECT_STATUSES, PMAC_SPECIALTY_LABELS, isPmacProjectLauncherRole } from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { getExecutiveBranchForUser, getPmacProjectWhere } from '@/lib/pmacProjects'
import { prisma } from '@/lib/prisma'
import { revalidatePmacViews } from '@/lib/pmacRevalidation'
import { sanitizeExternalHttpUrl, sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'
import type { PmacExecutiveTitle, PmacProjectMilestoneStatus, PmacProjectStatus } from '@/types'

import { formatExecutiveTitle, getViewerSession, assertPmacActionSession, getActivityActor } from './actionShared'
import type { PmacProjectStatusValue, PmacProjectMilestoneStatusValue, PmacProjectPayload, PmacProjectMemberPayload, PmacProjectMilestonePayload, PmacProjectOutputPayload, PmacProjectLinkPayload, SessionUser } from './actionShared'

function parseProjectDate(value: string, fieldName: string) {
  const sanitized = sanitizeSingleLineText(value, {
    fieldName,
    maxLength: 20,
    required: true,
  })
  const parsed = new Date(`${sanitized}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid.`)
  }

  return parsed
}

async function getPmacProjectPeopleOptions() {
  const [executiveHeads, assignableMembers] = await Promise.all([
    prisma.pmacMember.findMany({
      where: {
        status: 'ACTIVE',
        clubRole: 'EXECUTIVE',
        executiveTitle: {
          not: null,
        },
      },
      select: {
        id: true,
        fullName: true,
        executiveTitle: true,
        email: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    }),
    prisma.pmacMember.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        clubRole: true,
        executiveTitle: true,
        email: true,
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
        { fullName: 'asc' },
      ],
    }),
  ])

  return { executiveHeads, assignableMembers }
}

function buildProjectHealth(project: {
  status: PmacProjectStatusValue
  targetDate: Date
  outputSubmittedAt?: Date | null
  milestones: Array<{
    dueDate: Date
    status: PmacProjectMilestoneStatusValue
  }>
}) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const soon = new Date(now)
  soon.setDate(soon.getDate() + 3)
  const incompleteMilestones = project.milestones.filter(milestone => milestone.status !== 'DONE')
  const completedCount = project.milestones.length - incompleteMilestones.length
  const nextMilestone = incompleteMilestones
    .slice()
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0] ?? null

  if (project.status === 'COMPLETED') {
    return {
      label: 'Completed',
      tone: 'emerald',
      progress: 100,
      nextDueAt: null as Date | null,
    }
  }

  if (project.status === 'ON_HOLD') {
    return {
      label: 'On hold',
      tone: 'amber',
      progress: project.milestones.length ? Math.round((completedCount / project.milestones.length) * 100) : 0,
      nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
    }
  }

  const hasBlocked = project.milestones.some(milestone => milestone.status === 'BLOCKED')
  const hasOverdueMilestone = incompleteMilestones.some(milestone => milestone.dueDate < now)
  const isPastTarget = project.targetDate < now
  const isDueSoon = incompleteMilestones.some(milestone => milestone.dueDate >= now && milestone.dueDate <= soon)
    || (project.targetDate >= now && project.targetDate <= soon)
  const progress = project.milestones.length ? Math.round((completedCount / project.milestones.length) * 100) : 0

  if (hasBlocked || hasOverdueMilestone || isPastTarget) {
    return {
      label: 'Needs attention',
      tone: 'red',
      progress,
      nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
    }
  }

  if (isDueSoon) {
    return {
      label: 'Due soon',
      tone: 'orange',
      progress,
      nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
    }
  }

  return {
    label: 'On track',
    tone: 'emerald',
    progress,
    nextDueAt: nextMilestone?.dueDate ?? project.targetDate,
  }
}

async function reconcilePmacProjectDeadlines(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const overdueProjects = await db.pmacProject.findMany({
    where: {
      status: {
        in: ['ACTIVE', 'PLANNED'],
      },
      targetDate: {
        lt: now,
      },
    },
    select: {
      id: true,
      title: true,
      outputSubmittedAt: true,
      outputSummary: true,
    },
  })

  for (const project of overdueProjects) {
    const nextStatus = project.outputSubmittedAt || project.outputSummary ? 'COMPLETED' : 'ON_HOLD'

    await db.pmacProject.update({
      where: { id: project.id },
      data: {
        status: nextStatus,
        completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
      },
    })

    await recordPmacActivity(db, {
      entityType: 'PROJECT',
      entityId: project.id,
      projectId: project.id,
      actorId: null,
      actorName: 'System',
      actorRole: 'CMAC_COORDINATOR',
      action: 'PROJECT_DEADLINE_RECONCILED',
      summary: nextStatus === 'COMPLETED'
        ? `Marked project "${project.title}" completed at deadline because output was submitted.`
        : `Placed project "${project.title}" on hold because no output was submitted by the deadline.`,
    })
  }
}

function mapProjectForClient<T extends {
  status: PmacProjectStatusValue
  targetDate: Date
  milestones: Array<{
    dueDate: Date
    status: PmacProjectMilestoneStatusValue
  }>
}>(project: T) {
  return {
    ...project,
    health: buildProjectHealth(project),
  }
}

async function assertPmacProjectAccess(projectId: string, user: SessionUser) {
  const project = await prisma.pmacProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      branch: true,
      title: true,
      headMemberId: true,
    },
  })

  if (!project) {
    throw new Error('Project not found.')
  }

  if (isPmacProjectLauncherRole(user.role)) {
    return project
  }

  if (user.role === 'PMAC_EXECUTIVE' && user.pmacMemberId && project.headMemberId === user.pmacMemberId) {
    return project
  }

  if (user.role === 'PMAC_EXECUTIVE' && !project.headMemberId) {
    const executiveBranch = await getExecutiveBranchForUser(user)
    if (executiveBranch && executiveBranch === project.branch) {
      return project
    }
  }

  throw new Error('Only the selected executive head or PMAC project launchers can manage this project.')
}

function canClosePmacProject(project: { headMemberId: string | null }, user: SessionUser) {
  if (user.role === 'CMAC_COORDINATOR') {
    return true
  }

  return user.role === 'PMAC_EXECUTIVE'
    && !!user.pmacMemberId
    && project.headMemberId === user.pmacMemberId
}

function isAssignedPmacProjectHead(project: { headMemberId: string | null }, user: SessionUser) {
  return user.role === 'PMAC_EXECUTIVE'
    && !!user.pmacMemberId
    && project.headMemberId === user.pmacMemberId
}

async function hasPmacDirectorClosureCheck(projectId: string) {
  const check = await prisma.pmacActivityLog.findFirst({
    where: {
      projectId,
      action: 'PROJECT_DIRECTOR_CHECKED',
      actorRole: 'PMAC_DIRECTOR',
    },
    select: {
      id: true,
    },
  })

  return !!check
}

function assertPmacProjectCloseAccess(project: { headMemberId: string | null }, user: SessionUser, directorChecked: boolean) {
  if (user.role === 'CMAC_COORDINATOR') {
    return
  }

  if (isAssignedPmacProjectHead(project, user) && directorChecked) {
    return
  }

  if (isAssignedPmacProjectHead(project, user)) {
    throw new Error('PMAC Director must check this project before the assigned head can close it.')
  }

  if (!canClosePmacProject(project, user)) {
    throw new Error('Only the assigned executive head can close this project. CMAC coordinator may bypass when needed.')
  }
}

export async function getPmacProjects() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return {
      projects: [],
      stats: {
        total: 0,
        active: 0,
        needsAttention: 0,
        dueSoon: 0,
      },
      canLaunch: false,
      viewerBranch: null as PmacExecutiveTitle | null,
      viewerMemberId: null as string | null,
      executiveHeads: [],
      assignableMembers: [],
    }
  }

  await reconcilePmacProjectDeadlines()

  const where = await getPmacProjectWhere(session.user)
  const projects = await prisma.pmacProject.findMany({
    where,
    include: {
      launchedBy: {
        select: {
          name: true,
          role: true,
        },
      },
      headMember: {
        select: {
          id: true,
          fullName: true,
          email: true,
          executiveTitle: true,
        },
      },
      memberAssignments: {
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              email: true,
              clubRole: true,
              executiveTitle: true,
              specialties: {
                select: {
                  specialty: true,
                },
                orderBy: {
                  specialty: 'asc',
                },
              },
            },
          },
          assignedBy: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      milestones: {
        orderBy: {
          dueDate: 'asc',
        },
      },
      links: {
        include: {
          addedBy: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      activityLogs: {
        where: {
          action: 'PROJECT_DIRECTOR_CHECKED',
          actorRole: 'PMAC_DIRECTOR',
        },
        select: {
          actorName: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
    orderBy: [
      { status: 'asc' },
      { targetDate: 'asc' },
      { createdAt: 'desc' },
    ],
  })
  const viewerBranch = await getExecutiveBranchForUser(session.user)
  const mappedProjects = projects.map(project => {
    const directorCheck = project.activityLogs[0] ?? null
    const hasDirectorCheck = !!directorCheck
    const hasLauncherAccess = isPmacProjectLauncherRole(session.user.role)
    const hasAssignedHeadAccess = session.user.role === 'PMAC_EXECUTIVE' && project.headMemberId === session.user.pmacMemberId
    const hasUnassignedBranchAccess = session.user.role === 'PMAC_EXECUTIVE' && !project.headMemberId && project.branch === viewerBranch

    return {
      ...mapProjectForClient(project),
      directorCheck: directorCheck
        ? {
            checkedBy: directorCheck.actorName,
            checkedAt: directorCheck.createdAt,
          }
        : null,
      canManageProject: hasLauncherAccess || hasAssignedHeadAccess || hasUnassignedBranchAccess,
      canManageMembers: hasLauncherAccess || hasAssignedHeadAccess || hasUnassignedBranchAccess,
      mustSelectProjectMembers: session.user.role === 'PMAC_EXECUTIVE' && (hasAssignedHeadAccess || hasUnassignedBranchAccess),
      canCloseProject: session.user.role === 'CMAC_COORDINATOR' || (hasAssignedHeadAccess && hasDirectorCheck),
      isWaitingForDirectorCheck: hasAssignedHeadAccess && !hasDirectorCheck && project.status !== 'COMPLETED',
      canDirectorCheckProject: session.user.role === 'PMAC_DIRECTOR' && !hasDirectorCheck && project.status !== 'COMPLETED',
    }
  })
  const peopleOptions = isPmacProjectLauncherRole(session.user.role) || session.user.role === 'PMAC_EXECUTIVE'
    ? await getPmacProjectPeopleOptions()
    : { executiveHeads: [], assignableMembers: [] }

  return {
    projects: mappedProjects,
    stats: {
      total: mappedProjects.length,
      active: mappedProjects.filter(project => project.status === 'ACTIVE').length,
      needsAttention: mappedProjects.filter(project => project.health.label === 'Needs attention').length,
      dueSoon: mappedProjects.filter(project => project.health.label === 'Due soon').length,
    },
    canLaunch: isPmacProjectLauncherRole(session.user.role),
    viewerBranch,
    viewerMemberId: session.user.pmacMemberId,
    executiveHeads: peopleOptions.executiveHeads,
    assignableMembers: peopleOptions.assignableMembers,
  }
}

export async function getPmacProjectCalendarItems() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  await reconcilePmacProjectDeadlines()

  const projects = await prisma.pmacProject.findMany({
    where: await getPmacProjectWhere(session.user),
    include: {
      milestones: {
        orderBy: {
          dueDate: 'asc',
        },
      },
    },
    orderBy: [
      { startDate: 'asc' },
      { targetDate: 'asc' },
    ],
  })

  return projects.flatMap(project => {
    const health = buildProjectHealth(project)
    return [
      {
        id: `${project.id}-window`,
        projectId: project.id,
        title: project.title,
        branch: project.branch,
        type: 'PROJECT' as const,
        status: project.status,
        health,
        startDate: project.startDate,
        endDate: project.targetDate,
      },
      ...project.milestones.map(milestone => ({
        id: milestone.id,
        projectId: project.id,
        title: milestone.title,
        branch: project.branch,
        type: 'MILESTONE' as const,
        status: milestone.status,
        health,
        startDate: milestone.dueDate,
        endDate: milestone.dueDate,
      })),
    ]
  })
}

export async function savePmacProject(payload: PmacProjectPayload) {
  try {
    const session = await assertPmacActionSession(PMAC_PROJECT_LAUNCHER_ROLES)
    const title = sanitizeSingleLineText(payload.title, {
      fieldName: 'Project title',
      maxLength: 191,
      required: true,
    })
    const summary = sanitizeMultilineText(payload.summary, {
      fieldName: 'Project summary',
      maxLength: 4000,
    })
    const startDate = parseProjectDate(payload.startDate, 'Start date')
    const targetDate = parseProjectDate(payload.targetDate, 'Target date')
    const status = payload.status ?? 'ACTIVE'
    const headMemberId = sanitizeSingleLineText(payload.headMemberId, {
      fieldName: 'Executive head',
      maxLength: 191,
      required: true,
    })

    if (targetDate < startDate) {
      throw new Error('Target date cannot be earlier than the start date.')
    }
    if (!PMAC_PROJECT_STATUSES.includes(status)) {
      throw new Error('Please select a valid project status.')
    }

    const headMember = await prisma.pmacMember.findFirst({
      where: {
        id: headMemberId,
        status: 'ACTIVE',
        clubRole: 'EXECUTIVE',
        executiveTitle: {
          not: null,
        },
      },
      select: {
        id: true,
        fullName: true,
        executiveTitle: true,
      },
    })

    if (!headMember?.executiveTitle || !PMAC_EXECUTIVE_TITLES.includes(headMember.executiveTitle)) {
      throw new Error('Please select an active executive head for this project.')
    }
    const headBranch = headMember.executiveTitle

    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
    })

    if (projectId) {
      const accessibleProject = await assertPmacProjectAccess(projectId, session.user)
      if (status === 'COMPLETED') {
        const directorChecked = await hasPmacDirectorClosureCheck(projectId)
        assertPmacProjectCloseAccess(accessibleProject, session.user, directorChecked)
      }

      await prisma.$transaction(async (tx) => {
        const current = await tx.pmacProject.findUnique({
          where: { id: projectId },
          select: { status: true, headMemberId: true },
        })

        await tx.pmacProject.update({
          where: { id: projectId },
          data: {
            title,
            summary: summary || null,
            branch: headBranch,
            headMemberId: headMember.id,
            startDate,
            targetDate,
            status,
            completedAt: status === 'COMPLETED' ? new Date() : null,
          },
        })

        if (current && current.status !== status) {
          await recordPmacActivity(tx, {
            entityType: 'PROJECT',
            entityId: projectId,
            projectId,
            ...getActivityActor(session.user),
            action: 'PROJECT_STATUS_UPDATED',
            summary: `Updated project "${title}" status from ${current.status} to ${status}.`,
          })
        }

        if (current && current.headMemberId !== headMember.id) {
          await recordPmacActivity(tx, {
            entityType: 'PROJECT',
            entityId: projectId,
            projectId,
            ...getActivityActor(session.user),
            action: 'PROJECT_HEAD_ASSIGNED',
            summary: `Assigned "${title}" to ${headMember.fullName} (${formatExecutiveTitle(headBranch)}).`,
          })
        }
      })
    } else {
      await prisma.$transaction(async (tx) => {
        const created = await tx.pmacProject.create({
          data: {
            title,
            summary: summary || null,
            branch: headBranch,
            headMemberId: headMember.id,
            startDate,
            targetDate,
            status: 'ACTIVE',
            launchedById: session.user.id,
          },
        })

        await recordPmacActivity(tx, {
          entityType: 'PROJECT',
          entityId: created.id,
          projectId: created.id,
          ...getActivityActor(session.user),
          action: 'PROJECT_LAUNCHED',
          summary: `Launched project "${created.title}" for ${headMember.fullName} (${formatExecutiveTitle(created.branch) || 'a PMAC branch'}).`,
        })
      })
    }

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save PMAC project.' }
  }
}

export async function updatePmacProjectStatus(projectId: string, status: PmacProjectStatus) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const sanitizedProjectId = sanitizeSingleLineText(projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })

    if (!PMAC_PROJECT_STATUSES.includes(status)) {
      throw new Error('Please select a valid project status.')
    }

    const accessibleProject = await assertPmacProjectAccess(sanitizedProjectId, session.user)
    if (status === 'COMPLETED') {
      const directorChecked = await hasPmacDirectorClosureCheck(sanitizedProjectId)
      assertPmacProjectCloseAccess(accessibleProject, session.user, directorChecked)
    }

    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: sanitizedProjectId },
        select: {
          title: true,
          status: true,
        },
      })

      await tx.pmacProject.update({
        where: { id: sanitizedProjectId },
        data: {
          status,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        },
      })

      if (project && project.status !== status) {
        await recordPmacActivity(tx, {
          entityType: 'PROJECT',
          entityId: sanitizedProjectId,
          projectId: sanitizedProjectId,
          ...getActivityActor(session.user),
          action: 'PROJECT_STATUS_UPDATED',
          summary: `Updated project "${project.title}" status from ${project.status} to ${status}.`,
        })
      }
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update project status.' }
  }
}

export async function checkPmacProjectForClosure(projectId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR'])
    const sanitizedProjectId = sanitizeSingleLineText(projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })

    await assertPmacProjectAccess(sanitizedProjectId, session.user)
    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: sanitizedProjectId },
        select: {
          title: true,
          status: true,
        },
      })

      if (!project) {
        throw new Error('Project not found.')
      }

      if (project.status === 'COMPLETED') {
        throw new Error('Completed projects are already closed.')
      }

      const existingCheck = await tx.pmacActivityLog.findFirst({
        where: {
          projectId: sanitizedProjectId,
          action: 'PROJECT_DIRECTOR_CHECKED',
          actorRole: 'PMAC_DIRECTOR',
        },
        select: {
          id: true,
        },
      })

      if (existingCheck) {
        return
      }

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: sanitizedProjectId,
        projectId: sanitizedProjectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_DIRECTOR_CHECKED',
        summary: `PMAC Director checked project "${project.title}" for closure.`,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check project for closure.' }
  }
}

export async function submitPmacProjectOutput(payload: PmacProjectOutputPayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const outputSummary = sanitizeMultilineText(payload.outputSummary, {
      fieldName: 'Project output',
      maxLength: 6000,
      required: true,
    })

    const accessibleProject = await assertPmacProjectAccess(projectId, session.user)
    const directorChecked = await hasPmacDirectorClosureCheck(projectId)
    assertPmacProjectCloseAccess(accessibleProject, session.user, directorChecked)

    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: projectId },
        select: {
          title: true,
          status: true,
        },
      })

      if (!project) {
        throw new Error('Project not found.')
      }

      await tx.pmacProject.update({
        where: { id: projectId },
        data: {
          outputSummary,
          outputSubmittedAt: new Date(),
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_OUTPUT_SUBMITTED',
        summary: `Submitted output and marked project "${project.title}" completed.`,
        details: outputSummary,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit project output.' }
  }
}

export async function attachPmacProjectLink(payload: PmacProjectLinkPayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const label = sanitizeSingleLineText(payload.label, {
      fieldName: 'Link label',
      maxLength: 191,
      required: true,
    })
    const url = sanitizeExternalHttpUrl(payload.url, 'Project link URL')

    if (!url) {
      throw new Error('Link URL is required.')
    }
    if (!PMAC_PROJECT_LINK_TYPES.includes(payload.type)) {
      throw new Error('Please select a valid project link type.')
    }

    await assertPmacProjectAccess(projectId, session.user)
    await prisma.$transaction(async (tx) => {
      const project = await tx.pmacProject.findUnique({
        where: { id: projectId },
        select: { title: true },
      })

      if (!project) {
        throw new Error('Project not found.')
      }

      await tx.pmacProjectLink.create({
        data: {
          projectId,
          label,
          url,
          type: payload.type,
          addedById: session.user.id,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_LINK_ATTACHED',
        summary: `Attached a ${payload.type.toLowerCase()} link to project "${project.title}".`,
        details: label,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to attach project link.' }
  }
}

export async function assignPmacProjectMembers(payload: PmacProjectMemberPayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const memberIds = Array.from(new Set((payload.memberIds ?? []).map(memberId => sanitizeSingleLineText(memberId, {
      fieldName: 'PMAC member',
      maxLength: 191,
      required: true,
    }))))

    const project = await assertPmacProjectAccess(projectId, session.user)
    const assignableMemberIds = memberIds.filter(memberId => memberId !== project.headMemberId)
    const requiredSpecialty = PMAC_EXECUTIVE_BRANCH_SPECIALTY[project.branch]

    if (session.user.role === 'PMAC_EXECUTIVE' && assignableMemberIds.length < 2) {
      throw new Error(`Please select at least two active ${PMAC_SPECIALTY_LABELS[requiredSpecialty]} members who will work together on this project.`)
    }

    const members = assignableMemberIds.length
      ? await prisma.pmacMember.findMany({
          where: {
            id: {
              in: assignableMemberIds,
            },
            status: 'ACTIVE',
            specialties: {
              some: {
                specialty: requiredSpecialty,
              },
            },
          },
          select: {
            id: true,
            fullName: true,
          },
        })
      : []

    if (members.length !== assignableMemberIds.length) {
      throw new Error(`All selected project members must be active PMAC members with ${PMAC_SPECIALTY_LABELS[requiredSpecialty]} specialty.`)
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacProjectAssignment.deleteMany({
        where: {
          projectId,
        },
      })

      for (const memberId of assignableMemberIds) {
        await tx.pmacProjectAssignment.create({
          data: {
            projectId,
            memberId,
            assignedById: session.user.id,
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        ...getActivityActor(session.user),
        action: 'PROJECT_MEMBERS_ASSIGNED',
        summary: assignableMemberIds.length
          ? `Assigned ${assignableMemberIds.length} member(s) to project "${project.title}".`
          : `Cleared member assignments for project "${project.title}".`,
        details: members.map(member => member.fullName).join(', ') || null,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to assign project members.' }
  }
}

export async function savePmacProjectMilestone(payload: PmacProjectMilestonePayload) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const projectId = sanitizeSingleLineText(payload.projectId, {
      fieldName: 'Project ID',
      maxLength: 191,
      required: true,
    })
    const milestoneId = sanitizeSingleLineText(payload.milestoneId, {
      fieldName: 'Milestone ID',
      maxLength: 191,
    })
    const title = sanitizeSingleLineText(payload.title, {
      fieldName: 'Milestone title',
      maxLength: 191,
      required: true,
    })
    const notes = sanitizeMultilineText(payload.notes, {
      fieldName: 'Milestone notes',
      maxLength: 3000,
    })
    const dueDate = parseProjectDate(payload.dueDate, 'Due date')
    const status = payload.status ?? 'TODO'

    if (!PMAC_PROJECT_MILESTONE_STATUSES.includes(status)) {
      throw new Error('Please select a valid milestone status.')
    }

    const project = await assertPmacProjectAccess(projectId, session.user)

    await prisma.$transaction(async (tx) => {
      if (milestoneId) {
        const existingMilestone = await tx.pmacProjectMilestone.findFirst({
          where: {
            id: milestoneId,
            projectId,
          },
          select: { id: true },
        })

        if (!existingMilestone) {
          throw new Error('Milestone not found for this project.')
        }

        await tx.pmacProjectMilestone.update({
          where: { id: milestoneId },
          data: {
            title,
            dueDate,
            status,
            notes: notes || null,
          },
        })
      } else {
        await tx.pmacProjectMilestone.create({
          data: {
            projectId,
            title,
            dueDate,
            status,
            notes: notes || null,
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        ...getActivityActor(session.user),
        action: milestoneId ? 'PROJECT_MILESTONE_UPDATED' : 'PROJECT_MILESTONE_CREATED',
        summary: milestoneId
          ? `Updated milestone "${title}" for project "${project.title}".`
          : `Added milestone "${title}" to project "${project.title}".`,
        details: `Due ${dueDate.toLocaleDateString('en-PH')} - ${status}.`,
      })
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save milestone.' }
  }
}

export async function updatePmacProjectMilestoneStatus(milestoneId: string, status: PmacProjectMilestoneStatus) {
  try {
    const session = await assertPmacActionSession(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE'])
    const sanitizedMilestoneId = sanitizeSingleLineText(milestoneId, {
      fieldName: 'Milestone ID',
      maxLength: 191,
      required: true,
    })

    if (!PMAC_PROJECT_MILESTONE_STATUSES.includes(status)) {
      throw new Error('Please select a valid milestone status.')
    }

    const milestone = await prisma.pmacProjectMilestone.findUnique({
      where: { id: sanitizedMilestoneId },
      select: {
        projectId: true,
        title: true,
        status: true,
        project: {
          select: {
            title: true,
          },
        },
      },
    })

    if (!milestone) {
      throw new Error('Milestone not found.')
    }

    await assertPmacProjectAccess(milestone.projectId, session.user)
    await prisma.$transaction(async (tx) => {
      await tx.pmacProjectMilestone.update({
        where: { id: sanitizedMilestoneId },
        data: { status },
      })

      if (milestone.status !== status) {
        await recordPmacActivity(tx, {
          entityType: 'PROJECT',
          entityId: milestone.projectId,
          projectId: milestone.projectId,
          ...getActivityActor(session.user),
          action: 'PROJECT_MILESTONE_STATUS_UPDATED',
          summary: `Updated milestone "${milestone.title}" in project "${milestone.project.title}" from ${milestone.status} to ${status}.`,
        })
      }
    })

    revalidatePmacViews(['/pmac/projects/calendar'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update milestone status.' }
  }
}
