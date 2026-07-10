type SummaryItem = {
  label: string
  value: string | number
  helper?: string
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
  links?: Array<{
    href: string
    label: string
  }>
  stats?: SummaryItem[]
  upcomingEvents?: LinkCard[]
  branchProjects?: LinkCard[]
  openPolls?: LinkCard[]
  mustChangePassword?: boolean
}

function ListSection({
  title,
  items,
}: {
  title: string
  items: LinkCard[]
}) {
  if (!items.length) {
    return null
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <h3 className="font-display text-lg font-bold text-slate-800">{title}</h3>

      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{item.meta}</p>
            </div>
              {item.badge ? (
              <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{item.badge}</span>
              ) : null}
          </a>
        ))}
      </div>
    </div>
  )
}

export default function PmacDashboardPlaceholder({
  name,
  roleLabel,
  accessSummary,
  links = [],
  stats = [],
  upcomingEvents = [],
  branchProjects = [],
  openPolls = [],
  mustChangePassword = false,
}: PlaceholderProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
      <div
        className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-4 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">PMAC Workspace</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">{name || 'PMAC User'}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{roleLabel}</p>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-500 lg:text-right">{accessSummary}</p>
        </div>
      </div>

      {mustChangePassword ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <p className="text-sm font-bold">Password update required</p>
          <p className="mt-1 text-xs text-amber-700">Your account was issued or reset by an administrator. Open your profile and set a personal password.</p>
        </div>
      ) : null}

      {links.length ? (
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
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
      ) : null}

      {stats.length ? (
        <div className="rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Quick Reminders</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                <p className="text-lg font-bold text-slate-800">{item.value}</p>
              </div>
              {item.helper ? (
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{item.helper}</p>
              ) : null}
            </div>
          ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <ListSection
          title="Upcoming Events"
          items={upcomingEvents}
        />
        <ListSection
          title="Branch Projects"
          items={branchProjects}
        />
        <ListSection
          title="Open Polls"
          items={openPolls}
        />
      </div>
    </div>
  )
}
