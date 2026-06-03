'use client'
import { useEffect, useState } from 'react'
import { getAuditLogs } from '../requests/actions'
import { History, Search, FileText, User, Calendar, ShieldCheck, XCircle } from 'lucide-react'
import clsx from 'clsx'

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    getAuditLogs().then(data => {
      setLogs(data)
      setLoading(false)
    })
  }, [])

  const filteredLogs = logs.filter(log => 
    (log.request?.eventTitle || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getActionStyle = (action: string) => {
    switch (action) {
      case 'SUBMITTED': return 'bg-blue-50 text-blue-600 border-blue-100'
      case 'COORDINATOR_APPROVED': return 'bg-indigo-50 text-indigo-600 border-indigo-100'
      case 'DIRECTOR_APPROVED': return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'REJECTED': return 'bg-rose-50 text-rose-600 border-rose-100'
      case 'DIRECT_BYPASS': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'DELETED': return 'bg-slate-50 text-slate-600 border-slate-200'
      default: return 'bg-slate-50 text-slate-600 border-slate-100'
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'SUBMITTED': return <FileText size={14} />
      case 'DIRECT_BYPASS': return <ShieldCheck size={14} />
      case 'REJECTED': return <XCircle size={14} />
      default: return <History size={14} />
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">System Audit Logs</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Exclusive Coordinator Activity Monitor</p>
        </div>
        
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search logs (Event, Actor, Action)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-6 py-3 bg-white border border-slate-100 rounded-2xl w-full md:w-80 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all shadow-sm shadow-slate-200/50"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-20 text-center text-slate-400">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest">Fetching Audit Trail...</p>
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-6 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5",
                      getActionStyle(log.action)
                    )}>
                      {getActionIcon(log.action)}
                      {log.action.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-300 font-medium">·</span>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-widest">
                      <Calendar size={12} />
                      {new Date(log.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  
                  <h4 className="text-lg font-black text-slate-800 tracking-tight group-hover:text-emerald-600 transition-colors">
                    {log.request?.eventTitle || 'Unknown Request'}
                  </h4>
                  
                  <p className="text-sm text-slate-500 font-medium leading-relaxed italic">
                    {log.details}
                  </p>
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-1.5 md:min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                      <User size={16} />
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs font-black text-slate-800 tracking-tight leading-none">{log.actorName}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{log.actorRole.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 mx-auto mb-4">
              <History size={32} />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No log entries found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  )
}
