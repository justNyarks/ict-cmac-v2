'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

import { getPmacCalendarEvents } from '@/app/pmac/actions'
import { PmacEventStatusBadge } from '@/components/pmac/PmacBadges'

type CalendarEvent = Awaited<ReturnType<typeof getPmacCalendarEvents>>[number]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PmacCalendarPageClient() {
  const today = new Date()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  useEffect(() => {
    let cancelled = false

    async function loadEvents() {
      const result = await getPmacCalendarEvents()
      if (!cancelled) {
        setEvents(result)
        setLoading(false)
      }
    }

    loadEvents()

    return () => {
      cancelled = true
    }
  }, [])

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {}

    for (const event of events) {
      const date = new Date(event.startDateTime)
      if (date.getFullYear() !== viewYear || date.getMonth() !== viewMonth) {
        continue
      }
      const day = date.getDate()
      if (!map[day]) {
        map[day] = []
      }
      map[day].push(event)
    }

    return map
  }, [events, viewMonth, viewYear])

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC calendar...</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Calendar</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-800">Approved PMAC Schedule</h2>
          <p className="mt-2 text-sm text-slate-500">Only approved and completed PMAC events appear here, separate from the CMAC request calendar.</p>
        </div>
        <Link
          href="/pmac/events"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to PMAC Events
        </Link>
      </div>

      <div className="card p-5 flex items-center justify-between">
        <button
          onClick={() => {
            if (viewMonth === 0) {
              setViewMonth(11)
              setViewYear(previous => previous - 1)
              return
            }
            setViewMonth(previous => previous - 1)
          }}
          className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-display text-2xl text-slate-800">{MONTHS[viewMonth]}</p>
          <p className="text-sm text-slate-400">{viewYear}</p>
        </div>
        <button
          onClick={() => {
            if (viewMonth === 11) {
              setViewMonth(0)
              setViewYear(previous => previous + 1)
              return
            }
            setViewMonth(previous => previous + 1)
          }}
          className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAYS.map(day => (
            <div key={day} className="py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
            const dayEvents = day ? (eventsByDay[day] || []) : []

            return (
              <div
                key={`${day}-${index}`}
                className={clsx(
                  'min-h-[140px] border-b border-r border-slate-100 p-3',
                  !day ? 'bg-slate-50/60' : 'bg-white',
                )}
              >
                {day ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={clsx(
                        'w-7 h-7 rounded-full text-sm flex items-center justify-center',
                        isToday ? 'bg-[#064e3b] text-white' : 'text-slate-500'
                      )}>
                        {day}
                      </span>
                      <span className={clsx('text-[10px] font-black uppercase tracking-widest', dayEvents.length ? 'text-emerald-600' : 'text-slate-300')}>
                        {dayEvents.length ? `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : 'Open'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {dayEvents.slice(0, 3).map(event => (
                        <button
                          key={event.id}
                          onClick={() => setSelected(event)}
                          className="w-full rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-left text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          <p className="truncate">{event.title}</p>
                          <p className="mt-1 text-[10px] text-emerald-700">{new Date(event.startDateTime).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</p>
                        </button>
                      ))}
                      {dayEvents.length > 3 ? (
                        <p className="text-[10px] font-semibold text-slate-400">+{dayEvents.length - 3} more</p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {selected ? (
        <div className="card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Selected Event</p>
              <h3 className="mt-2 font-display text-2xl font-bold text-slate-800">{selected.title}</h3>
            </div>
            <PmacEventStatusBadge status={selected.status} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Venue</p>
              <p className="mt-2 text-sm text-slate-700">{selected.venue}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Start</p>
              <p className="mt-2 text-sm text-slate-700">{formatDateTime(selected.startDateTime)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">End</p>
              <p className="mt-2 text-sm text-slate-700">{formatDateTime(selected.endDateTime)}</p>
            </div>
          </div>

          <div>
            <Link
              href={`/pmac/events/${selected.id}`}
              className="inline-flex items-center rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
            >
              Open Event Workspace
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
