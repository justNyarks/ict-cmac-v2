'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Edit3, Eye, EyeOff, KeyRound, LoaderCircle, Search, UserPlus, Users } from 'lucide-react'
import clsx from 'clsx'

import Portal from '@/components/Portal'
import {
  PMAC_EXECUTIVE_TITLES,
  PMAC_EXECUTIVE_BRANCH_SPECIALTY,
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_SPECIALTIES,
  PMAC_SPECIALTY_LABELS,
} from '@/lib/pmac'
import {
  formatPmacMemberEducation,
  getPmacMemberEducation,
  PMAC_DEPARTMENTS,
  normalizePmacMemberName,
} from '@/lib/pmacMembers'
import { runWithReverification } from '@/lib/reverificationClient'
import {
  getDefaultClubRoleForSystemRole,
  PMAC_CLUB_ROLE_LABELS,
  PMAC_MEMBER_STATUSES,
  PMAC_MEMBER_STATUS_LABELS,
  PMAC_SYSTEM_ROLES,
  ROLE_LABELS,
} from '@/lib/roles'
import { getPmacMemberDirectory, savePmacMember } from './actions'
import type { PmacClubRole, PmacExecutiveTitle, PmacMemberStatus, PmacSpecialty, Role } from '@/types'

type PmacSystemRole = Extract<Role, 'PMAC_DIRECTOR' | 'PMAC_ASSISTANT_DIRECTOR' | 'PMAC_SECRETARY' | 'PMAC_EXECUTIVE' | 'PMAC_MEMBER'>
type PmacMemberDirectory = Awaited<ReturnType<typeof getPmacMemberDirectory>>
type PmacMemberRecord = PmacMemberDirectory['members'][number]
type MemberFormState = {
  id?: string
  fullName: string
  email: string
  phone: string
  department: string
  course: string
  joinedAt: string
  clubRole: PmacClubRole
  status: PmacMemberStatus
  executiveTitle: PmacExecutiveTitle | ''
  specialties: PmacSpecialty[]
  systemRole: PmacSystemRole
  password: string
}

type PmacManagementPageClientProps = {
  canManageMembers?: boolean
}

const EMPTY_FORM: MemberFormState = {
  fullName: '',
  email: '',
  phone: '',
  department: '',
  course: '',
  joinedAt: '',
  clubRole: 'MEMBER',
  status: 'ACTIVE',
  executiveTitle: '',
  specialties: [],
  systemRole: 'PMAC_MEMBER',
  password: '',
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const values = crypto.getRandomValues(new Uint32Array(16))
  return Array.from(values, value => alphabet[value % alphabet.length]).join('')
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return 'Not set'
  }

  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function toFormState(member: PmacMemberRecord): MemberFormState {
  const schoolInfo = getPmacMemberEducation(member)

  return {
    id: member.id,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone ?? '',
    department: schoolInfo.department,
    course: schoolInfo.course,
    joinedAt: member.joinedAt ? new Date(member.joinedAt).toISOString().slice(0, 10) : '',
    clubRole: member.clubRole as PmacClubRole,
    status: member.status as PmacMemberStatus,
    executiveTitle: (member.executiveTitle as PmacExecutiveTitle | null) ?? '',
    specialties: member.specialties.map((entry) => entry.specialty as PmacSpecialty),
    systemRole: member.account?.role as PmacSystemRole,
    password: '',
  }
}

