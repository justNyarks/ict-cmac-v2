'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useState, useTransition } from 'react'
import { LockKeyhole, ShieldCheck, ShieldEllipsis } from 'lucide-react'

import { verifyZeroTrustAccess } from './actions'

type ZeroTrustPageClientProps = {
  hasActiveVerification: boolean
  nextPath: string
  roleLabel: string
  ttlMinutes: number
  userName: string
}

export default function ZeroTrustPageClient({
  hasActiveVerification,
  nextPath,
  roleLabel,
  ttlMinutes,
  userName,
}: ZeroTrustPageClientProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const actionLabel = nextPath === '/' ? 'Refresh Secure Access' : 'Verify & Continue'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await verifyZeroTrustAccess({ password, nextPath })

      if (result?.error) {
        setError(result.error)
        return
      }

      setPassword('')
    })
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="card overflow-hidden">
        <div className="bg-[linear-gradient(135deg,#052e2b_0%,#064e3b_45%,#0f766e_100%)] px-8 py-10 text-white">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-100">
                <ShieldEllipsis size={14} />
                Zero Trust Access
              </div>
              <div>
                <h1 className="font-display text-3xl font-black tracking-tight">Re-verify privileged access</h1>
                <p className="mt-2 max-w-xl text-sm text-emerald-50/85">
                  Sensitive routes stay locked until privileged users confirm their identity again. This extra step protects
                  analytics, audit logs, approvals, and account administration.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100">Privileged Account</p>
              <p className="mt-2 text-lg font-semibold">{userName}</p>
              <p className="text-xs text-emerald-100/80">{roleLabel}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-8 md:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${
                    hasActiveVerification ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {hasActiveVerification ? <ShieldCheck size={18} /> : <LockKeyhole size={18} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {hasActiveVerification ? 'Secure session already active' : 'Verification required'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {hasActiveVerification
                      ? `You already have a verified privileged session. Re-enter your password to refresh the ${ttlMinutes}-minute trust window.`
                      : 'Enter your current password to unlock privileged routes for a short, tightly scoped session.'}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Current Password</label>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Re-enter your password"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[#064e3b] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#065f46] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? 'Verifying...' : actionLabel}
              </button>
              <Link
                href={nextPath}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Continue without refresh
              </Link>
            </div>
          </form>

          <div className="space-y-4 rounded-[1.75rem] border border-emerald-100 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_45%),linear-gradient(180deg,_rgba(236,253,245,0.8),_rgba(255,255,255,1))] p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Security Posture</p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-800">Short-lived trusted sessions</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Verification is limited to sensitive admin workflows and expires automatically after {ttlMinutes} minutes. We keep
              the trust window small so stolen sessions have less room to do damage.
            </p>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-slate-600 shadow-sm">
              <p className="font-semibold text-slate-800">Protected areas</p>
              <p className="mt-2">`/admin`, `/analytics`, `/logs`, and privileged request approvals now require this extra check.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
