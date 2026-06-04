'use client'
import { School } from '@/types'

const SCHOOLS: School[] = ['SNAHS', 'SBAHM', 'SITE', 'SASTE', 'MEDICINE', 'BEU', 'UNIVERSITY', 'HR']
const SCHOOL_LABELS: Record<School, string> = {
  SNAHS: 'SNAHS',
  SBAHM: 'SBAHM',
  SITE: 'SITE',
  SASTE: 'SASTE',
  MEDICINE: 'SOM',
  BEU: 'BEU',
  UNIVERSITY: 'UNIVERSITY',
  HR: 'HR',
}

function BarChart({ data, max, colorClass }: { data: { label: string; value: number }[]; max: number; colorClass: string }) {
  return (
    <div className="space-y-3">
      {data.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-36 text-xs text-slate-500 text-right flex-shrink-0 truncate">{label}</span>
          <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${colorClass} transition-all duration-700`}
              style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }}
            />
          </div>
          <span className="w-5 text-xs font-bold text-slate-700">{value}</span>
        </div>
      ))}
    </div>
  )
}

function DonutRing({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  let cumulative = 0
  const radius = 60
  const cx = 80; const cy = 80
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {total === 0
          ? <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="20" />
          : segments.map((seg, i) => {
              const ratio = seg.value / total
              const dash = ratio * circumference
              const offset = -cumulative * circumference
              cumulative += ratio
              return (
                <circle
                  key={i}
                  cx={cx} cy={cy} r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="20"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px' }}
                />
              )
            })
        }
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-lg font-bold" fill="#1e293b" fontSize="22" fontWeight="bold">{total}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill="#94a3b8" fontSize="10">total</text>
      </svg>
      <div className="space-y-2">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-slate-500">{s.label}</span>
            <span className="font-bold text-slate-700 ml-auto pl-4">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

import { getRequests } from '../requests/actions'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export default function AnalyticsPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRequests().then(data => {
      setRequests(data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-10 text-center text-slate-400">Loading analytics...</div>

  if (user && !['CMAC_COORDINATOR', 'ICT_DIRECTOR'].includes(user.role)) {
    return (
      <div className="p-20 text-center space-y-4 animate-fade-in">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 font-bold text-2xl">!</div>
        <h2 className="text-2xl font-black text-slate-800">Access Denied</h2>
        <p className="text-slate-500">You do not have permission to view the Analytics dashboard.</p>
      </div>
    )
  }

  // By school
  const bySchool = SCHOOLS.map(s => ({
    label: SCHOOL_LABELS[s],
    value: requests.filter(r => r.school === s).length
  }))
  const maxSchool = Math.max(...bySchool.map(x => x.value), 1)

  // By service
  const cmac = requests.filter(r => r.serviceType === 'CMAC').length
  const pmac = requests.filter(r => r.serviceType === 'PMAC').length
  const unassigned = requests.filter(r => !r.serviceType).length

  // By doc type
  const photo = requests.filter(r => r.documentationType === 'PHOTO').length
  const video = requests.filter(r => r.documentationType === 'VIDEO').length
  const both  = requests.filter(r => r.documentationType === 'BOTH').length

  // By status
  const pending  = requests.filter(r => r.status === 'PENDING').length
  const coordApp = requests.filter(r => r.status === 'COORDINATOR_APPROVED').length
  const dirApp   = requests.filter(r => r.status === 'DIRECTOR_APPROVED').length
  const rejected = requests.filter(r => r.status === 'REJECTED').length

  // Approval rate
  const approvalRate = requests.length > 0 ? Math.round((dirApp / requests.length) * 100) : 0

  // Monthly breakdown (by event date)
  const monthCounts: Record<string, number> = {}
  requests.forEach(r => {
    const m = new Date(r.eventDate).toLocaleString('en-PH', { month: 'short', year: '2-digit' })
    monthCounts[m] = (monthCounts[m] ?? 0) + 1
  })
  const byMonth = Object.entries(monthCounts).map(([label, value]) => ({ label, value }))
  const maxMonth = Math.max(...byMonth.map(x => x.value), 1)

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests', value: requests.length, sub: 'All time', bg: 'bg-[#172554]', text: 'text-white', sub2: 'text-blue-200' },
          { label: 'Approval Rate', value: `${approvalRate}%`, sub: 'Director approved', bg: 'bg-emerald-500', text: 'text-white', sub2: 'text-emerald-100' },
          { label: 'Pending Review', value: pending + coordApp, sub: 'Needs action', bg: 'bg-amber-400', text: 'text-amber-900', sub2: 'text-amber-700' },
          { label: 'Rejected', value: rejected, sub: 'Not approved', bg: 'bg-red-500', text: 'text-white', sub2: 'text-red-100' },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl p-5 ${k.bg} ${k.text} border border-slate-100`}>
            <p className="text-3xl font-bold">{k.value}</p>
            <p className="text-sm font-semibold mt-1">{k.label}</p>
            <p className={`text-xs mt-0.5 ${k.sub2}`}>{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* By School */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-slate-800">Requests by School</h3>
          <BarChart data={bySchool} max={maxSchool} colorClass="bg-[#1e3a8a]" />
        </div>

        {/* Status Donut */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-slate-800">Status Breakdown</h3>
          <DonutRing segments={[
            { label: 'Fully Approved', value: dirApp,   color: '#10b981' },
            { label: 'Coord. Approved', value: coordApp, color: '#3b82f6' },
            { label: 'Pending',         value: pending,  color: '#f59e0b' },
            { label: 'Rejected',        value: rejected, color: '#ef4444' },
          ]} />
        </div>

        {/* Service & Doc Type */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-slate-800">Service Type</h3>
          <BarChart
            data={[{ label: 'CMAC', value: cmac }, { label: 'PMAC', value: pmac }, { label: 'Unassigned', value: unassigned }]}
            max={Math.max(cmac, pmac, unassigned, 1)}
            colorClass="bg-indigo-500"
          />
          <hr className="border-slate-100" />
          <h3 className="font-semibold text-slate-800">Documentation Type</h3>
          <BarChart
            data={[{ label: 'Photo', value: photo }, { label: 'Video', value: video }, { label: 'Both', value: both }]}
            max={Math.max(photo, video, both, 1)}
            colorClass="bg-violet-400"
          />
        </div>

        {/* Monthly */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-slate-800">Events by Month</h3>
          {byMonth.length > 0
            ? <BarChart data={byMonth} max={maxMonth} colorClass="bg-amber-400" />
            : <p className="text-sm text-slate-400">No data available.</p>
          }
        </div>
      </div>
    </div>
  )
}
