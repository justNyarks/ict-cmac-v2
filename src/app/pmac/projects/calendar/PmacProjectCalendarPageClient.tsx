'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react'

import { getPmacProjectCalendarItems } from '@/app/pmac/actions'
import {
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_PROJECT_MILESTONE_STATUS_LABELS,
  PMAC_PROJECT_STATUS_LABELS,
} from '@/lib/pmac'

type CalendarItem = Awaited<ReturnType<typeof getPmacProjectCalendarItems>>[number]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function getCalendarDateKey(value: string | Date) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function itemClass(item: CalendarItem) {
  if (item.type === 'MILESTONE') {
    if (item.status === 'DONE') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    if (item.status === 'BLOCKED') return 'border-red-200 bg-red-50 text-red-800'
    if (item.health.label === 'Due soon') return 'border-orange-200 bg-orange-50 text-orange-800'
    return 'border-indigo-200 bg-indigo-50 text-indigo-800'
  }

  if (item.health.label === 'Needs attention') return 'border-red-200 bg-red-50 text-red-800'
  if (item.health.label === 'Due soon') return 'border-orange-200 bg-orange-50 text-orange-800'
  return 'border-slate-200 bg-white text-slate-800'
}

export default function PmacProjectCalendarPageClient() {
  const today = new Date()
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  useEffect(() => {
    async function loadItems() {
      const result = await getPmacProjectCalendarItems()
      setItems(result)
      setLoading(false)
    }

    loadItems()
  }, [])

  const itemsByDay = useMemo(() => {
    const map: Record<number, CalendarItem[]> = {}

    for (const item of items) {
      const startDate = new Date(item.startDate)
      const endDate = new Date(item.endDate)
      const cursor = new Date(startDate)

      while (cursor <= endDate) {
        if (cursor.getFullYear() === viewYear && cursor.getMonth() === viewMonth) {
          const day = cursor.getDate()
          map[day] = [...(map[day] ?? []), item]
        }
        cursor.setDate(cursor.getDate() + 1)

        if (item.type === 'MILESTONE') break
      }
    }

    return map
  }, [items, viewMonth, viewYear])

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading project calendar...</div>
  }

  const cells: (number | null)[] = [
    ...Array(getFirstDayOfMonth(viewYear, viewMonth)).fill(null),
    ...Array.from({ length: getDaysInMonth(viewYear, viewMonth) }, (_, index) => index + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Projects</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-800">Project Calendar</h2>
          <p className="mt-2 text-sm text-slate-500">Track branch project windows and milestone deadlines separately from event coverage.</p>
        </div>
        <Link
          href="/pmac/projects"
          className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
        >
          <FolderKanban size={14} />
          Projects
        </Link>
      </div>

      <div className="card bg-[#f9f6ee] p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11)
                setViewYear(year => year - 1)
              } else {
                setViewMonth(month => month - 1)
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <ChevronLeft size={18} />
          </button>
          <h3 className="font-display text-2xl font-bold text-slate-800">{MONTHS[viewMonth]} {viewYear}</h3>
          <button
            type="button"
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0)
                setViewYear(year => year + 1)
              } else {
                setViewMonth(month => month + 1)
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {DAYS.map(day => (
            <div key={day} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            const dayItems = day ? itemsByDay[day] ?? [] : []
            const isToday = day
              && viewYear === today.getFullYear()
              && viewMonth === today.getMonth()
              && day === today.getDate()

            return (
              <div key={`${day ?? 'blank'}-${index}`} className="min-h-32 border-b border-r border-slate-100 bg-white p-2">
                {day ? (
                  <>
                    <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-emerald-700 text-white' : 'text-slate-500'}`}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayItems.map(item => (
                        <Link
                          key={`${item.id}-${getCalendarDateKey(item.startDate)}`}
                          href="/pmac/projects"
                          className={`block rounded-xl border px-2 py-1.5 text-xs font-semibold ${itemClass(item)}`}
                        >
                          <span className="block truncate">{item.type === 'MILESTONE' ? 'Milestone: ' : ''}{item.title}</span>
                          <span className="mt-0.5 block truncate text-[10px] opacity-75">
                            {PMAC_EXECUTIVE_TITLE_LABELS[item.branch]} | {item.type === 'PROJECT' ? PMAC_PROJECT_STATUS_LABELS[item.status] : PMAC_PROJECT_MILESTONE_STATUS_LABELS[item.status]}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
