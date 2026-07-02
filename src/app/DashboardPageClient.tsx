'use client'

import { CheckCircle2, ChevronRight, Clock, FileCheck2, Layers, Camera, Video, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ElementType } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import clsx from 'clsx'

import { getStatusColor, getStatusLabel } from '@/lib/data'
import { getRoleLabel } from '@/lib/roles'
import { getDashboardStats } from './dashboardActions'
import type { AppNotification } from '@/types/notifications'

type DashboardStats = NonNullable<Awaited<ReturnType<typeof getDashboardStats>>>

const DISMISSED_NOTIFICATIONS_KEY = 'dismissedNotifications.v2'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string
  value: number | string
  icon: ElementType
  color: string
  sub?: string
}) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function getNotificationToneClasses(notification: AppNotification) {
  if (notification.tone === 'danger') {
    return {
      card: 'bg-red-50 border-red-100 hover:bg-red-100/50',
      icon: 'bg-white text-red-600',
      title: 'text-red-900',
      description: 'text-red-600',
      chevron: 'text-red-300',
      glyph: <XCircle size={20} />,
    }
  }

  if (notification.tone === 'warning') {
    return {
      card: 'bg-amber-50 border-amber-100 hover:bg-amber-100/50',
      icon: 'bg-white text-amber-600',
      title: 'text-amber-900',
      description: 'text-amber-600',
      chevron: 'text-amber-300',
      glyph: <Clock size={20} />,
    }
  }

  return {
    card: 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50',
    icon: 'bg-white text-emerald-600',
    title: 'text-emerald-900',
    description: 'text-emerald-600',
    chevron: 'text-emerald-300',
    glyph: <CheckCircle2 size={20} />,
  }
}

export default function DashboardPageClient() {
  const { data: session } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([])

  useEffect(() => {
    setDismissedNotifs(JSON.parse(localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY) || '[]'))
    getDashboardStats().then((data) => {
      setStats(data)
      setLoading(false)
    })
  }, [])

  const handleNotifClick = (notification: AppNotification) => {
    const updated = Array.from(new Set([...dismissedNotifs, notification.id]))
    setDismissedNotifs(updated)
    localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(updated))
    router.push(notification.href)
  }

  if (loading || !stats) {
    return <div className="p-10 text-center text-slate-400">Loading dashboard...</div>
  }

  const { total, pending, approved, rejected, coordApproved, recent } = stats
  const visibleNotifications = stats.notifications.filter((notification) => !dismissedNotifs.includes(notification.id))

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div
        className="relative rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 60%, #059669 100%)' }}
      >
        <div className="px-8 py-10 flex items-center justify-between">
          <div className="z-10">
            <p className="text-emerald-200 text-sm font-medium tracking-widest uppercase mb-1">
              Welcome back
            </p>
            <h2 className="font-display text-4xl text-white font-bold">{session?.user?.name || 'User'}</h2>
            <p className="text-emerald-300 mt-1 text-sm font-medium">
              {getRoleLabel(session?.user?.role)} | {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3 z-10">
            <div className="text-right bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
              <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wider mb-1">Needs Action</p>
              <p className="text-4xl font-bold text-white">
                {(() => {
                  const role = session?.user?.role
                  if (role === 'CMAC_COORDINATOR') return pending
                  if (role === 'ICT_DIRECTOR') return coordApproved + pending
                  return pending
                })()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {stats.dbUnavailable && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <p className="text-sm font-bold">Dashboard data is temporarily unavailable.</p>
          <p className="text-xs font-medium text-amber-700 mt-1">The app could not reach the database, so the widgets below are showing safe fallback values.</p>
        </div>
      )}

      {session?.user?.role === 'SECRETARY' && visibleNotifications.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Notifications</h3>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
            </div>
            <button
              onClick={() => {
                const idsToDismiss = visibleNotifications.map((notification) => notification.id)
                const updated = Array.from(new Set([...dismissedNotifs, ...idsToDismiss]))
                setDismissedNotifs(updated)
                localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(updated))
              }}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors"
            >
              Clear All
            </button>
          </div>
          {visibleNotifications.map((notification) => {
            const toneClasses = getNotificationToneClasses(notification)

            return (
              <div
                key={notification.id}
                className={clsx(
                  'rounded-2xl p-4 flex items-center justify-between group transition-all cursor-pointer border',
                  toneClasses.card
                )}
                onClick={() => handleNotifClick(notification)}
              >
                <div className="flex items-center gap-4">
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shadow-sm', toneClasses.icon)}>
                    {toneClasses.glyph}
                  </div>
                  <div>
                    <p className={clsx('text-sm font-bold', toneClasses.title)}>
                      {notification.title}
                    </p>
                    <p className={clsx('text-xs font-medium', toneClasses.description)}>
                      {notification.description}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className={toneClasses.chevron} />
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={total} icon={FileCheck2} color="bg-emerald-50 text-emerald-600" />
        <StatCard label="Pending" value={pending} icon={Clock} color="bg-amber-50 text-amber-600" />
        <StatCard label="Fully Approved" value={approved} icon={CheckCircle2} color="bg-green-100 text-green-700" />
        <StatCard label="Rejected" value={rejected} icon={XCircle} color="bg-red-50 text-red-500" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { type: 'PHOTO', label: 'Photo Documentation', count: stats.photoCount, icon: Camera },
          { type: 'VIDEO', label: 'Video Documentation', count: stats.videoCount, icon: Video },
          { type: 'BOTH', label: 'Photo + Video', count: stats.bothCount, icon: Layers },
        ].map(({ type, label, count, icon: Icon }) => (
          <div key={type} className="card p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Icon size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{count}</p>
              <p className="text-sm text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Recent Requests</h3>
          <a href="/requests" className="text-sm text-blue-600 hover:underline font-medium">View all</a>
        </div>
        <div className="divide-y divide-slate-50">
          {recent.map((request) => (
            <div key={request.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
              <div>
                <p className="font-medium text-slate-800 text-sm">{request.eventTitle}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {request.school} | {request.secretary?.name || 'Unknown requester'} | {new Date(request.eventDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <span className={`status-badge ${getStatusColor(request.status)}`}>
                {getStatusLabel(request.status)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
