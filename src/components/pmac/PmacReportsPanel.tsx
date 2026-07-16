'use client'

import { BarChart3, CalendarRange, Download, Filter, LoaderCircle, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { PMAC_ATTENDANCE_LABELS, PMAC_EXECUTIVE_TITLE_LABELS, PMAC_EXECUTIVE_TITLES } from '@/lib/pmac'
import { PMAC_DEPARTMENTS } from '@/lib/pmacMembers'
import { describePmacReportPeriod, PMAC_REPORT_STATUSES, type PmacReportFilters } from '@/lib/pmacReportFilters'
import type { PmacReportAnalytics, PmacReportCounts } from '@/lib/pmacReports'
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

type ReportFilterForm = {
  from: string
  to: string
  status: string
  branch: string
  department: string
  subject: string
}

const EMPTY_FILTERS: ReportFilterForm = {
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
  counts,
  analytics,
  appliedFilters,
}: {
  title: string
  description: string
  stats: ReportStats
  filterOptions: ReportFilterOptions
  counts: PmacReportCounts
  analytics: PmacReportAnalytics
  appliedFilters: PmacReportFilters
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [downloadingTypes, setDownloadingTypes] = useState<string[]>([])
  const [filters, setFilters] = useState<ReportFilterForm>({ ...EMPTY_FILTERS, ...appliedFilters })
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<'attendance' | 'coverage' | 'projects' | 'members'>('attendance')
  const [isApplyingFilters, setIsApplyingFilters] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setFilters({ ...EMPTY_FILTERS, ...appliedFilters })
    setIsApplyingFilters(false)
  }, [appliedFilters])

  function buildReportUrl(type?: string) {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    for (const [key, value] of Object.entries(appliedFilters)) {
      if (value) {
        params.set(key, value)
      }
    }

    return type ? `/api/exports/pmac?${params.toString()}` : params.toString()
  }

  async function authorizeReport(type: string) {
    const response = await fetch(buildReportUrl(type), {
      method: 'HEAD',
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(response.status === 428 ? 'Zero trust verification required' : 'Failed to authorize PMAC report download.')
    }

    return response
  }

  async function downloadReport(type: string) {
    setDownloadingTypes((current) => [...new Set([...current, type])])
    setMessage(null)

    try {
      await runWithReverification(() => authorizeReport(type))
      const link = document.createElement('a')
      link.href = buildReportUrl(type)
      document.body.appendChild(link)
      link.click()
      link.remove()
      setMessage({ type: 'success', text: 'PMAC report download started.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to download PMAC report.' })
    } finally {
      setDownloadingTypes((current) => current.filter((entry) => entry !== type))
    }
  }

  function updateFilter(field: keyof ReportFilterForm, value: string) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function applyFilters(nextFilters = filters) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) params.set(key, value)
    }
    setIsApplyingFilters(true)
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname)
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    applyFilters(EMPTY_FILTERS)
  }

  const hasFilters = Object.values(appliedFilters).some(Boolean)
  const hasPendingFilters = JSON.stringify(filters) !== JSON.stringify({ ...EMPTY_FILTERS, ...appliedFilters })
  const reportingPeriod = describePmacReportPeriod(appliedFilters)
  const trendMaximum = Math.max(1, ...analytics.trends.map((trend) => trend.assignments + trend.reliableAttendance + trend.absences))

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Reports</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
        <p className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
          <CalendarRange size={14} />
          Reporting period: {reportingPeriod}
        </p>
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
          {hasFilters || Object.values(filters).some(Boolean) ? (
            <button
              type="button"
              onClick={clearFilters}
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
        <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled={!hasPendingFilters || isApplyingFilters}
            onClick={() => applyFilters()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplyingFilters ? <LoaderCircle size={15} className="animate-spin" /> : <Filter size={15} />}
            {isApplyingFilters ? 'Applying...' : 'Apply Filters'}
          </button>
        </div>
      </section>

      <section className="card overflow-hidden" aria-labelledby="report-analytics-heading">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 id="report-analytics-heading" className="flex items-center gap-2 font-semibold text-slate-800">
              <BarChart3 size={17} className="text-slate-400" />
              Report Analytics
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">Filtered snapshot for {reportingPeriod.toLowerCase()}.</p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Report analytics views">
            {([
              ['attendance', 'Attendance'],
              ['coverage', 'Event Coverage'],
              ['projects', 'Projects'],
              ['members', 'Members'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeAnalyticsTab === value}
                onClick={() => setActiveAnalyticsTab(value)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeAnalyticsTab === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeAnalyticsTab === 'attendance' ? (
          <div className="divide-y divide-slate-100">
            {analytics.attendance.map((entry) => (
              <div key={entry.status} className="grid grid-cols-[minmax(110px,1fr)_minmax(120px,3fr)_auto] items-center gap-4 px-5 py-3">
                <span className="text-sm font-semibold text-slate-700">{PMAC_ATTENDANCE_LABELS[entry.status as keyof typeof PMAC_ATTENDANCE_LABELS]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={`block h-full rounded-full ${entry.status === 'ABSENT' ? 'bg-red-500' : entry.status === 'LATE' ? 'bg-amber-500' : 'bg-emerald-600'}`}
                    style={{ width: `${entry.percentage}%` }}
                  />
                </span>
                <span className="text-right text-xs font-bold text-slate-600">{entry.count} · {entry.percentage}%</span>
              </div>
            ))}
            {!analytics.attendance.some((entry) => entry.count) ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No attendance records match these filters.</p>
            ) : null}
          </div>
        ) : null}

        {activeAnalyticsTab === 'coverage' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-bold">Event</th>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 text-center font-bold">Assigned</th>
                  <th className="px-4 py-3 text-center font-bold">Pending</th>
                  <th className="px-5 py-3 text-right font-bold">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.coverage.map((event) => (
                  <tr key={event.id}>
                    <td className="max-w-[280px] truncate px-5 py-3 font-semibold text-slate-700">{event.title}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(event.startsAt).toLocaleDateString('en-PH')}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{event.assigned}/{event.recommended || event.assigned}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{event.pending}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-700">{event.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!analytics.coverage.length ? <p className="px-5 py-8 text-center text-sm text-slate-400">No events match these filters.</p> : null}
          </div>
        ) : null}

        {activeAnalyticsTab === 'projects' ? (
          <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="p-5">
              <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Completion by Branch</h4>
              <div className="mt-4 space-y-4">
                {analytics.projectBranches.map((branch) => (
                  <div key={branch.branch}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-700">{branch.label}</span>
                      <span className="text-slate-500">{branch.completed}/{branch.total} · {branch.percentage}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${branch.percentage}%` }} />
                    </div>
                  </div>
                ))}
                {!analytics.projectBranches.length ? <p className="text-sm text-slate-400">No projects match these filters.</p> : null}
              </div>
            </div>
            <div className="p-5">
              <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Overdue Work</h4>
              <div className="mt-3 divide-y divide-slate-100">
                {analytics.overdue.map((item) => (
                  <div key={`${item.type}:${item.id}`} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-700">{item.label}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{item.type === 'MILESTONE' ? `${item.projectTitle} · Milestone` : 'Project deadline'}</p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-red-600">{item.daysOverdue}d overdue</span>
                  </div>
                ))}
                {!analytics.overdue.length ? <p className="text-sm text-slate-400">No overdue projects or milestones.</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeAnalyticsTab === 'members' ? (
          <div>
            <div className="border-b border-slate-100 px-5 py-4">
              <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Workload & Reliability Trend</h4>
              <div className="mt-4 flex h-32 items-end gap-3 overflow-x-auto">
                {analytics.trends.map((trend) => {
                  const total = trend.assignments + trend.reliableAttendance + trend.absences
                  return (
                    <div key={trend.key} className="flex min-w-16 flex-1 flex-col items-center gap-2">
                      <div className="flex h-24 w-7 items-end overflow-hidden rounded-t bg-slate-100" title={`${trend.assignments} assignments, ${trend.reliableAttendance} reliable attendance, ${trend.absences} absences`}>
                        <div className="w-full bg-emerald-600" style={{ height: `${Math.max(4, (total / trendMaximum) * 100)}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{trend.label}</span>
                    </div>
                  )
                })}
                {!analytics.trends.length ? <p className="self-center text-sm text-slate-400">No trend data matches these filters.</p> : null}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-bold">Member</th>
                    <th className="px-4 py-3 font-bold">Department</th>
                    <th className="px-4 py-3 text-center font-bold">Assignments</th>
                    <th className="px-4 py-3 text-center font-bold">Attendance</th>
                    <th className="px-5 py-3 text-right font-bold">Absences</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-5 py-3 font-semibold text-slate-700">{member.name}</td>
                      <td className="px-4 py-3 text-slate-500">{member.department || 'Not set'}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{member.assignments}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-600">{member.attendanceRate}%</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-600">{member.absences}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
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
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{counts[report.type]} matching</span>
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
