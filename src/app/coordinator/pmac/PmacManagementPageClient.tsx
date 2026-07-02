'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Search, Shield, UserPlus, Users } from 'lucide-react'
import clsx from 'clsx'

import Portal from '@/components/Portal'
import { filterPmacMembers } from '@/lib/pmacFilters'
import { runWithReverification } from '@/lib/reverificationClient'
import {
  PMAC_CLUB_ROLES,
  PMAC_CLUB_ROLE_LABELS,
  PMAC_MEMBER_STATUSES,
  PMAC_MEMBER_STATUS_LABELS,
  PMAC_SYSTEM_ROLES,
  ROLE_LABELS,
  getDefaultSystemRoleForClubRole,
} from '@/lib/roles'
import { getPmacMembers, savePmacMember } from './actions'
import type { PmacClubRole, PmacMemberStatus, Role } from '@/types'

type PmacSystemRole = Extract<Role, 'PMAC_DIRECTOR' | 'PMAC_ASSISTANT_DIRECTOR' | 'PMAC_SECRETARY' | 'PMAC_EXECUTIVE' | 'PMAC_MEMBER'>
type PmacMemberRecord = Awaited<ReturnType<typeof getPmacMembers>>[number]
type MemberFormState = {
  id?: string
  fullName: string
  email: string
  phone: string
  courseOrDepartment: string
  notes: string
  joinedAt: string
  clubRole: PmacClubRole
  status: PmacMemberStatus
  systemRole: PmacSystemRole
  password: string
}

const EMPTY_FORM: MemberFormState = {
  fullName: '',
  email: '',
  phone: '',
  courseOrDepartment: '',
  notes: '',
  joinedAt: '',
  clubRole: 'MEMBER',
  status: 'ACTIVE',
  systemRole: 'PMAC_MEMBER',
  password: '',
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
  return {
    id: member.id,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone ?? '',
    courseOrDepartment: member.courseOrDepartment ?? '',
    notes: member.notes ?? '',
    joinedAt: member.joinedAt ? new Date(member.joinedAt).toISOString().slice(0, 10) : '',
    clubRole: member.clubRole as PmacClubRole,
    status: member.status as PmacMemberStatus,
    systemRole: member.account?.role as PmacSystemRole,
    password: '',
  }
}

