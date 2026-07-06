import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { getNotificationFeed } from '@/lib/notifications'
import { getPmacActivityFeed } from '@/lib/pmacActivity'
import { isPmacAssignmentResponderRole, isPmacEventManagerRole, isPmacProjectLauncherRole, PMAC_EXECUTIVE_TITLE_LABELS, PMAC_PROJECT_STATUS_LABELS, PMAC_SPECIALTY_LABELS } from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS, PMAC_MEMBER_STATUS_LABELS, getRoleLabel } from '@/lib/roles'
import type { PmacExecutiveTitle, PmacSpecialty, Role } from '@/types'
import PmacDashboardPlaceholder from '@/components/pmac/PmacDashboardPlaceholder'
import { requireRoleAccess } from '@/lib/security'

type PmacRolePageProps = {
  allowedRole: Role
  nextPath: string
  accessSummary: string
}

function getPmacRoleLinks(role: Role) {
  const links = [
    { href: '/pmac/events', label: 'PMAC Events' },
    { href: '/pmac/polls', label: 'PMAC Polls' },
    { href: '/pmac/calendar', label: 'PMAC Calendar' },
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

  if (role === 'PMAC_DIRECTOR' || role === 'PMAC_SECRETARY') {
    links.push({ href: '/pmac/members', label: 'Members' })
  }

  if (role === 'PMAC_EXECUTIVE') {
    links.push({ href: '/pmac/tags', label: 'Tags' })
  }

  links.push({ href: '/pmac/activity', label: 'Activity History' })

  if (role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR' || role === 'PMAC_SECRETARY') {
    links.push({ href: '/pmac/reports', label: 'Reports' })
  }

  return links
}

function getPmacProjectWhere(user: { role: Role; pmacMemberId: string | null }): Prisma.PmacProjectWhereInput {
  if (isPmacProjectLauncherRole(user.role)) {
    return {}
  }

  if (!user.pmacMemberId) {
    return { id: '__missing_project_access__' }
  }

  if (user.role === 'PMAC_EXECUTIVE') {
    return {
      OR: [
        { headMemberId: user.pmacMemberId },
        {
          memberAssignments: {
            some: {
              memberId: user.pmacMemberId,
            },
          },
        },
      ],
    }
  }

  if (user.role === 'PMAC_MEMBER') {
    return {
      memberAssignments: {
        some: {
          memberId: user.pmacMemberId,
        },
      },
    }
  }

  return { id: '__missing_project_access__' }
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

  const member = session.user.pmacMemberId
    ? await prisma.pmacMember.findUnique({
        where: { id: session.user.pmacMemberId },
        select: {
          clubRole: true,
          status: true,
          executiveTitle: true,
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
      })
    : null
  const projectWhere = getPmacProjectWhere(session.user)
  const [eventCount, importedNeedsStaffing, projectCount, activeProjectCount, openPollCount, pendingResponses, upcomingEvents, branchProjects, openPolls, notifications, recentActivity] = await Promise.all([
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
    getNotificationFeed(session.user, 4),
    getPmacActivityFeed(session.user, 4),
  ])

  return (
    <PmacDashboardPlaceholder
      name={session.user.name}
      roleLabel={getRoleLabel(session.user.role)}
      accessSummary={accessSummary}
      badge={member ? (
        <div className="space-y-2">
          <span className="status-badge bg-sky-50 text-sky-700 border-sky-200">
            Club: {PMAC_CLUB_ROLE_LABELS[member.clubRole]}
          </span>
          {member.executiveTitle ? (
            <span className="status-badge bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200">
              {PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle as PmacExecutiveTitle]}
            </span>
          ) : null}
          {member.specialties.map((entry) => (
            <span key={entry.specialty} className="status-badge bg-amber-50 text-amber-700 border-amber-200">
              {PMAC_SPECIALTY_LABELS[entry.specialty as PmacSpecialty]}
            </span>
          ))}
          {member.receivedTags.map((tag) => (
            <span key={`${tag.assignedByMember.fullName}-${tag.label}`} className="status-badge bg-slate-100 text-slate-700 border-slate-200">
              {tag.label} | {tag.assignedByMember.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[tag.assignedByMember.executiveTitle as PmacExecutiveTitle] : tag.assignedByMember.fullName}
            </span>
          ))}
          <span className="status-badge bg-emerald-50 text-emerald-700 border-emerald-200">
            Status: {PMAC_MEMBER_STATUS_LABELS[member.status]}
          </span>
        </div>
      ) : (
        <span className="status-badge bg-amber-50 text-amber-700 border-amber-200">
          No PMAC member profile linked
        </span>
      )}
      stats={[
        {
          label: 'Accessible Events',
          value: eventCount,
          helper: 'Role-aware PMAC events currently available to your account.',
        },
        {
          label: 'Open Polls',
          value: openPollCount,
          helper: 'Active PMAC governance polls that are currently live.',
        },
        {
          label: 'Pending Responses',
          value: pendingResponses,
          helper: 'Assignments still waiting on your availability response.',
        },
        {
          label: 'CMAC Imports',
          value: importedNeedsStaffing,
          helper: 'Approved CMAC requests in PMAC that still need duty assignment.',
        },
        {
          label: 'Branch Projects',
          value: projectCount,
          helper: `${activeProjectCount} active project(s) currently visible to this role.`,
        },
      ]}
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
      notifications={notifications}
      recentActivity={recentActivity.map((entry) => ({
        id: entry.id,
        title: entry.summary,
        meta: `${entry.actorName} | ${new Date(entry.createdAt).toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}`,
        href: entry.href,
        badge: entry.entityType,
      }))}
      mustChangePassword={session.user.mustChangePassword}
      links={getPmacRoleLinks(session.user.role)}
    />
  )
}
