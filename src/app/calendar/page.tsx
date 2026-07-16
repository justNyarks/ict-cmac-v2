'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'

import { getStatusColor, getStatusLabel } from '@/lib/data'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import clsx from 'clsx'

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const FILTER_TYPES = ['ALL', 'CMAC', 'PMAC', 'UNASSIGNED'] as const
const FILTER_USERS = ['ALL', 'MINE'] as const

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

import { getCalendarRequests } from '../requests/actions'

type CalendarRequest = Awaited<ReturnType<typeof getCalendarRequests>>[number]
type CalendarFilterType = (typeof FILTER_TYPES)[number]
type CalendarFilterUser = (typeof FILTER_USERS)[number]
type CalendarEvent = CalendarRequest & {
  _isMultiDay: boolean
  _isStart: boolean
  _isEnd: boolean
  _isMid: boolean
  _span: number
}

export default function CalendarPage() {
  const [requests, setRequests] = useState<CalendarRequest[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const { data: session } = useSession()
  const router = useRouter()
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const selectedServiceLabel = selected?.serviceType || 'Unassigned'
  const currentUserId = session?.user?.id
  const isDirector = session?.user?.role === 'ICT_DIRECTOR'
  
  // Filters
  const [filterType, setFilterType] = useState<CalendarFilterType>('ALL')
  const [filterUser, setFilterUser] = useState<CalendarFilterUser>('ALL')

  useEffect(() => {
    function fetchReqs() {
      getCalendarRequests().then(data => {
        setRequests(data)
        setLoading(false)
      })
    }

    fetchReqs()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchReqs()
      }
    }
    const handleWindowFocus = () => fetchReqs()

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDayOfMonth(viewYear, viewMonth)

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  // Apply filters and Map event dates to requests (spanning multi-day events)
  const eventsByDay = useMemo(() => {
    const filtered = requests.filter(req => {
      if (filterType === 'UNASSIGNED') {
        if (req.serviceType) return false
      } else if (filterType !== 'ALL' && req.serviceType !== filterType) {
        return false
      }
      if (filterUser === 'MINE' && req.secretaryId !== currentUserId) return false
      return true
    })

    const map: Record<number, CalendarEvent[]> = {}

    filtered.forEach(req => {
      const startDate = new Date(req.eventDate)
      const endDate = req.endDate ? new Date(req.endDate) : new Date(req.eventDate)

      // Iterate every day in the range [startDate, endDate]
      const cursor = new Date(startDate)
      const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1

      for (let i = 0; i < totalDays; i++) {
        if (cursor.getFullYear() === viewYear && cursor.getMonth() === viewMonth) {
          const day = cursor.getDate()
          if (!map[day]) map[day] = []
          map[day].push({
            ...req,
            _isMultiDay: totalDays > 1,
            _isStart: i === 0,
            _isEnd: i === totalDays - 1,
            _isMid: i > 0 && i < totalDays - 1,
            _span: totalDays,
          })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    })

    return map
  }, [requests, filterType, filterUser, currentUserId, viewYear, viewMonth])

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)


  // Deterministic color palette per event (based on ID hash)
  const EVENT_PALETTE = [
    { bg: 'bg-[#e0f2fe] dark:bg-[#1e2f47]', text: 'text-[#075985] dark:text-[#93c5fd]', border: 'border-[#bae6fd] dark:border-[#60a5fa]/35', dot: 'bg-sky-500' },
    { bg: 'bg-[#d1fae5] dark:bg-[#18373c]', text: 'text-[#065f46] dark:text-[#5eead4]', border: 'border-[#a7f3d0] dark:border-[#2dd4bf]/35', dot: 'bg-emerald-500' },
    { bg: 'bg-[#ede9fe] dark:bg-[#292841]', text: 'text-[#5b21b6] dark:text-[#c4b5fd]', border: 'border-[#ddd6fe] dark:border-[#8b5cf6]/35', dot: 'bg-violet-500' },
    { bg: 'bg-[#fef3c7] dark:bg-[#362f28]', text: 'text-[#92400e] dark:text-[#f8c766]', border: 'border-[#fde68a] dark:border-[#f5a524]/35', dot: 'bg-amber-500' },
    { bg: 'bg-[#ffe4e6] dark:bg-[#321f47]', text: 'text-[#9f1239] dark:text-[#efa7f7]', border: 'border-[#fecdd3] dark:border-[#d946ef]/35', dot: 'bg-rose-500' },
    { bg: 'bg-[#e0e7ff] dark:bg-[#252b49]', text: 'text-[#3730a3] dark:text-[#c7d2fe]', border: 'border-[#c7d2fe] dark:border-[#818cf8]/35', dot: 'bg-indigo-500' },
    { bg: 'bg-[#fae8ff] dark:bg-[#321f47]', text: 'text-[#86198f] dark:text-[#efa7f7]', border: 'border-[#f5d0fe] dark:border-[#d946ef]/35', dot: 'bg-fuchsia-500' },
    { bg: 'bg-[#ccfbf1] dark:bg-[#18373c]', text: 'text-[#115e59] dark:text-[#5eead4]', border: 'border-[#99f6e4] dark:border-[#2dd4bf]/35', dot: 'bg-teal-500' },
  ]
  function getEventColor(id: string) {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
    return EVENT_PALETTE[hash % EVENT_PALETTE.length]
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading calendar...</div>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card p-5 flex items-center justify-between">
        <button onClick={prevMonth} className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-display text-2xl text-slate-800">{MONTHS[viewMonth]}</p>
          <p className="text-sm text-slate-400">{viewYear}</p>
        </div>
        <button onClick={nextMonth} className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {FILTER_TYPES.map(type => (
            <button key={type} onClick={() => setFilterType(type)}
              className={clsx('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all', filterType === type ? 'bg-[#fafaf7] text-[#064e3b] shadow-sm dark:bg-[#2dd4bf] dark:text-[#141b2a]' : 'text-slate-400 hover:text-slate-600')}
            >
              {type === 'ALL' ? 'All Services' : type}
            </button>
          ))}
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setFilterUser('ALL')}
            className={clsx('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all', filterUser === 'ALL' ? 'bg-[#fafaf7] text-[#064e3b] shadow-sm dark:bg-[#2dd4bf] dark:text-[#141b2a]' : 'text-slate-400 hover:text-slate-600')}
          >
            All Bookings
          </button>
          <button onClick={() => setFilterUser('MINE')}
            className={clsx('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all', filterUser === 'MINE' ? 'bg-[#fafaf7] text-[#064e3b] shadow-sm dark:bg-[#2dd4bf] dark:text-[#141b2a]' : 'text-slate-400 hover:text-slate-600')}
          >
            My Bookings
          </button>
        </div>

        {isDirector && (
          <button 
            onClick={() => router.push('/new-request')}
            className="ml-auto flex items-center gap-2 bg-[#064e3b] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#065f46] shadow-lg shadow-emerald-900/10 transition-all cursor-pointer z-30"
          >
            <Plus size={14} /> Add Event
          </button>
        )}
      </div>

      {/* Calendar grid */}
      <div className="card overflow-hidden shadow-xl shadow-slate-200/50">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[#e2e8f0] dark:border-white/[0.08]">
          {DAYS.map(d => (
            <div key={d} className="py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        {/* Date cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
            const events = day ? (eventsByDay[day] ?? []) : []
            
            let totalMinutes = 0;
            events.forEach(e => {
              if (e.startTime && e.endTime) {
                const [sh, sm] = e.startTime.split(':').map(Number)
                const [eh, em] = e.endTime.split(':').map(Number)
                totalMinutes += (eh * 60 + em) - (sh * 60 + sm)
              } else if (e.endDate && new Date(e.endDate) > new Date(e.eventDate)) {
                totalMinutes += 8 * 60 // full day if multiple days
              } else {
                totalMinutes += 4 * 60 // fallback
              }
            })
            const isFullyBooked = totalMinutes >= 6 * 60; // 6 hours or more is fully booked
            const statusColor = events.length === 0 ? 'bg-green-500' : isFullyBooked ? 'bg-red-500' : 'bg-amber-400';
            const bgColor = !day
              ? 'bg-[#f8fafc]/50 dark:bg-[#141b2a]'
              : events.length === 0
                ? 'bg-[#f0fdf4] hover:bg-[#dcfce7] dark:bg-[#18373c] dark:hover:bg-[#1d4548]'
                : isFullyBooked
                  ? 'bg-[#fef2f2] hover:bg-[#fee2e2] dark:bg-[#321f47] dark:hover:bg-[#3d2754]'
                  : 'bg-[#fffbeb] hover:bg-[#fef3c7] dark:bg-[#362f28] dark:hover:bg-[#443a2b]';

            const tooltipText = day && events.length > 0 
              ? `${events.length} booking(s):\n${events.map(event => `- ${event.eventTitle}`).join('\n')}`
              : day ? 'Available' : '';

            return (
              <div
                key={idx}
                title={tooltipText}
                className={clsx(
                  'min-h-[120px] p-3 border-b border-r border-[#e2e8f0] last:border-r-0 transition-colors dark:border-white/[0.08]',
                  idx % 7 === 0 && 'border-l-0',
                  bgColor
                )}
              >
                {day && (
                  <>
                    <div className="flex justify-between items-start mb-1">
                      <span className={clsx(
                        'w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium',
                        isToday ? 'bg-[#1e3a8a] text-white dark:bg-[#2dd4bf] dark:text-[#141b2a]' : 'text-slate-500'
                      )}>
                        {day}
                      </span>
                      <span className={clsx("w-2 h-2 rounded-full mt-2.5", statusColor)} />
                    </div>
                    <div className="space-y-1.5 mt-2">
                      {events.slice(0, 3).map((req, ri) => {
                        const isApproved = req.status === 'DIRECTOR_APPROVED'
                        const isMulti = req._isMultiDay
                        const color = getEventColor(req.id)
                        // Shape classes based on position
                        const shapeClass = isMulti
                          ? req._isStart
                            ? 'rounded-l-full rounded-r-none pr-0 pl-2'
                            : req._isEnd
                              ? 'rounded-r-full rounded-l-none pl-2 pr-2'
                              : 'rounded-none px-2' // mid
                          : 'rounded px-1.5'

                        return (
                          <button
                            key={`${req.id}-${ri}`}
                            onClick={() => setSelected(req)}
                            className={clsx(
                              'w-full text-left py-1 text-[9px] font-bold truncate transition-all border min-h-[22px]',
                              shapeClass,
                              color.bg, color.text, color.border
                            )}
                          >
                            <div className="flex items-center justify-between gap-1 h-full">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {/* Only show dot and title on start day */}
                                {(!isMulti || req._isStart) && (
                                  <>
                                    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', color.dot)} />
                                    <span className="truncate">{req.eventTitle}</span>
                                  </>
                                )}
                              </div>
                              {isApproved && req._isStart && <span className="rounded bg-black/10 px-1 text-[7px] uppercase tracking-tighter dark:bg-black/25 dark:text-white/75">TAKEN</span>}
                              {isMulti && req._isStart && <span className="rounded bg-black/10 px-1 text-[7px] uppercase tracking-tighter dark:bg-black/25 dark:text-white/75">{req._span}d</span>}
                            </div>
                          </button>
                        )
                      })}
                      {events.length > 3 && (
                        <p className="text-[10px] text-slate-400 pl-1 font-bold">+{events.length - 3} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-end rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-white/[0.08] dark:bg-[#1e2a3d]">
        <div className="flex gap-4">
          <span className="flex items-center gap-2 rounded-full bg-[#f0fdf4] px-3 py-1.5 text-green-700 dark:bg-[#18373c] dark:text-[#5eead4]"><span className="w-2 h-2 rounded-full bg-green-400" /> Available</span>
          <span className="flex items-center gap-2 rounded-full bg-[#fffbeb] px-3 py-1.5 text-amber-700 dark:bg-[#362f28] dark:text-[#f8c766]"><span className="w-2 h-2 rounded-full bg-amber-300" /> Partially Booked</span>
          <span className="flex items-center gap-2 rounded-full bg-[#fef2f2] px-3 py-1.5 text-red-700 dark:bg-[#321f47] dark:text-[#efa7f7]"><span className="w-2 h-2 rounded-full bg-red-400" /> Fully Booked</span>
        </div>
      </div>

      {/* Event detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={clsx('p-8 text-white', selected.status === 'DIRECTOR_APPROVED' ? 'bg-emerald-600' : 'bg-amber-500')}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-white/20 px-3 py-1 rounded-full">{selectedServiceLabel} Request</span>
                {selected.status === 'DIRECTOR_APPROVED' && <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-800 px-3 py-1 rounded-full">TAKEN</span>}
              </div>
              <h3 className="font-display text-2xl font-bold leading-tight">{selected.eventTitle}</h3>
              <p className="text-white/80 text-sm mt-2 font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                {selected.school}
              </p>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</p>
                  <p className="font-bold text-slate-700 mt-1">{new Date(selected.eventDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  {selected.startTime && <p className="text-xs text-slate-500 font-medium mt-0.5">🕐 {selected.startTime}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selected.endDate ? 'End Date' : 'Venue'}</p>
                  {selected.endDate
                    ? <>
                        <p className="font-bold text-slate-700 mt-1">{new Date(selected.endDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                        {selected.endTime && <p className="text-xs text-slate-500 font-medium mt-0.5">🕐 {selected.endTime}</p>}
                      </>
                    : <p className="font-bold text-slate-700 mt-1">{selected.eventVenue}</p>
                  }
                </div>
              </div>
              {selected.endDate && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Venue</p>
                  <p className="font-bold text-slate-700 mt-1">{selected.eventVenue}</p>
                </div>
              )}

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Approval Progress</p>
                <div className="space-y-3">
                   <div className="flex items-center gap-3">
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold', 
                        ['COORDINATOR_APPROVED', 'DIRECTOR_APPROVED'].includes(selected.status) ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400')}>
                        1
                      </div>
                      <p className={clsx('text-xs font-bold', ['COORDINATOR_APPROVED', 'DIRECTOR_APPROVED'].includes(selected.status) ? 'text-emerald-700' : 'text-slate-400')}>
                        Coordinator {selected.status === 'PENDING' ? 'Pending' : 'Approved'}
                      </p>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold', 
                        selected.status === 'DIRECTOR_APPROVED' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400')}>
                        2
                      </div>
                      <p className={clsx('text-xs font-bold', selected.status === 'DIRECTOR_APPROVED' ? 'text-emerald-700' : 'text-slate-400')}>
                        Director {selected.status === 'DIRECTOR_APPROVED' ? 'Approved' : 'Pending'}
                      </p>
                   </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex flex-col">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Status</p>
                   <span className={clsx('text-xs font-bold mt-1', selected.status === 'REJECTED' ? 'text-red-500' : 'text-slate-700')}>
                     {getStatusLabel(selected.status)}
                   </span>
                </div>
                <button onClick={() => setSelected(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-bold transition-all">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
