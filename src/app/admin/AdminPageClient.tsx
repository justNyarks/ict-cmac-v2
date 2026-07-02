'use client'

import type { ElementType } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertCircle, Briefcase, CheckCircle2, Mail, PencilLine, Shield, User as UserIcon, UserPlus } from 'lucide-react'
import clsx from 'clsx'

import Portal from '@/components/Portal'
import { runWithReverification } from '@/lib/reverificationClient'
import type { Role } from '@/types'
import { addUser, getUsers, removeUser, updateUserEmail } from './actions'

const SCHOOLS = ['SNAHS', 'SBAHM', 'SITE', 'SASTE', 'MEDICINE', 'BEU', 'UNIVERSITY', 'HR'] as const

const SCHOOL_LABELS: Record<(typeof SCHOOLS)[number], string> = {
  SNAHS: 'SNAHS',
  SBAHM: 'SBAHM',
  SITE: 'SITE',
  SASTE: 'SASTE',
  MEDICINE: 'SOM',
  BEU: 'BEU',
  UNIVERSITY: 'UNIVERSITY',
  HR: 'HR',
}

const ROLE_META: Record<Role, { label: string; color: string; icon: ElementType; desc: string }> = {
  SECRETARY: {
    label: 'Secretary',
    color: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: UserIcon,
    desc: 'Submits service requests on behalf of their school.',
  },
  CMAC_COORDINATOR: {
    label: 'CMAC Coordinator',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Briefcase,
    desc: 'Reviews and provides first-level approval for requests.',
  },
  ICT_DIRECTOR: {
    label: 'ICT Director',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: Shield,
    desc: 'Final approver for all documentation requests.',
  },
  PMAC_DIRECTOR: {
    label: 'PMAC Director',
    color: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: Shield,
    desc: 'PMAC director account with access to the PMAC module.',
  },
  PMAC_ASSISTANT_DIRECTOR: {
    label: 'PMAC Assistant Director',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    icon: Briefcase,
    desc: 'PMAC assistant director account with protected PMAC access.',
  },
  PMAC_SECRETARY: {
    label: 'PMAC Secretary',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    icon: UserIcon,
    desc: 'PMAC secretary account for future PMAC coordination flows.',
  },
  PMAC_EXECUTIVE: {
    label: 'PMAC Executive',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    icon: UserIcon,
    desc: 'PMAC executive account with protected PMAC dashboard access.',
  },
  PMAC_MEMBER: {
    label: 'PMAC Member',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: UserIcon,
    desc: 'General PMAC member account with placeholder dashboard access.',
  },
}

type DBUser = { id: string; name: string | null; email: string; role: string; school: string | null }
type NewUserState = { name: string; email: string; password: string; role: Role; school: '' | (typeof SCHOOLS)[number] }

