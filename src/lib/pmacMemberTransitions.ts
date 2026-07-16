import { getDutyRolesForSpecialties, PMAC_EXECUTIVE_BRANCH_SPECIALTY, PMAC_SPECIALTY_LABELS } from '@/lib/pmac'
import type { PmacClubRole, PmacEventDutyRole, PmacExecutiveTitle, PmacMemberStatus, PmacSpecialty } from '@/types'

const ACTIVE_PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD'] as const
const CLUB_ROLE_RANK: Record<PmacClubRole, number> = {
  MEMBER: 0,
  EXECUTIVE: 1,
  SECRETARY: 2,
  ASSISTANT_DIRECTOR: 3,
  DIRECTOR: 4,
}

export type PmacMemberActiveWork = {
  eventDuties: Array<{ eventTitle: string; assignmentRole: PmacEventDutyRole }>
  projectAssignments: Array<{ projectTitle: string; branch: PmacExecutiveTitle }>
  headedProjects: Array<{ projectTitle: string; branch: PmacExecutiveTitle }>
}

export function getPmacActiveMemberWorkInclude() {
  return {
    eventAssignments: {
      where: { event: { status: 'APPROVED' as const } },
      select: {
        assignmentRole: true,
        event: { select: { title: true } },
      },
    },
    projectAssignments: {
      where: { project: { status: { in: [...ACTIVE_PROJECT_STATUSES] } } },
      select: {
        project: { select: { title: true, branch: true } },
      },
    },
    headedPmacProjects: {
      where: { status: { in: [...ACTIVE_PROJECT_STATUSES] } },
      select: { title: true, branch: true },
    },
  }
}

export function toPmacMemberActiveWork(member: {
  eventAssignments: Array<{ assignmentRole: PmacEventDutyRole; event: { title: string } }>
  projectAssignments: Array<{ project: { title: string; branch: PmacExecutiveTitle } }>
  headedPmacProjects: Array<{ title: string; branch: PmacExecutiveTitle }>
}): PmacMemberActiveWork {
  return {
    eventDuties: member.eventAssignments.map(assignment => ({
      eventTitle: assignment.event.title,
      assignmentRole: assignment.assignmentRole,
    })),
    projectAssignments: member.projectAssignments.map(assignment => ({
      projectTitle: assignment.project.title,
      branch: assignment.project.branch,
    })),
    headedProjects: member.headedPmacProjects.map(project => ({
      projectTitle: project.title,
      branch: project.branch,
    })),
  }
}

export function getPmacMemberTransitionProblem(params: {
  currentClubRole: PmacClubRole | null
  nextClubRole: PmacClubRole
  currentExecutiveTitle: PmacExecutiveTitle | null
  nextExecutiveTitle: PmacExecutiveTitle | null
  nextStatus: PmacMemberStatus
  nextSpecialties: readonly PmacSpecialty[]
  activeWork: PmacMemberActiveWork
}) {
  const { activeWork } = params

  if (params.nextStatus === 'INACTIVE') {
    const workCount = activeWork.eventDuties.length + activeWork.projectAssignments.length + activeWork.headedProjects.length
    if (workCount) {
      return `Reassign ${workCount} active event or project responsibility before deactivating this member.`
    }
  }

  if (
    params.currentClubRole
    && CLUB_ROLE_RANK[params.nextClubRole] < CLUB_ROLE_RANK[params.currentClubRole]
    && (activeWork.eventDuties.length || activeWork.projectAssignments.length || activeWork.headedProjects.length)
  ) {
    return 'Reassign active event and project responsibilities before demoting this member.'
  }

  if (params.currentExecutiveTitle !== params.nextExecutiveTitle && activeWork.headedProjects.length) {
    return `Reassign active project head responsibilities before changing this executive title: ${activeWork.headedProjects.map(project => project.projectTitle).join(', ')}.`
  }

  if (params.nextExecutiveTitle) {
    const requiredSpecialty = PMAC_EXECUTIVE_BRANCH_SPECIALTY[params.nextExecutiveTitle]
    if (!params.nextSpecialties.includes(requiredSpecialty)) {
      return `${PMAC_SPECIALTY_LABELS[requiredSpecialty]} specialty is required for this executive title.`
    }
  }

  const allowedDutyRoles = new Set(getDutyRolesForSpecialties(params.nextSpecialties))
  const incompatibleDuty = activeWork.eventDuties.find(duty => !allowedDutyRoles.has(duty.assignmentRole))
  if (incompatibleDuty) {
    return `Keep the specialty required by the ${incompatibleDuty.assignmentRole.replaceAll('_', ' ').toLowerCase()} duty in ${incompatibleDuty.eventTitle}, or reassign that duty first.`
  }

  const incompatibleProject = activeWork.projectAssignments.find(assignment => (
    !params.nextSpecialties.includes(PMAC_EXECUTIVE_BRANCH_SPECIALTY[assignment.branch])
  ))
  if (incompatibleProject) {
    const requiredSpecialty = PMAC_EXECUTIVE_BRANCH_SPECIALTY[incompatibleProject.branch]
    return `Keep ${PMAC_SPECIALTY_LABELS[requiredSpecialty]} specialty while assigned to ${incompatibleProject.projectTitle}, or reassign the project first.`
  }

  return null
}