export default function PmacManagementPageClient() {
  const [members, setMembers] = useState<PmacMemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | PmacMemberStatus>('ALL')
  const [clubRoleFilter, setClubRoleFilter] = useState<'ALL' | PmacClubRole>('ALL')
  const [form, setForm] = useState<MemberFormState>(EMPTY_FORM)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPmacMembers()
      setMembers(data)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to load PMAC members.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const stats = useMemo(() => {
    const active = members.filter(member => member.status === 'ACTIVE').length
    const inactive = members.length - active
    const officers = members.filter(member => member.clubRole !== 'MEMBER').length

    return { active, inactive, officers }
  }, [members])

  const filteredMembers = useMemo(
    () => filterPmacMembers(members, query, statusFilter, clubRoleFilter),
    [clubRoleFilter, members, query, statusFilter]
  )

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (member: PmacMemberRecord) => {
    setForm(toFormState(member))
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) {
      return
    }

    setShowModal(false)
    setForm(EMPTY_FORM)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await runWithReverification(
        () => savePmacMember(form),
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
    return <div className="p-10 text-center text-slate-400">Loading PMAC management...</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      {toast && (
        <div
          className={clsx(
            'fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-2xl animate-fade-in',
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toast.msg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-[#0f172a] p-5 text-white shadow-xl">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Users size={18} />
            </div>
            <span className="text-2xl font-bold">{members.length}</span>
          </div>
          <p className="text-sm font-semibold">Total PMAC Members</p>
          <p className="mt-1 text-xs text-slate-300">Database-driven roster foundation for PMAC V1.</p>
        </div>
        <div className="rounded-2xl bg-emerald-500 p-5 text-white shadow-xl">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <CheckCircle2 size={18} />
            </div>
            <span className="text-2xl font-bold">{stats.active}</span>
          </div>
          <p className="text-sm font-semibold">Active Accounts</p>
          <p className="mt-1 text-xs text-emerald-100">Members who can currently access PMAC routes.</p>
        </div>
        <div className="rounded-2xl bg-amber-400 p-5 text-amber-950 shadow-xl">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <Shield size={18} />
            </div>
            <span className="text-2xl font-bold">{stats.officers}</span>
          </div>
          <p className="text-sm font-semibold">Officer Assignments</p>
          <p className="mt-1 text-xs text-amber-900/70">Director, assistant, secretary, and executive roles tracked separately.</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">PMAC Member Directory</h3>
            <p className="text-xs text-slate-400 mt-1">Manage member identity, club role, system access role, and account status.</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/coordinator/pmac/officers"
              className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              Officer Assignment Flow
            </Link>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#065f46]"
            >
              <UserPlus size={14} />
              Add PMAC Member
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 px-6 py-4 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search size={16} className="text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search name, email, notes, or course"
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
            />
          </label>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All statuses</option>
            {PMAC_MEMBER_STATUSES.map(status => (
              <option key={status} value={status}>
                {PMAC_MEMBER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            value={clubRoleFilter}
            onChange={event => setClubRoleFilter(event.target.value as typeof clubRoleFilter)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All club roles</option>
            {PMAC_CLUB_ROLES.map(role => (
              <option key={role} value={role}>
                {PMAC_CLUB_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-slate-50">
          {filteredMembers.map(member => (
            <button
              key={member.id}
              onClick={() => openEdit(member)}
              className="flex w-full flex-col gap-4 px-6 py-5 text-left transition-colors hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between"
            >
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
                  {member.courseOrDepartment || 'No course or department yet'} · Joined {formatDate(member.joinedAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <span className="status-badge bg-sky-50 text-sky-700 border-sky-200">
                  Club: {PMAC_CLUB_ROLE_LABELS[member.clubRole as PmacClubRole]}
                </span>
                <span className="status-badge bg-indigo-50 text-indigo-700 border-indigo-200">
                  Access: {ROLE_LABELS[member.account?.role as PmacSystemRole]}
                </span>
                {member.account?.mustChangePassword ? (
                  <span className="status-badge bg-amber-50 text-amber-700 border-amber-200">
                    Password reset pending
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Status Snapshot</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">Inactive members remain in the roster but cannot sign in.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {stats.inactive} inactive
          </span>
        </div>
      </div>

      {showModal && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={closeModal}>
            <div className="w-full max-w-2xl space-y-5 rounded-2xl bg-white p-7 shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">
                  {form.id ? 'Edit PMAC Member' : 'Create PMAC Member'}
                </h3>
                <p className="text-sm text-slate-500">
                  Club role controls PMAC leadership placement. System access role controls the dashboard route and login permissions.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Full Name</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={event => setForm(previous => ({ ...previous, fullName: event.target.value }))}
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
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Club Role</label>
                  <select
                    value={form.clubRole}
                    onChange={event =>
                      setForm(previous => {
                        const clubRole = event.target.value as PmacClubRole
                        return {
                          ...previous,
                          clubRole,
                          systemRole: previous.id ? previous.systemRole : getDefaultSystemRoleForClubRole(clubRole),
                        }
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {PMAC_CLUB_ROLES.map(role => (
                      <option key={role} value={role}>
                        {PMAC_CLUB_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">System Access Role</label>
                  <select
                    value={form.systemRole}
                    onChange={event => setForm(previous => ({ ...previous, systemRole: event.target.value as PmacSystemRole }))}
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
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Status</label>
                  <select
                    value={form.status}
                    onChange={event => setForm(previous => ({ ...previous, status: event.target.value as PmacMemberStatus }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {PMAC_MEMBER_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {PMAC_MEMBER_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {form.id ? 'Reset Password (Optional)' : 'Password'}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))}
                    placeholder={form.id ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Course or Department</label>
                <input
                  type="text"
                  value={form.courseOrDepartment}
                  onChange={event => setForm(previous => ({ ...previous, courseOrDepartment: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div className="flex gap-3">
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
