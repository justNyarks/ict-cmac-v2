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
import { markAllNotificationsAsRead, markNotificationAsRead } from './notificationsActions'
import type { AppNotification } from '@/types/notifications'

type DashboardStats = NonNullable<Awaited<ReturnType<typeof getDashboardStats>>>

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

function getPriorityBadge(notification: AppNotification) {
  switch (notification.priority) {
    case 'critical':
      return 'bg-red-100 text-red-700'
    case 'high':
      return 'bg-amber-100 text-amber-700'
    case 'medium':
      return 'bg-sky-100 text-sky-700'
    case 'low':
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

export default function DashboardPageClient() {
  const { data: session } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboardStats().then((data) => {
      setStats(data)
      setLoading(false)
    })
  }, [])

  const handleNotifClick = async (notification: AppNotification) => {
    setStats((previous) => previous ? ({
      ...previous,
      notifications: previous.notifications.map((item) => (
        item.id === notification.id ? { ...item, isRead: true } : item
      )),
    }) : previous)
    await markNotificationAsRead(notification.id, notification.module)
    router.push(notification.href)
  }

  if (loading || !stats) {
    return <div className="p-10 text-center text-slate-400">Loading dashboard...</div>
  }

  const { total, pending, approved, rejected, coordApproved, recent } = stats
  const visibleNotifications = stats.notifications
  const unreadNotifications = visibleNotifications.filter((notification) => !notification.isRead)

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div
        className="relative rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'var(--hero-gradient)' }}
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

      {visibleNotifications.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Notifications</h3>
              {unreadNotifications.length ? (
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              ) : null}
            </div>
            <button
              onClick={async () => {
                const unread = visibleNotifications
                  .filter((notification) => !notification.isRead)
                  .map((notification) => ({ id: notification.id, module: notification.module }))
                if (!unread.length) {
                  return
                }

                setStats((previous) => previous ? ({
                  ...previous,
                  notifications: previous.notifications.map((notification) => ({ ...notification, isRead: true })),
                }) : previous)
                await markAllNotificationsAsRead(unread)
              }}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors"
            >
              Mark All Read
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={clsx('text-sm font-bold', toneClasses.title)}>
                        {notification.title}
                      </p>
                      <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', getPriorityBadge(notification))}>
                        {notification.priority}
                      </span>
                      {!notification.isRead ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                          Unread
                        </span>
                      ) : null}
                    </div>
                    <p className={clsx('text-xs font-medium', toneClasses.description)}>
                      {notification.description}
                    </p>
                    {notification.dueLabel ? (
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {notification.dueLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
                <ChevronRight size={18} className={toneClasses.chevron} />
              </div>
            )
          })}
        </div>
      )}

      {stats.workflowTimeline.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Workflow Timeline</h3>
            <a href="/requests" className="text-sm text-blue-600 hover:underline font-medium">Open queue</a>
          </div>
          <div className="divide-y divide-slate-50">
            {stats.workflowTimeline.map((item) => (
              <a key={item.id} href={item.href} className="block px-6 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{item.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.school} | {new Date(item.eventDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">{item.stageLabel}</p>
                    <p className={clsx(
                      'mt-1 text-[11px] font-bold',
                      item.slaLabel.includes('Needs') || item.slaLabel.includes('Upcoming')
                        ? 'text-amber-600'
                        : item.slaLabel === 'Closed'
                          ? 'text-red-500'
                          : 'text-emerald-600'
                    )}>
                      {item.slaLabel}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={total} icon={FileCheck2} color="bg-emerald-50 text-emerald-600" />
        <StatCard label="Pending" value={pending} icon={Clock} color="bg-amber-50 text-amber-600" />
        <StatCard label="Fully Approved" value={approved} icon={CheckCircle2} color="bg-green-100 text-green-700" />
        <StatCard label="Rejected" value={rejected} icon={XCircle} color="bg-red-50 text-red-500" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard
          label="PMAC Handoff"
          value={stats.pmacApproved}
          icon={Camera}
          color="bg-sky-50 text-sky-700"
          sub="Approved requests mirrored to PMAC operations."
        />
        <StatCard
          label="CMAC Coverage"
          value={stats.cmacApproved}
          icon={Layers}
          color="bg-indigo-50 text-indigo-700"
          sub="Approved requests retained in the core CMAC workflow."
        />
        <StatCard
          label="Needs Routing"
          value={stats.unassignedService}
          icon={Clock}
          color="bg-amber-50 text-amber-700"
          sub="Requests still waiting for final service assignment."
        />
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
                  {request.school} | {request.serviceType || 'Unassigned'} | {request.secretary?.name || 'Unknown requester'} | {new Date(request.eventDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
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
