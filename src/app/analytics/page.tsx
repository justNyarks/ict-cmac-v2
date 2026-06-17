import { getAnalyticsSnapshot } from '@/lib/analytics'
import { requireRoleAccess } from '@/lib/security'

type Metric = {
  label: string
  value: number
}

function getMaxValue(data: Metric[]) {
  return Math.max(...data.map(item => item.value), 1)
}

function BarChart({
  data,
  max,
  colorClass,
}: {
  data: Metric[]
  max: number
  colorClass: string
}) {
  return (
    <div className="space-y-3" role="list" aria-label="Analytics bar chart">
      {data.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" role="listitem">
          <div className="flex items-center justify-between gap-3 sm:w-40 sm:flex-shrink-0">
            <span className="text-xs text-slate-500 sm:text-right">{label}</span>
            <span className="text-xs font-bold text-slate-700 sm:hidden">{value}</span>
          </div>
          <div
            className="h-6 flex-1 overflow-hidden rounded-full bg-slate-100"
            aria-label={`${label}: ${value}`}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
            role="progressbar"
          >
            <div
              className={`h-full rounded-full ${colorClass} transition-all duration-700`}
              style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }}
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
  const radius = 60
  const center = 80
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
      <svg
        width="160"
        height="160"
        viewBox="0 0 160 160"
        role="img"
        aria-label={`Status breakdown donut chart with ${total} total requests`}
      >
        {total === 0 ? (
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="20" />
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
                strokeWidth="20"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px' }}
              />
            )
          })
        )}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#1e293b"
          fontSize="22"
          fontWeight="bold"
        >
          {total}
        </text>
        <text x={center} y={center + 18} textAnchor="middle" fill="#94a3b8" fontSize="10">
          total
        </text>
      </svg>

      <div className="space-y-2" role="list" aria-label="Status breakdown details">
        {segments.map(segment => (
          <div key={segment.label} className="flex items-center gap-2 text-sm" role="listitem">
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: segment.color }} />
            <span className="text-slate-500">{segment.label}</span>
            <span className="ml-auto pl-4 font-bold text-slate-700">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function AnalyticsPage() {
  const session = await requireRoleAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], {
    nextPath: '/analytics',
    zeroTrust: true,
  })
  const analytics = await getAnalyticsSnapshot(session.user)

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: 'Total Requests',
            value: analytics.totalRequests,
            sub: 'All time',
            bg: 'bg-[#172554]',
            text: 'text-white',
            sub2: 'text-blue-200',
          },
          {
            label: 'Approval Rate',
            value: `${analytics.approvalRate}%`,
            sub: 'Director approved',
            bg: 'bg-emerald-500',
            text: 'text-white',
            sub2: 'text-emerald-100',
          },
          {
            label: 'Pending Review',
            value: analytics.pendingReview,
            sub: 'Needs action',
            bg: 'bg-amber-400',
            text: 'text-amber-900',
            sub2: 'text-amber-700',
          },
          {
            label: 'Rejected',
            value: analytics.rejected,
            sub: 'Not approved',
            bg: 'bg-red-500',
            text: 'text-white',
            sub2: 'text-red-100',
          },
        ].map(card => (
          <div key={card.label} className={`rounded-2xl border border-slate-100 p-5 ${card.bg} ${card.text}`}>
            <p className="text-3xl font-bold">{card.value}</p>
            <p className="mt-1 text-sm font-semibold">{card.label}</p>
            <p className={`mt-0.5 text-xs ${card.sub2}`}>{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800">Requests by School</h3>
          <BarChart data={analytics.bySchool} max={getMaxValue(analytics.bySchool)} colorClass="bg-[#1e3a8a]" />
        </div>

        <div className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800">Status Breakdown</h3>
          <DonutRing
            segments={[
              { label: 'Fully Approved', value: analytics.statusBreakdown[0].value, color: '#10b981' },
              { label: 'Coord. Approved', value: analytics.statusBreakdown[1].value, color: '#3b82f6' },
              { label: 'Pending', value: analytics.statusBreakdown[2].value, color: '#f59e0b' },
              { label: 'Rejected', value: analytics.statusBreakdown[3].value, color: '#ef4444' },
            ]}
          />
        </div>

        <div className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800">Service Type</h3>
          <BarChart
            data={analytics.serviceTypeBreakdown}
            max={getMaxValue(analytics.serviceTypeBreakdown)}
            colorClass="bg-indigo-500"
          />
          <hr className="border-slate-100" />
          <h3 className="font-semibold text-slate-800">Documentation Type</h3>
          <BarChart
            data={analytics.documentationBreakdown}
            max={getMaxValue(analytics.documentationBreakdown)}
            colorClass="bg-violet-400"
          />
        </div>

        <div className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800">Events by Month</h3>
          {analytics.byMonth.length > 0 ? (
            <BarChart data={analytics.byMonth} max={getMaxValue(analytics.byMonth)} colorClass="bg-amber-400" />
          ) : (
            <p className="text-sm text-slate-400">No data available.</p>
          )}
        </div>
      </div>
    </div>
  )
}
