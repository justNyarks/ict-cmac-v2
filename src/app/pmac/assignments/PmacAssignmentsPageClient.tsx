'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import clsx from 'clsx'

import { getPmacAssignmentsBoard, respondToPmacAssignment } from '@/app/pmac/actions'
import { PmacAvailabilityBadge, PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import { PMAC_EVENT_DUTY_ROLE_LABELS } from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'

type AssignmentRecord = Awaited<ReturnType<typeof getPmacAssignmentsBoard>>[number]

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
          {canRespond ? 'My Coverage Requests' : 'Staffing Overview'}
        </h2>
        <p className="text-sm text-slate-500">
          {canRespond
            ? 'Respond Yes or No to your assigned PMAC event duties.'
            : 'Review event-duty coverage assignments across the PMAC workflow.'}
        </p>
      </div>

      {assignments.length ? (
        <div className="space-y-4">
          {assignments.map(assignment => (
            <div key={assignment.id} className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{assignment.event.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{assignment.event.venue} · {formatDateTime(assignment.event.startDateTime)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PmacEventStatusBadge status={assignment.event.status} />
                  <PmacAvailabilityBadge status={assignment.availabilityResponse} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Member</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{assignment.member.fullName}</p>
                  <p className="mt-1 text-xs text-slate-400">{PMAC_CLUB_ROLE_LABELS[assignment.member.clubRole]}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Duty</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{PMAC_EVENT_DUTY_ROLE_LABELS[assignment.assignmentRole]}</p>
                  <p className="mt-1 text-xs text-slate-400">Assigned by {assignment.assignedBy.name || 'Unknown'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Notes</p>
                  <p className="mt-2 text-sm text-slate-600">{assignment.assignmentNotes || 'No assignment notes recorded.'}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/pmac/events/${assignment.event.id}`}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open Event Workspace
                </Link>

                {canRespond ? (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await respondToPmacAssignment(assignment.id, 'YES')
                          if (!result.success) {
                            setToast({ type: 'error', message: result.error || 'Failed to update response.' })
                            return
                          }
                          setToast({ type: 'success', message: 'Availability marked Yes.' })
                          setAssignments(previous => previous.map(item => (
                            item.id === assignment.id
                              ? { ...item, availabilityResponse: 'YES' }
                              : item
                          )))
                        })
                      }}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await respondToPmacAssignment(assignment.id, 'NO')
                          if (!result.success) {
                            setToast({ type: 'error', message: result.error || 'Failed to update response.' })
                            return
                          }
                          setToast({ type: 'success', message: 'Availability marked No.' })
                          setAssignments(previous => previous.map(item => (
                            item.id === assignment.id
                              ? { ...item, availabilityResponse: 'NO' }
                              : item
                          )))
                        })
                      }}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      No
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
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
