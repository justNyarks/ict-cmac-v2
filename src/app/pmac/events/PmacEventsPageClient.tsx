'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Plus, Search } from 'lucide-react'

import { getPmacEvents } from '@/app/pmac/actions'
import { PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import { filterPmacEvents } from '@/lib/pmacFilters'
import { PMAC_EVENT_STATUSES, PMAC_EVENT_STATUS_LABELS } from '@/lib/pmac'
import { getRoleLabel } from '@/lib/roles'

type EventListItem = Awaited<ReturnType<typeof getPmacEvents>>[number]

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PmacEventsPageClient({ role }: { role: string }) {
  const [events, setEvents] = useState<EventListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  useEffect(() => {
    let cancelled = false

    async function loadEvents() {
      const result = await getPmacEvents()
      if (!cancelled) {
        setEvents(result)
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
              : 'Track drafts, approvals, staffing, and completion for PMAC events.'}
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
          {role === 'PMAC_DIRECTOR' ? (
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

      {filteredEvents.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map(event => (
            <Link key={event.id} href={`/pmac/events/${event.id}`} className="card p-5 space-y-4 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{event.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{event.venue}</p>
                </div>
                <PmacEventStatusBadge status={event.status} />
              </div>

              <div className="space-y-1 text-sm text-slate-500">
                <p>{formatDateTime(event.startDateTime)}</p>
                <p>{formatDateTime(event.endDateTime)}</p>
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
            {role === 'PMAC_DIRECTOR'
              ? 'Start by creating a draft event, then submit it for CMAC approval.'
              : 'Once PMAC events are created or assigned to you, they will appear here.'}
          </p>
        </div>
      )}
    </div>
  )
}
