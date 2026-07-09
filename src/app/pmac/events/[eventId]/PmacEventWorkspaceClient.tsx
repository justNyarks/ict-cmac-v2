'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Paperclip, Plus, Trash2, Upload, XCircle } from 'lucide-react'
import clsx from 'clsx'

import {
  approvePmacEvent,
  getPmacEventWorkspace,
  markPmacEventCompleted,
  rejectPmacEvent,
  respondToPmacAssignment,
  savePmacAssignments,
  savePmacAttendance,
  savePmacEventWrapUp,
  submitPmacEvent,
  updatePmacEvent,
} from '@/app/pmac/actions'
import { PmacAttendanceBadge, PmacAvailabilityBadge, PmacEventStatusBadge } from '@/components/pmac/PmacBadges'
import PmacEventForm from '@/components/pmac/PmacEventForm'
import {
  PMAC_EXECUTIVE_TITLE_LABELS,
  getPmacEventSourceBadgeClass,
  PMAC_ATTENDANCE_LABELS,
  PMAC_ATTENDANCE_STATUSES,
  PMAC_EVENT_SOURCE_LABELS,
  PMAC_EVENT_DUTY_ROLES,
  PMAC_EVENT_DUTY_ROLE_LABELS,
} from '@/lib/pmac'
import { runWithReverification } from '@/lib/reverificationClient'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'
import type { PmacEventSourceType, PmacExecutiveTitle } from '@/types'

type WorkspaceData = Awaited<ReturnType<typeof getPmacEventWorkspace>>

type AssignmentRow = {
  memberId: string
  assignmentRole: (typeof PMAC_EVENT_DUTY_ROLES)[number]
  assignmentNotes: string
}

type AttendanceRow = {
  memberId: string
  fullName: string
  status: (typeof PMAC_ATTENDANCE_STATUSES)[number]
  notes: string
}

type WrapUpFields = {
  deliveredOutputs: string
  issuesEncountered: string
  attachmentAuditNotes: string
  wrapUpNotes: string
}

const EMPTY_ASSIGNMENT: AssignmentRow = {
  memberId: '',
  assignmentRole: 'PHOTOGRAPHER',
  assignmentNotes: '',
}

const EMPTY_WRAP_UP: WrapUpFields = {
  deliveredOutputs: '',
  issuesEncountered: '',
  attachmentAuditNotes: '',
  wrapUpNotes: '',
}

function buildTemplateRows(roles: readonly AssignmentRow['assignmentRole'][]) {
  return roles.map((role) => ({
    memberId: '',
    assignmentRole: role,
    assignmentNotes: '',
  }))
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return 'Not set'
  }

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateTimeInput(value: string | Date) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function renderSourceBadge(sourceType: PmacEventSourceType) {
  return (
    <span className={`status-badge ${getPmacEventSourceBadgeClass(sourceType)}`}>
      {PMAC_EVENT_SOURCE_LABELS[sourceType]}
    </span>
  )
}

function buildAttendanceRows(workspace: NonNullable<WorkspaceData>): AttendanceRow[] {
  const memberMap = new Map<string, AttendanceRow>()

  for (const assignment of workspace.event.assignments) {
    memberMap.set(assignment.member.id, {
      memberId: assignment.member.id,
      fullName: assignment.member.fullName,
      status: 'PRESENT',
      notes: '',
    })
  }

  for (const record of workspace.event.attendance) {
    memberMap.set(record.member.id, {
      memberId: record.member.id,
      fullName: record.member.fullName,
      status: record.status,
      notes: record.notes || '',
    })
  }

  return Array.from(memberMap.values()).sort((left, right) => left.fullName.localeCompare(right.fullName))
}

