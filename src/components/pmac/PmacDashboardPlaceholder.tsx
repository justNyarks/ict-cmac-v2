import type { ReactNode } from 'react'

import type { AppNotification } from '@/types/notifications'

type SummaryItem = {
  label: string
  value: string | number
  helper: string
}

type LinkCard = {
  id: string
  title: string
  meta: string
  href: string
  badge?: string
}

type PlaceholderProps = {
  name: string | null | undefined
  roleLabel: string
  accessSummary: string
  badge?: ReactNode
  links?: Array<{
    href: string
    label: string
  }>
  stats?: SummaryItem[]
  upcomingEvents?: LinkCard[]
  branchProjects?: LinkCard[]
  openPolls?: LinkCard[]
  recentActivity?: LinkCard[]
  notifications?: AppNotification[]
  mustChangePassword?: boolean
}

function ListSection({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: LinkCard[]
}) {
  return (
    <div className="card p-6">
      <div className="space-y-1">
        <h3 className="font-display text-xl font-bold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      {items.length ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 transition-colors hover:bg-slate-100"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                {item.badge ? (
                  <span className="status-badge bg-emerald-50 text-emerald-700 border-emerald-200">{item.badge}</span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">{item.meta}</p>
            </a>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          Nothing to show right now.
        </div>
      )}
    </div>
  )
}

export default function PmacDashboardPlaceholder({
  name,
  roleLabel,
  accessSummary,
  badge,
  links = [],
  stats = [],
  upcomingEvents = [],
  branchProjects = [],
  openPolls = [],
  recentActivity = [],
  notifications = [],
  mustChangePassword = false,
}: PlaceholderProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div
        className="overflow-hidden rounded-2xl shadow-xl"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #115e59 55%, #10b981 100%)' }}
      >
        <div className="flex flex-col gap-6 px-8 py-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-emerald-200 text-sm font-medium tracking-widest uppercase">PMAC Workspace</p>
            <h2 className="mt-2 font-display text-4xl font-bold text-white">{name || 'PMAC User'}</h2>
            <p className="mt-2 text-sm font-medium text-emerald-100">{roleLabel}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-right text-white backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200">Module Status</p>
            <p className="mt-1 text-2xl font-bold">V4 Ready</p>
            <p className="mt-1 text-xs text-emerald-100">Operations, governance, visibility, and exports are live.</p>
          </div>
        </div>
      </div>

      {mustChangePassword ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <p className="text-sm font-bold">Password update required</p>
          <p className="mt-1 text-xs text-amber-700">Your account was issued or reset by an administrator. Open your profile and set a personal password.</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Access Scope</p>
          <p className="mt-3 text-lg font-bold text-slate-800">{roleLabel}</p>
          <p className="mt-2 text-sm text-slate-500">{accessSummary}</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Club Assignment</p>
          <div className="mt-3">{badge}</div>
          <p className="mt-2 text-sm text-slate-500">Club leadership remains separate from sign-in permissions and event staffing duties.</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Shortcuts</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {stats.length ? (
        <div className="rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Quick Reminders</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                <p className="text-lg font-bold text-slate-800">{item.value}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{item.helper}</p>
            </div>
          ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <ListSection
          title="Upcoming Events"
          description="The next PMAC events connected to your current role and assignments."
          items={upcomingEvents}
        />
        <ListSection
          title="Branch Projects"
          description="Active project work assigned to executive heads and selected members."
          items={branchProjects}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ListSection
          title="Open Polls"
          description="Live PMAC voting items and governance decisions that still need attention."
          items={openPolls}
        />
        <div className="card p-6">
          <div className="space-y-1">
            <h3 className="font-display text-xl font-bold text-slate-800">Notifications</h3>
            <p className="text-sm text-slate-500">Fresh reminders surfaced directly from active PMAC and CMAC workflow activity.</p>
          </div>

          {notifications.length ? (
            <div className="mt-4 space-y-3">
              {notifications.map((notification) => (
                <a
                  key={notification.id}
                  href={notification.href}
                  className="block rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 transition-colors hover:bg-slate-100"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{notification.title}</p>
                    <span className="status-badge bg-slate-100 text-slate-700 border-slate-200">{notification.module}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{notification.description}</p>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              No new PMAC notifications right now.
            </div>
          )}
        </div>

        <ListSection
          title="Recent Activity"
          description="Recent PMAC changes across events, polls, attachments, and governance records."
          items={recentActivity}
        />
      </div>
    </div>
  )
}
