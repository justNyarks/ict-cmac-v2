import type { ReactNode } from 'react'

import type { getPmacEventWorkspace } from '@/app/pmac/actions'
import {
  getDutyRolesForSpecialties,
  getPmacEventSourceBadgeClass,
  PMAC_ATTENDANCE_STATUSES,
  PMAC_EVENT_DUTY_ROLES,
  PMAC_EVENT_SOURCE_LABELS,
} from '@/lib/pmac'
import type { PmacEventSourceType, PmacSpecialty } from '@/types'

export type WorkspaceData = Awaited<ReturnType<typeof getPmacEventWorkspace>>
export type Workspace = NonNullable<WorkspaceData>
export type AssignmentSuggestion = Workspace['assignmentSuggestions'][number]

export type AssignmentRow = {
  memberId: string
  assignmentRole: (typeof PMAC_EVENT_DUTY_ROLES)[number]
  assignmentNotes: string
}

export type AttendanceRow = {
  memberId: string
  fullName: string
  status: (typeof PMAC_ATTENDANCE_STATUSES)[number]
  notes: string
}

export type WrapUpFields = {
  deliveredOutputs: string
  issuesEncountered: string
  attachmentAuditNotes: string
  wrapUpNotes: string
}

export const EMPTY_ASSIGNMENT: AssignmentRow = {
  memberId: '',
  assignmentRole: 'PHOTOGRAPHER',
  assignmentNotes: '',
}

export const EMPTY_WRAP_UP: WrapUpFields = {
  deliveredOutputs: '',
  issuesEncountered: '',
  attachmentAuditNotes: '',
  wrapUpNotes: '',
}

export function buildTemplateRows(roles: readonly AssignmentRow['assignmentRole'][]) {
  return roles.map((role) => ({
    memberId: '',
    assignmentRole: role,
    assignmentNotes: '',
  }))
}

export function getMemberDutyRoles(member?: { specialties?: Array<{ specialty: PmacSpecialty }> | null }) {
  const specialtyValues = member?.specialties?.map(entry => entry.specialty) ?? []
  return getDutyRolesForSpecialties(specialtyValues)
}

export function formatDateTime(value: string | Date | null | undefined) {
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

export function formatDateTimeInput(value: string | Date) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function renderSourceBadge(sourceType: PmacEventSourceType) {
  return (
    <span className={`status-badge ${getPmacEventSourceBadgeClass(sourceType)}`}>
      {PMAC_EVENT_SOURCE_LABELS[sourceType]}
    </span>
  )
}

export function WorkspaceMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex min-w-[9rem] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
        {icon}
      </span>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

export function SectionHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-lg font-bold leading-tight text-slate-800">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  )
}

export function buildAttendanceRows(workspace: NonNullable<WorkspaceData>): AttendanceRow[] {
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
