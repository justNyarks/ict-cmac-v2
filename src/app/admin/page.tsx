'use client'
import { useState, useEffect } from 'react'
import { Role } from '@/types'
import { UserPlus, Shield, User as UserIcon, Briefcase, AlertCircle, CheckCircle2, Mail, PencilLine } from 'lucide-react'
import clsx from 'clsx'
import { getUsers, addUser, removeUser, updateUserEmail } from './actions'
import { useSession } from 'next-auth/react'
import Portal from '@/components/Portal'

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

const ROLE_META: Record<Role, { label: string; color: string; icon: React.ElementType; desc: string }> = {
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
}

type DBUser = { id: string; name: string | null; email: string; role: string; school: string | null }

export default function AdminPage() {
  const { data: session, update } = useSession()
  const [users, setUsers] = useState<DBUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingUser, setEditingUser] = useState<DBUser | null>(null)
  const [editingEmail, setEditingEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'SECRETARY' as Role, school: '' })
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchUsers = async () => {
    setLoading(true)
    const data = await getUsers()
    setUsers(data as DBUser[])
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  async function handleAddUser() {
    if (!newUser.name || !newUser.email || !newUser.password) {
      return showToast('error', 'Please fill all required fields.')
    }
    const res = await addUser({
      name: newUser.name,
      email: newUser.email,
      password: newUser.password,
      role: newUser.role,
      school: newUser.role === 'SECRETARY' ? newUser.school : undefined,
    })
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
    const res = await removeUser(id)
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
      const res = await updateUserEmail(editingUser.id, editingEmail)
      if (res.success) {
        if (editingUser.id === (session?.user as any)?.id) {
          await update()
        }
        showToast('success', 'User email updated.')
        setEditingUser(null)
        setEditingEmail('')
        await fetchUsers()
      } else {
        showToast('error', res.error || 'Failed to update email.')
      }
    } finally {
      setSavingEmail(false)
    }
  }

  const grouped = (['SECRETARY', 'CMAC_COORDINATOR', 'ICT_DIRECTOR'] as Role[]).map(role => ({
    role,
    users: users.filter(u => u.role === role),
  }))

  const getInitials = (name: string | null) => {
    if (!name) return '??'
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading users...</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className={clsx(
          'fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-sm font-bold animate-fade-in',
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
        )}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toast.msg}
        </div>
      )}

      {/* Role cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {(['SECRETARY', 'CMAC_COORDINATOR', 'ICT_DIRECTOR'] as Role[]).map(role => {
          const meta = ROLE_META[role]
          const Icon = meta.icon
          const count = users.filter(u => u.role === role).length
          return (
            <div key={role} className={`rounded-2xl border p-5 ${meta.color.replace('text-', '').replace('border-', 'border ')}`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.color}`}>
                  <Icon size={18} />
                </div>
                <span className="text-2xl font-bold">{count}</span>
              </div>
              <p className="font-semibold text-sm">{meta.label}</p>
              <p className="text-xs mt-1 opacity-70">{meta.desc}</p>
            </div>
          )
        })}
      </div>

      {/* User management */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">System Users</h3>
          {(session?.user as any)?.role === 'ICT_DIRECTOR' && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-[#064e3b] text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-[#065f46] transition-colors"
            >
              <UserPlus size={14} /> Add User
            </button>
          )}
        </div>

        {grouped.map(({ role, users: roleUsers }) => (
          roleUsers.length > 0 && (
            <div key={role}>
              <div className="px-6 py-2 bg-slate-50 border-y border-slate-100">
                <span className={`status-badge ${ROLE_META[role].color}`}>
                  {ROLE_META[role].label}
                </span>
              </div>
              {roleUsers.map(user => (
                <div key={user.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/60 border-b border-slate-50 last:border-b-0 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#064e3b] flex items-center justify-center text-white text-xs font-bold">
                      {getInitials(user.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.school || user.email}</p>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                        <Mail size={12} />
                        {user.email}
                      </p>
                    </div>
                  </div>
                  {(session?.user as any)?.role === 'ICT_DIRECTOR' && (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => openEditEmail(user)}
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-semibold"
                      >
                        <PencilLine size={12} />
                        Edit Gmail
                      </button>
                      {user.id !== (session?.user as any)?.id && (
                        <button
                          onClick={() => handleRemoveUser(user.id, user.name)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ))}
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 space-y-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-xl text-slate-800 font-bold">Add New User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Maria Santos"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  placeholder="user@spup.edu.ph"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                  placeholder="Min 8 characters"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(p => ({ ...p, role: e.target.value as Role }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="SECRETARY">Secretary</option>
                  <option value="CMAC_COORDINATOR">CMAC Coordinator</option>
                  <option value="ICT_DIRECTOR">ICT Director</option>
                </select>
              </div>
              {newUser.role === 'SECRETARY' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">School</label>
                  <select
                    value={newUser.school}
                    onChange={e => setNewUser(p => ({ ...p, school: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="">Select school…</option>
                    {SCHOOLS.map(s => (
                      <option key={s} value={s}>{SCHOOL_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddUser}
                className="flex-1 bg-[#064e3b] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#065f46] transition-colors">
                Add User
              </button>
              <button onClick={() => setShowAdd(false)}
                className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {editingUser && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden" onClick={() => !savingEmail && setEditingUser(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 space-y-5" onClick={e => e.stopPropagation()}>
              <div className="space-y-1">
                <h3 className="font-display text-xl text-slate-800 font-bold">Edit User Gmail</h3>
                <p className="text-sm text-slate-500">
                  Update the login email for <span className="font-semibold text-slate-700">{editingUser.name || 'this user'}</span>.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Account Type</p>
                <p className="text-sm font-semibold text-slate-700 mt-1">
                  {ROLE_META[editingUser.role as Role]?.label || editingUser.role}
                  {editingUser.school ? ` · ${editingUser.school}` : ''}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Gmail Address</label>
                <input
                  type="email"
                  value={editingEmail}
                  onChange={e => setEditingEmail(e.target.value)}
                  placeholder="secretary@gmail.com"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail}
                  className="flex-1 bg-[#064e3b] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#065f46] transition-colors disabled:opacity-60"
                >
                  {savingEmail ? 'Saving...' : 'Save Email'}
                </button>
                <button
                  onClick={() => setEditingUser(null)}
                  disabled={savingEmail}
                  className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors disabled:opacity-60"
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
