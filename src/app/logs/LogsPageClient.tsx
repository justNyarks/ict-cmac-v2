'use client'

import { useEffect, useState } from 'react'
import { Calendar, FileText, History, Search, ShieldCheck, User, XCircle } from 'lucide-react'
import clsx from 'clsx'

import { getAuditLogs } from '../requests/actions'

type AuditLog = {
  id: string
  createdAt: string | Date
  actorName: string
  actorRole: string
  action: string
  details: string
  request?: {
    eventTitle?: string | null
  } | null
}

export default function LogsPageClient() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    async function loadLogs() {
      try {
        const data = await getAuditLogs()
        setLogs(data as AuditLog[])
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load audit logs.')
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [])

  const filteredLogs = logs.filter(log =>
    (log.request?.eventTitle || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getActionStyle = (action: string) => {
    switch (action) {
      case 'SUBMITTED':
        return 'bg-blue-50 text-blue-600 border-blue-100'
      case 'COORDINATOR_APPROVED':
        return 'bg-indigo-50 text-indigo-600 border-indigo-100'
      case 'DIRECTOR_APPROVED':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'REJECTED':
      case 'CANCELLED':
        return 'bg-rose-50 text-rose-600 border-rose-100'
      case 'REVISION_REQUESTED':
      case 'RESUBMITTED':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'WITHDRAWN':
      case 'ARCHIVED':
        return 'bg-slate-50 text-slate-600 border-slate-200'
      case 'DIRECT_BYPASS':
        return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'DELETED':
        return 'bg-slate-50 text-slate-600 border-slate-200'
      default:
        return 'bg-slate-50 text-slate-600 border-slate-100'
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'SUBMITTED':
        return <FileText size={14} />
      case 'DIRECT_BYPASS':
        return <ShieldCheck size={14} />
      case 'REJECTED':
        return <XCircle size={14} />
      default:
        return <History size={14} />
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-800">System Audit Logs</h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Exclusive Coordinator Activity Monitor</p>
        </div>

        <div className="group relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-500"
            size={18}
          />
          <input
            type="text"
            placeholder="Search logs (Event, Actor, Action)..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="w-full rounded-2xl border border-slate-100 bg-white py-3 pl-12 pr-6 text-sm font-medium shadow-sm shadow-slate-200/50 transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 md:w-80"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-20 text-center text-slate-400">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="text-sm font-bold uppercase tracking-widest">Fetching Audit Trail...</p>
          </div>
        ) : loadError ? (
          <div className="p-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-300">
              <XCircle size={32} />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-red-500">{loadError}</p>
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {filteredLogs.map(log => (
              <div key={log.id} className="flex flex-col gap-6 p-6 transition-colors hover:bg-slate-50/50 md:flex-row md:items-center">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={clsx(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest',
                        getActionStyle(log.action)
                      )}
                    >
                      {getActionIcon(log.action)}
                      {log.action.replaceAll('_', ' ')}
                    </span>
                    <span className="text-xs font-medium text-slate-300">·</span>
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                      <Calendar size={12} />
                      {new Date(log.createdAt).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <h4 className="text-lg font-black tracking-tight text-slate-800 transition-colors group-hover:text-emerald-600">
                    {log.request?.eventTitle || 'Unknown Request'}
                  </h4>

                  <p className="text-sm italic font-medium leading-relaxed text-slate-500">{log.details}</p>
                </div>

                <div className="flex flex-row items-center gap-3 md:min-w-[140px] md:flex-col md:items-end md:gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <User size={16} />
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs font-black leading-none tracking-tight text-slate-800">{log.actorName}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {log.actorRole.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50 text-slate-300">
              <History size={32} />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
              No log entries found matching your search.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
