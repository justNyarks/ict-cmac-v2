'use client'
import { useState } from 'react'
import { MOCK_REQUESTS, getStatusLabel, getStatusColor } from '@/lib/data'
import { ServiceRequest } from '@/types'
import { CheckCircle, XCircle, Eye, Filter, FileCheck2, Printer, X } from 'lucide-react'
import clsx from 'clsx'
import Portal from '@/components/Portal'

const FILTERS = ['ALL', 'PENDING', 'COORDINATOR_APPROVED', 'DIRECTOR_APPROVED', 'REJECTED'] as const

import { approveRequest, rejectRequest, getRequests, checkConflict } from './actions'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

export default function RequestsPage() {
  const { data: session } = useSession()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<typeof FILTERS[number]>('ALL')
  const [selected, setSelected] = useState<any | null>(null)
  const [note, setNote] = useState('')
  const [conflicts, setConflicts] = useState<{title: string, date: string, startTime: string | null, venue: string}[]>([])
  const [sameDayEvents, setSameDayEvents] = useState<{title: string, date: string, startTime: string | null, endTime: string | null, venue: string}[]>([])

  const fetchRequests = async () => {
    setLoading(true)
    const data = await getRequests()
    setRequests(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  useEffect(() => {
    if (selected && ['CMAC_COORDINATOR', 'ICT_DIRECTOR'].includes((session?.user as any)?.role)) {
      checkConflict(
        selected.eventDate, 
        selected.startTime, 
        selected.endDate, 
        selected.endTime, 
        selected.eventVenue,
        selected.id
      ).then(res => {
        setConflicts(res.conflicts || [])
        setSameDayEvents(res.sameDayEvents || [])
      })
    } else {
      setConflicts([])
      setSameDayEvents([])
    }
  }, [selected, session])

  const filtered = filter === 'ALL' ? requests : requests.filter(r => r.status === filter)

  async function handleApprove(id: string) {
    try {
      await approveRequest(id, note)
      await fetchRequests()

      setSelected(null)
      setNote('')
    } catch (e) {
      alert('Failed to approve')
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectRequest(id, note)
      await fetchRequests()
      setSelected(null)
      setNote('')
    } catch (e) {
      alert('Failed to reject')
    }
  }

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in print:hidden">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={15} className="text-slate-400" />
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold border transition-all',
                filter === f
                  ? 'bg-[#064e3b] text-white border-[#064e3b] shadow-lg shadow-emerald-900/10'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-200'
              )}
            >
              {f === 'ALL' ? 'All Requests' : getStatusLabel(f as ServiceRequest['status'])}
            </button>
          ))}
          <span className="ml-auto text-xs font-bold text-slate-400 uppercase tracking-widest">{filtered.length} Results</span>
        </div>

        {/* Table */}
        <div className="card overflow-hidden border border-emerald-100/50 shadow-xl shadow-emerald-900/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-emerald-50 bg-emerald-50/20">
                {['Event & School', 'Service Type', 'Request Date', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-6 py-4 text-[10px] font-black text-emerald-800/50 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/50">
              {filtered.map(req => (
                <tr key={req.id} className="hover:bg-emerald-50/30 transition-colors group">
                  <td className="px-6 py-5">
                    <p className="font-bold text-[var(--text-dark)] group-hover:text-emerald-700 transition-colors">{req.eventTitle}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{req.school}</p>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="font-bold text-emerald-700 text-xs">{req.serviceType}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{req.documentationType === 'BOTH' ? 'Photo + Video' : req.documentationType}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-slate-500 font-medium">
                    {new Date(req.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-5">
                    <span className={`status-badge font-bold ${getStatusColor(req.status)}`}>
                      {getStatusLabel(req.status)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {req.status === 'DIRECTOR_APPROVED' && (session?.user as any)?.role === 'SECRETARY' && (
                        <button
                          onClick={() => { setSelected(req); setTimeout(() => window.print(), 100); }}
                          className="p-2.5 rounded-xl bg-slate-900 text-white hover:bg-black transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase px-4"
                          title="Print Official Letter"
                        >
                          <Printer size={14} /> Print
                        </button>
                      )}
                      <button
                        onClick={() => { setSelected(req); setNote('') }}
                        className="p-2.5 rounded-xl hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-all border border-transparent hover:border-emerald-100"
                      >
                        <Eye size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-24 text-center space-y-3">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                <Filter size={24} className="text-slate-200" />
              </div>
              <p className="text-slate-400 text-sm font-medium">No requests match your filter.</p>
            </div>
          )}
        </div>

        {/* Detail / Action Modal */}
        {selected && (
          <Portal>
          <div className="fixed inset-0 bg-[#022c22]/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-6 animate-fade-in print:hidden" onClick={() => setSelected(null)}>
            <div 
              className="bg-white rounded-[2rem] shadow-2xl max-w-5xl w-full max-h-[85vh] flex overflow-hidden relative" 
              onClick={e => e.stopPropagation()}
            >
              
              {/* Main Content Area */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="p-8 pb-4 shrink-0 border-b border-slate-100 relative">
                  <p className="text-[10px] text-emerald-600 font-black uppercase tracking-[0.2em] mb-2">Service Request Detail</p>
                  <h2 className="font-display text-2xl text-[var(--text-dark)] font-black leading-tight pr-10">{selected.eventTitle}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500 uppercase">{selected.eventVenue}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400 font-bold text-sm">{new Date(selected.eventDate).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <p className="text-xs font-bold text-emerald-700/60 mt-2 uppercase tracking-wider">Requested by: <span className="text-emerald-800">{selected.secretary?.name || 'Secretary'}</span></p>
                  <button 
                    onClick={() => setSelected(null)} 
                    className="absolute top-6 right-6 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all z-20 print:hidden"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-8 pt-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-y border-emerald-50">
                    {[
                      ['School', selected.school],
                      ['Service', selected.serviceType],
                      ['Doc Type', selected.documentationType === 'BOTH' ? 'Photo + Video' : selected.documentationType],
                      ['Location', (selected as any).campusType === 'IN_CAMPUS' ? 'In-Campus' : 'Off-Campus'],
                      ['Status', getStatusLabel(selected.status)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{k}</p>
                        <p className="font-bold text-[var(--text-dark)] mt-1">{v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Technical Requirements Checklist */}
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-3">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Technical Requirements</p>
                      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                        {[
                          { label: 'Same-Day Photo Delivery', value: selected.needsSoundSystem },
                          { label: 'LED Wall', value: selected.needsLEDWall },
                          { label: 'Standby ICT Personnel', value: selected.needsICTPersonnel },
                          { label: 'Online Speaker (Setup)', value: selected.hasOnlineSpeaker },
                        ].map(item => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600">{item.label}</span>
                            {item.value ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase tracking-tighter">Required</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-200 text-slate-400 text-[10px] font-black rounded uppercase tracking-tighter">Not Needed</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {(selected.letterContent || selected.letterUrl) && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Official Request Letter</p>
                        {selected.letterUrl && !selected.letterContent && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold uppercase">{selected.letterUrl}</span>
                        )}
                      </div>
                      {selected.letterContent ? (
                        <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                          <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">
                            {selected.letterContent}
                          </pre>
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                            <CheckCircle size={20} className="text-emerald-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-700">Attachment Provided</p>
                            <p className="text-[10px] text-slate-400 font-medium uppercase">{selected.letterUrl}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Approval trail */}
                  <div className="space-y-4 pt-4">
                    <p className="font-black text-[var(--text-dark)] text-[10px] uppercase tracking-widest">Workflow Timeline</p>
                    <div className="space-y-6 relative ml-2">
                      <div className="absolute left-1 top-2 bottom-2 w-0.5 bg-emerald-100"></div>
                      
                      {/* Coordinator Step */}
                      <div className="flex items-start gap-4 relative">
                        <span className={clsx('w-2.5 h-2.5 rounded-full mt-1.5 z-10', 
                          ['COORDINATOR_APPROVED', 'DIRECTOR_APPROVED'].includes(selected.status) ? 'bg-emerald-500 ring-4 ring-emerald-100' : 
                          selected.status === 'REJECTED' && selected.coordinatorNote ? 'bg-red-500 ring-4 ring-red-100' : 'bg-slate-300')} />
                        <div>
                          <p className="text-xs font-bold text-slate-700">Coordinator Review</p>
                          {selected.coordinator ? (
                            <p className="text-[10px] text-slate-400 font-medium">{selected.coordinator.name} · {selected.coordinatorApprovedAt ? new Date(selected.coordinatorApprovedAt).toLocaleDateString('en-PH') : 'Approved'}</p>
                          ) : (
                            selected.status === 'PENDING' ? (
                              <p className="text-[10px] text-amber-500 font-bold uppercase mt-0.5">Awaiting Review</p>
                            ) : (
                              ['DIRECTOR_APPROVED', 'REJECTED'].includes(selected.status) && !selected.coordinatorNote && (
                                <p className="text-[10px] text-slate-300 font-medium italic mt-0.5">Not reviewed by Coordinator</p>
                              )
                            )
                          )}
                          {selected.coordinatorNote && <p className="text-[11px] text-emerald-600 bg-emerald-50/50 px-3 py-2 rounded-lg font-medium italic mt-2 border border-emerald-100/50">"{selected.coordinatorNote}"</p>}
                        </div>
                      </div>

                      {/* Director Step */}
                      <div className="flex items-start gap-4 relative">
                        <span className={clsx('w-2.5 h-2.5 rounded-full mt-1.5 z-10', 
                          selected.status === 'DIRECTOR_APPROVED' ? 'bg-emerald-500 ring-4 ring-emerald-100' : 
                          selected.status === 'REJECTED' && selected.directorNote ? 'bg-red-500 ring-4 ring-red-100' : 'bg-slate-300')} />
                        <div>
                          <p className="text-xs font-bold text-slate-700">Director Final Approval</p>
                          {selected.director ? (
                            <p className="text-[10px] text-slate-400 font-medium">{selected.director.name} · {selected.directorApprovedAt ? new Date(selected.directorApprovedAt).toLocaleDateString('en-PH') : 'Approved'}</p>
                          ) : (
                            ['PENDING', 'COORDINATOR_APPROVED'].includes(selected.status) ? (
                               <p className="text-[10px] text-slate-300 font-bold uppercase mt-0.5">Awaiting Step</p>
                            ) : (
                              selected.status === 'REJECTED' && !selected.directorNote && (
                                <p className="text-[10px] text-slate-300 font-medium italic mt-0.5">Not reached Director</p>
                              )
                            )
                          )}
                          {selected.directorNote && <p className="text-[11px] text-emerald-600 bg-emerald-50/50 px-3 py-2 rounded-lg font-medium italic mt-2 border border-emerald-100/50">"{selected.directorNote}"</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action area */}
                  {((selected.status === 'PENDING' && (session?.user as any)?.role === 'CMAC_COORDINATOR') || 
                     (['PENDING', 'COORDINATOR_APPROVED'].includes(selected.status) && (session?.user as any)?.role === 'ICT_DIRECTOR')) && (
                    <div className="pt-6 border-t border-emerald-50 space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Review Action</p>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">As {(session?.user as any)?.role.replace('_', ' ')}</span>
                      </div>
                      <textarea
                        rows={3}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Review comments or feedback…"
                        className="w-full text-sm border-2 border-emerald-50 rounded-2xl p-4 focus:outline-none focus:border-emerald-500 transition-all bg-emerald-50/20 font-medium"
                      />
                      <div className="flex gap-4">
                        <button
                          onClick={() => handleApprove(selected.id)}
                          className="flex-1 flex items-center justify-center gap-2 bg-[#064e3b] hover:bg-[#065f46] text-white rounded-2xl py-4 text-sm font-black shadow-lg shadow-emerald-900/20 transition-all"
                        >
                          <CheckCircle size={18} /> Approve Request
                        </button>
                        <button
                          onClick={() => handleReject(selected.id)}
                          className="px-8 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl py-4 text-sm font-black transition-all border border-red-100"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Print Area (Secretary) */}
                  {selected.status === 'DIRECTOR_APPROVED' && (session?.user as any)?.role === 'SECRETARY' && (
                    <div className="pt-6 border-t border-emerald-50 space-y-3">
                      <div className="flex gap-4">
                        <button
                          onClick={() => window.print()}
                          className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white rounded-2xl py-4 text-sm font-black transition-all shadow-xl shadow-slate-900/10"
                        >
                          <Printer size={18} /> Prints Letter
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-widest">For official documentation and hard copy filing</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Conflict Side Panel (Integrated) */}
              {['CMAC_COORDINATOR', 'ICT_DIRECTOR'].includes((session?.user as any)?.role) && (
                <div className="w-72 bg-slate-50/80 flex flex-col shrink-0 border-l border-slate-100 animate-slide-in-right">
                  <div className="p-8 bg-slate-900 text-white">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Scheduling Check</p>
                    <h3 className="text-xl font-black">Conflicts</h3>
                  </div>
                  <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-4">
                    {conflicts.length > 0 ? (
                      <>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-2">Overlap Detected</p>
                        {conflicts.map((c, i) => (
                          <div key={i} className="bg-white border border-red-100 p-4 rounded-2xl space-y-2 shadow-sm">
                            <p className="text-sm font-black text-red-900 leading-tight">{c.title}</p>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-red-700/60 uppercase">{c.date}</p>
                              <p className="text-[10px] font-bold text-red-700/60 uppercase">{c.venue}</p>
                            </div>
                            <div className="pt-2">
                              <span className="text-[10px] font-black bg-red-50 text-red-700 px-2 py-0.5 rounded uppercase">{c.startTime || 'All Day'}</span>
                            </div>
                          </div>
                        ))}
                        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                          <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
                            Tip: You can still approve, but consider technical staff availability for simultaneous events.
                          </p>
                        </div>
                      </>
                    ) : sameDayEvents.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                          <div className="w-16 h-16 rounded-3xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                            <FileCheck2 size={32} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800">Clear Venue</p>
                            <p className="text-xs text-slate-400 mt-1">No overlapping bookings in this venue.</p>
                          </div>
                        </div>
                        <div className="mt-2 pt-4 border-t border-slate-100">
                          <p className="text-amber-700 text-xs font-medium leading-relaxed">
                            Other events are scheduled for this date in different venues:
                          </p>
                          <ul className="mt-3 space-y-2">
                            {sameDayEvents.map((c: any, i: number) => (
                              <li key={i} className="text-[10px] font-bold text-amber-800 bg-amber-50/50 border border-amber-100 p-3 rounded-xl flex flex-col gap-1 shadow-sm">
                                <span className="truncate">{c.title}</span>
                                <div className="flex justify-between items-center opacity-60">
                                  <span>@ {c.venue}</span>
                                  <span className="tabular-nums">{c.startTime || '00:00'} - {c.endTime || '23:59'}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
                        <div className="w-16 h-16 rounded-3xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                          <FileCheck2 size={32} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">Clear Schedule</p>
                          <p className="text-xs text-slate-400 mt-1">No overlapping bookings found.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          </Portal>
        )}
      </div>

      {/* Hidden Printable Content (Isolates print block from print:hidden parents) */}
      {selected && (
        <div className="hidden print:block absolute inset-0 bg-white z-[9999] text-black font-serif w-full h-full p-0 m-0">
          <div className="relative w-full h-full flex flex-col">
            {/* Header */}
            <div className="text-center space-y-2 border-b-4 border-double border-black pb-6">
              <h1 className="text-2xl font-black uppercase tracking-tighter">St. Paul University Philippines</h1>
              <p className="text-sm font-bold uppercase tracking-widest">ICT - Center for Media and Communications</p>
              <p className="text-[10px] font-medium italic">Mabini St., Tuguegarao City, Cagayan</p>
            </div>

            {/* Document Title */}
            <div className="text-center py-4">
              <h2 className="text-lg font-black uppercase underline decoration-2 underline-offset-4">OFFICIAL SERVICE REQUISITION</h2>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-3">
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400">Event Title</p>
                  <p className="text-lg font-bold">{selected.eventTitle}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400">Department/School</p>
                  <p className="text-sm font-bold">{selected.school}</p>
                </div>
              </div>
              <div className="text-right space-y-3">
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400">Requisition ID</p>
                  <p className="text-sm font-mono font-bold">REQ-{selected.id.slice(-6).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400">Date of Event</p>
                  <p className="text-sm font-bold">{new Date(selected.eventDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
            </div>

            {/* Technical Requirements & Venue */}
            <div className="grid grid-cols-2 gap-8 py-6 border-y border-slate-200 bg-slate-50/50 px-6">
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Logistics & Venue</p>
                <p className="text-xs"><strong>Venue:</strong> {selected.eventVenue}</p>
                <p className="text-xs"><strong>Service Type:</strong> {selected.serviceType}</p>
                <p className="text-xs"><strong>Documentation:</strong> {selected.documentationType === 'BOTH' ? 'Photo & Video' : selected.documentationType}</p>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Technical Checklist</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border border-black flex items-center justify-center text-[8px]">{selected.needsSoundSystem ? 'X' : ''}</div>
                    <span>Sound System/Mic</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border border-black flex items-center justify-center text-[8px]">{selected.needsLEDWall ? 'X' : ''}</div>
                    <span>LED Wall</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border border-black flex items-center justify-center text-[8px]">{selected.needsICTPersonnel ? 'X' : ''}</div>
                    <span>ICT Standby</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border border-black flex items-center justify-center text-[8px]">{selected.hasOnlineSpeaker ? 'X' : ''}</div>
                    <span>Camera Setup</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Letter Content */}
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase text-slate-400">Official Request Content</p>
              <div className="text-sm leading-relaxed whitespace-pre-wrap p-6 border border-slate-100 min-h-[200px] italic text-slate-700 bg-white">
                {selected.letterContent || `Formal request for ${selected.serviceType} coverage for the event titled "${selected.eventTitle}".`}
              </div>
            </div>

            {/* Narrative Details */}
            {selected.eventDetails && (
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase text-slate-400">Additional Narrative/Notes</p>
                <p className="text-[11px] leading-relaxed text-slate-600">{selected.eventDetails}</p>
              </div>
            )}

            {/* Approval Section */}
            <div className="grid grid-cols-2 gap-16 pt-12">
              <div className="space-y-8">
                <div className="relative">
                  <p className="text-[9px] font-black uppercase text-slate-400 mb-10 italic">Certified and Recommended by:</p>
                  <div className="border-b-2 border-black w-full" />
                  <p className="text-sm font-black mt-2 uppercase">{selected.coordinator?.name || 'Liza Mendoza'}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">CMAC Coordinator</p>
                  {selected.coordinatorNote && <p className="text-[9px] text-emerald-700 mt-2">Note: {selected.coordinatorNote}</p>}
                </div>
              </div>
              <div className="space-y-8">
                <div className="relative">
                  <p className="text-[9px] font-black uppercase text-slate-400 mb-10 italic">Approved by:</p>
                  <div className="border-b-2 border-black w-full" />
                  <p className="text-sm font-black mt-2 uppercase">{selected.director?.name || 'Dir. Ramon Dela Cruz'}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ICT Director</p>
                  {selected.directorNote && <p className="text-[9px] text-emerald-700 mt-2">Note: {selected.directorNote}</p>}
                </div>
              </div>
            </div>

            {/* Footer Text */}
            <div className="mt-auto pt-8 flex justify-between items-end border-t-2 border-slate-800">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-800">This is not valid without official seal.</p>
                <p className="text-[8px] text-slate-500 mt-1 uppercase tracking-widest">SPUP ICT-CMAC Division · Document ID: REQ-{selected.id.slice(-6).toUpperCase()}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.3em]">System Generated Document</p>
                <p className="text-[7px] font-bold text-slate-300 uppercase tracking-[0.2em] mt-1">St. Paul University Philippines © {new Date().getFullYear()}</p>
              </div>
            </div>

            {/* Realistic CSS Dry Seal (Embossed Effect) */}
            <div 
              className="absolute pointer-events-none flex items-center justify-center rounded-full"
              style={{
                bottom: '0in',
                right: '0in',
                width: '2.5in',
                height: '2.5in',
                opacity: 0.15,
                border: '3px solid transparent',
                boxShadow: 'inset 2px 2px 5px rgba(0,0,0,0.4), inset -2px -2px 5px rgba(255,255,255,1), 2px 2px 5px rgba(0,0,0,0.3), -1px -1px 3px rgba(255,255,255,0.8)'
              }}
            >
              <div className="absolute inset-2 rounded-full border border-black/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.2)]"></div>
              <div className="absolute w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-[90%] h-[90%] animate-[spin_60s_linear_infinite]" style={{ animationPlayState: 'paused' }}>
                  <path id="curve" d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0" fill="transparent" />
                  <text className="text-[10.5px] font-black uppercase tracking-[0.1em]" style={{ fill: 'none', stroke: 'rgba(0,0,0,0.6)', strokeWidth: '0.4px', filter: 'drop-shadow(1px 1px 0px rgba(255,255,255,0.8))' }}>
                    <textPath href="#curve" startOffset="50%" textAnchor="middle">
                      ★ St. Paul University Philippines ★
                    </textPath>
                  </text>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-black/60 to-black/20 filter drop-shadow-[1px_1px_0px_rgba(255,255,255,0.8)]">
                  Official
                </p>
                <p className="text-lg font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-br from-black/60 to-black/20 filter drop-shadow-[1px_1px_0px_rgba(255,255,255,0.8)] border-t border-b border-black/20 my-1 py-1">
                  Seal
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
