import type { Prisma } from '@prisma/client'

import { isPmacProjectLauncherRole } from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { getExecutiveBranchForUser } from '@/lib/pmacProjects'
import { prisma } from '@/lib/prisma'
import { sanitizeSingleLineText } from '@/lib/sanitization'
import type { SessionUser, PmacProjectMilestoneStatusValue, PmacProjectStatusValue } from './actionShared'

export function parseProjectDate(value: string, fieldName: string) {
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

export async function getPmacProjectPeopleOptions() {
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

export function buildProjectHealth(project: {
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

export async function reconcilePmacProjectDeadlines(db: Prisma.TransactionClient | typeof prisma = prisma) {
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
      status: true,
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
      changes: {
        status: { before: project.status, after: nextStatus },
      },
    })
  }
}

export function mapProjectForClient<T extends {
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

export async function assertPmacProjectAccess(projectId: string, user: SessionUser) {
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

export function canClosePmacProject(project: { headMemberId: string | null }, user: SessionUser) {
  if (user.role === 'CMAC_COORDINATOR') {
    return true
  }

  return user.role === 'PMAC_EXECUTIVE'
    && !!user.pmacMemberId
    && project.headMemberId === user.pmacMemberId
}

export function isAssignedPmacProjectHead(project: { headMemberId: string | null }, user: SessionUser) {
  return user.role === 'PMAC_EXECUTIVE'
    && !!user.pmacMemberId
    && project.headMemberId === user.pmacMemberId
}

export async function hasPmacDirectorClosureCheck(projectId: string) {
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

export function assertPmacProjectCloseAccess(project: { headMemberId: string | null }, user: SessionUser, directorChecked: boolean) {
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
