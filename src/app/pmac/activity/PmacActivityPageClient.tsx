import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileClock,
  FileText,
  FolderKanban,
  ListChecks,
  Paperclip,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'

import {
  PMAC_ACTIVITY_ENTITY_TYPES,
  type PmacActivityEntityType,
  type PmacActivityFeedOptions,
} from '@/lib/pmacActivity'

type ActivityEntry = {
  id: string
  entityType: PmacActivityEntityType
  entityId: string
  eventId: string | null
  pollId: string | null
  projectId: string | null
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

type ActivityActor = {
  id: string
  name: string
}

type ActivityPagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const ENTITY_PRESENTATION: Record<PmacActivityEntityType, {
  label: string
  icon: LucideIcon
  iconClassName: string
}> = {
  EVENT: { label: 'Event', icon: CalendarDays, iconClassName: 'bg-sky-50 text-sky-700' },
  POLL: { label: 'Poll', icon: ListChecks, iconClassName: 'bg-violet-50 text-violet-700' },
  PROJECT: { label: 'Project', icon: FolderKanban, iconClassName: 'bg-emerald-50 text-emerald-700' },
  MEMBER: { label: 'Member', icon: Users, iconClassName: 'bg-cyan-50 text-cyan-700' },
  ACCOUNT: { label: 'Account', icon: ShieldCheck, iconClassName: 'bg-indigo-50 text-indigo-700' },
  ATTACHMENT: { label: 'Attachment', icon: Paperclip, iconClassName: 'bg-amber-50 text-amber-700' },
  REPORT: { label: 'Report', icon: FileText, iconClassName: 'bg-slate-100 text-slate-700' },
}

const ACRONYMS = new Set(['CMAC', 'CSV', 'ID', 'PMAC', 'URL'])

function formatAction(action: string) {
  return action.split('_').map((part) => {
    if (ACRONYMS.has(part)) {
      return part
    }

    return `${part.charAt(0)}${part.slice(1).toLowerCase()}`
  }).join(' ')
}

function getActionClassName(action: string) {
  if (/(DELETED|DECLINED|REJECTED|REMOVED|CANCELLED)/.test(action)) {
    return 'border-red-200 bg-red-50 text-red-700'
  }

  if (/(HOLD|DEADLINE|PENDING|OVERDUE)/.test(action)) {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (/(APPROVED|COMPLETED|CLOSED|DONE|SUBMITTED|CONFIRMED)/.test(action)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (/(ASSIGNED|TAGGED|INVITED|LAUNCHED|CREATED|UPLOADED|ATTACHED)/.test(action)) {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }

  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateGroup(value: Date | string) {
  return new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function groupEntries(entries: ActivityEntry[]) {
  const groups = new Map<string, ActivityEntry[]>()

  for (const entry of entries) {
    const label = formatDateGroup(entry.createdAt)
    const group = groups.get(label) ?? []
    group.push(entry)
    groups.set(label, group)
  }

  return Array.from(groups.entries())
}

function buildPageHref(basePath: string, filters: PmacActivityFeedOptions, page: number) {
  const params = new URLSearchParams()
  const values = {
    query: filters.query,
    entityType: filters.entityType,
    action: filters.action,
    actorId: filters.actorId,
    from: filters.from,
    to: filters.to,
  }

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value)
    }
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

export default function PmacActivityPageClient({
  entries,
  actions,
  actors,
  pagination,
  filters,
  basePath,
  title,
  description,
}: {
  entries: ActivityEntry[]
  actions: string[]
  actors: ActivityActor[]
  pagination: ActivityPagination
  filters: PmacActivityFeedOptions
  basePath: string
  title: string
  description: string
}) {
  const groupedEntries = groupEntries(entries)
  const hasFilters = !!(
    filters.query
    || filters.entityType
    || filters.action
    || filters.actorId
    || filters.from
    || filters.to
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
      <header className="space-y-1">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Activity</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </header>

      <form action={basePath} method="get" className="card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="md:col-span-2 xl:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Search</span>
            <span className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                type="search"
                name="query"
                defaultValue={filters.query ?? ''}
                maxLength={120}
                placeholder="Summary, actor, or action"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
              />
            </span>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Record type</span>
            <select
              name="entityType"
              defaultValue={filters.entityType ?? ''}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All types</option>
              {PMAC_ACTIVITY_ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{ENTITY_PRESENTATION[type].label}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Action</span>
            <select
              name="action"
              defaultValue={filters.action ?? ''}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>{formatAction(action)}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Actor</span>
            <select
              name="actorId"
              defaultValue={filters.actorId ?? ''}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All actors</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>{actor.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-1">
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-500">From</span>
              <input
                type="date"
                name="from"
                defaultValue={filters.from ?? ''}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-500">To</span>
              <input
                type="date"
                name="to"
                defaultValue={filters.to ?? ''}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            {pagination.total} {pagination.total === 1 ? 'record' : 'records'}
          </p>
          <div className="flex items-center gap-2">
            {hasFilters ? (
              <Link
                href={basePath}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <X size={15} />
                Clear
              </Link>
            ) : null}
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-900"
            >
              <SlidersHorizontal size={15} />
              Apply
            </button>
          </div>
        </div>
      </form>

      <section className="card overflow-hidden" aria-labelledby="activity-timeline-heading">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="activity-timeline-heading" className="font-semibold text-slate-800">Activity Timeline</h3>
            <p className="mt-0.5 text-xs text-slate-400">Page {pagination.page} of {pagination.totalPages}</p>
          </div>
          <FileClock size={18} className="text-slate-400" />
        </div>

        {groupedEntries.length ? (
          <div>
            {groupedEntries.map(([dateLabel, dateEntries]) => (
              <div key={dateLabel}>
                <div className="border-y border-slate-100 bg-slate-50 px-5 py-2 text-xs font-bold text-slate-500 first:border-t-0">
                  {dateLabel}
                </div>
                <div className="divide-y divide-slate-100">
                  {dateEntries.map((entry) => {
                    const presentation = ENTITY_PRESENTATION[entry.entityType]
                    const EntityIcon = presentation.icon

                    return (
                      <Link
                        key={entry.id}
                        href={entry.href}
                        className="grid gap-3 px-5 py-4 transition-colors hover:bg-slate-50 md:grid-cols-[36px_minmax(0,1fr)_auto] md:items-start"
                      >
                        <span className={`hidden h-9 w-9 items-center justify-center rounded-full md:flex ${presentation.iconClassName}`}>
                          <EntityIcon size={17} />
                        </span>

                        <span className="min-w-0 space-y-2">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">{presentation.label}</span>
                            <span className={`status-badge ${getActionClassName(entry.action)}`}>
                              {formatAction(entry.action)}
                            </span>
                          </span>
                          <span className="block text-sm font-semibold text-slate-800">{entry.summary}</span>
                          {entry.details ? (
                            <span className="block text-sm leading-6 text-slate-500">{entry.details}</span>
                          ) : null}
                          <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                            <CircleUserRound size={13} />
                            {entry.actorName}
                            <span aria-hidden="true">·</span>
                            {entry.actorRoleLabel}
                          </span>
                        </span>

                        <span className="text-xs font-medium text-slate-400 md:pt-1">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <FileClock size={24} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No matching activity</p>
            <p className="mt-1 text-xs text-slate-400">Adjust or clear the current filters.</p>
          </div>
        )}

        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            {pagination.page > 1 ? (
              <Link
                href={buildPageHref(basePath, filters, pagination.page - 1)}
                aria-label="Previous activity page"
                title="Previous page"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ChevronLeft size={17} />
              </Link>
            ) : <span className="h-9 w-9" />}

            <span className="text-xs font-semibold text-slate-500">
              {((pagination.page - 1) * pagination.pageSize) + 1}-{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
            </span>

            {pagination.page < pagination.totalPages ? (
              <Link
                href={buildPageHref(basePath, filters, pagination.page + 1)}
                aria-label="Next activity page"
                title="Next page"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ChevronRight size={17} />
              </Link>
            ) : <span className="h-9 w-9" />}
          </div>
        ) : null}
      </section>
    </div>
  )
}
