'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Inbox, MapPin, Plus, Search, UserRoundCheck, Users } from 'lucide-react'

import { getPmacEvents, getPmacStaffingOverview } from '@/app/pmac/actions'
import { PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import { filterPmacEvents } from '@/lib/pmacFilters'
import { getPmacEventSourceBadgeClass, PMAC_EVENT_SOURCE_LABELS, PMAC_EVENT_STATUSES, PMAC_EVENT_STATUS_LABELS } from '@/lib/pmac'
import { getRoleLabel } from '@/lib/roles'
import type { PmacEventSourceType } from '@/types'

type EventListItem = Awaited<ReturnType<typeof getPmacEvents>>[number]
type StaffingOverview = Awaited<ReturnType<typeof getPmacStaffingOverview>>
type FocusEvent = NonNullable<StaffingOverview>['focusEvents'][number]

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function renderSourceBadge(sourceType: PmacEventSourceType) {
  return (
    <span className={`status-badge ${getPmacEventSourceBadgeClass(sourceType)}`}>
      {PMAC_EVENT_SOURCE_LABELS[sourceType]}
    </span>
  )
}

function OverviewMetric({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode
  label: string
  value: string | number
  helper: string
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {icon}
        </span>
        <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
      </div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  )
}

export default function PmacEventsPageClient({ role }: { role: string }) {
  const canCreateEvent = role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR'
  const [events, setEvents] = useState<EventListItem[]>([])
  const [overview, setOverview] = useState<StaffingOverview>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  useEffect(() => {
    let cancelled = false

    async function loadEvents() {
      const [eventResult, overviewResult] = await Promise.all([
        getPmacEvents(),
        getPmacStaffingOverview(),
      ])
      if (!cancelled) {
        setEvents(eventResult)
        setOverview(overviewResult)
        setLoading(false)
      }
    }

    loadEvents()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredEvents = useMemo(
    () => filterPmacEvents(events, query, statusFilter),
    [events, query, statusFilter]
  )

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC events...</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-emerald-50 bg-white px-5 py-5">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">PMAC Events</p>
            <h2 className="mt-2 font-display text-3xl font-bold leading-tight text-slate-900">Event Control</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
            {role === 'PMAC_EXECUTIVE' || role === 'PMAC_MEMBER'
              ? 'Your event list is limited to PMAC assignments linked to your account.'
              : 'Track PMAC-created events and ICT-approved CMAC requests that were assigned to PMAC for staffing.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/pmac/calendar"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <CalendarDays size={14} />
              Calendar
            </Link>
            {canCreateEvent ? (
              <Link
                href="/pmac/events/new"
                className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
              >
                <Plus size={14} />
                New Event
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 bg-slate-50/70 px-5 py-4 md:grid-cols-[1.4fr_0.7fr]">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Search size={16} className="text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search by title or venue"
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
            />
          </label>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All statuses</option>
            {PMAC_EVENT_STATUSES.map(status => (
              <option key={status} value={status}>
                {PMAC_EVENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {overview ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <OverviewMetric
              icon={<CalendarDays size={17} />}
              label="Upcoming"
              value={overview.totalUpcoming}
              helper="Approved events in the next 14 days."
            />
            <OverviewMetric
              icon={<Inbox size={17} />}
              label="CMAC Imports"
              value={overview.importedCount}
              helper="Approved CMAC requests routed to PMAC."
            />
            <OverviewMetric
              icon={<UserRoundCheck size={17} />}
              label="Unassigned"
              value={overview.unassignedCount}
              helper="Events with no PMAC duty records yet."
            />
            <OverviewMetric
              icon={<Clock3 size={17} />}
              label="Pending Replies"
              value={overview.pendingResponses}
              helper="Member confirmations still waiting."
            />
            <OverviewMetric
              icon={<CheckCircle2 size={17} />}
              label="Coverage Gaps"
              value={overview.understaffedCount}
              helper="Events missing recommended roles."
            />
            <OverviewMetric
              icon={<Users size={17} />}
              label="Team Load"
              value={`${overview.overloadedMemberCount}/${overview.activeMemberCount}`}
              helper="High-load members over active roster."
            />
          </div>

          {overview.focusEvents.length ? (
            <div className="card space-y-4 bg-[#f9f6ee] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Needs Attention</p>
                  <h3 className="mt-1 font-display text-lg font-bold text-slate-800">Duty Assignment</h3>
                  <p className="mt-1 text-sm text-slate-500">Events below need member coverage, role coverage, or confirmations.</p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700">
                  {overview.focusEvents.length} event(s)
                </span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {overview.focusEvents.map((event) => (
                  <Link key={event.id} href={`/pmac/events/${event.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold leading-snug text-slate-900">{event.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <CalendarDays size={13} className="text-emerald-700" />
                          <span>{formatDateTime(event.startDateTime)}</span>
                          <MapPin size={13} className="text-emerald-700" />
                          <span>{event.venue}</span>
                        </p>
                      </div>
                      {renderSourceBadge(event.sourceType)}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!event.assignmentCount ? (
                        <span className="status-badge bg-amber-50 text-amber-800 border-amber-200">Unassigned</span>
                      ) : null}
                      {event.pendingResponses ? (
                        <span className="status-badge bg-orange-50 text-orange-800 border-orange-200">{event.pendingResponses} pending response(s)</span>
                      ) : null}
                      {event.missingRoles.length ? (
                        <span className="status-badge bg-sky-50 text-sky-800 border-sky-200">Missing {event.missingRoles.join(', ')}</span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {filteredEvents.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map(event => (
            <Link key={event.id} href={`/pmac/events/${event.id}`} className="card flex min-h-[17rem] flex-col p-5 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold leading-snug text-slate-900">{event.title}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <MapPin size={13} className="text-emerald-700" />
                    <span className="truncate">{event.venue}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <PmacEventStatusBadge status={event.status} />
                  {renderSourceBadge(event.sourceType)}
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <CalendarDays size={14} className="text-emerald-700" />
                  <span>{formatDateTime(event.startDateTime)}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Clock3 size={14} className="text-emerald-700" />
                  <span>{formatDateTime(event.endDateTime)}</span>
                </p>
                {(event.sourceSchool || event.sourceDocumentationType) ? (
                  <p className="border-t border-slate-200 pt-2 text-xs text-slate-500">
                    {[event.sourceSchool, event.sourceDocumentationType, event.sourceCampusType === 'OFF_CAMPUS' ? 'Off-Campus' : event.sourceCampusType === 'IN_CAMPUS' ? 'In-Campus' : ''].filter(Boolean).join(' | ')}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Assignments</p>
                  <p className="mt-1 font-bold text-slate-800">{event._count.assignments}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Attendance</p>
                  <p className="mt-1 font-bold text-slate-800">{event._count.attendance}</p>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-slate-400">
                <span className="truncate">Created by {event.createdBy.name || 'Unknown'}</span>
                <span className="shrink-0">{getRoleLabel(event.createdBy.role)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center space-y-3">
          <h3 className="font-display text-2xl font-bold text-slate-800">No PMAC events yet</h3>
          <p className="text-sm text-slate-500">
            {canCreateEvent
              ? 'Start by creating a draft event, or wait for an ICT-approved CMAC request assigned to PMAC.'
              : 'Once PMAC events are created or assigned to you, they will appear here.'}
          </p>
        </div>
      )}
    </div>
  )
}
