'use client'

import { Download, Filter, LoaderCircle, X } from 'lucide-react'
import { useState } from 'react'

import { PMAC_EXECUTIVE_TITLE_LABELS, PMAC_EXECUTIVE_TITLES } from '@/lib/pmac'
import { PMAC_DEPARTMENTS } from '@/lib/pmacMembers'
import { PMAC_REPORT_STATUSES } from '@/lib/pmacReportFilters'
import { runWithReverification } from '@/lib/reverificationClient'

type ReportStats = {
  members: number
  activeMembers: number
  events: number
  importedEvents: number
  openPolls: number
  polls: number
  pendingResponses: number
  upcomingEvents: number
  understaffedUpcoming: number
  attendanceGaps: number
  attachments: number
  activity: number
  archivedActivity: number
  attendanceRecords: number
  attendanceRate: number
  averageReadinessScore: number
  reliableMembers: number
  incompleteMemberProfiles: number
  overloadedMembers: number
  wrapUpsPending: number
  projects: number
  activeProjects: number
  onHoldProjects: number
  completedProjects: number
  overdueProjects: number
  projectCompletionRate: number
}

type ReportFilterOptions = {
  events: Array<{ id: string; title: string }>
  projects: Array<{ id: string; title: string }>
}

type ReportFilters = {
  from: string
  to: string
  status: string
  branch: string
  department: string
  subject: string
}

const EMPTY_FILTERS: ReportFilters = {
  from: '',
  to: '',
  status: '',
  branch: '',
  department: '',
  subject: '',
}

const REPORT_LINKS = [
  { type: 'members', label: 'Member Directory Export', description: 'Roster, account role, active status, and password-reset flags.' },
  { type: 'events', label: 'Event Operations Export', description: 'Event lifecycle, source metadata, staffing counts, attendance, and attachments.' },
  { type: 'projects', label: 'Project Operations Export', description: 'Project status, branch head, assigned team, milestone completion, outputs, and links.' },
  { type: 'staffing', label: 'Duty Assignment Export', description: 'Upcoming event coverage gaps, pending responses, and member workload snapshots.' },
  { type: 'performance', label: 'Member Performance Export', description: 'Attendance reliability, recent workload, and duty history for PMAC staffing decisions.' },
  { type: 'attendance', label: 'Attendance Register Export', description: 'Event attendance by member, assigned duty, status, recorder, and timestamp.' },
  { type: 'polls', label: 'Poll Governance Export', description: 'Poll status, linked events, votes cast, and attachment totals.' },
  { type: 'activity', label: 'Activity Audit Export', description: 'Current and archived PMAC actions with structured change history.' },
] as const

export default function PmacReportsPanel({
  title,
  description,
  stats,
  filterOptions,
}: {
  title: string
  description: string
  stats: ReportStats
  filterOptions: ReportFilterOptions
}) {
  const [downloadingTypes, setDownloadingTypes] = useState<string[]>([])
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function fetchReport(type: string) {
    const params = new URLSearchParams({ type })
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value)
      }
    }

    const response = await fetch(`/api/exports/pmac?${params.toString()}`, {
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
    setDownloadingTypes((current) => [...new Set([...current, type])])
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
      setDownloadingTypes((current) => current.filter((entry) => entry !== type))
    }
  }

  function updateFilter(field: keyof ReportFilters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function getReportCount(type: string) {
    switch (type) {
      case 'members':
        return stats.members
      case 'events':
        return stats.events
      case 'projects':
        return stats.projects
      case 'polls':
        return stats.polls
      case 'activity':
        return stats.activity
      case 'attendance':
        return stats.attendanceRecords
      case 'performance':
        return stats.activeMembers
      case 'staffing':
        return stats.upcomingEvents + stats.activeMembers
      default:
        return 0
    }
  }

  const hasFilters = Object.values(filters).some(Boolean)

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
          {stats.incompleteMemberProfiles > 0 ? (
            <p className="mt-1 text-xs font-semibold text-amber-700">{stats.incompleteMemberProfiles} profiles need department/course updates</p>
          ) : null}
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Events</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.events}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.importedEvents} imported from CMAC · {stats.wrapUpsPending} wrap-ups pending</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Attendance</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.attendanceRate}%</p>
          <p className="mt-1 text-xs text-slate-500">{stats.attendanceRecords} records · {stats.attendanceGaps} recent event gaps</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Polls & Responses</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.openPolls}/{stats.polls}</p>
          <p className="mt-1 text-xs text-slate-500">Open polls · {stats.pendingResponses} pending assignment replies</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Audit Trail</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.activity}</p>
          <p className="mt-1 text-xs text-slate-500">
            {Math.max(0, stats.activity - stats.archivedActivity)} current · {stats.archivedActivity} archived · {stats.attachments} attachments
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Projects</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{stats.projectCompletionRate}%</p>
          <p className="mt-1 text-xs text-slate-500">
            {stats.completedProjects}/{stats.projects} completed · {stats.overdueProjects} overdue
          </p>
        </div>
      </div>

      <section className="card p-4" aria-labelledby="report-filters-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 id="report-filters-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter size={15} className="text-slate-400" />
              Report Filters
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">Applied to relevant exports and recorded in the CSV metadata.</p>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <X size={15} />
              Clear
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">From</span>
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => updateFilter('from', event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">To</span>
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => updateFilter('to', event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Status</span>
            <select
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All statuses</option>
              {PMAC_REPORT_STATUSES.map((status) => (
                <option key={status} value={status}>{status.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase())}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Department</span>
            <select
              value={filters.department}
              onChange={(event) => updateFilter('department', event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All departments</option>
              {PMAC_DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Executive branch</span>
            <select
              value={filters.branch}
              onChange={(event) => updateFilter('branch', event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All branches</option>
              {PMAC_EXECUTIVE_TITLES.map((branch) => <option key={branch} value={branch}>{PMAC_EXECUTIVE_TITLE_LABELS[branch]}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Event or project</span>
            <select
              value={filters.subject}
              onChange={(event) => updateFilter('subject', event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All records</option>
              <optgroup label="Events">
                {filterOptions.events.map((event) => <option key={event.id} value={`EVENT:${event.id}`}>{event.title}</option>)}
              </optgroup>
              <optgroup label="Projects">
                {filterOptions.projects.map((project) => <option key={project.id} value={`PROJECT:${project.id}`}>{project.title}</option>)}
              </optgroup>
            </select>
          </label>
        </div>
      </section>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-800">Exports</h3>
          <p className="mt-1 text-xs text-slate-400">Download PMAC-ready CSV reports for reporting, backups, and coordination reviews.</p>
          {message ? (
            <p role="status" className={`mt-3 text-xs font-semibold ${message.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
              {message.text}
            </p>
          ) : null}
        </div>
        <div className="divide-y divide-slate-50">
          {REPORT_LINKS.map((report) => {
            const isDownloading = downloadingTypes.includes(report.type)

            return (
              <button
                type="button"
                key={report.type}
                disabled={isDownloading}
                onClick={() => downloadReport(report.type)}
                className="flex w-full flex-col gap-3 px-6 py-5 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{report.label}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{getReportCount(report.type)} available</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{report.description}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                  {isDownloading ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
                  {isDownloading ? 'Preparing...' : 'Download CSV'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
