'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Plus, Search } from 'lucide-react'

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Events</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-800">Operational Event Workflow</h2>
          <p className="mt-2 text-sm text-slate-500">
            {role === 'PMAC_EXECUTIVE' || role === 'PMAC_MEMBER'
              ? 'Your event list is limited to PMAC assignments linked to your account.'
              : 'Track PMAC-created events and ICT-approved CMAC requests that were assigned to PMAC for staffing.'}
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/pmac/calendar"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <CalendarDays size={14} />
            PMAC Calendar
          </Link>
          {canCreateEvent ? (
            <Link
              href="/pmac/events/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
            >
              <Plus size={14} />
              Create PMAC Event
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.4fr_0.7fr]">
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <Search size={16} className="text-slate-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search PMAC events by title or venue"
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

      {overview ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Upcoming</p>
              <p className="mt-3 text-3xl font-bold text-slate-800">{overview.totalUpcoming}</p>
              <p className="mt-1 text-xs text-slate-500">Approved PMAC events in the next 14 days.</p>
            </div>
            <div className="card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Imported</p>
              <p className="mt-3 text-3xl font-bold text-slate-800">{overview.importedCount}</p>
              <p className="mt-1 text-xs text-slate-500">Events routed from ICT/CMAC into PMAC.</p>
            </div>
            <div className="card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Unassigned</p>
              <p className="mt-3 text-3xl font-bold text-slate-800">{overview.unassignedCount}</p>
              <p className="mt-1 text-xs text-slate-500">Upcoming events without any PMAC staffing yet.</p>
            </div>
            <div className="card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pending Replies</p>
              <p className="mt-3 text-3xl font-bold text-slate-800">{overview.pendingResponses}</p>
              <p className="mt-1 text-xs text-slate-500">Assignments still waiting for member confirmation.</p>
            </div>
            <div className="card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Understaffed</p>
              <p className="mt-3 text-3xl font-bold text-slate-800">{overview.understaffedCount}</p>
              <p className="mt-1 text-xs text-slate-500">Events missing recommended coverage roles.</p>
            </div>
            <div className="card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Readiness</p>
              <p className="mt-3 text-3xl font-bold text-slate-800">{overview.averageReadinessScore}%</p>
              <p className="mt-1 text-xs text-slate-500">{overview.activeMemberCount} active members · {overview.overloadedMemberCount} high-load</p>
            </div>
          </div>

          {overview.focusEvents.length ? (
            <div className="card bg-[#f9f6ee] p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Duty Assignment</h3>
                <p className="text-sm text-slate-500">The events below still need staffing attention before they are operationally ready.</p>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {overview.focusEvents.map((event) => (
                  <Link key={event.id} href={`/pmac/events/${event.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold leading-snug text-slate-900">{event.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(event.startDateTime)} · {event.venue}
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
            <Link key={event.id} href={`/pmac/events/${event.id}`} className="card p-5 space-y-4 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{event.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{event.venue}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <PmacEventStatusBadge status={event.status} />
                  {renderSourceBadge(event.sourceType)}
                </div>
              </div>

              <div className="space-y-1 text-sm text-slate-500">
                <p>{formatDateTime(event.startDateTime)}</p>
                <p>{formatDateTime(event.endDateTime)}</p>
                {(event.sourceSchool || event.sourceDocumentationType) ? (
                  <p className="text-xs text-slate-400">
                    {[event.sourceSchool, event.sourceDocumentationType, event.sourceCampusType === 'OFF_CAMPUS' ? 'Off-Campus' : event.sourceCampusType === 'IN_CAMPUS' ? 'In-Campus' : ''].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Assignments</p>
                  <p className="mt-2 font-semibold text-slate-800">{event._count.assignments}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Attendance</p>
                  <p className="mt-2 font-semibold text-slate-800">{event._count.attendance}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Created by {event.createdBy.name || 'Unknown'}</span>
                <span>{getRoleLabel(event.createdBy.role)}</span>
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
