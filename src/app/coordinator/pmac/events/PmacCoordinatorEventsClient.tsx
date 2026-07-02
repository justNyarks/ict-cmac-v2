'use client'

import { useEffect, useState, useTransition } from 'react'
import { useCallback } from 'react'
import { CheckCircle2, Eye, XCircle } from 'lucide-react'
import clsx from 'clsx'

import { approvePmacEvent, getPmacEventWorkspace, getPmacEvents, rejectPmacEvent } from '@/app/pmac/actions'
import { PmacAttendanceBadge, PmacAvailabilityBadge, PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import { PMAC_EVENT_DUTY_ROLE_LABELS } from '@/lib/pmac'
import { runWithReverification } from '@/lib/reverificationClient'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'

type EventListItem = Awaited<ReturnType<typeof getPmacEvents>>[number]
type WorkspaceData = Awaited<ReturnType<typeof getPmacEventWorkspace>>

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return 'Not yet'
  }

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PmacCoordinatorEventsClient() {
  const [events, setEvents] = useState<EventListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceData>(null)
  const [loading, setLoading] = useState(true)
  const [remarks, setRemarks] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadEvents = useCallback(async () => {
    const result = await getPmacEvents()
    setEvents(result)
    const nextId = selectedId && result.some(event => event.id === selectedId)
      ? selectedId
      : result[0]?.id || null
    setSelectedId(nextId)
    return nextId
  }, [selectedId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextId = await loadEvents()
      if (cancelled) {
        return
      }

      if (nextId) {
        const detail = await getPmacEventWorkspace(nextId)
        if (!cancelled) {
          setWorkspace(detail)
          setRemarks(detail?.event.approvalRemarks || '')
        }
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [loadEvents])

  useEffect(() => {
    if (!selectedId) {
      setWorkspace(null)
      return
    }

    const activeEventId = selectedId

    let cancelled = false

    async function loadDetail() {
      const detail = await getPmacEventWorkspace(activeEventId)
      if (!cancelled) {
        setWorkspace(detail)
        setRemarks(detail?.event.approvalRemarks || '')
      }
    }

    loadDetail()

    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    if (!toast) {
      return
    }
    const timeout = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC coordinator view...</div>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
      {toast ? (
        <div
          className={clsx(
            'fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-2xl',
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {toast.message}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">CMAC Oversight</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">PMAC Event Approval Queue</h2>
        <p className="text-sm text-slate-500">Review PMAC event drafts that have moved into the coordinator approval workflow, plus staffing and attendance visibility after approval.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="font-semibold text-slate-800">All PMAC Events</h3>
            <p className="mt-1 text-xs text-slate-400">Select an event to review operational details.</p>
          </div>
          <div className="divide-y divide-slate-50">
            {events.map(event => (
              <button
                key={event.id}
                onClick={() => setSelectedId(event.id)}
                className={clsx(
                  'w-full px-6 py-5 text-left transition-colors hover:bg-slate-50',
                  selectedId === event.id ? 'bg-emerald-50/50' : 'bg-white'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{event.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{event.venue} · {formatDateTime(event.startDateTime)}</p>
                  </div>
                  <PmacEventStatusBadge status={event.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <span>{event._count.assignments} assignments</span>
                  <span>{event._count.attendance} attendance logs</span>
                  <span>Created by {event.createdBy.name || 'Unknown'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {workspace ? (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Selected Event</p>
                  <h3 className="mt-2 font-display text-2xl font-bold text-slate-800">{workspace.event.title}</h3>
                  <p className="mt-2 text-sm text-slate-500">{workspace.event.venue} · {formatDateTime(workspace.event.startDateTime)} to {formatDateTime(workspace.event.endDateTime)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PmacEventStatusBadge status={workspace.event.status} />
                  <span className="status-badge bg-slate-100 text-slate-700 border-slate-200">
                    <Eye size={12} />
                    Review Mode
                  </span>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Description</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{workspace.event.description || 'No description provided.'}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Created By</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{workspace.event.createdBy.name || 'Unknown'}</p>
                  <p className="mt-1 text-xs text-slate-400">{workspace.event.createdBy.email}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Current Approval Remarks</p>
                  <p className="mt-2 text-sm text-slate-600">{workspace.event.approvalRemarks || 'No remarks yet.'}</p>
                </div>
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Approval Decision</h3>
                <p className="text-sm text-slate-500">Approve or reject the PMAC event once the submission looks ready.</p>
              </div>

              <textarea
                value={remarks}
                onChange={event => setRemarks(event.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Coordinator remarks..."
              />

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isPending || workspace.event.status !== 'PENDING_APPROVAL'}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        const result = await runWithReverification(
                          () => approvePmacEvent(workspace.event.id, remarks),
                          response => response.success ? null : response.error
                        )
                        if (!result.success) {
                          setToast({ type: 'error', message: result.error || 'Failed to approve PMAC event.' })
                          return
                        }
                        setToast({ type: 'success', message: 'PMAC event approved.' })
                        const nextId = await loadEvents()
                        if (nextId) {
                          const detail = await getPmacEventWorkspace(nextId)
                          setWorkspace(detail)
                        }
                      } catch (error) {
                        setToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to verify this change.' })
                      }
                    })
                  }}
                  className="rounded-xl bg-[#064e3b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                >
                  {isPending ? 'Saving...' : 'Approve Event'}
                </button>
                <button
                  type="button"
                  disabled={isPending || workspace.event.status !== 'PENDING_APPROVAL'}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        const result = await runWithReverification(
                          () => rejectPmacEvent(workspace.event.id, remarks),
                          response => response.success ? null : response.error
                        )
                        if (!result.success) {
                          setToast({ type: 'error', message: result.error || 'Failed to reject PMAC event.' })
                          return
                        }
                        setToast({ type: 'success', message: 'PMAC event rejected.' })
                        const nextId = await loadEvents()
                        if (nextId) {
                          const detail = await getPmacEventWorkspace(nextId)
                          setWorkspace(detail)
                        }
                      } catch (error) {
                        setToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to verify this change.' })
                      }
                    })
                  }}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  {isPending ? 'Saving...' : 'Reject Event'}
                </button>
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Staffing Visibility</h3>
                <p className="text-sm text-slate-500">Monitor who is assigned, for what duty, and how they responded.</p>
              </div>

              {workspace.event.assignments.length ? (
                <div className="space-y-3">
                  {workspace.event.assignments.map((assignment: any) => (
                    <div key={assignment.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{assignment.member.fullName}</p>
                          <p className="mt-1 text-xs text-slate-400">{PMAC_CLUB_ROLE_LABELS[assignment.member.clubRole as keyof typeof PMAC_CLUB_ROLE_LABELS]}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="status-badge bg-sky-50 text-sky-700 border-sky-200">
                            {PMAC_EVENT_DUTY_ROLE_LABELS[assignment.assignmentRole as keyof typeof PMAC_EVENT_DUTY_ROLE_LABELS]}
                          </span>
                          <PmacAvailabilityBadge status={assignment.availabilityResponse} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  No staffing assignments yet for this PMAC event.
                </div>
              )}
            </div>

            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Attendance Visibility</h3>
                <p className="text-sm text-slate-500">Secretary-recorded attendance remains visible here for operational monitoring.</p>
              </div>

              {workspace.event.attendance.length ? (
                <div className="space-y-3">
                  {workspace.event.attendance.map((record: any) => (
                    <div key={record.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{record.member.fullName}</p>
                          <p className="mt-1 text-xs text-slate-400">{PMAC_CLUB_ROLE_LABELS[record.member.clubRole as keyof typeof PMAC_CLUB_ROLE_LABELS]}</p>
                        </div>
                        <PmacAttendanceBadge status={record.status} />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Recorded by {record.recordedBy.name || 'Unknown'} · {formatDateTime(record.recordedAt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  No attendance records yet for this PMAC event.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-10 text-center text-slate-500">Select a PMAC event to review.</div>
        )}
      </div>
    </div>
  )
}