export default function AdminPageClient() {
  const { data: session, update } = useSession()
  const [users, setUsers] = useState<DBUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingUser, setEditingUser] = useState<DBUser | null>(null)
  const [editingEmail, setEditingEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [newUser, setNewUser] = useState<NewUserState>({ name: '', email: '', password: '', role: 'SECRETARY', school: '' })
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)

    try {
      const data = await getUsers()
      setUsers(data as DBUser[])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load users.'
      setToast({ type: 'error', msg: message })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function handleAddUser() {
    if (!newUser.name || !newUser.email || !newUser.password) {
      return showToast('error', 'Please fill all required fields.')
    }

    let res
    try {
      res = await runWithReverification(
        () => addUser({
          name: newUser.name,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          school: newUser.role === 'SECRETARY' ? newUser.school : undefined,
        }),
        result => result.success ? null : result.error
      )
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to verify this change.')
      return
    }

    if (res.success) {
      showToast('success', 'User added successfully!')
      setShowAdd(false)
      setNewUser({ name: '', email: '', password: '', role: 'SECRETARY', school: '' })
      await fetchUsers()
    } else {
      showToast('error', res.error || 'Failed to add user.')
    }
  }

  async function handleRemoveUser(id: string, name: string | null) {
    if (!confirm(`Remove ${name || 'this user'}? This cannot be undone.`)) return

    let res
    try {
      res = await runWithReverification(
        () => removeUser(id),
        result => result.success ? null : result.error
      )
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to verify this change.')
      return
    }
    if (res.success) {
      showToast('success', 'User removed.')
      await fetchUsers()
    } else {
      showToast('error', res.error || 'Failed to remove user.')
    }
  }

  function openEditEmail(user: DBUser) {
    setEditingUser(user)
    setEditingEmail(user.email)
  }

  async function handleSaveEmail() {
    if (!editingUser) return

    setSavingEmail(true)
    try {
      const res = await runWithReverification(
        () => updateUserEmail(editingUser.id, editingEmail),
        result => result.success ? null : result.error
      )
      if (res.success) {
        if (editingUser.id === session?.user?.id) {
          await update()
        }

        showToast('success', 'User email updated.')
        setEditingUser(null)
        setEditingEmail('')
        await fetchUsers()
      } else {
        showToast('error', res.error || 'Failed to update email.')
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to verify this change.')
    } finally {
      setSavingEmail(false)
    }
  }

  const grouped = ([
    'SECRETARY',
    'CMAC_COORDINATOR',
    'ICT_DIRECTOR',
    'PMAC_DIRECTOR',
    'PMAC_ASSISTANT_DIRECTOR',
    'PMAC_SECRETARY',
    'PMAC_EXECUTIVE',
    'PMAC_MEMBER',
  ] as Role[]).map(role => ({
    role,
    users: users.filter(user => user.role === role),
  }))

  const getInitials = (name: string | null) => {
    if (!name) return '??'
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading users...</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
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
        {([
          'SECRETARY',
          'CMAC_COORDINATOR',
          'ICT_DIRECTOR',
          'PMAC_DIRECTOR',
          'PMAC_ASSISTANT_DIRECTOR',
          'PMAC_SECRETARY',
          'PMAC_EXECUTIVE',
          'PMAC_MEMBER',
        ] as Role[]).map(role => {
          const meta = ROLE_META[role]
          const Icon = meta.icon
          const count = users.filter(user => user.role === role).length

          return (
            <div key={role} className={`rounded-2xl border p-5 ${meta.color.replace('text-', '').replace('border-', 'border ')}`}>
              <div className="mb-3 flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.color}`}>
                  <Icon size={18} />
                </div>
                <span className="text-2xl font-bold">{count}</span>
              </div>
              <p className="text-sm font-semibold">{meta.label}</p>
              <p className="mt-1 text-xs opacity-70">{meta.desc}</p>
            </div>
          )
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-800">System Users</h3>
          {session?.user?.role === 'ICT_DIRECTOR' && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#065f46]"
            >
              <UserPlus size={14} /> Add User
            </button>
          )}
        </div>

        {grouped.map(({ role, users: roleUsers }) =>
          roleUsers.length > 0 ? (
            <div key={role}>
              <div className="border-y border-slate-100 bg-slate-50 px-6 py-2">
                <span className={`status-badge ${ROLE_META[role].color}`}>{ROLE_META[role].label}</span>
              </div>
              {roleUsers.map(user => (
                <div
                  key={user.id}
                  className="flex items-center justify-between border-b border-slate-50 px-6 py-4 transition-colors last:border-b-0 hover:bg-slate-50/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#064e3b] text-xs font-bold text-white">
                      {getInitials(user.name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.school || user.email}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Mail size={12} />
                        {user.email}
                      </p>
                    </div>
                  </div>
                  {session?.user?.role === 'ICT_DIRECTOR' && (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => openEditEmail(user)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
                      >
                        <PencilLine size={12} />
                        Edit Gmail
                      </button>
                      {user.id !== session?.user?.id && (
                        <button
                          onClick={() => handleRemoveUser(user.id, user.name)}
                          className="text-xs font-medium text-red-400 transition-colors hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null
        )}
      </div>

      {showAdd && (
        <Portal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
            onClick={() => setShowAdd(false)}
          >
            <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-7 shadow-2xl" onClick={event => event.stopPropagation()}>
              <h3 className="font-display text-xl font-bold text-slate-800">Add New User</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Full Name</label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={event => setNewUser(previous => ({ ...previous, name: event.target.value }))}
                    placeholder="e.g. Maria Santos"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={event => setNewUser(previous => ({ ...previous, email: event.target.value }))}
                    placeholder="user@spup.edu.ph"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={event => setNewUser(previous => ({ ...previous, password: event.target.value }))}
                    placeholder="Min 8 characters"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Role</label>
                  <select
                    value={newUser.role}
                    onChange={event => setNewUser(previous => ({ ...previous, role: event.target.value as Role }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="SECRETARY">Secretary</option>
                    <option value="CMAC_COORDINATOR">CMAC Coordinator</option>
                    <option value="ICT_DIRECTOR">ICT Director</option>
                  </select>
                </div>
                {newUser.role === 'SECRETARY' && (
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">School</label>
                    <select
                      value={newUser.school}
                      onChange={event =>
                        setNewUser(previous => ({ ...previous, school: event.target.value as NewUserState['school'] }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Select school...</option>
                      {SCHOOLS.map(school => (
                        <option key={school} value={school}>
                          {SCHOOL_LABELS[school]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAddUser}
                  className="flex-1 rounded-xl bg-[#064e3b] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065f46]"
                >
                  Add User
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {editingUser && (
        <Portal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
            onClick={() => !savingEmail && setEditingUser(null)}
          >
            <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-7 shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Edit User Gmail</h3>
                <p className="text-sm text-slate-500">
                  Update the login email for <span className="font-semibold text-slate-700">{editingUser.name || 'this user'}</span>.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Account Type</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {ROLE_META[editingUser.role as Role]?.label || editingUser.role}
                  {editingUser.school ? ` · ${editingUser.school}` : ''}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Gmail Address</label>
                <input
                  type="email"
                  value={editingEmail}
                  onChange={event => setEditingEmail(event.target.value)}
                  placeholder="secretary@gmail.com"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail}
                  className="flex-1 rounded-xl bg-[#064e3b] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065f46] disabled:opacity-60"
                >
                  {savingEmail ? 'Saving...' : 'Save Email'}
                </button>
                <button
                  onClick={() => setEditingUser(null)}
                  disabled={savingEmail}
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
