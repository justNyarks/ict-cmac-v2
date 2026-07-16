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
import clsx from 'clsx'

import {
  PMAC_ACTIVITY_ENTITY_TYPES,
  type PmacActivityEntityType,
  type PmacActivityFeedOptions,
} from '@/lib/pmacActivity'
import { getPmacActivityActionLabel } from '@/lib/pmacActivityAudit'

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
  changes: unknown
  entityLabel: string | null
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

type ActivitySubject = {
  value: string
  label: string
  type: 'EVENT' | 'PROJECT'
}

const ENTITY_PRESENTATION: Record<PmacActivityEntityType, {
  label: string
  icon: LucideIcon
}> = {
  EVENT: { label: 'Event', icon: CalendarDays },
  POLL: { label: 'Poll', icon: ListChecks },
  PROJECT: { label: 'Project', icon: FolderKanban },
  MEMBER: { label: 'Member', icon: Users },
  ACCOUNT: { label: 'Account', icon: ShieldCheck },
  ATTACHMENT: { label: 'Attachment', icon: Paperclip },
  REPORT: { label: 'Report', icon: FileText },
}

function getActivityActionClassName(action: string, entityType: PmacActivityEntityType) {
  if (/(ATTENDANCE|ABSENT|PRESENT)/.test(action)) {
    return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-[#a855f7]/35 dark:bg-[#a855f7]/15 dark:text-[#d8b4fe]'
  }

  if (entityType === 'MEMBER' || entityType === 'ACCOUNT') {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-[#6366f1]/35 dark:bg-[#6366f1]/15 dark:text-[#a5b4fc]'
  }

  if (entityType === 'REPORT' || entityType === 'ATTACHMENT') {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-[#f4b328]/35 dark:bg-[#f4b328]/15 dark:text-[#f8d477]'
  }

  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-[#2dd4bf]/35 dark:bg-[#2dd4bf]/15 dark:text-[#5eead4]'
}

function getActivityEntityClassName(entityType: PmacActivityEntityType) {
  if (entityType === 'MEMBER' || entityType === 'ACCOUNT') {
    return 'bg-indigo-50 text-indigo-700 dark:bg-[#6366f1]/15 dark:text-[#a5b4fc]'
  }

  if (entityType === 'REPORT' || entityType === 'ATTACHMENT') {
    return 'bg-amber-50 text-amber-700 dark:bg-[#f4b328]/15 dark:text-[#f8d477]'
  }

  return 'bg-emerald-50 text-emerald-700 dark:bg-[#2dd4bf]/15 dark:text-[#5eead4]'
}

function formatChangeField(field: string) {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')

  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'None'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    return value.length ? value.map((entry) => formatChangeValue(entry)).join(', ') : 'None'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, 180)
  }

  return String(value).slice(0, 180)
}

function getChangeRows(changes: unknown) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return []
  }

  return Object.entries(changes as Record<string, unknown>).flatMap(([field, change]) => {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      return []
    }

    const values = change as { before?: unknown; after?: unknown }
    return [{
      field: formatChangeField(field),
      before: formatChangeValue(values.before),
      after: formatChangeValue(values.after),
    }]
  }).slice(0, 6)
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
    subject: filters.subject,
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
  subjects,
  pagination,
  filters,
  basePath,
  title,
  description,
}: {
  entries: ActivityEntry[]
  actions: string[]
  actors: ActivityActor[]
  subjects: ActivitySubject[]
  pagination: ActivityPagination
  filters: PmacActivityFeedOptions
  basePath: string
  title: string
  description: string
}) {
  const groupedEntries = groupEntries(entries)
  const mostRecentEntryId = entries[0]?.id
  const hasFilters = !!(
    filters.query
    || filters.entityType
    || filters.action
    || filters.actorId
    || filters.subject
    || filters.from
    || filters.to
  )

  return (
    <div className="pmac-activity-feed mx-auto max-w-6xl space-y-5 animate-fade-in">
      <header className="space-y-1">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Activity</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </header>

      <form action={basePath} method="get" className="card activity-filter-panel p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.6fr)_repeat(4,minmax(130px,1fr))_minmax(230px,1.3fr)]">
          <label className="md:col-span-2 xl:col-span-1">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Search</span>
            <span className="activity-filter-control flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
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
            <span className="mb-1 block text-xs font-semibold text-slate-500">Event or project</span>
            <select
              name="subject"
              defaultValue={filters.subject ?? ''}
              className="activity-filter-control h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All records</option>
              {subjects.map((subject) => (
                <option key={subject.value} value={subject.value}>
                  {subject.type === 'EVENT' ? 'Event' : 'Project'}: {subject.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Record type</span>
            <select
              name="entityType"
              defaultValue={filters.entityType ?? ''}
              className="activity-filter-control h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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
              className="activity-filter-control h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>{getPmacActivityActionLabel(action)}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Actor</span>
            <select
              name="actorId"
              defaultValue={filters.actorId ?? ''}
              className="activity-filter-control h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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
                className="activity-filter-control h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-500">To</span>
              <input
                type="date"
                name="to"
                defaultValue={filters.to ?? ''}
                className="activity-filter-control h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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

      <section className="card activity-timeline overflow-hidden" aria-labelledby="activity-timeline-heading">
        <div className="activity-timeline-header flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
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
                <div className="activity-date-heading border-y border-slate-100 bg-slate-50 px-5 py-2 text-xs font-bold text-slate-500 first:border-t-0">
                  {dateLabel}
                </div>
                <div className="divide-y divide-slate-100">
                  {dateEntries.map((entry, entryIndex) => {
                    const presentation = ENTITY_PRESENTATION[entry.entityType]
                    const EntityIcon = presentation.icon
                    const changeRows = getChangeRows(entry.changes)

                    return (
                      <Link
                        key={entry.id}
                        href={entry.href}
                        className={clsx(
                          'grid gap-3 border-l-2 border-l-transparent px-5 py-4 transition-colors hover:bg-slate-50 md:grid-cols-[36px_minmax(0,1fr)_auto] md:items-start',
                          'activity-entry',
                          entryIndex % 2 === 0 ? 'activity-entry-base' : 'activity-entry-alternate',
                          entry.id === mostRecentEntryId && 'activity-entry-recent'
                        )}
                      >
                        <span className={`hidden h-9 w-9 items-center justify-center rounded-full md:flex ${getActivityEntityClassName(entry.entityType)}`}>
                          <EntityIcon size={17} />
                        </span>

                        <span className="min-w-0 space-y-2">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-600">
                              {presentation.label}{entry.entityLabel ? `: ${entry.entityLabel}` : ''}
                            </span>
                            <span className={`status-badge ${getActivityActionClassName(entry.action, entry.entityType)}`}>
                              {getPmacActivityActionLabel(entry.action)}
                            </span>
                          </span>
                          <span className="activity-primary-text block text-sm font-semibold text-slate-800">{entry.summary}</span>
                          {entry.details ? (
                            <span className="block text-sm leading-6 text-slate-500">{entry.details}</span>
                          ) : null}
                          {changeRows.length ? (
                            <span className="grid gap-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-500 sm:grid-cols-2">
                              {changeRows.map((change) => (
                                <span key={change.field} className="min-w-0">
                                  <strong className="font-semibold text-slate-600">{change.field}:</strong>{' '}
                                  {change.before} {'->'} {change.after}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          <span className="activity-metadata flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                            <CircleUserRound size={13} />
                            {entry.actorName}
                            <span aria-hidden="true">|</span>
                            {entry.actorRoleLabel}
                          </span>
                        </span>

                        <span className="activity-metadata text-xs font-medium text-slate-400 md:pt-1">
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
