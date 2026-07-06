'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

import { PMAC_EXECUTIVE_TITLES, PMAC_EXECUTIVE_TITLE_LABELS } from '@/lib/pmac'
import {
  getDefaultClubRoleForSystemRole,
  PMAC_CLUB_ROLES,
  PMAC_CLUB_ROLE_LABELS,
  PMAC_MEMBER_STATUSES,
  PMAC_MEMBER_STATUS_LABELS,
  PMAC_SYSTEM_ROLES,
  ROLE_LABELS,
  getDefaultSystemRoleForClubRole,
} from '@/lib/roles'
import { runWithReverification } from '@/lib/reverificationClient'
import { assignPmacOfficerRole, getPmacMembers } from '../actions'
import type { PmacClubRole, PmacExecutiveTitle, PmacMemberStatus, Role } from '@/types'

type PmacSystemRole = Extract<Role, 'PMAC_DIRECTOR' | 'PMAC_ASSISTANT_DIRECTOR' | 'PMAC_SECRETARY' | 'PMAC_EXECUTIVE' | 'PMAC_MEMBER'>
type PmacMemberRecord = Awaited<ReturnType<typeof getPmacMembers>>[number]

export default function PmacOfficerAssignmentsClient() {
  const [members, setMembers] = useState<PmacMemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
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
      showToast('error', error instanceof Error ? error.message : 'Failed to load PMAC assignments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const updateLocalMember = (memberId: string, patch: Partial<PmacMemberRecord>) => {
    setMembers(previous => previous.map(member => (
      member.id === memberId
        ? {
            ...member,
            ...patch,
            account: member.account ? { ...member.account, ...(patch.account ?? {}) } : member.account,
          }
        : member
    )))
  }

  const saveAssignment = async (member: PmacMemberRecord) => {
    setSavingId(member.id)
    try {
      const result = await runWithReverification(
        () => assignPmacOfficerRole({
          memberId: member.id,
          clubRole: member.clubRole as PmacClubRole,
          status: member.status as PmacMemberStatus,
          executiveTitle: (member.executiveTitle as PmacExecutiveTitle | null) ?? null,
          systemRole: member.account?.role as PmacSystemRole,
        }),
        response => response.success ? null : response.error
      )

      if (!result.success) {
        showToast('error', result.error || 'Failed to update assignment.')
        return
      }

      showToast('success', `${member.fullName} assignment updated.`)
      await fetchMembers()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to verify this change.')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading officer assignments...</div>
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

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Coordinator Flow</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-800">Officer Assignment</h2>
          <p className="mt-2 text-sm text-slate-500">Adjust club leadership slots without changing the underlying member record structure.</p>
        </div>
        <Link
          href="/coordinator/pmac"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft size={14} />
          Back to PMAC Directory
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1.3fr_1fr_1fr_1.1fr_0.9fr_auto] gap-4 border-b border-slate-100 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span>Member</span>
          <span>Club Role</span>
          <span>System Access</span>
          <span>Executive Title</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>

        <div className="divide-y divide-slate-50">
          {members.map(member => (
            <div key={member.id} className="grid grid-cols-[1.3fr_1fr_1fr_1.1fr_0.9fr_auto] items-center gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{member.fullName}</p>
                <p className="text-xs text-slate-400">{member.email}</p>
              </div>

              <select
                value={member.clubRole}
                onChange={event => {
                  const clubRole = event.target.value as PmacClubRole
                  const nextSystemRole = clubRole === 'EXECUTIVE'
                    ? 'PMAC_EXECUTIVE'
                    : member.account?.role === 'PMAC_EXECUTIVE'
                      ? getDefaultSystemRoleForClubRole(clubRole)
                      : getDefaultSystemRoleForClubRole(clubRole)
                  updateLocalMember(member.id, {
                    clubRole,
                    executiveTitle: clubRole === 'EXECUTIVE' || nextSystemRole === 'PMAC_EXECUTIVE'
                      ? member.executiveTitle
                      : null,
                    account: member.account
                      ? {
                          ...member.account,
                          role: nextSystemRole,
                        }
                      : member.account,
                  })
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {PMAC_CLUB_ROLES.map(role => (
                  <option key={role} value={role}>
                    {PMAC_CLUB_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>

              <select
                value={member.account?.role}
                onChange={event => {
                  const systemRole = event.target.value as PmacSystemRole
                  const nextClubRole = systemRole === 'PMAC_EXECUTIVE'
                    ? 'EXECUTIVE'
                    : member.clubRole === 'EXECUTIVE'
                      ? getDefaultClubRoleForSystemRole(systemRole)
                      : member.clubRole

                  updateLocalMember(member.id, {
                    clubRole: nextClubRole,
                    executiveTitle: systemRole === 'PMAC_EXECUTIVE' || nextClubRole === 'EXECUTIVE'
                      ? member.executiveTitle
                      : null,
                    account: member.account
                      ? {
                          ...member.account,
                          role: systemRole,
                        }
                      : member.account,
                  })
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {PMAC_SYSTEM_ROLES.map(role => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>

              <select
                value={member.executiveTitle ?? ''}
                onChange={event => updateLocalMember(member.id, { executiveTitle: event.target.value ? event.target.value as PmacExecutiveTitle : null })}
                disabled={member.clubRole !== 'EXECUTIVE' && member.account?.role !== 'PMAC_EXECUTIVE'}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{member.clubRole === 'EXECUTIVE' || member.account?.role === 'PMAC_EXECUTIVE' ? 'Select title' : 'Not executive'}</option>
                {PMAC_EXECUTIVE_TITLES.map((title) => (
                  <option key={title} value={title}>
                    {PMAC_EXECUTIVE_TITLE_LABELS[title]}
                  </option>
                ))}
              </select>

              <select
                value={member.status}
                onChange={event => updateLocalMember(member.id, { status: event.target.value as PmacMemberStatus })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {PMAC_MEMBER_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {PMAC_MEMBER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>

              <div className="text-right">
                <button
                  onClick={() => saveAssignment(member)}
                  disabled={savingId === member.id}
                  className="rounded-xl bg-[#064e3b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#065f46] disabled:opacity-60"
                >
                  {savingId === member.id ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
