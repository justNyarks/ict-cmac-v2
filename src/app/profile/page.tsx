'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, Lock, CheckCircle2, AlertCircle } from 'lucide-react'
import { updateProfile } from './actions'
import clsx from 'clsx'

const ROLE_LABELS: Record<string, string> = {
  SECRETARY: 'Secretary',
  CMAC_COORDINATOR: 'CMAC Coordinator',
  ICT_DIRECTOR: 'ICT Director',
}

export default function ProfilePage() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Sync name from session when it loads (session is async)
  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user?.name])

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSave() {
    if (!name.trim()) return showToast('error', 'Name cannot be empty.')
    if (newPassword && newPassword !== confirmPassword) return showToast('error', 'New passwords do not match.')
    setLoading(true)
    try {
      const res = await updateProfile({ name, currentPassword: currentPassword || undefined, newPassword: newPassword || undefined })
      if (res.success) {
        // Trigger JWT update which re-reads from DB
        await update()
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
        showToast('success', 'Profile updated successfully!')
        router.refresh()
      } else {
        showToast('error', res.error || 'Failed to update profile.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
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

      {/* Avatar + Role card */}
      <div className="card p-8 flex items-center gap-6"
        style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)' }}>
        <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center text-white font-black text-3xl shadow-xl flex-shrink-0">
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
        <div>
          <p className="text-emerald-300 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Your Account</p>
          <h2 className="text-white font-display text-2xl font-bold leading-tight">{user?.name || 'User'}</h2>
          <p className="text-emerald-300 text-sm font-medium mt-1">{user?.email}</p>
          <span className="mt-2 inline-block bg-white/10 text-emerald-100 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
            {ROLE_LABELS[user?.role] || user?.role}
          </span>
          {user?.school && (
            <span className="mt-2 ml-2 inline-block bg-white/10 text-emerald-100 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
              {user.school}
            </span>
          )}
        </div>
      </div>

      {/* Edit Form */}
      <div className="card p-8 space-y-8">
        {/* Identity */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <User size={16} className="text-emerald-500" />
            <h3 className="font-black text-[10px] text-slate-500 uppercase tracking-widest">Personal Information</h3>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
            <div className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-400 cursor-not-allowed">
              {user?.email}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 ml-1">Email cannot be changed. Contact your administrator.</p>
          </div>
        </div>

        {/* Password */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <Lock size={16} className="text-emerald-500" />
            <h3 className="font-black text-[10px] text-slate-500 uppercase tracking-widest">Change Password</h3>
            <span className="text-[9px] text-slate-400 font-bold ml-1">(leave blank to keep current)</span>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className={clsx(
                  'w-full border-2 rounded-2xl px-5 py-3.5 text-sm font-medium focus:outline-none focus:ring-4 transition-all',
                  confirmPassword && newPassword !== confirmPassword
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                    : 'border-slate-100 focus:border-emerald-500 focus:ring-emerald-50'
                )}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[10px] text-red-500 font-bold mt-1 ml-1">Passwords do not match</p>
              )}
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 bg-[#064e3b] hover:bg-[#065f46] text-white px-10 py-3.5 rounded-2xl font-black text-sm shadow-xl shadow-emerald-900/20 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              <><CheckCircle2 size={16} /> Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
