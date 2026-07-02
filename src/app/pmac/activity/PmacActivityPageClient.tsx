'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { FileClock, Search } from 'lucide-react'

import { filterPmacActivity } from '@/lib/pmacFilters'

type ActivityEntry = {
  id: string
  entityType: string
  entityId: string
  eventId: string | null
  pollId: string | null
  memberId: string | null
  actorName: string
  actorRole: string
  actorRoleLabel: string
  action: string
  summary: string
  details: string | null
  createdAt: Date
  href: string
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PmacActivityPageClient({
  entries,
  title,
  description,
}: {
  entries: ActivityEntry[]
  title: string
  description: string
}) {
  const [query, setQuery] = useState('')
  const [entityType, setEntityType] = useState('ALL')

  const filteredEntries = useMemo(
    () => filterPmacActivity(entries, query, entityType),
    [entries, query, entityType]
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Activity</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-[1.4fr_0.7fr]">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search size={16} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search summary, actor, or details"
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
            />
          </label>

          <select
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All activity</option>
            <option value="EVENT">Events</option>
            <option value="POLL">Polls</option>
            <option value="MEMBER">Members</option>
            <option value="ACCOUNT">Accounts</option>
            <option value="ATTACHMENT">Attachments</option>
            <option value="REPORT">Reports</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-800">Activity Timeline</h3>
          <p className="mt-1 text-xs text-slate-400">{filteredEntries.length} matching record(s)</p>
        </div>

        {filteredEntries.length ? (
          <div className="divide-y divide-slate-50">
            {filteredEntries.map((entry) => (
              <Link
                key={entry.id}
                href={entry.href}
                className="flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-slate-50 md:flex-row md:items-start md:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="status-badge bg-slate-100 text-slate-700 border-slate-200">{entry.entityType}</span>
                    <span className="status-badge bg-emerald-50 text-emerald-700 border-emerald-200">{entry.action.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{entry.summary}</p>
                  {entry.details ? (
                    <p className="text-sm leading-6 text-slate-500">{entry.details}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    {entry.actorName} · {entry.actorRoleLabel}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <FileClock size={14} />
                  {formatDateTime(entry.createdAt)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-slate-500">No activity matched the current filters.</div>
        )}
      </div>
    </div>
  )
}
