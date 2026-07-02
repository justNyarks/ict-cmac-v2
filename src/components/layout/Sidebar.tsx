'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  FilePlus2,
  Briefcase,
  ClipboardList,
  Settings,
  User,
  Aperture,
  History,
  CheckCircle,
  Vote,
} from 'lucide-react'
import clsx from 'clsx'
import { getHomePathForRole, getRoleLabel, isPmacSystemRole } from '@/lib/roles'

import { useSession, signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user
  const role = user?.role
  const homeHref = getHomePathForRole(role)

  const navItems = [
    { href: homeHref, label: 'Dashboard', icon: LayoutDashboard },
    ...(isPmacSystemRole(role)
      ? [
          { href: '/pmac/events', label: 'PMAC Events', icon: ClipboardList },
          { href: '/pmac/polls', label: 'PMAC Polls', icon: Vote },
          { href: '/pmac/calendar', label: 'PMAC Calendar', icon: CalendarDays },
          { href: '/pmac/assignments', label: 'Assignments', icon: Briefcase },
          { href: '/pmac/activity', label: 'Activity', icon: History },
          ...(role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR' || role === 'PMAC_SECRETARY'
            ? [{ href: '/pmac/reports', label: 'Reports', icon: BarChart3 }]
            : []),
          ...(role === 'PMAC_SECRETARY'
            ? [{ href: '/pmac/attendance', label: 'Attendance', icon: CheckCircle }]
            : []),
        ]
      : [
          { href: '/requests', label: 'Requests', icon: ClipboardList },
          { href: '/new-request', label: 'New Request', icon: FilePlus2 },
          { href: '/calendar', label: 'Calendar', icon: CalendarDays },
          { href: '/analytics', label: 'Analytics', icon: BarChart3 },
          { href: '/logs', label: 'System Logs', icon: History },
          { href: '/admin', label: 'Admin', icon: Settings },
        ]),
    ...(role === 'CMAC_COORDINATOR'
      ? [
          { href: '/coordinator/pmac', label: 'PMAC Management', icon: Settings },
          { href: '/coordinator/pmac/officers', label: 'Officer Assignments', icon: Briefcase },
          { href: '/coordinator/pmac/events', label: 'PMAC Events', icon: ClipboardList },
          { href: '/coordinator/pmac/polls', label: 'PMAC Polls', icon: Vote },
          { href: '/coordinator/pmac/activity', label: 'PMAC Activity', icon: History },
          { href: '/coordinator/pmac/reports', label: 'PMAC Reports', icon: BarChart3 },
        ]
      : []),
    { href: '/profile', label: 'My Profile', icon: User },
  ]
  const filteredNavItems = navItems.filter(item => {
    if (item.href === '/new-request') return role === 'SECRETARY' || role === 'ICT_DIRECTOR'
    if (item.href === '/admin') return role === 'ICT_DIRECTOR'
    if (item.href === '/analytics') return role === 'CMAC_COORDINATOR' || role === 'ICT_DIRECTOR'
    if (item.href === '/logs') return role === 'CMAC_COORDINATOR'
    return true
  })

  return (
    <aside className="w-64 flex-shrink-0 bg-[var(--primary)] flex flex-col h-full border-r border-emerald-900/20 print:hidden">
      {/* Logo */}
      <div className="px-6 py-8 border-b border-white/5">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-white p-2 flex items-center justify-center shadow-xl border border-emerald-100/20 text-emerald-800">
            <Aperture size={32} />
          </div>
          <div>
            <p className="font-display text-white text-lg leading-tight font-bold tracking-tight">ICT CMAC</p>
            <p className="text-emerald-400 text-[8px] font-bold tracking-[0.2em] uppercase mt-1">
              St. Paul University Philippines
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1">
        {filteredNavItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium',
                active
                  ? 'bg-white/10 text-white shadow-inner'
                  : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
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
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
            </div>
            <div>
              <p className="text-white text-xs font-semibold">{user?.name || 'Loading...'}</p>
              <p className="text-emerald-300 text-[10px]">{getRoleLabel(user?.role)}</p>
            </div>
          </div>
          <button 
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="p-1.5 rounded-lg text-emerald-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
