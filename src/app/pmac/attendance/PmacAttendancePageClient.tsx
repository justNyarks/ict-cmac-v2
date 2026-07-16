'use client'

import clsx from 'clsx'
import { CheckCircle2, LoaderCircle, Save, Search, Users, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { getPmacAttendanceBoard, savePmacAttendance } from '@/app/pmac/actions'
import { PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import { PMAC_ATTENDANCE_LABELS, PMAC_ATTENDANCE_STATUSES, PMAC_EVENT_DUTY_ROLE_LABELS } from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'

type AttendanceBoard = Awaited<ReturnType<typeof getPmacAttendanceBoard>>
type AttendanceEvent = AttendanceBoard[number]
type AttendanceStatus = (typeof PMAC_ATTENDANCE_STATUSES)[number]
type EventAttendanceState = Record<string, Record<string, { status: AttendanceStatus; notes: string }>>

type AttendanceMember = {
  id: string
  fullName: string
  clubRole: keyof typeof PMAC_CLUB_ROLE_LABELS
  duties: string[]
}

const STATUS_BUTTON_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  LATE: 'border-amber-300 bg-amber-50 text-amber-800',
  ABSENT: 'border-red-300 bg-red-50 text-red-800',
  EXCUSED: 'border-sky-300 bg-sky-50 text-sky-800',
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getEventMembers(event: AttendanceEvent): AttendanceMember[] {
  const members = new Map<string, AttendanceMember>()

  for (const assignment of event.assignments) {
    const member = members.get(assignment.member.id) ?? {
      id: assignment.member.id,
      fullName: assignment.member.fullName,
      clubRole: assignment.member.clubRole,
      duties: [],
    }
    const duty = PMAC_EVENT_DUTY_ROLE_LABELS[assignment.assignmentRole]
    if (!member.duties.includes(duty)) member.duties.push(duty)
    members.set(member.id, member)
  }

  return Array.from(members.values()).sort((left, right) => left.fullName.localeCompare(right.fullName))
}

function getRecordedMemberCount(event: AttendanceEvent) {
  const assignedMemberIds = new Set(getEventMembers(event).map(member => member.id))
  return new Set(event.attendance
    .filter(record => assignedMemberIds.has(record.member.id))
    .map(record => record.member.id)).size
}

function buildInitialState(events: AttendanceBoard): EventAttendanceState {
  const state: EventAttendanceState = {}

  for (const event of events) {
    state[event.id] = Object.fromEntries(getEventMembers(event).map(member => [member.id, {
      status: 'PRESENT' as const,
      notes: '',
    }]))

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
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'ALL' | 'PENDING' | 'RECORDED'>('ALL')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savingEventId, setSavingEventId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [, startTransition] = useTransition()

  const loadBoard = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setLoadError('')
    try {
      const result = await getPmacAttendanceBoard()
      setEvents(result)
      setAttendanceState(buildInitialState(result))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load PMAC attendance.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return events.filter(event => {
      const members = getEventMembers(event)
      const hasCompleteAttendance = getRecordedMemberCount(event) >= members.length
      if (view === 'PENDING' && hasCompleteAttendance) return false
      if (view === 'RECORDED' && !hasCompleteAttendance) return false
      if (!normalizedQuery) return true

      return [event.title, event.venue, ...members.map(member => member.fullName)]
        .some(value => value.toLowerCase().includes(normalizedQuery))
    })
  }, [events, query, view])

  const totalAssignedMembers = events.reduce((total, event) => total + getEventMembers(event).length, 0)
  const totalAttendanceRecords = events.reduce((total, event) => total + getRecordedMemberCount(event), 0)

  function updateMember(eventId: string, memberId: string, update: Partial<{ status: AttendanceStatus; notes: string }>) {
    setAttendanceState(previous => ({
      ...previous,
      [eventId]: {
        ...previous[eventId],
        [memberId]: {
          status: previous[eventId]?.[memberId]?.status ?? 'PRESENT',
          notes: previous[eventId]?.[memberId]?.notes ?? '',
          ...update,
        },
      },
    }))
  }

  function saveEvent(event: AttendanceEvent, members: AttendanceMember[]) {
    setSavingEventId(event.id)
    startTransition(async () => {
      try {
        const result = await savePmacAttendance(members.map(member => ({
          eventId: event.id,
          memberId: member.id,
          status: attendanceState[event.id]?.[member.id]?.status ?? 'PRESENT',
          notes: attendanceState[event.id]?.[member.id]?.notes ?? '',
        })))

        if (!result.success) {
          setToast({ type: 'error', message: result.error || 'Failed to save attendance.' })
          return
        }

        setToast({
          type: 'success',
          message: result.updatedCount
            ? `${result.updatedCount} attendance record(s) saved for ${event.title}.`
            : `No attendance changes to save for ${event.title}.`,
        })
        await loadBoard(false)
      } finally {
        setSavingEventId(null)
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <LoaderCircle size={17} className="animate-spin" />
        Loading PMAC attendance...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
      {toast ? (
        <div
          role="status"
          className={clsx(
            'fixed right-4 top-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-xl',
            toast.type === 'success' ? 'bg-emerald-700' : 'bg-red-600',
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {toast.message}
        </div>
      ) : null}

      <header className="space-y-1">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Attendance</p>
        <h2 className="font-display text-2xl font-bold text-slate-800">Attendance Board</h2>
        <p className="text-sm text-slate-500">Record attendance once for each assigned member, even when they have multiple duties.</p>
      </header>

      <section className="card p-4" aria-label="Attendance summary and filters">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3 sm:border-b-0 sm:border-r sm:pb-0">
            <Users size={18} className="text-emerald-700" />
            <div><p className="text-xs text-slate-400">Staffed events</p><p className="font-bold text-slate-800">{events.length}</p></div>
          </div>
          <div><p className="text-xs text-slate-400">Assigned members</p><p className="font-bold text-slate-800">{totalAssignedMembers}</p></div>
          <div><p className="text-xs text-slate-400">Recorded</p><p className="font-bold text-slate-800">{totalAttendanceRecords}/{totalAssignedMembers}</p></div>
        </div>
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search event, venue, or member"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <select
            value={view}
            onChange={event => setView(event.target.value as typeof view)}
            aria-label="Attendance completion filter"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="ALL">All staffed events</option>
            <option value="PENDING">Needs attendance</option>
            <option value="RECORDED">Fully recorded</option>
          </select>
        </div>
      </section>

      {loadError ? (
        <div className="card border-red-200 p-6 text-center">
          <p className="font-semibold text-red-700">{loadError}</p>
          <button type="button" onClick={() => void loadBoard()} className="mt-3 text-sm font-semibold text-emerald-700">Try again</button>
        </div>
      ) : visibleEvents.length ? (
        <div className="space-y-4">
          {visibleEvents.map(event => {
            const members = getEventMembers(event)
            const memberStates = attendanceState[event.id] || {}
            const recorded = getRecordedMemberCount(event)
            const isSaving = savingEventId === event.id

            return (
              <section key={event.id} className="card overflow-hidden" aria-labelledby={`attendance-${event.id}`}>
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 id={`attendance-${event.id}`} className="truncate text-lg font-bold text-slate-800">{event.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{event.venue} | {formatDateTime(event.startDateTime)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">{recorded}/{members.length} recorded</span>
                    <PmacEventStatusBadge status={event.status} />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {members.map(member => {
                    const current = memberStates[member.id] ?? { status: 'PRESENT' as const, notes: '' }
                    return (
                      <div key={member.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(180px,1fr)_minmax(340px,1.5fr)_minmax(180px,1fr)] lg:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{member.fullName}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {PMAC_CLUB_ROLE_LABELS[member.clubRole]} | {member.duties.join(', ')}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label={`Attendance status for ${member.fullName}`}>
                          {PMAC_ATTENDANCE_STATUSES.map(status => (
                            <button
                              key={status}
                              type="button"
                              aria-pressed={current.status === status}
                              onClick={() => updateMember(event.id, member.id, { status })}
                              className={clsx(
                                'h-9 rounded-lg border px-2 text-xs font-semibold transition-colors',
                                current.status === status
                                  ? STATUS_BUTTON_CLASSES[status]
                                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                              )}
                            >
                              {PMAC_ATTENDANCE_LABELS[status]}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={current.notes}
                          maxLength={2000}
                          onChange={eventInput => updateMember(event.id, member.id, { notes: eventInput.target.value })}
                          placeholder="Optional remarks"
                          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <button
                    type="button"
                    disabled={savingEventId !== null}
                    onClick={() => saveEvent(event, members)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                    {isSaving ? 'Saving...' : 'Save Attendance'}
                  </button>
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="card space-y-2 p-8 text-center">
          <h3 className="text-lg font-bold text-slate-800">No staffed events found</h3>
          <p className="text-sm text-slate-500">Adjust the filters or assign members to an approved PMAC event first.</p>
        </div>
      )}
    </div>
  )
}
