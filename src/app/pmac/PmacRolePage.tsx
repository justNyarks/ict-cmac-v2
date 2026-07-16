import { prisma } from '@/lib/prisma'
import { isPmacAssignmentResponderRole, isPmacEventManagerRole, PMAC_EXECUTIVE_TITLE_LABELS, PMAC_PROJECT_STATUS_LABELS } from '@/lib/pmac'
import { getPmacProjectWhere } from '@/lib/pmacProjects'
import { getRoleLabel } from '@/lib/roles'
import type { Role } from '@/types'
import PmacDashboardPlaceholder from '@/components/pmac/PmacDashboardPlaceholder'
import { requireRoleAccess } from '@/lib/security'

type PmacRolePageProps = {
  allowedRole: Role
  nextPath: string
  accessSummary: string
}

function getPmacRoleLinks(role: Role) {
  const links = [
    { href: '/pmac/events', label: 'Events' },
    { href: '/pmac/polls', label: 'Polls' },
    { href: '/pmac/calendar', label: 'Calendar' },
    { href: '/pmac/assignments', label: 'Assignments' },
  ]

  if (role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR') {
    links.unshift({ href: '/pmac/events/new', label: 'Create Event' })
  }

  if (role === 'PMAC_DIRECTOR') {
    links.unshift({ href: '/pmac/polls/new', label: 'Create Poll' })
  }

  if (role === 'PMAC_ASSISTANT_DIRECTOR') {
    links.unshift({ href: '/pmac/polls/new', label: 'Create Poll' })
  }

  if (role === 'PMAC_SECRETARY') {
    links.push({ href: '/pmac/attendance', label: 'Attendance' })
  }

  if (role === 'PMAC_DIRECTOR' || role === 'PMAC_SECRETARY' || role === 'PMAC_EXECUTIVE' || role === 'PMAC_MEMBER') {
    links.push({ href: '/pmac/projects', label: 'Projects' })
  }

  if (role === 'PMAC_DIRECTOR' || role === 'PMAC_SECRETARY') {
    links.push({ href: '/pmac/members', label: 'Members' })
  }

  links.push({ href: '/pmac/activity', label: 'Activity History' })

  if (role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR' || role === 'PMAC_SECRETARY') {
    links.push({ href: '/pmac/reports', label: 'Reports' })
  }

  return links
}

function getPmacDashboardStats(params: {
  role: Role
  eventCount: number
  importedNeedsStaffing: number
  projectCount: number
  activeProjectCount: number
  openPollCount: number
  pendingResponses: number
}) {
  const eventLabel = isPmacEventManagerRole(params.role) || params.role === 'PMAC_SECRETARY'
    ? 'Events'
    : 'Assigned Events'
  const stats: Array<{ label: string; value: number; helper?: string }> = [
    {
      label: eventLabel,
      value: params.eventCount,
    },
  ]

  if (params.role === 'PMAC_DIRECTOR' || params.role === 'PMAC_ASSISTANT_DIRECTOR' || params.role === 'PMAC_SECRETARY') {
    stats.push({
      label: 'Duty Assignment',
      value: params.importedNeedsStaffing,
    })
  }

  if (isPmacAssignmentResponderRole(params.role)) {
    stats.push({
      label: 'Pending Responses',
      value: params.pendingResponses,
    })
  }

  if (params.projectCount > 0 || params.role === 'PMAC_DIRECTOR' || params.role === 'PMAC_SECRETARY') {
    stats.push({
      label: 'Projects',
      value: params.projectCount,
      helper: params.activeProjectCount ? `${params.activeProjectCount} active` : undefined,
    })
  }

  if (params.openPollCount > 0 || params.role === 'PMAC_DIRECTOR' || params.role === 'PMAC_ASSISTANT_DIRECTOR') {
    stats.push({
      label: 'Open Polls',
      value: params.openPollCount,
    })
  }

  return stats
}

