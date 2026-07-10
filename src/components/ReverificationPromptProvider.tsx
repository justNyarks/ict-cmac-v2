'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'

import Portal from '@/components/Portal'
import { registerReverificationPrompt } from '@/lib/reverificationClient'

type PendingPrompt = {
  resolve: (password: string | null) => void
}

export default function ReverificationPromptProvider() {
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
  const [password, setPassword] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return registerReverificationPrompt(() => new Promise(resolve => {
      setPassword('')
      setPendingPrompt({ resolve })
    }))
  }, [])

  useEffect(() => {
    if (!pendingPrompt) {
      return
    }

    const timeout = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(timeout)
  }, [pendingPrompt])

  if (!pendingPrompt) {
    return null
  }

  const close = () => {
    pendingPrompt.resolve(null)
    setPendingPrompt(null)
    setPassword('')
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!password) {
      return
    }

    pendingPrompt.resolve(password)
    setPendingPrompt(null)
    setPassword('')
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm print:hidden" onClick={close}>
        <form
          onSubmit={submit}
          className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">Confirm sensitive change</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Enter the password for your signed-in account to continue.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              aria-label="Cancel verification"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Current Password</span>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                autoComplete="current-password"
              />
            </label>
            <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              This is not the password you are setting for the new member. Use your own login password.
            </p>
          </div>

          <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password}
              className="flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </Portal>
  )
}
