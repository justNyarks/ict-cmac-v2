'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  FilePlus2,
  Briefcase,
  FolderKanban,
  ClipboardList,
  Settings,
  User,
  Aperture,
  History,
  CheckCircle,
  Vote,
} from 'lucide-react'
import clsx from 'clsx'
import { getRoleLabel } from '@/lib/roles'
import { getActiveNavigationHref, getNavigationItems, type NavigationItem } from '@/lib/navigation'

import { useSession, signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'

const ICONS = {
  dashboard: LayoutDashboard, events: ClipboardList, projects: FolderKanban, polls: Vote,
  calendar: CalendarDays, members: Settings, assignments: Briefcase, activity: History,
  reports: BarChart3, attendance: CheckCircle, newRequest: FilePlus2, profile: User,
} satisfies Record<NavigationItem['icon'], typeof User>

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user
  const role = user?.role
  const filteredNavItems = getNavigationItems(role)
  const activeHref = getActiveNavigationHref(pathname, filteredNavItems)

  return (
    <aside className="app-sidebar w-64 flex-shrink-0 bg-[var(--sidebar)] flex flex-col h-full border-r border-emerald-900/20 dark:border-white/[0.08] print:hidden">
      {/* Logo */}
      <div className="px-6 py-8 border-b border-white/5">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-white p-2 flex items-center justify-center shadow-xl border border-emerald-100/20 text-emerald-800 dark:border-[var(--border)] dark:bg-[var(--surface-raised)] dark:text-[var(--accent)]">
            <Aperture size={32} />
          </div>
          <div>
            <p className="font-display text-white text-lg leading-tight font-bold tracking-tight">ICT CMAC</p>
            <p className="text-emerald-400 text-[8px] font-bold tracking-[0.2em] uppercase mt-1 dark:text-[var(--accent)]">
              St. Paul University Philippines
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1">
        {filteredNavItems.map(({ href, label, icon }) => {
          const active = href === activeHref
          const Icon = ICONS[icon]
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 border-l-2 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium',
                active
                  ? 'border-transparent bg-white/10 text-white shadow-inner dark:border-[var(--accent)] dark:bg-[#2dd4bf]/15 dark:text-[var(--text-dark)]'
                  : 'border-transparent text-emerald-100/70 hover:bg-white/5 hover:text-white dark:text-[#8b98a9] dark:hover:bg-white/[0.05] dark:hover:text-[#f1f5f9]'
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Current User */}
      <div className="px-4 py-5 border-t border-white/5">
        <div className="flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold dark:bg-[var(--accent)] dark:text-[var(--sidebar)]">
              {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
            </div>
            <div>
              <p className="text-white text-xs font-semibold">{user?.name || 'Loading...'}</p>
              <p className="text-emerald-300 text-[10px] dark:text-[#8b98a9]">{getRoleLabel(user?.role)}</p>
            </div>
          </div>
          <button 
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="p-1.5 rounded-lg text-emerald-300 hover:bg-white/10 hover:text-white transition-colors dark:text-[#8b98a9] dark:hover:text-[#f1f5f9]"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
