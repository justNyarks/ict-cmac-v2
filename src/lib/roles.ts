import type { PmacClubRole, PmacMemberStatus, Role } from '@/types'

export const CORE_WORKFLOW_ROLES = ['SECRETARY', 'CMAC_COORDINATOR', 'ICT_DIRECTOR'] as const satisfies readonly Role[]
export const PMAC_SYSTEM_ROLES = [
  'PMAC_DIRECTOR',
  'PMAC_ASSISTANT_DIRECTOR',
  'PMAC_SECRETARY',
  'PMAC_EXECUTIVE',
  'PMAC_MEMBER',
] as const satisfies readonly Role[]
export const PMAC_MANAGEMENT_ROLES = ['CMAC_COORDINATOR'] as const satisfies readonly Role[]
export const PMAC_CLUB_ROLES = ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'SECRETARY', 'EXECUTIVE', 'MEMBER'] as const satisfies readonly PmacClubRole[]
export const PMAC_MEMBER_STATUSES = ['ACTIVE', 'INACTIVE'] as const satisfies readonly PmacMemberStatus[]

export const ROLE_LABELS: Record<Role, string> = {
  SECRETARY: 'Secretary',
  CMAC_COORDINATOR: 'CMAC Coordinator',
  ICT_DIRECTOR: 'ICT Director',
  PMAC_DIRECTOR: 'PMAC Director',
  PMAC_ASSISTANT_DIRECTOR: 'PMAC Assistant Director',
  PMAC_SECRETARY: 'PMAC Secretary',
  PMAC_EXECUTIVE: 'PMAC Executive',
  PMAC_MEMBER: 'PMAC Member',
}

export const PMAC_CLUB_ROLE_LABELS: Record<PmacClubRole, string> = {
  DIRECTOR: 'Director',
  ASSISTANT_DIRECTOR: 'Assistant Director',
  SECRETARY: 'Secretary',
  EXECUTIVE: 'Executive',
  MEMBER: 'Member',
}

export const PMAC_MEMBER_STATUS_LABELS: Record<PmacMemberStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
}

export const PMAC_ROLE_ROUTES: Record<(typeof PMAC_SYSTEM_ROLES)[number], string> = {
  PMAC_DIRECTOR: '/pmac/director',
  PMAC_ASSISTANT_DIRECTOR: '/pmac/assistant-director',
  PMAC_SECRETARY: '/pmac/secretary',
  PMAC_EXECUTIVE: '/pmac/executive',
  PMAC_MEMBER: '/pmac/member',
}

export function isCoreWorkflowRole(role?: string | null): role is (typeof CORE_WORKFLOW_ROLES)[number] {
  return !!role && CORE_WORKFLOW_ROLES.includes(role as (typeof CORE_WORKFLOW_ROLES)[number])
}

export function isPmacSystemRole(role?: string | null): role is (typeof PMAC_SYSTEM_ROLES)[number] {
  return !!role && PMAC_SYSTEM_ROLES.includes(role as (typeof PMAC_SYSTEM_ROLES)[number])
}

export function getRoleLabel(role?: string | null) {
  if (!role) {
    return 'Unknown Role'
  }

  return ROLE_LABELS[role as Role] ?? role
}

export function getPmacDashboardRoute(role?: string | null) {
  if (!role || !isPmacSystemRole(role)) {
    return null
  }

  return PMAC_ROLE_ROUTES[role]
}

export function getHomePathForRole(role?: string | null) {
  return getPmacDashboardRoute(role) ?? '/'
}

export function getDefaultSystemRoleForClubRole(clubRole: PmacClubRole): (typeof PMAC_SYSTEM_ROLES)[number] {
  switch (clubRole) {
    case 'DIRECTOR':
      return 'PMAC_DIRECTOR'
    case 'ASSISTANT_DIRECTOR':
      return 'PMAC_ASSISTANT_DIRECTOR'
    case 'SECRETARY':
      return 'PMAC_SECRETARY'
    case 'EXECUTIVE':
      return 'PMAC_EXECUTIVE'
    case 'MEMBER':
    default:
      return 'PMAC_MEMBER'
  }
}
