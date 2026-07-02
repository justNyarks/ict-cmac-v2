import { prisma } from '@/lib/prisma'
import { getNotificationFeed } from '@/lib/notifications'
import { getPmacActivityFeed } from '@/lib/pmacActivity'
import { isPmacAssignmentResponderRole, isPmacEventManagerRole } from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS, PMAC_MEMBER_STATUS_LABELS, getRoleLabel } from '@/lib/roles'
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
    { href: '/pmac/events', label: 'PMAC Events' },
    { href: '/pmac/polls', label: 'PMAC Polls' },
    { href: '/pmac/calendar', label: 'PMAC Calendar' },
    { href: '/pmac/assignments', label: 'Assignments' },
  ]

  if (role === 'PMAC_DIRECTOR') {
    links.unshift({ href: '/pmac/polls/new', label: 'Create Poll' })
    links.unshift({ href: '/pmac/events/new', label: 'Create Event' })
  }

  if (role === 'PMAC_ASSISTANT_DIRECTOR') {
    links.unshift({ href: '/pmac/polls/new', label: 'Create Poll' })
  }

  if (role === 'PMAC_SECRETARY') {
    links.push({ href: '/pmac/attendance', label: 'Attendance' })
  }

  links.push({ href: '/pmac/activity', label: 'Activity History' })

  if (role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR' || role === 'PMAC_SECRETARY') {
    links.push({ href: '/pmac/reports', label: 'Reports' })
  }

  return links
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
        },
      })
    : null
  const [eventCount, openPollCount, pendingResponses, upcomingEvents, openPolls, notifications, recentActivity] = await Promise.all([
    prisma.pmacEvent.count({
      where: eventWhere,
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
        startDateTime: true,
        venue: true,
      },
      orderBy: {
        startDateTime: 'asc',
      },
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
        })} · ${event.venue}`,
        href: `/pmac/events/${event.id}`,
        badge: event.status,
      }))}
      openPolls={openPolls.map((poll) => ({
        id: poll.id,
        title: poll.title,
        meta: `${poll.type.replaceAll('_', ' ')} · closes ${poll.closesAt ? new Date(poll.closesAt).toLocaleString('en-PH', {
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
        meta: `${entry.actorName} · ${new Date(entry.createdAt).toLocaleString('en-PH', {
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
