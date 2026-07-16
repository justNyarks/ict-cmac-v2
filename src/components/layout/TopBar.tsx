'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Bell, CheckCircle2, Clock, Info, X, XCircle } from 'lucide-react'
import clsx from 'clsx'

import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '@/app/notificationsActions'
import { getRoleLabel } from '@/lib/roles'
import type { AppNotification } from '@/types/notifications'
import ThemeToggle from '@/components/theme/ThemeToggle'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/requests': 'Service Requests',
  '/new-request': 'New Request',
  '/calendar': 'Event Calendar',
  '/analytics': 'Analytics',
  '/admin': 'Admin',
  '/coordinator/pmac': 'PMAC Directory',
  '/coordinator/pmac/officers': 'Officer Assignments',
  '/coordinator/pmac/events': 'PMAC Event Oversight',
  '/coordinator/pmac/polls': 'PMAC Poll Oversight',
  '/coordinator/pmac/activity': 'PMAC Activity Oversight',
  '/coordinator/pmac/reports': 'PMAC Reports',
  '/pmac/members': 'PMAC Members',
  '/pmac/director': 'PMAC Director',
  '/pmac/assistant-director': 'PMAC Assistant Director',
  '/pmac/secretary': 'PMAC Secretary',
  '/pmac/executive': 'PMAC Executive',
  '/pmac/member': 'PMAC Member',
  '/pmac/events': 'PMAC Events',
  '/pmac/events/new': 'New PMAC Event',
  '/pmac/projects': 'Branch Projects',
  '/pmac/projects/calendar': 'Project Calendar',
  '/pmac/polls': 'PMAC Polls',
  '/pmac/polls/new': 'New PMAC Poll',
  '/pmac/calendar': 'PMAC Calendar',
  '/pmac/tags': 'PMAC Tags',
  '/pmac/assignments': 'PMAC Assignments',
  '/pmac/attendance': 'PMAC Attendance',
  '/pmac/activity': 'PMAC Activity',
  '/pmac/reports': 'PMAC Reports',
}

const DISMISSED_NOTIFICATIONS_KEY = 'dismissedNotifications.v2'

function getNotificationIcon(notification: AppNotification) {
  if (notification.tone === 'danger') {
    return <XCircle size={16} />
  }

  if (notification.tone === 'info') {
    return <Info size={16} />
  }

  if (notification.tone === 'success') {
    return <CheckCircle2 size={16} />
  }

  return <Clock size={16} />
}

