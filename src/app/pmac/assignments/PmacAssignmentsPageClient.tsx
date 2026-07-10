'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, UsersRound, XCircle } from 'lucide-react'
import clsx from 'clsx'

import { getPmacAssignmentsBoard, respondToPmacAssignment } from '@/app/pmac/actions'
import { PmacAvailabilityBadge, PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import { PMAC_EVENT_DUTY_ROLE_LABELS } from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'

type AssignmentRecord = Awaited<ReturnType<typeof getPmacAssignmentsBoard>>[number]
type AssignmentEventGroup = {
  event: AssignmentRecord['event']
  assignments: AssignmentRecord[]
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

export default function PmacAssignmentsPageClient({ role }: { role: string }) {
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const canRespond = role === 'PMAC_EXECUTIVE' || role === 'PMAC_MEMBER'

  const assignmentGroups = useMemo(() => {
    const groupMap = new Map<string, AssignmentEventGroup>()

    for (const assignment of assignments) {
      const currentGroup = groupMap.get(assignment.event.id)
      if (currentGroup) {
        currentGroup.assignments.push(assignment)
      } else {
        groupMap.set(assignment.event.id, {
          event: assignment.event,
          assignments: [assignment],
        })
      }
    }

    return Array.from(groupMap.values())
  }, [assignments])

  useEffect(() => {
    let cancelled = false

    async function loadAssignments() {
      const result = await getPmacAssignmentsBoard()
      if (!cancelled) {
        setAssignments(result)
        setLoading(false)
      }
    }

    loadAssignments()

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

  const updateAvailability = (assignmentId: string, response: 'YES' | 'NO') => {
    startTransition(async () => {
      const result = await respondToPmacAssignment(assignmentId, response)
      if (!result.success) {
        setToast({ type: 'error', message: result.error || 'Failed to update response.' })
        return
      }

      setToast({ type: 'success', message: response === 'YES' ? 'Availability marked Yes.' : 'Availability marked No.' })
      setAssignments(previous => previous.map(item => (
        item.id === assignmentId
          ? { ...item, availabilityResponse: response }
          : item
      )))
    })
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC assignments...</div>
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
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Assignments</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">
          {canRespond ? 'My Event Assignments' : 'Assignments Overview'}
        </h2>
        <p className="text-sm text-slate-500">
          {canRespond
            ? 'Review each event where you are assigned and respond to your duty request.'
            : 'Review each PMAC event, the assigned members, and the duty assigned to each person.'}
        </p>
      </div>

      {assignmentGroups.length ? (
        <div className="space-y-4">
          {assignmentGroups.map(group => (
            <section key={group.event.id} className="card overflow-hidden">
              <div className="border-b border-slate-100 bg-white px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PmacEventStatusBadge status={group.event.status} />
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <UsersRound size={13} />
                        {group.assignments.length} assigned
                      </span>
                    </div>
                    <h3 className="mt-3 text-xl font-bold text-slate-900">{group.event.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <CalendarDays size={15} />
                      <span>{group.event.venue}</span>
                      <span className="text-slate-300">|</span>
                      <span>{formatDateTime(group.event.startDateTime)}</span>
                    </p>
                  </div>
                  <Link
                    href={`/pmac/events/${group.event.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Open Workspace
                    <ExternalLink size={15} />
                  </Link>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {group.assignments.map(assignment => (
                  <div key={assignment.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{assignment.member.fullName}</p>
                      <p className="mt-1 text-xs text-slate-500">{PMAC_CLUB_ROLE_LABELS[assignment.member.clubRole]}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="status-badge border-slate-200 bg-slate-100 text-slate-700">
                          {assignment.memberInsights.workloadTier} load
                        </span>
                        <span className="status-badge border-emerald-200 bg-emerald-50 text-emerald-700">
                          {assignment.memberInsights.attendanceRate}% attendance
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Duty</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{PMAC_EVENT_DUTY_ROLE_LABELS[assignment.assignmentRole]}</p>
                      <p className="mt-1 text-xs text-slate-500">Assigned by {assignment.assignedBy.name || 'Unknown'}</p>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PmacAvailabilityBadge status={assignment.availabilityResponse} />
                        <span className="text-xs text-slate-400">
                          {assignment.memberInsights.upcomingLoad} other upcoming
                        </span>
                      </div>
                      {assignment.assignmentNotes ? (
                        <p className="mt-2 text-sm text-slate-600">{assignment.assignmentNotes}</p>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">No notes recorded.</p>
                      )}
                    </div>

                    {canRespond ? (
                      <div className="flex gap-2 lg:justify-end">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => updateAvailability(assignment.id, 'YES')}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => updateAvailability(assignment.id, 'NO')}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          No
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center space-y-3">
          <h3 className="font-display text-2xl font-bold text-slate-800">No PMAC assignments yet</h3>
          <p className="text-sm text-slate-500">Assignments will appear here after members are staffed onto approved PMAC events.</p>
        </div>
      )}
    </div>
  )
}