export default async function PmacRolePage({ allowedRole, nextPath, accessSummary }: PmacRolePageProps) {
  const session = await requireRoleAccess([allowedRole], { nextPath })
  const now = new Date()
  const eventWhere = isPmacEventManagerRole(session.user.role) || session.user.role === 'PMAC_SECRETARY'
    ? {}
    : session.user.pmacMemberId
      ? {
          assignments: {
            some: {
              memberId: session.user.pmacMemberId,
            },
          },
        }
      : {
          id: '__missing_member__',
        }

  const projectWhere = await getPmacProjectWhere(session.user)
  const [eventCount, importedNeedsStaffing, projectCount, activeProjectCount, openPollCount, pendingResponses, upcomingEvents, branchProjects, openPolls] = await Promise.all([
    prisma.pmacEvent.count({
      where: eventWhere,
    }),
    prisma.pmacEvent.count({
      where: {
        ...eventWhere,
        sourceType: 'CMAC_REQUEST',
        status: 'APPROVED',
        assignments: {
          none: {},
        },
      },
    }),
    prisma.pmacProject.count({
      where: projectWhere,
    }),
    prisma.pmacProject.count({
      where: {
        ...projectWhere,
        status: 'ACTIVE',
      },
    }),
    prisma.pmacPoll.count({
      where: {
        status: 'OPEN',
      },
    }),
    session.user.pmacMemberId && isPmacAssignmentResponderRole(session.user.role)
      ? prisma.pmacEventAssignment.count({
          where: {
            memberId: session.user.pmacMemberId,
            availabilityResponse: 'PENDING',
          },
        })
      : Promise.resolve(0),
    prisma.pmacEvent.findMany({
      where: {
        ...eventWhere,
        startDateTime: {
          gte: now,
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        sourceType: true,
        startDateTime: true,
        venue: true,
      },
      orderBy: {
        startDateTime: 'asc',
      },
      take: 3,
    }),
    prisma.pmacProject.findMany({
      where: projectWhere,
      select: {
        id: true,
        title: true,
        branch: true,
        status: true,
        targetDate: true,
        headMember: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { targetDate: 'asc' },
      ],
      take: 3,
    }),
    prisma.pmacPoll.findMany({
      where: {
        status: 'OPEN',
      },
      select: {
        id: true,
        title: true,
        closesAt: true,
        type: true,
      },
      orderBy: {
        closesAt: 'asc',
      },
      take: 3,
    }),
  ])

  return (
    <PmacDashboardPlaceholder
      name={session.user.name}
      roleLabel={getRoleLabel(session.user.role)}
      accessSummary={accessSummary}
      stats={getPmacDashboardStats({
        role: session.user.role,
        eventCount,
        importedNeedsStaffing,
        projectCount,
        activeProjectCount,
        openPollCount,
        pendingResponses,
      })}
      upcomingEvents={upcomingEvents.map((event) => ({
        id: event.id,
        title: event.title,
        meta: `${new Date(event.startDateTime).toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })} | ${event.venue}${event.sourceType === 'CMAC_REQUEST' ? ' | Imported from CMAC' : ''}`,
        href: `/pmac/events/${event.id}`,
        badge: event.status,
      }))}
      branchProjects={branchProjects.map((project) => ({
        id: project.id,
        title: project.title,
        meta: `${PMAC_EXECUTIVE_TITLE_LABELS[project.branch]} | ${project.headMember?.fullName || 'No head assigned'} | due ${new Date(project.targetDate).toLocaleDateString('en-PH', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}`,
        href: '/pmac/projects',
        badge: PMAC_PROJECT_STATUS_LABELS[project.status],
      }))}
      openPolls={openPolls.map((poll) => ({
        id: poll.id,
        title: poll.title,
        meta: `${poll.type.replaceAll('_', ' ')} | closes ${poll.closesAt ? new Date(poll.closesAt).toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }) : 'not scheduled'}`,
        href: `/pmac/polls/${poll.id}`,
        badge: poll.type,
      }))}
      mustChangePassword={session.user.mustChangePassword}
      links={getPmacRoleLinks(session.user.role)}
    />
  )
}
