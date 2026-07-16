import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Inbox,
  Route,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'

import {
  getAnalyticsPeriodLabel,
  getAnalyticsSnapshot,
  parseAnalyticsFilters,
  SCHOOL_LABELS,
  SCHOOLS,
} from '@/lib/analytics'
import { requireRoleAccess } from '@/lib/security'

type Metric = {
  label: string
  value: number
}

function getMaxValue(data: Metric[]) {
  return Math.max(...data.map(item => item.value), 1)
}

function formatTurnaround(hours: number | null) {
  if (hours === null) return 'No approvals yet'
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`
  return `${(hours / 24).toFixed(1)} days`
}

function BarChart({
  data,
  colorClass,
  emptyLabel = 'No records match the selected period.',
}: {
  data: Metric[]
  colorClass: string
  emptyLabel?: string
}) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-slate-400">{emptyLabel}</p>
  }

  const max = getMaxValue(data)

  return (
    <div className="space-y-3" role="list" aria-label="Analytics bar chart">
      {data.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" role="listitem">
          <div className="flex items-center justify-between gap-3 sm:w-36 sm:flex-shrink-0">
            <span className="truncate text-xs text-slate-500 sm:text-right" title={label}>{label}</span>
            <span className="text-xs font-bold text-slate-700 sm:hidden">{value}</span>
          </div>
          <div
            className="h-5 flex-1 overflow-hidden rounded-full bg-slate-100"
            aria-label={`${label}: ${value}`}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
            role="progressbar"
          >
            <div
              className={`h-full rounded-full ${colorClass}`}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
          <span className="hidden w-10 text-right text-xs font-bold text-slate-700 sm:block">{value}</span>
        </div>
      ))}
    </div>
  )
}

function DonutRing({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  let cumulative = 0
  const radius = 58
  const center = 76
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <svg
        className="h-40 w-40 shrink-0"
        viewBox="0 0 152 152"
        role="img"
        aria-label={`Status breakdown with ${total} requests`}
      >
        {total === 0 ? (
          <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="18" className="text-slate-200" />
        ) : (
          segments.map(segment => {
            const ratio = segment.value / total
            const dash = ratio * circumference
            const offset = -cumulative * circumference
            cumulative += ratio

            return (
              <circle
                key={segment.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="18"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '76px 76px' }}
              />
            )
          })
        )}
        <text x={center} y={center - 2} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="bold" className="fill-slate-800 dark:fill-[#f1f5f9]">
          {total}
        </text>
        <text x={center} y={center + 17} textAnchor="middle" fontSize="10" className="fill-slate-400 dark:fill-[#8b98a9]">
          requests
        </text>
      </svg>

      <div className="min-w-0 flex-1 space-y-2" role="list" aria-label="Status breakdown details">
        {segments.map(segment => (
          <div key={segment.label} className="flex items-center gap-2 text-sm" role="listitem">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: segment.color }} />
            <span className="truncate text-slate-500">{segment.label}</span>
            <span className="ml-auto pl-3 font-bold text-slate-700">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  iconClassName,
}: {
  label: string
  value: string | number
  detail: string
  icon: typeof Inbox
  iconClassName: string
}) {
  return (
    <div className="card flex min-h-32 items-start gap-4 p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
      </div>
    </div>
  )
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireRoleAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], {
    nextPath: '/analytics',
  })
  const filters = parseAnalyticsFilters(await searchParams)
  const analytics = await getAnalyticsSnapshot(session.user, filters)
  const hasFilters = !!(filters.from || filters.to || filters.school)
  const periodLabel = getAnalyticsPeriodLabel(filters)
  const statusColors: Record<string, string> = {
    'Fully Approved': '#2dd4bf',
    'Coord. Approved': '#6366f1',
    Pending: '#f5a524',
    Rejected: '#d946ef',
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">CMAC Analytics</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-slate-800">Request Performance</h2>
          <p className="mt-1 text-sm text-slate-500">Operational trends from current CMAC service-request data.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reporting period</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">{periodLabel}</p>
        </div>
      </header>

      <form action="/analytics" method="get" className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end">
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">From event date</span>
            <input type="date" name="from" defaultValue={filters.from ?? ''} max={filters.to} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">To event date</span>
            <input type="date" name="to" defaultValue={filters.to ?? ''} min={filters.from} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">School</span>
            <select name="school" defaultValue={filters.school ?? ''} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
              <option value="">All schools</option>
              {SCHOOLS.map(school => <option key={school} value={school}>{SCHOOL_LABELS[school]}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            {hasFilters ? (
              <Link href="/analytics" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear</Link>
            ) : null}
            <button type="submit" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">Apply</button>
          </div>
        </div>
      </form>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="CMAC request metrics">
        <SummaryMetric label="Total Requests" value={analytics.totalRequests} detail="Requests in the selected event-date period" icon={Inbox} iconClassName="bg-sky-50 text-sky-700" />
        <SummaryMetric label="Approval Rate" value={`${analytics.approvalRate}%`} detail="Director-approved share of decided requests" icon={CheckCircle2} iconClassName="bg-emerald-50 text-emerald-700" />
        <SummaryMetric label="Pending Review" value={analytics.pendingReview} detail="Coordinator or director action still required" icon={Clock3} iconClassName="bg-amber-50 text-amber-700" />
        <SummaryMetric label="Upcoming Events" value={analytics.upcomingEvents} detail="Approved events scheduled in the next 30 days" icon={CalendarClock} iconClassName="bg-indigo-50 text-indigo-700" />
      </section>

      <section className="card overflow-hidden" aria-labelledby="attention-heading">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 id="attention-heading" className="font-semibold text-slate-800">Operational Attention</h3>
          <p className="mt-0.5 text-xs text-slate-400">Items that may affect routing, event readiness, or review speed.</p>
        </div>
        <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          {[
            { label: 'Overdue reviews', value: analytics.overdueReview, detail: 'Event date passed before a final decision', icon: AlertTriangle, tone: 'bg-red-50 text-red-700' },
            { label: 'Needs routing', value: analytics.unassignedService, detail: 'No CMAC or PMAC service route selected', icon: Route, tone: 'bg-amber-50 text-amber-700' },
            { label: 'Same-day needs', value: analytics.sameDayRequirements, detail: 'Requests needing same-day photo or editing', icon: Sparkles, tone: 'bg-purple-50 text-purple-700' },
            { label: 'Approval turnaround', value: formatTurnaround(analytics.averageApprovalHours), detail: 'Average submission-to-director approval time', icon: Clock3, tone: 'bg-sky-50 text-sky-700' },
          ].map(({ label, value, detail, icon: Icon, tone }) => (
            <div key={label} className="flex min-h-28 gap-3 p-4">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon size={16} /></span>
              <div>
                <p className="text-lg font-bold text-slate-800">{value}</p>
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <div>
            <h3 className="font-semibold text-slate-800">Status Breakdown</h3>
            <p className="mt-0.5 text-xs text-slate-400">Current workflow outcome for the selected period</p>
          </div>
          <DonutRing segments={analytics.statusBreakdown.map(segment => ({ ...segment, color: statusColors[segment.label] ?? '#8b98a9' }))} />
        </section>

        <section className="card space-y-4 p-5">
          <div>
            <h3 className="font-semibold text-slate-800">Monthly Event Volume</h3>
            <p className="mt-0.5 text-xs text-slate-400">Latest 12 active months within the selected period</p>
          </div>
          <BarChart data={analytics.byMonth} colorClass="bg-amber-400" />
        </section>

        <section className="card space-y-4 p-5">
          <div>
            <h3 className="font-semibold text-slate-800">Requests by School</h3>
            <p className="mt-0.5 text-xs text-slate-400">Only schools with matching requests are shown</p>
          </div>
          <BarChart data={analytics.bySchool} colorClass="bg-sky-500" />
        </section>

        <section className="card space-y-5 p-5">
          <div>
            <h3 className="font-semibold text-slate-800">Coverage Mix</h3>
            <p className="mt-0.5 text-xs text-slate-400">Service routing and requested documentation</p>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Service Route</p>
            <BarChart data={analytics.serviceTypeBreakdown} colorClass="bg-indigo-500" />
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Documentation</p>
            <BarChart data={analytics.documentationBreakdown} colorClass="bg-violet-400" />
          </div>
        </section>
      </div>
    </div>
  )
}
