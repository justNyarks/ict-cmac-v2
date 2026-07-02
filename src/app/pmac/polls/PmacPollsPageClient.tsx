'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Vote } from 'lucide-react'

import { getPmacPolls } from '@/app/pmac/actions'
import { PmacPollStatusBadge, PmacPollTypeBadge, PmacVoteChoiceBadge } from '@/components/pmac/PmacBadges'
import { filterPmacPolls } from '@/lib/pmacFilters'
import { PMAC_POLL_RESULTS_VISIBILITY_LABELS, PMAC_POLL_STATUSES, PMAC_POLL_STATUS_LABELS, PMAC_POLL_TYPES, PMAC_POLL_TYPE_LABELS } from '@/lib/pmac'

type PollListItem = Awaited<ReturnType<typeof getPmacPolls>>[number]

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return 'Not scheduled'
  }

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PmacPollsPageClient({ role }: { role: string }) {
  const [polls, setPolls] = useState<PollListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')

  useEffect(() => {
    let cancelled = false

    async function loadPolls() {
      const result = await getPmacPolls()
      if (!cancelled) {
        setPolls(result)
        setLoading(false)
      }
    }

    loadPolls()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredPolls = useMemo(
    () => filterPmacPolls(polls, query, statusFilter, typeFilter),
    [polls, query, statusFilter, typeFilter]
  )

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC polls...</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Governance</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-800">Polls and Voting</h2>
          <p className="mt-2 text-sm text-slate-500">Track internal PMAC decisions, member participation, and event-related consultations in one place.</p>
        </div>

        {(role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR') ? (
          <Link
            href="/pmac/polls/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
          >
            <Plus size={14} />
            Create Poll
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[1.2fr_0.7fr_0.7fr]">
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <Search size={16} className="text-slate-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search PMAC polls"
            className="w-full bg-transparent text-sm text-slate-700 outline-none"
          />
        </label>
        <select
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
        >
          <option value="ALL">All statuses</option>
          {PMAC_POLL_STATUSES.map(status => (
            <option key={status} value={status}>
              {PMAC_POLL_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={event => setTypeFilter(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-200"
        >
          <option value="ALL">All poll types</option>
          {PMAC_POLL_TYPES.map(type => (
            <option key={type} value={type}>
              {PMAC_POLL_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {filteredPolls.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPolls.map(poll => (
            <Link key={poll.id} href={`/pmac/polls/${poll.id}`} className="card p-5 space-y-4 hover:-translate-y-0.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <PmacPollStatusBadge status={poll.status} />
                  <p className="text-sm font-semibold text-slate-800">{poll.title}</p>
                </div>
                <PmacPollTypeBadge type={poll.type} />
              </div>

              <p className="text-sm leading-6 text-slate-500">{poll.description || 'No poll description yet.'}</p>

              <div className="space-y-1 text-sm text-slate-500">
                <p>Opens: {formatDateTime(poll.opensAt)}</p>
                <p>Closes: {formatDateTime(poll.closesAt)}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Participation</p>
                <p className="mt-2 font-semibold text-slate-800">
                  {poll.votesCast} / {poll.totalEligibleVoters} voted
                </p>
                <p className="mt-1 text-xs text-slate-500">{poll.participationRate}% participation</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="status-badge bg-slate-100 text-slate-700 border-slate-200">
                  {PMAC_POLL_RESULTS_VISIBILITY_LABELS[poll.resultsVisibility]}
                </span>
                {poll.viewerVote ? <PmacVoteChoiceBadge choice={poll.viewerVote.selectedOption} /> : null}
                {poll.isVotingOpen ? (
                  <span className="status-badge bg-emerald-50 text-emerald-700 border-emerald-200">
                    <Vote size={12} />
                    Voting Open
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Created by {poll.createdBy.name || 'Unknown'}</span>
                <span>{poll.linkedEvent ? `Linked: ${poll.linkedEvent.title}` : 'Standalone poll'}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center space-y-3">
          <h3 className="font-display text-2xl font-bold text-slate-800">No PMAC polls yet</h3>
          <p className="text-sm text-slate-500">
            {(role === 'PMAC_DIRECTOR' || role === 'PMAC_ASSISTANT_DIRECTOR')
              ? 'Start by creating a draft poll, then open it when the club is ready to vote.'
              : 'Once PMAC officers publish polls, they will appear here for participation.'}
          </p>
        </div>
      )}
    </div>
  )
}