export default function PmacManagementPageClient({
  canManageMembers = true,
}: PmacManagementPageClientProps) {
  const [directory, setDirectory] = useState<PmacMemberDirectory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | PmacMemberStatus>('ALL')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [specialtyFilter, setSpecialtyFilter] = useState<'ALL' | PmacSpecialty>('ALL')
  const [systemRoleFilter, setSystemRoleFilter] = useState<'ALL' | PmacSystemRole>('ALL')
  const [sort, setSort] = useState('NAME_ASC')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<MemberFormState>(EMPTY_FORM)
  const [editingWorkCount, setEditingWorkCount] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const requestId = useRef(0)

  const members = directory?.members ?? []
  const hasDirectoryFilters = !!query || statusFilter !== 'ALL' || departmentFilter !== 'ALL'
    || specialtyFilter !== 'ALL' || systemRoleFilter !== 'ALL' || sort !== 'NAME_ASC'

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [query])

  const fetchMembers = useCallback(async (showInitialLoading = false) => {
    const currentRequest = requestId.current + 1
    requestId.current = currentRequest
    if (showInitialLoading) setLoading(true)
    setRefreshing(true)
    setLoadError('')
    try {
      const data = await getPmacMemberDirectory({
        query: debouncedQuery,
        status: statusFilter,
        department: departmentFilter,
        specialty: specialtyFilter,
        systemRole: systemRoleFilter,
        sort,
        page,
        pageSize: 20,
      })
      if (requestId.current === currentRequest) {
        setDirectory(data)
        if (data.page !== page) setPage(data.page)
      }
    } catch (error) {
      if (requestId.current === currentRequest) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load PMAC members.')
      }
    } finally {
      if (requestId.current === currentRequest) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [debouncedQuery, departmentFilter, page, sort, specialtyFilter, statusFilter, systemRoleFilter])

  useEffect(() => {
    void fetchMembers()
  }, [fetchMembers])
  const shouldShowExecutiveTitle = form.systemRole === 'PMAC_EXECUTIVE'

  const clearDirectoryFilters = () => {
    setQuery('')
    setDebouncedQuery('')
    setStatusFilter('ALL')
    setDepartmentFilter('ALL')
    setSpecialtyFilter('ALL')
    setSystemRoleFilter('ALL')
    setSort('NAME_ASC')
    setPage(1)
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditingWorkCount(0)
    setShowPassword(false)
    setShowModal(true)
  }

  const openEdit = (member: PmacMemberRecord) => {
    setForm(toFormState(member))
    setEditingWorkCount(member._count.eventAssignments + member._count.projectAssignments + member._count.headedPmacProjects)
    setShowPassword(false)
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) {
      return
    }

    setShowModal(false)
    setForm(EMPTY_FORM)
    setEditingWorkCount(0)
    setShowPassword(false)
  }

  const handleSave = async () => {
    const normalizedName = normalizePmacMemberName(form.fullName)

    if (!normalizedName) {
      showToast('error', 'Full name is required.')
      return
    }
    if (!form.email.trim()) {
      showToast('error', 'Email is required.')
      return
    }
    if (!form.department) {
      showToast('error', 'Please select a department.')
      return
    }
    if (!form.course.trim()) {
      showToast('error', 'Course is required.')
      return
    }
    if (form.systemRole === 'PMAC_EXECUTIVE' && !form.executiveTitle) {
      showToast('error', 'Executive accounts must have an executive title.')
      return
    }
    if (!form.specialties.length) {
      showToast('error', 'Select at least one specialty.')
      return
    }
    if ((!form.id || form.password) && form.password.length < 12) {
      showToast('error', 'Temporary passwords must be at least 12 characters.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        fullName: normalizedName,
        executiveTitle: form.executiveTitle || null,
      }
      const result = await runWithReverification(
        () => savePmacMember(payload),
        response => response.success ? null : response.error
      )
      if (!result.success) {
        showToast('error', result.error || 'Failed to save PMAC member.')
        return
      }

      showToast('success', form.id ? 'PMAC member updated.' : 'PMAC member created.')
      closeModal()
      await fetchMembers()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to verify this change.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin" /> Loading PMAC members...</div>
  }

  if (loadError && !directory) {
    return (
      <div className="card mx-auto max-w-2xl p-8 text-center">
        <p className="font-semibold text-red-700">{loadError}</p>
        <button type="button" onClick={() => void fetchMembers(true)} className="mt-3 text-sm font-semibold text-emerald-700">Try again</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      {toast && (
        <div
          className={clsx(
            'fixed right-4 top-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-xl animate-fade-in',
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toast.msg}
        </div>
      )}

      <section className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center" aria-label="PMAC roster summary">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Users size={17} /></span>
          <div><p className="text-sm font-semibold text-slate-800">PMAC Roster</p><p className="text-xs text-slate-400">Current member and account status</p></div>
        </div>
        <p className="text-sm text-slate-500"><strong className="text-slate-800">{directory?.total ?? 0}</strong> members</p>
        <p className="text-sm text-slate-500"><strong className="text-emerald-700">{directory?.active ?? 0}</strong> active</p>
        <p className="text-sm text-slate-500"><strong className="text-slate-800">{directory?.officers ?? 0}</strong> officers</p>
      </section>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">PMAC Member Directory</h3>
            <p className="mt-1 text-xs text-slate-400">
              {canManageMembers
                ? 'Manage member identity, department, course, system access role, and account status.'
                : 'Coordinator view for PMAC roster visibility while member creation stays with PMAC director and secretary.'}
            </p>
          </div>
          <div className="flex gap-3">
            {!canManageMembers ? (
              <Link
                href="/coordinator/pmac/officers"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
              >
                Officer Assignment Flow
              </Link>
            ) : null}
            {canManageMembers ? (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#065f46]"
              >
                <UserPlus size={14} />
                Add PMAC Member
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex h-10 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 sm:col-span-2 lg:col-span-3">
            <Search size={16} className="text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search name, email, phone, department, course, or tag"
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
            />
          </label>
          <select
            value={statusFilter}
            onChange={event => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1) }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All statuses</option>
            {PMAC_MEMBER_STATUSES.map(status => (
              <option key={status} value={status}>
                {PMAC_MEMBER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            value={departmentFilter}
            onChange={event => { setDepartmentFilter(event.target.value); setPage(1) }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All departments</option>
            {PMAC_DEPARTMENTS.map(department => <option key={department} value={department}>{department}</option>)}
          </select>
          <select
            value={specialtyFilter}
            onChange={event => { setSpecialtyFilter(event.target.value as typeof specialtyFilter); setPage(1) }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All specialties</option>
            {PMAC_SPECIALTIES.map(specialty => <option key={specialty} value={specialty}>{PMAC_SPECIALTY_LABELS[specialty]}</option>)}
          </select>
          <select
            value={systemRoleFilter}
            onChange={event => { setSystemRoleFilter(event.target.value as typeof systemRoleFilter); setPage(1) }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All access roles</option>
            {PMAC_SYSTEM_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
          <select
            value={sort}
            onChange={event => { setSort(event.target.value); setPage(1) }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="NAME_ASC">Name A-Z</option>
            <option value="NAME_DESC">Name Z-A</option>
            <option value="JOINED_DESC">Newest members</option>
            <option value="STATUS">Status then name</option>
          </select>
          <button
            type="button"
            disabled={!hasDirectoryFilters}
            onClick={clearDirectoryFilters}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>

        {loadError ? <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{loadError}</p> : null}
        <div className={clsx('divide-y divide-slate-100 transition-opacity', refreshing && 'opacity-60')}>
          {members.map(member => {
            const activeWorkCount = member._count.eventAssignments + member._count.projectAssignments + member._count.headedPmacProjects
            const content = (
              <>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{member.fullName}</p>
                    <span className={clsx(
                      'status-badge',
                      member.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    )}>
                      {PMAC_MEMBER_STATUS_LABELS[member.status as PmacMemberStatus]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{member.email}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatPmacMemberEducation(member) || 'No department or course yet'} · Joined {formatDate(member.joinedAt)}
                  </p>
                  {member.receivedTags.length ? (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Tags: {member.receivedTags.map((tag) => `${tag.label} (${tag.assignedByMember.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[tag.assignedByMember.executiveTitle as PmacExecutiveTitle] : tag.assignedByMember.fullName})`).join(' · ')}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 md:max-w-[55%] md:justify-end">
                  <span className="status-badge bg-sky-50 text-sky-700 border-sky-200">
                    Club: {PMAC_CLUB_ROLE_LABELS[member.clubRole as PmacClubRole]}
                  </span>
                  {member.executiveTitle ? (
                    <span className="status-badge bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200">
                      {PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle as PmacExecutiveTitle]}
                    </span>
                  ) : null}
                  {member.specialties.map((entry) => (
                    <span key={`${member.id}-${entry.specialty}`} className="status-badge bg-amber-50 text-amber-700 border-amber-200">
                      {PMAC_SPECIALTY_LABELS[entry.specialty as PmacSpecialty]}
                    </span>
                  ))}
                  <span className="status-badge bg-indigo-50 text-indigo-700 border-indigo-200">
                    Access: {ROLE_LABELS[member.account?.role as PmacSystemRole]}
                  </span>
                  {member.account?.mustChangePassword ? (
                    <span className="status-badge bg-amber-50 text-amber-700 border-amber-200">
                      Password reset pending
                    </span>
                  ) : null}
                  {activeWorkCount ? (
                    <span className="status-badge border-slate-200 bg-slate-50 text-slate-600">
                      {activeWorkCount} active responsibilit{activeWorkCount === 1 ? 'y' : 'ies'}
                    </span>
                  ) : null}
                  {canManageMembers ? (
                    <button
                      type="button"
                      onClick={() => openEdit(member)}
                      title={`Edit ${member.fullName}`}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                  ) : null}
                </div>
              </>
            )

            return (
              <div
                key={member.id}
                className="flex w-full flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                {content}
              </div>
            )
          })}
          {!members.length ? (
            <div className="px-5 py-10 text-center">
              <p className="font-semibold text-slate-700">No members match these filters</p>
              <p className="mt-1 text-sm text-slate-400">Clear or adjust the directory filters to see more members.</p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{directory?.filteredTotal ?? 0} result(s) | Page {directory?.page ?? 1} of {directory?.totalPages ?? 1}</p>
          <div className="flex gap-2">
            <button type="button" title="Previous page" disabled={!directory || directory.page <= 1 || refreshing} onClick={() => setPage(current => Math.max(1, current - 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ChevronLeft size={16} /></button>
            <button type="button" title="Next page" disabled={!directory || directory.page >= directory.totalPages || refreshing} onClick={() => setPage(current => current + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {canManageMembers && showModal && (
        <Portal>
          <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/45 px-4 py-6 print:hidden sm:py-8" onClick={closeModal}>
            <div className="mx-auto flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
                <h3 className="font-display text-xl font-bold text-slate-800">
                  {form.id ? 'Edit PMAC Member' : 'Create PMAC Member'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  System access role controls dashboard access. Department is selected, while course is entered manually.
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 sm:px-7">
              {editingWorkCount ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This member has {editingWorkCount} active responsibilit{editingWorkCount === 1 ? 'y' : 'ies'}. Reassign conflicting work before deactivation, demotion, executive-title changes, or specialty removal.
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Full Name</label>
                  <input
                    type="tel"
                    value={form.fullName}
                    onChange={event => setForm(previous => ({ ...previous, fullName: event.target.value }))}
                    onBlur={() => setForm(previous => ({ ...previous, fullName: normalizePmacMemberName(previous.fullName) }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={event => setForm(previous => ({ ...previous, phone: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Joined At</label>
                  <input
                    type="date"
                    value={form.joinedAt}
                    onChange={event => setForm(previous => ({ ...previous, joinedAt: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">System Access Role</label>
                  <select
                    value={form.systemRole}
                    onChange={event => setForm(previous => {
                      const systemRole = event.target.value as PmacSystemRole
                      const nextClubRole = getDefaultClubRoleForSystemRole(systemRole)
                      return {
                        ...previous,
                        clubRole: nextClubRole,
                        systemRole,
                        executiveTitle: systemRole === 'PMAC_EXECUTIVE'
                          ? previous.executiveTitle
                          : '',
                      }
                    })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {PMAC_SYSTEM_ROLES.map(role => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Executive Title</label>
                  <select
                    value={form.executiveTitle}
                    onChange={event => setForm(previous => {
                      const executiveTitle = event.target.value as PmacExecutiveTitle | ''
                      const requiredSpecialty = executiveTitle ? PMAC_EXECUTIVE_BRANCH_SPECIALTY[executiveTitle] : null
                      return {
                        ...previous,
                        executiveTitle,
                        specialties: requiredSpecialty && !previous.specialties.includes(requiredSpecialty)
                          ? [...previous.specialties, requiredSpecialty]
                          : previous.specialties,
                      }
                    })}
                    disabled={!shouldShowExecutiveTitle}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{shouldShowExecutiveTitle ? 'Select executive title' : 'Only for executive accounts'}</option>
                    {PMAC_EXECUTIVE_TITLES.map(title => (
                      <option key={title} value={title}>
                        {PMAC_EXECUTIVE_TITLE_LABELS[title]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Status</label>
                  <select
                    value={form.status}
                    onChange={event => setForm(previous => ({ ...previous, status: event.target.value as PmacMemberStatus }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {PMAC_MEMBER_STATUSES.map(status => (
                      <option key={status} value={status} disabled={status === 'INACTIVE' && editingWorkCount > 0}>
                        {PMAC_MEMBER_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Department</label>
                  <select
                    value={form.department}
                    onChange={event => setForm(previous => ({ ...previous, department: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="">Select department</option>
                    {PMAC_DEPARTMENTS.map(department => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Course</label>
                  <input
                    type="text"
                    value={form.course}
                    onChange={event => setForm(previous => ({ ...previous, course: event.target.value }))}
                    placeholder="Example: BSIT, BS Nursing"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {form.id ? 'Reset Password (Optional)' : 'Temporary Password'}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        minLength={12}
                        onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))}
                        placeholder={form.id ? 'Leave blank to keep current password' : 'Minimum 12 characters'}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                      <button
                        type="button"
                        title={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword(current => !current)}
                        className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(previous => ({ ...previous, password: generateTemporaryPassword() }))
                        setShowPassword(true)
                      }}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <KeyRound size={15} /> Generate
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">New or reset credentials require a password change at the next sign-in.</p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Specialties</label>
                <div className="grid gap-2 md:grid-cols-2">
                  {PMAC_SPECIALTIES.map((specialty) => {
                    const checked = form.specialties.includes(specialty)
                    const requiredByExecutiveTitle = !!form.executiveTitle
                      && PMAC_EXECUTIVE_BRANCH_SPECIALTY[form.executiveTitle] === specialty

                    return (
                      <label key={specialty} className={clsx('flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700', requiredByExecutiveTitle && 'bg-slate-50')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={requiredByExecutiveTitle}
                          onChange={() => setForm(previous => ({
                            ...previous,
                            specialties: checked
                              ? previous.specialties.filter((item) => item !== specialty)
                              : [...previous.specialties, specialty],
                          }))}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                        />
                        <span>{PMAC_SPECIALTY_LABELS[specialty]}{requiredByExecutiveTitle ? ' (required)' : ''}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-400">Specialties stay separate from executive title and access role.</p>
              </div>

              </div>

              <div className="flex gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:px-7">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-[#064e3b] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065f46] disabled:opacity-60"
                >
                  {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create Member'}
                </button>
                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
