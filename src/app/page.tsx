'use client'
import { getStatusLabel, getStatusColor } from '@/lib/data'
import {
  CheckCircle2, Clock, XCircle, FileCheck2,
  TrendingUp, Camera, Video, Layers, ChevronRight
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { getDashboardStats } from './dashboardActions'
import { useSession } from 'next-auth/react'
import clsx from 'clsx'

function StatCard({
  label, value, icon: Icon, color, sub
}: {
  label: string; value: number | string; icon: React.ElementType; color: string; sub?: string
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

export default function DashboardPage() {
  const { data: session } = useSession()
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([])

  useEffect(() => {
    setDismissedNotifs(JSON.parse(localStorage.getItem('dismissedNotifs') || '[]'))
    getDashboardStats().then(data => {
      setStats(data)
      setLoading(false)
    })
  }, [])

  const handleNotifClick = (id: string) => {
    const updated = [...dismissedNotifs, id]
    setDismissedNotifs(updated)
    localStorage.setItem('dismissedNotifs', JSON.stringify(updated))
    window.location.href = '/requests'
  }

  if (loading || !stats) {
    return <div className="p-10 text-center text-slate-400">Loading dashboard...</div>
  }

  const { total, pending, approved, rejected, coordApproved, recent } = stats

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 60%, #059669 100%)' }}>
        <div className="px-8 py-10 flex items-center justify-between">
          <div className="z-10">
            <p className="text-emerald-200 text-sm font-medium tracking-widest uppercase mb-1">
              Welcome back
            </p>
            <h2 className="font-display text-4xl text-white font-bold">{session?.user?.name || 'User'}</h2>
            <p className="text-emerald-300 mt-1 text-sm font-medium">{(session?.user as any)?.role?.replace('_', ' ')} · {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="hidden md:flex items-center gap-3 z-10">
            <div className="text-right bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
              <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wider mb-1">Needs Action</p>
              <p className="text-4xl font-bold text-white">
                {(() => {
                  const role = (session?.user as any)?.role;
                  if (role === 'CMAC_COORDINATOR') return pending;
                  if (role === 'ICT_DIRECTOR') return coordApproved + pending;
                  return pending;
                })()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications for Secretary */}
      {(session?.user as any)?.role === 'SECRETARY' && stats.newlyApproved?.filter((req: any) => !dismissedNotifs.includes(req.id)).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Notifications</h3>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
          </div>
          {stats.newlyApproved.filter((req: any) => !dismissedNotifs.includes(req.id)).map((req: any) => (
            <div key={req.id} className={clsx(
                "rounded-2xl p-4 flex items-center justify-between group transition-all cursor-pointer border",
                req.status === 'REJECTED' ? "bg-red-50 border-red-100 hover:bg-red-100/50" : "bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50"
              )} 
              onClick={() => handleNotifClick(req.id)}>
              <div className="flex items-center gap-4">
                <div className={clsx(
                  "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                  req.status === 'REJECTED' ? "bg-white text-red-600" : "bg-white text-emerald-600"
                )}>
                  {req.status === 'REJECTED' ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
                </div>
                <div>
                  <p className={clsx("text-sm font-bold", req.status === 'REJECTED' ? "text-red-900" : "text-emerald-900")}>
                    {req.secretaryId === (session?.user as any)?.id 
                      ? (
                        req.status === 'REJECTED' 
                          ? `Your request for "${req.eventTitle}" was rejected.` 
                          : req.status === 'COORDINATOR_APPROVED' 
                            ? `Coordinator approved your request for "${req.eventTitle}".`
                            : `Your request for "${req.eventTitle}" has been fully approved!`
                      )
                      : `New booking "${req.eventTitle}" added to shared calendar`}
                  </p>
                  <p className={clsx("text-xs font-medium", req.status === 'REJECTED' ? "text-red-600" : "text-emerald-600")}>
                    {req.status === 'REJECTED' 
                      ? 'Please check the coordinator\'s notes for feedback.' 
                      : req.status === 'COORDINATOR_APPROVED'
                        ? 'Awaiting final approval from the ICT Director.'
                        : 'You can now view and print the official requisition letter from the requests page.'}
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className={req.status === 'REJECTED' ? "text-red-300" : "text-emerald-300"} />
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Requests"   value={total}    icon={FileCheck2}  color="bg-emerald-50 text-emerald-600"   />
        <StatCard label="Pending"          value={pending}  icon={Clock}       color="bg-amber-50 text-amber-600" />
        <StatCard label="Fully Approved"   value={approved} icon={CheckCircle2} color="bg-green-100 text-green-700" />
        <StatCard label="Rejected"         value={rejected} icon={XCircle}     color="bg-red-50 text-red-500"     />
      </div>

      {/* Service breakdown */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { type: 'PHOTO', label: 'Photo Documentation', count: stats.photoCount, icon: Camera },
          { type: 'VIDEO', label: 'Video Documentation', count: stats.videoCount, icon: Video },
          { type: 'BOTH',  label: 'Photo + Video', count: stats.bothCount, icon: Layers },
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

      {/* Recent Requests */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Recent Requests</h3>
          <a href="/requests" className="text-sm text-blue-600 hover:underline font-medium">View all</a>
        </div>
        <div className="divide-y divide-slate-50">
          {recent.map((req: any) => (
            <div key={req.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
              <div>
                <p className="font-medium text-slate-800 text-sm">{req.eventTitle}</p>
                <p className="text-xs text-slate-400 mt-0.5">{req.school} · {req.secretary?.name || req.requestedBy} · {new Date(req.eventDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <span className={`status-badge ${getStatusColor(req.status)}`}>
                {getStatusLabel(req.status)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
