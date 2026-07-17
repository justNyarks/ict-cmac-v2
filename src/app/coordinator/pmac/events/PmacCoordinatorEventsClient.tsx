'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  Search,
  XCircle,
} from 'lucide-react'
import clsx from 'clsx'

import {
  approvePmacEvent,
  getCoordinatorPmacEventDetail,
  getPmacEvents,
  rejectPmacEvent,
} from '@/app/pmac/actions'
import { PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import {
  getPmacEventSourceBadgeClass,
  PMAC_EVENT_SOURCE_LABELS,
  PMAC_EVENT_STATUSES,
  PMAC_EVENT_STATUS_LABELS,
} from '@/lib/pmac'
import { runWithReverification } from '@/lib/reverificationClient'
import { getRoleLabel } from '@/lib/roles'
import type { DocumentationType, PmacEventSourceType } from '@/types'

type EventListItem = Awaited<ReturnType<typeof getPmacEvents>>[number]
type EventDetail = Awaited<ReturnType<typeof getCoordinatorPmacEventDetail>>

const DOCUMENTATION_LABELS: Record<DocumentationType, string> = {
  PHOTO: 'Photo',
  VIDEO: 'Video',
  BOTH: 'Photo and Video',
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return 'Not recorded'

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function sourceBadge(sourceType: PmacEventSourceType) {
  return (
    <span className={`status-badge ${getPmacEventSourceBadgeClass(sourceType)}`}>
      {PMAC_EVENT_SOURCE_LABELS[sourceType]}
    </span>
  )
}

function getDisplayDescription(event: NonNullable<EventDetail>) {
  const description = event.description?.trim()
  if (event.sourceType !== 'CMAC_REQUEST') {
    return description || 'No description was provided for this event.'
  }

  const requestNotes = description
    ?.split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('Request Notes:'))
    ?.replace(/^Request Notes:\s*/, '')

  return requestNotes || 'Approved CMAC request synchronized to PMAC for event coverage.'
}

export default function PmacCoordinatorEventsClient() {
  const [events, setEvents] = useState<EventListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EventDetail>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const refreshEvents = useCallback(async () => {
    try {
      const result = await getPmacEvents()
      setEvents(result)
      setSelectedId(current => current && result.some(event => event.id === current)
        ? current
        : result.find(event => event.status === 'PENDING_APPROVAL')?.id || result[0]?.id || null)
      setError(null)
    } catch {
      setError('Unable to load PMAC events. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshDetail = useCallback(async (eventId: string) => {
    setDetailLoading(true)
    try {
      const result = await getCoordinatorPmacEventDetail(eventId)
      setDetail(result)
      setRemarks(result?.approvalRemarks || '')
      setError(result ? null : 'This PMAC event is no longer available.')
    } catch {
      setDetail(null)
      setError('Unable to load the selected PMAC event.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshEvents()
  }, [refreshEvents])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void refreshDetail(selectedId)
  }, [refreshDetail, selectedId])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return events.filter(event => {
      const matchesStatus = statusFilter === 'ALL' || event.status === statusFilter
      const matchesQuery = !normalizedQuery
        || event.title.toLowerCase().includes(normalizedQuery)
        || event.venue.toLowerCase().includes(normalizedQuery)
        || event.sourceSchool?.toLowerCase().includes(normalizedQuery)
      return matchesStatus && matchesQuery
    })
  }, [events, query, statusFilter])

  const pendingCount = events.filter(event => event.status === 'PENDING_APPROVAL').length

  async function refreshAfterDecision(message: string) {
    setToast({ type: 'success', message })
    await refreshEvents()
    if (selectedId) await refreshDetail(selectedId)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500">Loading PMAC events...</div>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 animate-fade-in">
      {toast ? (
        <div className={clsx(
          'fixed right-6 top-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-xl',
          toast.type === 'success' ? 'bg-emerald-700' : 'bg-rose-600'
        )}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {toast.message}
        </div>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">CMAC Oversight</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-slate-900">PMAC Event Oversight</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Review PMAC-created event submissions and monitor events synchronized from approved CMAC requests.
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Awaiting Review</p>
          <p className="mt-0.5 text-xl font-bold text-amber-900">{pendingCount}</p>
        </div>
      </header>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_16rem_auto]">
        <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search title, venue, or department"
            className="w-full bg-transparent text-sm text-slate-700 outline-none"
          />
        </label>
        <select
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none"
        >
          <option value="ALL">All statuses</option>
          {PMAC_EVENT_STATUSES.map(status => (
            <option key={status} value={status}>{PMAC_EVENT_STATUS_LABELS[status]}</option>
          ))}
        </select>
        {(query || statusFilter !== 'ALL') ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setStatusFilter('ALL')
            }}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Clear filters
          </button>
        ) : <span className="self-center px-2 text-xs font-semibold text-slate-400">{events.length} events</span>}
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => void refreshEvents()} className="font-bold hover:underline">Retry</button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold text-slate-800">Event Registry</h3>
            <span className="text-xs text-slate-400">{filteredEvents.length} shown</span>
          </div>
          <div className="max-h-[42rem] divide-y divide-slate-100 overflow-y-auto">
            {filteredEvents.map(event => (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedId(event.id)}
                className={clsx(
                  'w-full px-4 py-4 text-left transition-colors hover:bg-slate-50',
                  selectedId === event.id && 'bg-emerald-50/70'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-bold text-slate-900">{event.title}</p>
                  <PmacEventStatusBadge status={event.status} />
                </div>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <CalendarDays size={13} className="text-emerald-700" />
                  {formatDateTime(event.startDateTime)}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <MapPin size={13} className="text-emerald-700" />
                  <span className="truncate">{event.venue}</span>
                </p>
                <div className="mt-3">{sourceBadge(event.sourceType)}</div>
              </button>
            ))}
            {!filteredEvents.length ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">No events match the selected filters.</div>
            ) : null}
          </div>
        </section>

        <section className="min-w-0">
          {detailLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading event details...</div>
          ) : detail ? (
            <div className="space-y-4">
              <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <PmacEventStatusBadge status={detail.status} />
                        {sourceBadge(detail.sourceType)}
                      </div>
                      <h3 className="mt-3 font-display text-2xl font-bold text-slate-900">{detail.title}</h3>
                      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-2"><MapPin size={14} />{detail.venue}</span>
                        <span className="inline-flex items-center gap-2"><Clock3 size={14} />{formatDateTime(detail.startDateTime)} to {formatDateTime(detail.endDateTime)}</span>
                      </p>
                    </div>
                    {detail.sourceRequestId ? (
                      <Link
                        href={`/requests?requestId=${detail.sourceRequestId}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        CMAC request
                        <ExternalLink size={14} />
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-5 px-5 py-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Description</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                      {getDisplayDescription(detail)}
                    </p>
                    {detail.sourceType === 'CMAC_REQUEST' ? (
                      <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                        <div>
                          <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Department</dt>
                          <dd className="mt-1 text-sm font-semibold text-slate-700">{detail.sourceSchool || 'Not specified'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Documentation</dt>
                          <dd className="mt-1 text-sm font-semibold text-slate-700">
                            {detail.sourceDocumentationType ? DOCUMENTATION_LABELS[detail.sourceDocumentationType] : 'Not specified'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Location</dt>
                          <dd className="mt-1 text-sm font-semibold text-slate-700">
                            {detail.sourceCampusType === 'IN_CAMPUS' ? 'In-Campus' : detail.sourceCampusType === 'OFF_CAMPUS' ? 'Off-Campus' : 'Not specified'}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </div>

                  <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Created By</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{detail.createdBy.name || 'Unknown user'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{getRoleLabel(detail.createdBy.role)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Decision</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {detail.approvedBy?.name || (detail.sourceType === 'CMAC_REQUEST' ? 'Approved through CMAC' : 'Awaiting coordinator review')}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {detail.approvedAt ? formatDateTime(detail.approvedAt) : detail.rejectedAt ? formatDateTime(detail.rejectedAt) : detail.submittedAt ? `Submitted ${formatDateTime(detail.submittedAt)}` : 'No decision recorded'}
                      </p>
                    </div>
                  </div>

                  {detail.approvalRemarks ? (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Review Notes</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{detail.approvalRemarks}</p>
                    </div>
                  ) : null}
                </div>
              </article>

              {detail.status === 'PENDING_APPROVAL' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
                  <h3 className="font-display text-lg font-bold text-slate-900">Coordinator Decision</h3>
                  <p className="mt-1 text-sm text-slate-600">Review this PMAC-created event before adding it to the approved PMAC calendar.</p>
                  <textarea
                    value={remarks}
                    onChange={event => setRemarks(event.target.value)}
                    rows={3}
                    className="mt-4 w-full rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
                    placeholder="Decision notes (required when rejecting)"
                  />
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => startTransition(async () => {
                        try {
                          const result = await runWithReverification(
                            () => approvePmacEvent(detail.id, remarks),
                            response => response.success ? null : response.error
                          )
                          if (!result.success) {
                            setToast({ type: 'error', message: result.error || 'Failed to approve PMAC event.' })
                            return
                          }
                          await refreshAfterDecision('PMAC event approved.')
                        } catch (actionError) {
                          setToast({ type: 'error', message: actionError instanceof Error ? actionError.message : 'Failed to verify this change.' })
                        }
                      })}
                      className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Approve Event
                    </button>
                    <button
                      type="button"
                      disabled={isPending || !remarks.trim()}
                      onClick={() => startTransition(async () => {
                        try {
                          const result = await runWithReverification(
                            () => rejectPmacEvent(detail.id, remarks),
                            response => response.success ? null : response.error
                          )
                          if (!result.success) {
                            setToast({ type: 'error', message: result.error || 'Failed to reject PMAC event.' })
                            return
                          }
                          await refreshAfterDecision('PMAC event returned to PMAC with review notes.')
                        } catch (actionError) {
                          setToast({ type: 'error', message: actionError instanceof Error ? actionError.message : 'Failed to verify this change.' })
                        }
                      })}
                      className="rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Return for Revision
                    </button>
                  </div>
                </div>
              ) : detail.sourceType === 'CMAC_REQUEST' ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  This event was already approved through the CMAC request workflow. No additional coordinator decision is required here.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Select an event to view its oversight details.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