export default function PmacEventWorkspaceClient({ eventId }: { eventId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [approvalRemarks, setApprovalRemarks] = useState('')
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>([EMPTY_ASSIGNMENT])
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([])
  const [wrapUpFields, setWrapUpFields] = useState<WrapUpFields>(EMPTY_WRAP_UP)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentDescription, setAttachmentDescription] = useState('')
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      setLoading(true)
      const result = await getPmacEventWorkspace(eventId)
      if (cancelled) {
        return
      }
      setWorkspace(result)
      setLoading(false)
    }

    loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [eventId])

  useEffect(() => {
    if (!workspace) {
      return
    }

    setApprovalRemarks(workspace.event.approvalRemarks || '')
    setAssignmentRows(
      workspace.event.assignments.length
        ? workspace.event.assignments.map((assignment: any) => ({
            memberId: assignment.memberId,
            assignmentRole: assignment.assignmentRole as AssignmentRow['assignmentRole'],
            assignmentNotes: assignment.assignmentNotes || '',
          }))
        : [EMPTY_ASSIGNMENT]
    )
    setAttendanceRows(buildAttendanceRows(workspace))
    setWrapUpFields({
      deliveredOutputs: workspace.event.deliveredOutputs || '',
      issuesEncountered: workspace.event.issuesEncountered || '',
      attachmentAuditNotes: workspace.event.attachmentAuditNotes || '',
      wrapUpNotes: workspace.event.wrapUpNotes || '',
    })
  }, [workspace])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeout = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
  }

  const refreshWorkspace = async () => {
    const result = await getPmacEventWorkspace(eventId)
    setWorkspace(result)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC event workspace...</div>
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
        <div className="card p-8 text-center space-y-4">
          <h2 className="font-display text-2xl font-bold text-slate-800">PMAC event not available</h2>
          <p className="text-sm text-slate-500">This event may not exist or you may not have access to it.</p>
          <div>
            <Link
              href="/pmac/events"
              className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
            >
              <ArrowLeft size={14} />
              Back to PMAC Events
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { event, permissions, roster, viewerRole } = workspace
  const isImportedCmacEvent = event.sourceType === 'CMAC_REQUEST'
  const canManageAttachments = permissions.canEdit || permissions.canManageAssignments || permissions.canApprove || permissions.canRecordAttendance

  const uploadAttachment = async () => {
    if (!attachmentFile) {
      showToast('error', 'Choose a file before uploading.')
      return
    }

    setAttachmentBusy(true)

    try {
      const formData = new FormData()
      formData.set('targetType', 'event')
      formData.set('targetId', event.id)
      formData.set('description', attachmentDescription)
      formData.set('file', attachmentFile)

      const response = await fetch('/api/pmac/attachments', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()

      if (!response.ok) {
        showToast('error', payload.error || 'Failed to upload attachment.')
        return
      }

      setAttachmentFile(null)
      setAttachmentDescription('')
      showToast('success', 'Attachment uploaded.')
      await refreshWorkspace()
    } finally {
      setAttachmentBusy(false)
    }
  }

  const deleteAttachment = async (attachmentId: string) => {
    setAttachmentBusy(true)

    try {
      await runWithReverification(async () => {
        const response = await fetch('/api/pmac/attachments', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ attachmentId }),
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to remove attachment.')
        }

        return payload
      })

      showToast('success', 'Attachment removed.')
      await refreshWorkspace()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to remove attachment.')
    } finally {
      setAttachmentBusy(false)
    }
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

      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Event Workspace</p>
              <PmacEventStatusBadge status={event.status} />
              {renderSourceBadge(event.sourceType)}
            </div>
            <h2 className="mt-2 font-display text-xl font-bold leading-tight text-slate-900">{event.title}</h2>
            <p className="mt-1.5 text-sm font-semibold text-slate-700">{event.venue}</p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDateTime(event.startDateTime)} to {formatDateTime(event.endDateTime)}
            </p>
            <p className="mt-3 max-h-28 overflow-y-auto whitespace-pre-line text-sm leading-6 text-slate-600">{event.description || 'No description yet.'}</p>
            {event.sourceType === 'CMAC_REQUEST' ? (
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
                CMAC: {event.sourceSchool || 'School not recorded'} · {event.sourceDocumentationType || 'Documentation not recorded'} · {event.sourceCampusType === 'OFF_CAMPUS' ? 'Off-Campus' : event.sourceCampusType === 'IN_CAMPUS' ? 'In-Campus' : 'Location not recorded'}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-slate-500 sm:items-end">
            <Link
              href="/pmac/events"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              Back
            </Link>
            <p>{isImportedCmacEvent ? 'Requested by' : 'Created by'} {event.createdBy.name || 'Unknown'}</p>
            <p>Approved by {event.approvedBy?.name || 'Pending review'}</p>
          </div>
        </div>
      </div>

      {permissions.canEdit ? (
        <PmacEventForm
          initialValues={{
            title: event.title,
            description: event.description || '',
            venue: event.venue,
            startDateTime: formatDateTimeInput(event.startDateTime),
            endDateTime: formatDateTimeInput(event.endDateTime),
          }}
          submitLabel="Save Draft Changes"
          helperText="Draft and rejected PMAC events can be refined here before submission."
          onSubmit={async values => {
            const result = await updatePmacEvent({
              eventId,
              ...values,
            })
            if (result.success) {
              showToast('success', 'PMAC event draft updated.')
              await refreshWorkspace()
            }
            return result
          }}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {(permissions.canSubmit || permissions.canComplete || permissions.canManageAssignments) ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Event Actions</h3>
                <p className="text-sm text-slate-500">Role-aware actions unlock as the event moves through the PMAC workflow.</p>
              </div>

              <div className="flex flex-wrap gap-3">
                {permissions.canSubmit ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await submitPmacEvent(event.id)
                        if (!result.success) {
                          showToast('error', result.error || 'Failed to submit PMAC event.')
                          return
                        }
                        showToast('success', 'PMAC event submitted for CMAC approval.')
                        await refreshWorkspace()
                      })
                    }}
                    className="rounded-xl bg-[#064e3b] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#065f46] disabled:opacity-60"
                  >
                    {isPending ? 'Submitting...' : 'Submit for CMAC Approval'}
                  </button>
                ) : null}

                {permissions.canComplete ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await markPmacEventCompleted(event.id)
                        if (!result.success) {
                          showToast('error', result.error || 'Failed to complete PMAC event.')
                          return
                        }
                        showToast('success', 'PMAC event marked completed.')
                        await refreshWorkspace()
                      })
                    }}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {isPending ? 'Saving...' : 'Mark Completed'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {permissions.canManageAssignments ? (
            <div className="card p-6 space-y-5">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Event Staffing Assignments</h3>
                <p className="text-sm text-slate-500">Assign PMAC members to operational duties after the event is approved.</p>
              </div>

              {workspace.staffingReadiness.missingRoles.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
                    <div>
                      <p className="font-semibold">Coverage gaps detected</p>
                      <p className="mt-1 text-amber-800">Recommended roles still missing for this event: {workspace.staffingReadiness.missingRoles.join(', ')}.</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {workspace.assignmentTemplates.length ? (
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Assignment Templates</p>
                    <p className="text-sm text-slate-500">Start with a role layout based on the event’s coverage needs, then assign members to each slot.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workspace.assignmentTemplates.map((template: any) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setAssignmentRows(buildTemplateRows(template.roles))}
                        className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {workspace.assignmentSuggestions.length ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Suggested Members</p>
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    {workspace.assignmentSuggestions.map((suggestion: any) => (
                      <div key={suggestion.memberId} className="rounded-xl border border-white/80 bg-white px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{suggestion.fullName}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {PMAC_CLUB_ROLE_LABELS[suggestion.clubRole as keyof typeof PMAC_CLUB_ROLE_LABELS]}
                              {suggestion.executiveTitle ? ` | ${PMAC_EXECUTIVE_TITLE_LABELS[suggestion.executiveTitle as PmacExecutiveTitle]}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Match {suggestion.score}%
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{suggestion.workloadTier} load</span>
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{suggestion.attendanceRate}% attendance</span>
                          {suggestion.matchedRoles.length ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              {PMAC_EVENT_DUTY_ROLE_LABELS[suggestion.matchedRoles[0] as AssignmentRow['assignmentRole']]}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {assignmentRows.map((row, index) => (
                  <div key={`${row.memberId}-${row.assignmentRole}-${index}`} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto]">
                    <select
                      value={row.memberId}
                      onChange={event => setAssignmentRows(previous => previous.map((item, itemIndex) => (
                        itemIndex === index
                          ? { ...item, memberId: event.target.value }
                          : item
                      )))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Select PMAC member</option>
                      {roster.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.fullName} - {PMAC_CLUB_ROLE_LABELS[member.clubRole]}{member.executiveTitle ? ` (${PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle as PmacExecutiveTitle]})` : ''}
                        </option>
                      ))}
                    </select>

                    <select
                      value={row.assignmentRole}
                      onChange={event => setAssignmentRows(previous => previous.map((item, itemIndex) => (
                        itemIndex === index
                          ? { ...item, assignmentRole: event.target.value as AssignmentRow['assignmentRole'] }
                          : item
                      )))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      {PMAC_EVENT_DUTY_ROLES.map(role => (
                        <option key={role} value={role}>
                          {PMAC_EVENT_DUTY_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={row.assignmentNotes}
                      onChange={event => setAssignmentRows(previous => previous.map((item, itemIndex) => (
                        itemIndex === index
                          ? { ...item, assignmentNotes: event.target.value }
                          : item
                      )))}
                      placeholder="Assignment notes"
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />

                    <button
                      type="button"
                      onClick={() => setAssignmentRows(previous => previous.filter((_, itemIndex) => itemIndex !== index))}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setAssignmentRows(previous => [...previous, EMPTY_ASSIGNMENT])}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={14} />
                  Add Assignment
                </button>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await savePmacAssignments(event.id, assignmentRows.filter(row => row.memberId))
                      if (!result.success) {
                        showToast('error', result.error || 'Failed to save PMAC assignments.')
                        return
                      }
                      showToast('success', result.warnings?.length ? `PMAC staffing assignments updated. ${result.warnings.join(' ')}` : 'PMAC staffing assignments updated.')
                      await refreshWorkspace()
                    })
                  }}
                  className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                >
                  {isPending ? 'Saving...' : 'Save Assignments'}
                </button>
              </div>
            </div>
          ) : null}

          {!permissions.canManageAssignments && event.assignments.length ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Current Assignments</h3>
                <p className="text-sm text-slate-500">Assigned PMAC coverage for this event.</p>
              </div>
              <div className="space-y-3">
                {event.assignments.map((assignment: any) => (
                  <div key={assignment.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{assignment.member.fullName}</p>
                        <p className="text-xs text-slate-400">{PMAC_CLUB_ROLE_LABELS[assignment.member.clubRole as keyof typeof PMAC_CLUB_ROLE_LABELS]}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="status-badge bg-sky-50 text-sky-700 border-sky-200">
                          {PMAC_EVENT_DUTY_ROLE_LABELS[assignment.assignmentRole as keyof typeof PMAC_EVENT_DUTY_ROLE_LABELS]}
                        </span>
                        <PmacAvailabilityBadge status={assignment.availabilityResponse} />
                      </div>
                    </div>
                    {assignment.assignmentNotes ? (
                      <p className="mt-3 text-sm text-slate-500">{assignment.assignmentNotes}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          {(permissions.canApprove || permissions.canReject) ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">CMAC Approval</h3>
                <p className="text-sm text-slate-500">Approve or reject the PMAC event after operational review.</p>
              </div>

              <textarea
                value={approvalRemarks}
                onChange={event => setApprovalRemarks(event.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Add remarks for the PMAC team..."
              />

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await approvePmacEvent(event.id, approvalRemarks)
                      if (!result.success) {
                        showToast('error', result.error || 'Failed to approve PMAC event.')
                        return
                      }
                      showToast('success', 'PMAC event approved.')
                      await refreshWorkspace()
                    })
                  }}
                  className="rounded-xl bg-[#064e3b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                >
                  {isPending ? 'Saving...' : 'Approve Event'}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await rejectPmacEvent(event.id, approvalRemarks)
                      if (!result.success) {
                        showToast('error', result.error || 'Failed to reject PMAC event.')
                        return
                      }
                      showToast('success', 'PMAC event rejected.')
                      await refreshWorkspace()
                    })
                  }}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  {isPending ? 'Saving...' : 'Reject Event'}
                </button>
              </div>
            </div>
          ) : null}

          {(viewerRole === 'PMAC_EXECUTIVE' || viewerRole === 'PMAC_MEMBER') && event.assignments.length ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">My Coverage Response</h3>
                <p className="text-sm text-slate-500">Respond to your assigned PMAC coverage duties for this event.</p>
              </div>
              {event.assignments.map((assignment: any) => (
                <div key={assignment.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="status-badge bg-sky-50 text-sky-700 border-sky-200">
                      {PMAC_EVENT_DUTY_ROLE_LABELS[assignment.assignmentRole as keyof typeof PMAC_EVENT_DUTY_ROLE_LABELS]}
                    </span>
                    <PmacAvailabilityBadge status={assignment.availabilityResponse} />
                  </div>
                  {assignment.assignmentNotes ? (
                    <p className="mt-3 text-sm text-slate-500">{assignment.assignmentNotes}</p>
                  ) : null}
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await respondToPmacAssignment(assignment.id, 'YES')
                          if (!result.success) {
                            showToast('error', result.error || 'Failed to update response.')
                            return
                          }
                          showToast('success', 'Availability marked Yes.')
                          await refreshWorkspace()
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
                            showToast('error', result.error || 'Failed to update response.')
                            return
                          }
                          showToast('success', 'Availability marked No.')
                          await refreshWorkspace()
                        })
                      }}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      No
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {(permissions.canRecordAttendance || event.attendance.length > 0) ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Attendance</h3>
                <p className="text-sm text-slate-500">Secretary-recorded event attendance appears here after staffing is assigned.</p>
              </div>

              {permissions.canRecordAttendance ? (
                <div className="space-y-3">
                  {attendanceRows.length ? (
                    attendanceRows.map((row, index) => (
                      <div key={row.memberId} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-[1.1fr_0.9fr_1.2fr]">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{row.fullName}</p>
                        </div>
                        <select
                          value={row.status}
                          onChange={event => setAttendanceRows(previous => previous.map((item, itemIndex) => (
                            itemIndex === index
                              ? { ...item, status: event.target.value as AttendanceRow['status'] }
                              : item
                          )))}
                          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        >
                          {PMAC_ATTENDANCE_STATUSES.map(status => (
                            <option key={status} value={status}>
                              {PMAC_ATTENDANCE_LABELS[status]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={row.notes}
                          onChange={event => setAttendanceRows(previous => previous.map((item, itemIndex) => (
                            itemIndex === index
                              ? { ...item, notes: event.target.value }
                              : item
                          )))}
                          placeholder="Attendance notes"
                          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                      Assign members to the event first so attendance can be recorded.
                    </div>
                  )}

                  {attendanceRows.length ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await savePmacAttendance(attendanceRows.map(row => ({
                              eventId: event.id,
                              memberId: row.memberId,
                              status: row.status,
                              notes: row.notes,
                            })))
                            if (!result.success) {
                              showToast('error', result.error || 'Failed to save attendance.')
                              return
                            }
                            showToast('success', 'Attendance saved.')
                            await refreshWorkspace()
                          })
                        }}
                        className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                      >
                        {isPending ? 'Saving...' : 'Save Attendance'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : event.attendance.length ? (
                <div className="space-y-3">
                  {event.attendance.map((record: any) => (
                    <div key={record.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">{record.member.fullName}</p>
                        <PmacAttendanceBadge status={record.status} />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Recorded by {record.recordedBy.name || 'Unknown'} on {formatDateTime(record.recordedAt)}</p>
                      {record.notes ? <p className="mt-3 text-sm text-slate-500">{record.notes}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  No attendance has been recorded for this PMAC event yet.
                </div>
              )}
            </div>
          ) : null}

          {(permissions.canManageAssignments || permissions.canRecordAttendance || permissions.canApprove || event.wrapUpUpdatedAt) ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Post-Event Wrap-Up</h3>
                <p className="text-sm text-slate-500">Capture delivered outputs, issues, and attachment follow-through so PMAC leadership can review event quality without manual follow-up.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Delivered Outputs</label>
                  <textarea
                    value={wrapUpFields.deliveredOutputs}
                    onChange={currentEvent => setWrapUpFields((previous) => ({ ...previous, deliveredOutputs: currentEvent.target.value }))}
                    rows={4}
                    disabled={!(permissions.canManageAssignments || permissions.canRecordAttendance)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50"
                    placeholder="Summarize coverage delivered, posts created, albums submitted, and final outputs."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Issues Encountered</label>
                  <textarea
                    value={wrapUpFields.issuesEncountered}
                    onChange={currentEvent => setWrapUpFields((previous) => ({ ...previous, issuesEncountered: currentEvent.target.value }))}
                    rows={4}
                    disabled={!(permissions.canManageAssignments || permissions.canRecordAttendance)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50"
                    placeholder="Record delays, staffing issues, venue constraints, or production blockers."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Attachment Completeness</label>
                  <textarea
                    value={wrapUpFields.attachmentAuditNotes}
                    onChange={currentEvent => setWrapUpFields((previous) => ({ ...previous, attachmentAuditNotes: currentEvent.target.value }))}
                    rows={4}
                    disabled={!(permissions.canManageAssignments || permissions.canRecordAttendance)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50"
                    placeholder="Note missing files, uploaded references, and anything still needed before closeout."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Leadership Notes</label>
                  <textarea
                    value={wrapUpFields.wrapUpNotes}
                    onChange={currentEvent => setWrapUpFields((previous) => ({ ...previous, wrapUpNotes: currentEvent.target.value }))}
                    rows={4}
                    disabled={!(permissions.canManageAssignments || permissions.canRecordAttendance)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50"
                    placeholder="Add recommendations, follow-up actions, or coaching notes for future events."
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  {event.wrapUpUpdatedAt ? `Last updated ${formatDateTime(event.wrapUpUpdatedAt)}` : 'No wrap-up saved yet.'}
                </p>
                {(permissions.canManageAssignments || permissions.canRecordAttendance) ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await savePmacEventWrapUp(event.id, wrapUpFields)
                        if (!result.success) {
                          showToast('error', result.error || 'Failed to save wrap-up.')
                          return
                        }
                        showToast('success', 'Post-event wrap-up saved.')
                        await refreshWorkspace()
                      })
                    }}
                    className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                  >
                    {isPending ? 'Saving...' : 'Save Wrap-Up'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="card p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-xl font-bold text-slate-800">Attachments</h3>
              <p className="text-sm text-slate-500">Keep event briefs, approval references, and PMAC support files attached to this workspace.</p>
            </div>

            {canManageAttachments ? (
              <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <input
                  type="file"
                  onChange={event => setAttachmentFile(event.target.files?.[0] ?? null)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600"
                />
                <input
                  type="text"
                  value={attachmentDescription}
                  onChange={event => setAttachmentDescription(event.target.value)}
                  placeholder="Optional attachment note"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={attachmentBusy}
                    onClick={uploadAttachment}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                  >
                    <Upload size={14} />
                    {attachmentBusy ? 'Uploading...' : 'Upload Attachment'}
                  </button>
                </div>
              </div>
            ) : null}

            {event.attachments.length ? (
              <div className="space-y-3">
                {event.attachments.map((attachment: any) => (
                  <div key={attachment.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <a href={attachment.filePath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                          <Paperclip size={14} />
                          {attachment.fileName}
                        </a>
                        <p className="mt-1 text-xs text-slate-400">
                          Uploaded by {attachment.uploadedBy.name || 'Unknown'} · {formatDateTime(attachment.createdAt)}
                        </p>
                      </div>
                      {canManageAttachments ? (
                        <button
                          type="button"
                          disabled={attachmentBusy}
                          onClick={() => deleteAttachment(attachment.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    {attachment.description ? (
                      <p className="mt-3 text-sm text-slate-500">{attachment.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                No PMAC attachments have been added to this event yet.
              </div>
            )}
          </div>

          <div className="card p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-xl font-bold text-slate-800">Activity History</h3>
              <p className="text-sm text-slate-500">Recent workflow updates, approvals, and records tied to this PMAC event.</p>
            </div>

            {event.activityLogs.length ? (
              <div className="space-y-3">
                {event.activityLogs.map((entry: any) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{entry.summary}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {entry.actorName} · {entry.actorRole.replaceAll('_', ' ')} · {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                      <span className="status-badge bg-slate-100 text-slate-700 border-slate-200">{entry.action.replaceAll('_', ' ')}</span>
                    </div>
                    {entry.details ? <p className="mt-3 text-sm text-slate-500">{entry.details}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                No PMAC activity entries have been recorded for this event yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
