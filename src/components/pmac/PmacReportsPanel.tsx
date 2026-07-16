'use client'

import { useState } from 'react'

import { runWithReverification } from '@/lib/reverificationClient'

type ReportStats = {
  members: number
  activeMembers: number
  events: number
  importedEvents: number
  openPolls: number
  pendingResponses: number
  understaffedUpcoming: number
  attendanceGaps: number
  attachments: number
  activity: number
  averageReadinessScore: number
  reliableMembers: number
  overloadedMembers: number
  wrapUpsPending: number
  projects: number
  activeProjects: number
  onHoldProjects: number
  completedProjects: number
  overdueProjects: number
  projectCompletionRate: number
}

const REPORT_LINKS = [
  { type: 'members', label: 'Member Directory Export', description: 'Roster, account role, active status, and password-reset flags.' },
  { type: 'events', label: 'Event Operations Export', description: 'Event lifecycle, source metadata, staffing counts, attendance, and attachments.' },
  { type: 'projects', label: 'Project Operations Export', description: 'Project status, branch head, assigned team, milestone completion, outputs, and links.' },
  { type: 'staffing', label: 'Duty Assignment Export', description: 'Upcoming event coverage gaps, pending responses, and member workload snapshots.' },
  { type: 'performance', label: 'Member Performance Export', description: 'Attendance reliability, recent workload, and duty history for PMAC staffing decisions.' },
  { type: 'polls', label: 'Poll Governance Export', description: 'Poll status, linked events, votes cast, and attachment totals.' },
  { type: 'activity', label: 'Activity Audit Export', description: 'Recent PMAC actions for oversight, governance, and reliability tracking.' },
] as const

export default function PmacReportsPanel({
  title,
  description,
  stats,
}: {
  title: string
  description: string
  stats: ReportStats
}) {
  const [downloadingType, setDownloadingType] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function fetchReport(type: string) {
    const response = await fetch(`/api/exports/pmac?type=${type}`, {
      method: 'GET',
      credentials: 'include',
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error || (response.status === 428 ? 'Zero trust verification required' : 'Failed to download PMAC report.'))
    }

    return response
  }

  async function downloadReport(type: string) {
    setDownloadingType(type)
    setMessage(null)

    try {
      const response = await runWithReverification(() => fetchReport(type))
      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/i)
      const filename = filenameMatch?.[1] || `pmac-${type}-report.csv`
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: 'PMAC report downloaded.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to download PMAC report.' })
    } finally {
      setDownloadingType(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Reports</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Members</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.members}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.activeMembers} active accounts · {stats.reliableMembers} reliable</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Events</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.events}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.importedEvents} imported from CMAC · {stats.wrapUpsPending} wrap-ups pending</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Readiness</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.averageReadinessScore}%</p>
          <p className="mt-1 text-xs text-slate-500">{stats.understaffedUpcoming} upcoming events need staffing attention</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Operations</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.openPolls}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.pendingResponses} pending replies · {stats.overloadedMembers} high-load members</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Audit Trail</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.attachments}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.activity} activity entries · {stats.attendanceGaps} attendance gaps</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Projects</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.projectCompletionRate}%</p>
          <p className="mt-1 text-xs text-slate-500">
            {stats.completedProjects}/{stats.projects} completed · {stats.activeProjects} active · {stats.onHoldProjects} on hold · {stats.overdueProjects} overdue
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-800">Exports</h3>
          <p className="mt-1 text-xs text-slate-400">Download PMAC-ready CSV reports for reporting, backups, and coordination reviews.</p>
          {message ? (
            <p className={`mt-3 text-xs font-semibold ${message.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
              {message.text}
            </p>
          ) : null}
        </div>
        <div className="divide-y divide-slate-50">
          {REPORT_LINKS.map((report) => (
            <button
              type="button"
              key={report.type}
              disabled={!!downloadingType}
              onClick={() => downloadReport(report.type)}
              className="flex w-full flex-col gap-3 px-6 py-5 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{report.label}</p>
                <p className="mt-1 text-sm text-slate-500">{report.description}</p>
              </div>
              <span className="status-badge bg-emerald-50 text-emerald-700 border-emerald-200">
                {downloadingType === report.type ? 'Downloading...' : 'Download CSV'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
