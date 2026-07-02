'use client'
import { useState } from 'react'
import { getStatusLabel, getStatusColor } from '@/lib/data'
import { ServiceRequest } from '@/types'
import { CheckCircle, Download, Eye, Filter, FileCheck2, Printer, X, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import Portal from '@/components/Portal'
import ConfirmModal from '@/components/ConfirmModal'
import { runWithReverification } from '@/lib/reverificationClient'

const FILTERS = ['ALL', 'PENDING', 'COORDINATOR_APPROVED', 'DIRECTOR_APPROVED', 'REJECTED'] as const

import { approveRequest, rejectRequest, deleteRequest, getRequests, checkConflict } from './actions'
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)
  const [printMode, setPrintMode] = useState<'LETTER' | 'RECEIPT'>('LETTER')
  const [selectedServiceType, setSelectedServiceType] = useState<any>(null)
  const [isDownloadingPastEvents, setIsDownloadingPastEvents] = useState(false)
  const selectedServiceLabel = selected?.serviceType || 'Unassigned'
  const isPrivilegedUser = ['CMAC_COORDINATOR', 'ICT_DIRECTOR'].includes((session?.user as any)?.role)
  const isDirectorBypassApproval = selected?.status === 'PENDING' && (session?.user as any)?.role === 'ICT_DIRECTOR'
  const receiptLetterSource =
    selected?.letterContent ||
    `Formal request for ${selectedServiceLabel} coverage for "${selected?.eventTitle || 'the event'}".`
  const receiptLetterPreview =
    receiptLetterSource.length > 1800 ? `${receiptLetterSource.slice(0, 1800)}...` : receiptLetterSource
  const receiptLetterTextClass =
    receiptLetterSource.length > 1300
      ? 'text-[8px] leading-[1.45]'
      : receiptLetterSource.length > 900
        ? 'text-[8.6px] leading-[1.5]'
        : 'text-[9.2px] leading-[1.6]'

  const SCHOOL_LABELS: Record<string, string> = {
    SNAHS: 'SNAHS',
    SBAHM: 'SBAHM',
    SITE: 'SITE',
    SASTE: 'SASTE',
    MEDICINE: 'SOM',
    BEU: 'BEU',
    UNIVERSITY: 'UNIVERSITY',
    HR: 'HR',
  }

  function getRequesterName(request: any) {
    const letterContent = request?.letterContent
    if (typeof letterContent === 'string') {
      const match = letterContent.match(/Sincerely,\s*\n+\s*(.+?)\s*\n(?:Secretary|Director),/i)
      if (match?.[1]?.trim()) {
        return match[1].trim()
      }
    }

    return request?.secretary?.name || 'Authorized Personnel'
  }

  function getSecretaryTitle(school?: string) {
    if (!school) return 'School Secretary'
    return `${SCHOOL_LABELS[school] || school} Secretary`
  }

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const data = await getRequests()
      setRequests(data)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to load requests.')
    } finally {
      setLoading(false)
    }
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
    if (isDirectorBypassApproval && !note.trim()) {
      alert('A bypass reason is required when the director skips coordinator review.')
      return
    }

    try {
      await runWithReverification(() => approveRequest(id, note, selectedServiceType))
      await fetchRequests()

      setSelected(null)
      setNote('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to approve')
    }
  }

  async function handleReject(id: string) {
    try {
      await runWithReverification(() => rejectRequest(id, note))
      await fetchRequests()
      setSelected(null)
      setNote('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reject')
    }
  }

  async function handleDelete() {
    if (!idToDelete) return;
    try {
      await runWithReverification(() => deleteRequest(idToDelete))
      await fetchRequests()
      setIdToDelete(null)
      setNote('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  async function handleDownloadPastEvents() {
    setIsDownloadingPastEvents(true)

    try {
      const response = await fetch('/api/exports/past-events', {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message =
          payload?.error ||
          (response.status === 428
            ? 'Zero trust verification required before downloading the monthly activity compilation.'
            : 'Failed to download the monthly activity compilation.')
        throw new Error(message)
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/i)
      const filename = filenameMatch?.[1] || 'ict-cmac-monthly-activities.csv'
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to download the monthly activity compilation.')
    } finally {
      setIsDownloadingPastEvents(false)
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
          <div className="ml-auto flex items-center gap-3">
            {isPrivilegedUser && (
              <button
                onClick={handleDownloadPastEvents}
                disabled={isDownloadingPastEvents}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Download current month plus the previous three months"
              >
                <Download size={14} />
                {isDownloadingPastEvents ? 'Preparing Export...' : 'Monthly Activities (4 Months)'}
              </button>
            )}
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{filtered.length} Results</span>
          </div>
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
                      <span className="font-bold text-emerald-700 text-xs">{req.serviceType || 'Unassigned'}</span>
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
                      {req.status === 'DIRECTOR_APPROVED' && (
                        <>
                          {(session?.user as any)?.role === 'SECRETARY' && (
                            <button
                              onClick={() => { setPrintMode('RECEIPT'); setSelected(req); setTimeout(() => window.print(), 100); }}
                              className="p-2.5 rounded-xl bg-slate-900 text-white hover:bg-black transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase px-4"
                              title="Print Receipt"
                            >
                              <Printer size={14} /> Receipt
                            </button>
                          )}
                          {(session?.user as any)?.role === 'ICT_DIRECTOR' && (
                            <button
                              onClick={() => { setPrintMode('LETTER'); setSelected(req); setTimeout(() => window.print(), 100); }}
                              className="p-2.5 rounded-xl bg-[#064e3b] text-white hover:bg-[#065f46] transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase px-4"
                              title="Print Official Letter"
                            >
                              <Printer size={14} /> Letter
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => { setSelected(req); setNote(''); setSelectedServiceType(req.serviceType || 'CMAC') }}
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
                  <p className="text-xs font-bold text-emerald-700/60 mt-2 uppercase tracking-wider">Requested by: <span className="text-emerald-800">{getRequesterName(selected)}</span></p>
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
                      ['Service', selectedServiceLabel],
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
                          { label: 'Same Day Edit (Video)', value: selected.needsSameDayEdit },
                          { label: 'Same-Day Photo Delivery', value: (selected as any).needsSameDayPhoto },
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
                          {selected.coordinatorNote && <p className="text-[11px] text-emerald-600 bg-emerald-50/50 px-3 py-2 rounded-lg font-medium italic mt-2 border border-emerald-100/50">{`"${selected.coordinatorNote}"`}</p>}
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
                          {selected.directorNote && <p className="text-[11px] text-emerald-600 bg-emerald-50/50 px-3 py-2 rounded-lg font-medium italic mt-2 border border-emerald-100/50">{`"${selected.directorNote}"`}</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action area */}
                  {((selected.status === 'PENDING' && (session?.user as any)?.role === 'CMAC_COORDINATOR') || 
                     (['PENDING', 'COORDINATOR_APPROVED'].includes(selected.status) && (session?.user as any)?.role === 'ICT_DIRECTOR')) && (
                    <div className="pt-6 border-t border-emerald-50 space-y-4">
                      {/* Service Type — Director only */}
                      {(session?.user as any)?.role === 'ICT_DIRECTOR' && (
                        <>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Assign Service Type</p>
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Director Only</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            {['CMAC', 'PMAC'].map(type => (
                              <button
                                key={type}
                                onClick={() => setSelectedServiceType(type)}
                                className={clsx(
                                  "py-3 rounded-xl border-2 font-black text-sm transition-all",
                                  selectedServiceType === type 
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                                    : "border-slate-100 text-slate-300 hover:border-emerald-200"
                                )}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Review Action</p>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">As {(session?.user as any)?.role.replace('_', ' ')}</span>
                      </div>
                      {isDirectorBypassApproval && (
                        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Coordinator Review Will Be Skipped</p>
                          <p className="text-xs text-amber-700 mt-1 font-medium">
                            A recorded bypass reason is required before this request can be approved directly by the ICT Director.
                          </p>
                        </div>
                      )}
                      <textarea
                        rows={3}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder={isDirectorBypassApproval ? 'Enter the bypass reason for this direct approval…' : 'Review comments or feedback…'}
                        className="w-full text-sm border-2 border-emerald-50 rounded-2xl p-4 focus:outline-none focus:border-emerald-500 transition-all bg-emerald-50/20 font-medium"
                      />
                      <div className="flex gap-4">
                        <button
                          onClick={() => handleApprove(selected.id)}
                          disabled={isDirectorBypassApproval && !note.trim()}
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

                  {/* Print Area */}
                  {selected.status === 'DIRECTOR_APPROVED' && (
                    <div className="pt-6 border-t border-emerald-50 space-y-3">
                      <div className="flex gap-4">
                        {(session?.user as any)?.role === 'SECRETARY' && (
                          <button
                            onClick={() => { setPrintMode('RECEIPT'); window.print(); }}
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white rounded-2xl py-4 text-sm font-black transition-all shadow-xl shadow-slate-900/10"
                          >
                            <Printer size={18} /> Print Event Receipt
                          </button>
                        )}
                        {(session?.user as any)?.role === 'ICT_DIRECTOR' && (
                          <button
                            onClick={() => { setPrintMode('LETTER'); window.print(); }}
                            className="flex-1 flex items-center justify-center gap-2 bg-[#064e3b] hover:bg-[#065f46] text-white rounded-2xl py-4 text-sm font-black transition-all shadow-xl shadow-emerald-900/10"
                          >
                            <Printer size={18} /> Print Official Letter
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-widest">
                        {(session?.user as any)?.role === 'SECRETARY' ? 'For event documentation and admin submission' : 'For official documentation and hard copy filing'}
                      </p>
                    </div>
                  )}

                  {/* Admin Delete Action */}
                  {isPrivilegedUser && (
                    <div className="pt-6 border-t border-slate-100 space-y-3">
                      <button
                        onClick={() => {
                          setIdToDelete(selected.id);
                          setIsDeleteModalOpen(true);
                          setSelected(null);
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-500 hover:text-white text-red-600 border border-red-100 rounded-2xl py-3 text-sm font-black transition-all"
                      >
                        <Trash2 size={18} /> Delete Request
                      </button>
                    </div>
                  )}
                </div>
              </div>



              {/* Conflict Side Panel (Integrated) */}
              {isPrivilegedUser && (
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

      {/* Hidden Printable Content */}
      {selected && (
        <div className="hidden print:block fixed top-0 left-0 bg-white z-[9999] text-black p-0 m-0 overflow-hidden"
          style={{ width: '8.5in', minHeight: '13in' }}>

          {/* 1. DIRECTOR FILING COPY LAYOUT */}
          {printMode === 'LETTER' && (
            <div className="relative w-full h-[13in] max-h-[13in] flex flex-col font-sans bg-white px-7 py-6 overflow-hidden">
              <div className="absolute inset-4 border border-slate-200 pointer-events-none" />
              <div className="hidden" />
              <div className="relative border-b border-slate-200 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">ICT-CMAC Approved Request</p>
                <h1 className="mt-2 text-[1.8rem] font-black leading-none tracking-[-0.03em] text-slate-950">Official Request Copy</h1>
                <p className="mt-2 text-[11px] font-semibold text-slate-700">St. Paul University Philippines</p>
                <p className="mt-0.5 text-[10px] text-slate-500">ICT - Center for Media and Communications</p>
              </div>

              <div className="relative flex items-end justify-between pt-4 pb-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Issued Document</p>
                  <h2 className="mt-1 text-[1.25rem] font-black tracking-[-0.02em] text-slate-900">Director Filing Copy</h2>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Reference Number</p>
                  <p className="mt-1 text-[13px] font-mono font-black text-slate-900">REQ-{selected.id.slice(-6).toUpperCase()}</p>
                </div>
              </div>

              <div className="relative grid grid-cols-[1.3fr_0.7fr] gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Status</p>
                  <p className="mt-1 text-[1.1rem] font-black text-emerald-900">Approved for Director Filing</p>
                  <p className="mt-1 text-[10px] leading-snug text-emerald-900/70">This request is ready for formal ICT-CMAC filing and record-keeping.</p>
                </div>
                <div className="border-l border-emerald-200 pl-4 text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Approval Date</p>
                  <p className="mt-1.5 text-[13px] font-bold text-slate-800">{selected.directorApprovedAt ? new Date(selected.directorApprovedAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}</p>
                </div>
              </div>

              <div className="relative mt-4 grid grid-cols-[1.35fr_0.65fr] gap-5">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Event Overview</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
                      <div className="col-span-2">
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Event Title</p>
                        <p className="text-[1.15rem] leading-tight font-black text-slate-900">{selected.eventTitle}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Requesting School</p>
                        <p className="text-[13px] font-semibold text-slate-800">{selected.school}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Requested By</p>
                        <p className="text-[13px] font-semibold text-slate-800">{getRequesterName(selected)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Schedule</p>
                        <p className="text-[13px] font-semibold text-slate-800">
                          {new Date(selected.eventDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {selected.endDate && selected.endDate !== selected.eventDate && ` - ${new Date(selected.endDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{selected.startTime} - {selected.endTime}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Venue</p>
                        <p className="text-[13px] font-semibold text-slate-800">{selected.eventVenue}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{selected.campusType === 'IN_CAMPUS' ? 'In-Campus' : 'Off-Campus'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em]">Service Details</h3>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <div>
                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Service Type</p>
                            <p className="mt-1 text-[13px] font-black text-slate-800">{selectedServiceLabel}</p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <div>
                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Documentation</p>
                            <p className="mt-1 text-[13px] font-black text-slate-800">{selected.documentationType === 'BOTH' ? 'Photo & Video' : selected.documentationType}</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Technical Needs</p>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium leading-tight text-slate-700">Same Day Video Edit</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${selected.needsSameDayEdit ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{selected.needsSameDayEdit ? 'Required' : 'Not Needed'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium leading-tight text-slate-700">Same-Day Photo Delivery</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${(selected as any).needsSameDayPhoto ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{(selected as any).needsSameDayPhoto ? 'Required' : 'Not Needed'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em]">Approved Request Letter</p>
                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-[0.18em]">Official Copy</p>
                  </div>
                  <div className={clsx(
                    'mt-3 h-[4.45in] overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 whitespace-pre-wrap text-slate-700',
                    receiptLetterTextClass
                  )}>
                    {receiptLetterPreview}
                  </div>
                </div>
              </div>

              <div className="hidden">
                <div
                  className="pointer-events-none relative flex items-center justify-center rounded-full"
                  style={{
                    width: '1.9in',
                    height: '1.9in',
                    opacity: 0.08,
                    border: '3px solid transparent',
                    boxShadow: 'inset 2px 2px 5px rgba(0,0,0,0.25), inset -2px -2px 5px rgba(255,255,255,0.95), 1px 1px 4px rgba(0,0,0,0.12)'
                  }}
                >
                  <div className="absolute inset-2 rounded-full border border-black/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.2)]"></div>
                  <div className="absolute w-full h-full flex items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]">
                      <path id="curve-receipt-inline-director" d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0" fill="transparent" />
                      <text className="text-[10px] font-black uppercase tracking-[0.08em]" style={{ fill: 'none', stroke: 'rgba(15,23,42,0.55)', strokeWidth: '0.35px' }}>
                        <textPath href="#curve-receipt-inline-director" startOffset="50%" textAnchor="middle">
                          * St. Paul University Philippines *
                        </textPath>
                      </text>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[1.02rem] font-black uppercase tracking-[0.12em] text-slate-700/70">
                      Official
                    </p>
                    <p className="border-y border-slate-500/20 py-1 text-[0.88rem] font-black uppercase tracking-[0.18em] text-slate-700/55">
                      Seal
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative mt-auto grid grid-cols-2 gap-10 pt-2">
                <div className="space-y-2">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Prepared For Director</p>
                  <div className="border-b border-slate-300" />
                  <p className="pt-1 text-[13px] font-black uppercase text-slate-900">{selected.director?.name || 'Dir. Ramon Dela Cruz'}</p>
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.16em]">ICT Director</p>
                </div>
                <div className="space-y-2 text-right">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Verified By</p>
                  <div className="border-b border-slate-300" />
                  <p className="pt-1 text-[13px] font-black uppercase text-slate-900">SPUP ICT-CMAC Portal</p>
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.16em]">Automated Approval System</p>
                </div>
              </div>

              <div className="relative mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-[8px] uppercase tracking-[0.18em] text-slate-500">
                <p>This copy confirms the approved booking.</p>
                <div className="flex gap-6">
                  <p>Printed: {new Date().toLocaleString('en-PH')}</p>
                  <p>Doc ID: REQ-{selected.id.slice(-6).toUpperCase()}</p>
                </div>
              </div>

              <div 
                className="absolute pointer-events-none flex items-center justify-center rounded-full"
                style={{
                  bottom: '0.18in',
                  left: '0.28in',
                  width: '1.9in',
                  height: '1.9in',
                  opacity: 0.09,
                  border: '3px solid transparent',
                  boxShadow: 'inset 2px 2px 5px rgba(0,0,0,0.24), inset -2px -2px 5px rgba(255,255,255,0.95), 1px 1px 4px rgba(0,0,0,0.12)'
                }}
              >
                <div className="absolute inset-2 rounded-full border border-black/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.2)]"></div>
                <div className="absolute w-full h-full flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]">
                    <path id="curve-receipt-director" d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0" fill="transparent" />
                    <text className="text-[10px] font-black uppercase tracking-[0.08em]" style={{ fill: 'none', stroke: 'rgba(15,23,42,0.55)', strokeWidth: '0.35px' }}>
                      <textPath href="#curve-receipt-director" startOffset="50%" textAnchor="middle">
                        * St. Paul University Philippines *
                      </textPath>
                    </text>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[1.02rem] font-black uppercase tracking-[0.12em] text-slate-700/70">
                    Official
                  </p>
                  <p className="border-y border-slate-500/20 py-1 text-[0.88rem] font-black uppercase tracking-[0.18em] text-slate-700/55">
                    Seal
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 1. OFFICIAL LETTER LAYOUT (LEGACY, DISABLED) */}
          {false && printMode === 'LETTER' && (
            <div className="relative w-full min-h-[13in] flex flex-col font-serif px-8 py-6 overflow-hidden">
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
                  <p className="text-xs"><strong>Location:</strong> {selected.campusType === 'IN_CAMPUS' ? 'In-Campus' : 'Off-Campus'}</p>
                  <p className="text-xs"><strong>Service Type:</strong> {selectedServiceLabel}</p>
                  <p className="text-xs"><strong>Documentation:</strong> {selected.documentationType === 'BOTH' ? 'Photo & Video' : selected.documentationType}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Technical Checklist</p>
                  <div className="grid grid-cols-1 gap-y-1 text-[10px] font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-black flex items-center justify-center text-[8px]">{selected.needsSameDayEdit ? 'X' : ''}</div>
                      <span>Same Day Edit (Video)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-black flex items-center justify-center text-[8px]">{(selected as any).needsSameDayPhoto ? 'X' : ''}</div>
                      <span>Same-Day Photo Delivery</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Letter Content */}
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase text-slate-400">Official Request Content</p>
                <div className="text-sm leading-relaxed whitespace-pre-wrap p-6 border border-slate-100 min-h-[200px] italic text-slate-700 bg-white">
                  {selected.letterContent || `Formal request for ${selectedServiceLabel} coverage for the event titled "${selected.eventTitle}".`}
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
                  <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]">
                    <path id="curve" d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0" fill="transparent" />
                    <text className="text-[10px] font-black uppercase tracking-[0.08em]" style={{ fill: 'none', stroke: 'rgba(15,23,42,0.55)', strokeWidth: '0.35px' }}>
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
          )}

          {/* 2. EVENT RECEIPT LAYOUT (SECRETARY) */}
          {printMode === 'RECEIPT' && (
            <div className="relative w-full h-[13in] max-h-[13in] flex flex-col font-sans bg-white px-7 py-6 overflow-hidden">
              <div className="absolute inset-4 border border-slate-200 pointer-events-none" />
              <div className="hidden" />
              {/* Header */}
              <div className="relative border-b border-slate-200 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">ICT-CMAC Approved Request</p>
                <h1 className="mt-2 text-[1.8rem] font-black leading-none tracking-[-0.03em] text-slate-950">Event Service Receipt</h1>
                <p className="mt-2 text-[11px] font-semibold text-slate-700">St. Paul University Philippines</p>
                <p className="mt-0.5 text-[10px] text-slate-500">ICT - Center for Media and Communications</p>
              </div>

              <div className="relative flex items-end justify-between pt-4 pb-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Issued Document</p>
                  <h2 className="mt-1 text-[1.25rem] font-black tracking-[-0.02em] text-slate-900">Approved Service Summary</h2>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Reference Number</p>
                  <p className="mt-1 text-[13px] font-mono font-black text-slate-900">REQ-{selected.id.slice(-6).toUpperCase()}</p>
              </div>
              </div>

              {/* Status Banner */}
              <div className="relative grid grid-cols-[1.3fr_0.7fr] gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Status</p>
                  <p className="mt-1 text-[1.1rem] font-black text-emerald-900">Confirmed and Approved</p>
                  <p className="mt-1 text-[10px] leading-snug text-emerald-900/70">This request has been cleared for ICT-CMAC service scheduling and support.</p>
                </div>
                <div className="border-l border-emerald-200 pl-4 text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Approval Date</p>
                  <p className="mt-1.5 text-[13px] font-bold text-slate-800">{selected.directorApprovedAt ? new Date(selected.directorApprovedAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}</p>
                </div>
              </div>

              <div className="relative mt-4 grid grid-cols-[1.35fr_0.65fr] gap-5">
                {/* Event Summary */}
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Event Overview</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="col-span-2">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Event Title</p>
                      <p className="text-[1.15rem] leading-tight font-black text-slate-900">{selected.eventTitle}</p>
                    </div>
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Requesting School</p>
                        <p className="text-[13px] font-semibold text-slate-800">{selected.school}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Requested By</p>
                        <p className="text-[13px] font-semibold text-slate-800">{getRequesterName(selected)}</p>
                      </div>

                    <div>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Schedule</p>
                      <p className="text-[13px] font-semibold text-slate-800">
                        {new Date(selected.eventDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {selected.endDate && selected.endDate !== selected.eventDate && ` - ${new Date(selected.endDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{selected.startTime} - {selected.endTime}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-1">Venue</p>
                      <p className="text-[13px] font-semibold text-slate-800">{selected.eventVenue}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{selected.campusType === 'IN_CAMPUS' ? 'In-Campus' : 'Off-Campus'}</p>
                    </div>
                  </div>
                </div>
                </div>

                {/* Services Availed */}
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em]">Service Details</h3>
                  <div className="mt-3 space-y-3">
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div>
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Service Type</p>
                          <p className="mt-1 text-[13px] font-black text-slate-800">{selectedServiceLabel}</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div>
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Documentation</p>
                          <p className="mt-1 text-[13px] font-black text-slate-800">{selected.documentationType === 'BOTH' ? 'Photo & Video' : selected.documentationType}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Technical Needs</p>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium leading-tight text-slate-700">Same Day Video Edit</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${selected.needsSameDayEdit ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{selected.needsSameDayEdit ? 'Required' : 'Not Needed'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium leading-tight text-slate-700">Same-Day Photo Delivery</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${(selected as any).needsSameDayPhoto ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{(selected as any).needsSameDayPhoto ? 'Required' : 'Not Needed'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>

                {/* Approved Letter Summary */}
                <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em]">Approved Request Letter</p>
                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-[0.18em]">Filed Copy</p>
                  </div>
                  <div className={clsx(
                    'mt-3 h-[4.45in] overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 whitespace-pre-wrap text-slate-700',
                    receiptLetterTextClass
                  )}>
                    {receiptLetterPreview}
                  </div>
                </div>
              </div>

              <div className="hidden">
                <div
                  className="pointer-events-none relative flex items-center justify-center rounded-full"
                  style={{
                    width: '1.9in',
                    height: '1.9in',
                    opacity: 0.08,
                    border: '3px solid transparent',
                    boxShadow: 'inset 2px 2px 5px rgba(0,0,0,0.25), inset -2px -2px 5px rgba(255,255,255,0.95), 1px 1px 4px rgba(0,0,0,0.12)'
                  }}
                >
                  <div className="absolute inset-2 rounded-full border border-black/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.2)]"></div>
                  <div className="absolute w-full h-full flex items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]">
                      <path id="curve-receipt-inline" d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0" fill="transparent" />
                      <text className="text-[10px] font-black uppercase tracking-[0.08em]" style={{ fill: 'none', stroke: 'rgba(15,23,42,0.55)', strokeWidth: '0.35px' }}>
                        <textPath href="#curve-receipt-inline" startOffset="50%" textAnchor="middle">
                          * St. Paul University Philippines *
                        </textPath>
                      </text>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[1.02rem] font-black uppercase tracking-[0.12em] text-slate-700/70">
                      Official
                    </p>
                    <p className="border-y border-slate-500/20 py-1 text-[0.88rem] font-black uppercase tracking-[0.18em] text-slate-700/55">
                      Seal
                    </p>
                  </div>
                </div>
              </div>

              {/* Acknowledgment */}
              <div className="relative mt-auto grid grid-cols-2 gap-10 pt-2">
                <div className="space-y-2">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Issued To Secretary</p>
                  <div className="border-b border-slate-300" />
                  <p className="pt-1 text-[13px] font-black uppercase text-slate-900">{getRequesterName(selected)}</p>
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.16em]">{getSecretaryTitle(selected.school)}</p>
                </div>
                <div className="space-y-2 text-right">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Verified By</p>
                  <div className="border-b border-slate-300" />
                  <p className="pt-1 text-[13px] font-black uppercase text-slate-900">SPUP ICT-CMAC Portal</p>
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.16em]">Automated Approval System</p>
                </div>
              </div>

              <div className="relative mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-[8px] uppercase tracking-[0.18em] text-slate-500">
                <p>This receipt confirms the approved booking.</p>
                <div className="flex gap-6">
                  <p>Printed: {new Date().toLocaleString('en-PH')}</p>
                  <p>Doc ID: REQ-{selected.id.slice(-6).toUpperCase()}</p>
                </div>
              </div>

              {/* Realistic CSS Dry Seal (Embossed Effect) */}
              <div 
                className="absolute pointer-events-none flex items-center justify-center rounded-full"
                style={{
                  bottom: '0.18in',
                  left: '0.28in',
                  width: '1.9in',
                  height: '1.9in',
                  opacity: 0.09,
                  border: '3px solid transparent',
                  boxShadow: 'inset 2px 2px 5px rgba(0,0,0,0.24), inset -2px -2px 5px rgba(255,255,255,0.95), 1px 1px 4px rgba(0,0,0,0.12)'
                }}
              >
                <div className="absolute inset-2 rounded-full border border-black/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.2)]"></div>
                <div className="absolute w-full h-full flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]">
                    <path id="curve-receipt" d="M 50,50 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0" fill="transparent" />
                    <text className="text-[10px] font-black uppercase tracking-[0.08em]" style={{ fill: 'none', stroke: 'rgba(15,23,42,0.55)', strokeWidth: '0.35px' }}>
                      <textPath href="#curve-receipt" startOffset="50%" textAnchor="middle">
                        ★ St. Paul University Philippines ★
                      </textPath>
                    </text>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[1.02rem] font-black uppercase tracking-[0.12em] text-slate-700/70">
                    Official
                  </p>
                  <p className="border-y border-slate-500/20 py-1 text-[0.88rem] font-black uppercase tracking-[0.18em] text-slate-700/55">
                    Seal
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Request"
        message="Are you sure you want to permanently delete this request? This action cannot be undone."
        confirmText="Yes, Delete"
        cancelText="Keep Request"
      />
    </>
  )
}