export default function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [popNotification, setPopNotification] = useState<AppNotification | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dismissedRef = useRef<string[]>([])
  const seenNotificationIdsRef = useRef<Set<string>>(new Set())
  const initializedNotificationsRef = useRef(false)

  useEffect(() => {
    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY) || '[]') as string[]
    setDismissedNotifs(dismissed)
    dismissedRef.current = dismissed

    const fetchNotifs = () =>
      getNotifications()
        .then((nextNotifications) => {
          const visibleUnread = nextNotifications.filter((notification) => (
            !notification.isRead && !dismissedRef.current.includes(notification.id)
          ))

          if (initializedNotificationsRef.current) {
            const newNotification = visibleUnread.find((notification) => !seenNotificationIdsRef.current.has(notification.id))
            if (newNotification && !showNotifs) {
              setPopNotification(newNotification)
            }
          }

          seenNotificationIdsRef.current = new Set(nextNotifications.map((notification) => notification.id))
          initializedNotificationsRef.current = true
          setNotifications(nextNotifications)
        })
        .catch((error) => {
          console.error('TOPBAR_NOTIFICATIONS_ERROR:', error)
          setNotifications([])
        })
    fetchNotifs()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifs()
      }
    }
    const handleWindowFocus = () => fetchNotifs()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchNotifs()
      }
    }, 60000)

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifs(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showNotifs])

  useEffect(() => {
    if (!popNotification) {
      return
    }

    const timeout = window.setTimeout(() => setPopNotification(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [popNotification])

  const visibleNotifs = notifications.filter((notification) => !notification.isRead && !dismissedNotifs.includes(notification.id))
  const hasHighPriorityNotification = visibleNotifs.some((notification) => (
    notification.priority === 'critical' || notification.priority === 'high'
  ))

  const handleDismiss = (event: ReactMouseEvent, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    const updated = Array.from(new Set([...dismissedNotifs, id]))
    setDismissedNotifs(updated)
    dismissedRef.current = updated
    localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(updated))
    setPopNotification((current) => current?.id === id ? null : current)
  }

  const handleNotifClick = async (notification: AppNotification) => {
    const updated = Array.from(new Set([...dismissedNotifs, notification.id]))
    setDismissedNotifs(updated)
    dismissedRef.current = updated
    localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(updated))
    setNotifications((previous) => previous.map((item) => (
      item.id === notification.id ? { ...item, isRead: true } : item
    )))
    setPopNotification(null)
    setShowNotifs(false)
    await markNotificationAsRead(notification.id, notification.module)
    router.push(notification.href)
  }

  const pageTitle = PAGE_TITLES[pathname]
    ?? (pathname.startsWith('/pmac/events/')
      ? 'PMAC Event Workspace'
      : pathname.startsWith('/pmac/polls/')
        ? 'PMAC Poll Workspace'
        : 'ICT CMAC')

  return (
    <header className="flex h-20 flex-shrink-0 items-center justify-between gap-3 border-b border-emerald-100/50 bg-white/80 px-4 shadow-sm backdrop-blur-md sm:px-6 lg:px-10 z-20 print:hidden">
      <h1 className="min-w-0 truncate font-display text-base text-[var(--text-dark)] font-extrabold uppercase tracking-tight sm:text-xl">
        {pathname === '/' ? 'Dashboard Overview' : pageTitle}
      </h1>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4 lg:gap-6">
        <ThemeToggle />
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            aria-label={visibleNotifs.length ? `${visibleNotifs.length} unread notification${visibleNotifs.length === 1 ? '' : 's'}` : 'Notifications'}
            className={clsx(
              'relative p-2.5 rounded-2xl transition-all duration-300',
              showNotifs ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50',
              visibleNotifs.length ? 'shadow-sm ring-1 ring-emerald-100' : '',
              hasHighPriorityNotification ? 'text-amber-600 ring-amber-200 animate-pulse' : ''
            )}
          >
            <Bell size={22} />
            {visibleNotifs.length > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-600 px-1 text-[10px] font-black text-white shadow-sm">
                {visibleNotifs.length > 9 ? '9+' : visibleNotifs.length}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 mt-3 w-84 bg-white rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden animate-fade-in z-50" style={{ width: '340px' }}>
              <div className="p-5 border-b border-emerald-50 bg-emerald-50/20 flex items-center justify-between">
                <h3 className="font-black text-[10px] text-emerald-800 uppercase tracking-[0.2em]">Notifications</h3>
                {visibleNotifs.length > 0 && (
                  <button
                    onClick={async () => {
                      const updated = Array.from(new Set([...dismissedNotifs, ...visibleNotifs.map((notification) => notification.id)]))
                      setDismissedNotifs(updated)
                      dismissedRef.current = updated
                      localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(updated))
                      setNotifications((previous) => previous.map((notification) => ({ ...notification, isRead: true })))
                      setPopNotification(null)
                      await markAllNotificationsAsRead(visibleNotifs.map((notification) => ({
                        id: notification.id,
                        module: notification.module,
                      })))
                    }}
                    className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {visibleNotifs.length > 0 ? (
                  visibleNotifs.map((notification) => (
                    <div
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotifClick(notification)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleNotifClick(notification)
                        }
                      }}
                      className="flex w-full cursor-pointer items-start gap-3 border-b border-emerald-50/50 p-4 text-left transition-colors hover:bg-emerald-50/50 group"
                    >
                      <div className={clsx(
                        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        notification.tone === 'success' ? 'bg-emerald-100 text-emerald-600'
                        : notification.tone === 'info' ? 'bg-sky-100 text-sky-600'
                        : notification.tone === 'danger' ? 'bg-red-100 text-red-600'
                        : 'bg-amber-100 text-amber-600'
                      )}>
                        {getNotificationIcon(notification)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-emerald-700 transition-colors">{notification.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{notification.description}</p>
                      </div>
                      <button
                        onClick={(event) => handleDismiss(event, notification.id)}
                        className="p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center">
                    <p className="text-xs text-slate-400 font-medium">No new notifications</p>
                  </div>
                )}
              </div>
              <Link
                href={session?.user?.role?.startsWith('PMAC_') ? '/pmac/events' : session?.user?.role === 'CMAC_COORDINATOR' ? '/coordinator/pmac' : '/requests'}
                onClick={() => setShowNotifs(false)}
                className="block p-4 text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:bg-emerald-50 transition-colors"
              >
                View Notifications
              </Link>
            </div>
          )}

          {popNotification && !showNotifs ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleNotifClick(popNotification)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleNotifClick(popNotification)
                }
              }}
              className="absolute right-0 top-14 z-50 w-80 rounded-3xl border border-emerald-100 bg-white p-4 text-left shadow-2xl ring-1 ring-emerald-100 animate-fade-in"
            >
              <div className="flex items-start gap-3">
                <div className={clsx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
                  popNotification.tone === 'success' ? 'bg-emerald-100 text-emerald-600'
                  : popNotification.tone === 'info' ? 'bg-sky-100 text-sky-600'
                  : popNotification.tone === 'danger' ? 'bg-red-100 text-red-600'
                  : 'bg-amber-100 text-amber-600'
                )}>
                  {getNotificationIcon(popNotification)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">New notification</p>
                  <p className="mt-1 line-clamp-1 text-sm font-bold text-slate-800">{popNotification.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{popNotification.description}</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => handleDismiss(event, popNotification.id)}
                  className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="hidden h-10 w-px bg-emerald-100/50 sm:block"></div>
        <Link href="/profile" className="flex items-center gap-4 group cursor-pointer" onClick={() => setShowNotifs(false)}>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-[var(--text-dark)] leading-none group-hover:text-emerald-700 transition-colors">{session?.user?.name || 'User Name'}</p>
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-1.5 flex items-center justify-end gap-1">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
              {getRoleLabel(session?.user?.role)}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300 dark:from-[#8bd3d0] dark:to-[#5aa6ae] dark:text-[#17283a]">
            {session?.user?.name?.[0] || 'U'}
          </div>
        </Link>
      </div>
    </header>
  )
}
