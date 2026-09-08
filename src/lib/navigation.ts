import { getHomePathForRole, isPmacSystemRole } from '@/lib/roles'

export type NavigationItem = { href: string; label: string; icon: keyof typeof NAVIGATION_ICONS }
// Names are mapped to actual icons by the sidebar, keeping this policy usable on the server.
export const NAVIGATION_ICONS = {
  dashboard: true, events: true, projects: true, polls: true, calendar: true,
  members: true, assignments: true, activity: true, reports: true, attendance: true,
  newRequest: true, profile: true,
} as const

export function canAccessProjects(role?: string | null) {
  return ['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE', 'PMAC_MEMBER'].includes(role || '')
}

export function getNavigationItems(role?: string | null): NavigationItem[] {
  const items: NavigationItem[] = [{ href: getHomePathForRole(role), label: 'Dashboard', icon: 'dashboard' }]
  if (isPmacSystemRole(role)) {
    items.push({ href: '/pmac/events', label: 'PMAC Events', icon: 'events' })
    if (canAccessProjects(role)) items.push({ href: '/pmac/projects', label: 'Branch Projects', icon: 'projects' })
    items.push(
      { href: '/pmac/polls', label: 'PMAC Polls', icon: 'polls' },
      { href: '/pmac/calendar', label: 'PMAC Calendar', icon: 'calendar' },
    )
    if (role === 'PMAC_DIRECTOR' || role === 'PMAC_SECRETARY') items.push({ href: '/pmac/members', label: 'Members', icon: 'members' })
    items.push(
      { href: '/pmac/assignments', label: 'Assignments', icon: 'assignments' },
      { href: '/pmac/activity', label: 'Activity', icon: 'activity' },
    )
    if (['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'].includes(role || '')) items.push({ href: '/pmac/reports', label: 'Reports', icon: 'reports' })
    if (role === 'PMAC_SECRETARY') items.push({ href: '/pmac/attendance', label: 'Attendance', icon: 'attendance' })
  } else {
    items.push({ href: '/requests', label: 'Requests', icon: 'events' })
    if (role === 'SECRETARY' || role === 'ICT_DIRECTOR') items.push({ href: '/new-request', label: 'New Request', icon: 'newRequest' })
    items.push({ href: '/calendar', label: 'Calendar', icon: 'calendar' })
    if (role === 'CMAC_COORDINATOR' || role === 'ICT_DIRECTOR') items.push({ href: '/analytics', label: 'Analytics', icon: 'reports' })
    if (role === 'CMAC_COORDINATOR') items.push({ href: '/logs', label: 'CMAC Request Audit', icon: 'activity' })
    if (role === 'ICT_DIRECTOR') items.push({ href: '/admin', label: 'Admin', icon: 'members' })
  }
  if (role === 'CMAC_COORDINATOR') {
    items.push(
      { href: '/coordinator/pmac', label: 'PMAC Directory', icon: 'members' },
      { href: '/coordinator/pmac/officers', label: 'Officer Assignments', icon: 'assignments' },
      { href: '/coordinator/pmac/events', label: 'PMAC Events', icon: 'events' },
      { href: '/pmac/projects', label: 'Branch Projects', icon: 'projects' },
      { href: '/pmac/polls', label: 'PMAC Polls', icon: 'polls' },
      { href: '/coordinator/pmac/activity', label: 'PMAC Operations Audit', icon: 'activity' },
      { href: '/coordinator/pmac/reports', label: 'PMAC Reports', icon: 'reports' },
    )
  }
  items.push({ href: '/profile', label: 'My Profile', icon: 'profile' })
  return items
}

export function getActiveNavigationHref(pathname: string, items: NavigationItem[]) {
  return items.filter(({ href }) => pathname === href || (href !== '/' && pathname.startsWith(href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}
