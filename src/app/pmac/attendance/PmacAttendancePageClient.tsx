'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import clsx from 'clsx'

import { getPmacAttendanceBoard, savePmacAttendance } from '@/app/pmac/actions'
import { PmacAttendanceBadge, PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import { PMAC_ATTENDANCE_LABELS, PMAC_ATTENDANCE_STATUSES, PMAC_EVENT_DUTY_ROLE_LABELS } from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'

type AttendanceBoard = Awaited<ReturnType<typeof getPmacAttendanceBoard>>

type EventAttendanceState = Record<string, Record<string, { status: (typeof PMAC_ATTENDANCE_STATUSES)[number]; notes: string }>>

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function buildInitialState(events: AttendanceBoard): EventAttendanceState {
  const state: EventAttendanceState = {}

  for (const event of events) {
    state[event.id] = {}

    for (const assignment of event.assignments) {
      state[event.id][assignment.member.id] = {
        status: 'PRESENT',
        notes: '',
      }
    }

    for (const record of event.attendance) {
      state[event.id][record.member.id] = {
        status: record.status,
        notes: record.notes || '',
      }
    }
  }

  return state
}

export default function PmacAttendancePageClient() {
  const [events, setEvents] = useState<AttendanceBoard>([])
  const [attendanceState, setAttendanceState] = useState<EventAttendanceState>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false

    async function loadBoard() {
      const result = await getPmacAttendanceBoard()
      if (!cancelled) {
        setEvents(result)
        setAttendanceState(buildInitialState(result))
        setLoading(false)
      }
    }

    loadBoard()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }
    const timeout = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC attendance...</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
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
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Attendance</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">Secretary Attendance Board</h2>
        <p className="text-sm text-slate-500">Capture attendance for staffed PMAC members during or after approved events.</p>
      </div>

      {events.length ? (
        <div className="space-y-5">
          {events.map(event => {
            const memberStates = attendanceState[event.id] || {}

            return (
              <div key={event.id} className="card p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl font-bold text-slate-800">{event.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{event.venue} · {formatDateTime(event.startDateTime)}</p>
                  </div>
                  <PmacEventStatusBadge status={event.status} />
                </div>

                {event.assignments.length ? (
                  <div className="space-y-3">
                    {event.assignments.map(assignment => {
                      const currentState = memberStates[assignment.member.id] || {
                        status: 'PRESENT' as const,
                        notes: '',
                      }

                      return (
                        <div key={assignment.id} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-[1.1fr_1fr_1fr_1.2fr]">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{assignment.member.fullName}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {PMAC_CLUB_ROLE_LABELS[assignment.member.clubRole]} · {PMAC_EVENT_DUTY_ROLE_LABELS[assignment.assignmentRole]}
                            </p>
                          </div>

                          <select
                            value={currentState.status}
                            onChange={eventInput => setAttendanceState(previous => ({
                              ...previous,
                              [event.id]: {
                                ...previous[event.id],
                                [assignment.member.id]: {
                                  ...currentState,
                                  status: eventInput.target.value as (typeof PMAC_ATTENDANCE_STATUSES)[number],
                                },
                              },
                            }))}
                            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                          >
                            {PMAC_ATTENDANCE_STATUSES.map(status => (
                              <option key={status} value={status}>
                                {PMAC_ATTENDANCE_LABELS[status]}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center">
                            <PmacAttendanceBadge status={currentState.status} />
                          </div>

                          <input
                            type="text"
                            value={currentState.notes}
                            onChange={eventInput => setAttendanceState(previous => ({
                              ...previous,
                              [event.id]: {
                                ...previous[event.id],
                                [assignment.member.id]: {
                                  ...currentState,
                                  notes: eventInput.target.value,
                                },
                              },
                            }))}
                            placeholder="Attendance notes"
                            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    No staffing assignments exist for this PMAC event yet.
                  </div>
                )}

                {event.assignments.length ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await savePmacAttendance(
                            event.assignments.map(assignment => ({
                              eventId: event.id,
                              memberId: assignment.member.id,
                              status: (attendanceState[event.id]?.[assignment.member.id]?.status || 'PRESENT'),
                              notes: attendanceState[event.id]?.[assignment.member.id]?.notes || '',
                            }))
                          )

                          if (!result.success) {
                            setToast({ type: 'error', message: result.error || 'Failed to save attendance.' })
                            return
                          }

                          setToast({ type: 'success', message: `Attendance saved for ${event.title}.` })
                        })
                      }}
                      className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                    >
                      {isPending ? 'Saving...' : 'Save Attendance'}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card p-10 text-center space-y-3">
          <h3 className="font-display text-2xl font-bold text-slate-800">No PMAC events ready for attendance</h3>
          <p className="text-sm text-slate-500">Attendance becomes available after PMAC events are approved and staffed.</p>
        </div>
      )}
    </div>
  )
}
