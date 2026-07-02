'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, Lock } from 'lucide-react'
import clsx from 'clsx'

import { getPmacPolls, getPmacPollWorkspace } from '@/app/pmac/actions'
import { PmacPollStatusBadge, PmacPollTypeBadge, PmacVoteChoiceBadge } from '@/components/pmac/PmacBadges'
import { PMAC_POLL_RESULTS_VISIBILITY_LABELS, PMAC_VOTE_CHOICES } from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'

type PollListItem = Awaited<ReturnType<typeof getPmacPolls>>[number]
type WorkspaceData = Awaited<ReturnType<typeof getPmacPollWorkspace>>

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

export default function PmacCoordinatorPollsClient() {
  const [polls, setPolls] = useState<PollListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceData>(null)
  const [loading, setLoading] = useState(true)

  const loadPolls = useCallback(async () => {
    const result = await getPmacPolls()
    setPolls(result)
    const nextId = selectedId && result.some(poll => poll.id === selectedId)
      ? selectedId
      : result[0]?.id || null
    setSelectedId(nextId)
    return nextId
  }, [selectedId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextId = await loadPolls()
      if (cancelled) {
        return
      }

      if (nextId) {
        const detail = await getPmacPollWorkspace(nextId)
        if (!cancelled) {
          setWorkspace(detail)
        }
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [loadPolls])

  useEffect(() => {
    if (!selectedId) {
      setWorkspace(null)
      return
    }

    const activePollId = selectedId
    let cancelled = false

    async function loadDetail() {
      const detail = await getPmacPollWorkspace(activePollId)
      if (!cancelled) {
        setWorkspace(detail)
      }
    }

    loadDetail()

    return () => {
      cancelled = true
    }
  }, [selectedId])

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC poll oversight...</div>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">CMAC Oversight</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">PMAC Poll Oversight</h2>
        <p className="text-sm text-slate-500">Monitor PMAC governance activity, participation, and results visibility without interrupting the normal club voting flow.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="font-semibold text-slate-800">All PMAC Polls</h3>
            <p className="mt-1 text-xs text-slate-400">Select a poll to review its current governance status.</p>
          </div>
          <div className="divide-y divide-slate-50">
            {polls.map(poll => (
              <button
                key={poll.id}
                onClick={() => setSelectedId(poll.id)}
                className={clsx(
                  'w-full px-6 py-5 text-left transition-colors hover:bg-slate-50',
                  selectedId === poll.id ? 'bg-emerald-50/50' : 'bg-white'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{poll.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(poll.opensAt)} to {formatDateTime(poll.closesAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PmacPollStatusBadge status={poll.status} />
                    <PmacPollTypeBadge type={poll.type} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <span>{poll.votesCast} / {poll.totalEligibleVoters} voted</span>
                  <span>{poll.participationRate}% participation</span>
                  <span>{PMAC_POLL_RESULTS_VISIBILITY_LABELS[poll.resultsVisibility]}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {workspace ? (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Selected Poll</p>
                  <h3 className="mt-2 font-display text-2xl font-bold text-slate-800">{workspace.poll.title}</h3>
                  <p className="mt-2 text-sm text-slate-500">{workspace.poll.description || 'No poll description yet.'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PmacPollStatusBadge status={workspace.poll.status} />
                  <PmacPollTypeBadge type={workspace.poll.type} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Created By</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{workspace.poll.createdBy.name || 'Unknown'}</p>
                  <p className="mt-1 text-xs text-slate-400">{workspace.poll.createdBy.email}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Participation</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{workspace.metrics.totalVotesCast} / {workspace.metrics.totalEligibleVoters}</p>
                  <p className="mt-1 text-xs text-slate-400">{workspace.metrics.participationRate}% participation</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Visibility Rule</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{PMAC_POLL_RESULTS_VISIBILITY_LABELS[workspace.poll.resultsVisibility as keyof typeof PMAC_POLL_RESULTS_VISIBILITY_LABELS]}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(workspace.poll.opensAt)} to {formatDateTime(workspace.poll.closesAt)}</p>
                </div>
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-3">
                {workspace.metrics.resultsVisible ? (
                  <Eye className="text-emerald-600" size={18} />
                ) : (
                  <Lock className="text-amber-600" size={18} />
                )}
                <div>
                  <h3 className="font-display text-xl font-bold text-slate-800">Results Visibility</h3>
                  <p className="text-sm text-slate-500">
                    {workspace.metrics.resultsVisible
                      ? 'Results are currently visible under the configured poll rule.'
                      : 'Results are hidden until the PMAC poll closes.'}
                  </p>
                </div>
              </div>

              {workspace.metrics.resultsVisible && workspace.voteSummary ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {PMAC_VOTE_CHOICES.map(choice => (
                    <div key={choice} className="rounded-2xl bg-slate-50 px-4 py-4">
                      <PmacVoteChoiceBadge choice={choice} />
                      <p className="mt-3 text-2xl font-bold text-slate-800">{workspace.voteSummary?.[choice] ?? 0}</p>
                      <p className="mt-1 text-sm text-slate-500">votes</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  The breakdown remains hidden until the PMAC poll closes.
                </div>
              )}
            </div>

            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Participation Log</h3>
                <p className="text-sm text-slate-500">Observe who participated while preserving the configured result-release behavior.</p>
              </div>

              {workspace.metrics.resultsVisible && workspace.poll.votes.length ? (
                <div className="space-y-3">
                  {workspace.poll.votes.map((vote: any) => (
                    <div key={vote.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{vote.voterMember.fullName}</p>
                          <p className="mt-1 text-xs text-slate-400">{PMAC_CLUB_ROLE_LABELS[vote.voterMember.clubRole as keyof typeof PMAC_CLUB_ROLE_LABELS]}</p>
                        </div>
                        <PmacVoteChoiceBadge choice={vote.selectedOption} />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Submitted on {formatDateTime(vote.votedAt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  Vote details are not visible yet under the current poll configuration.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-10 text-center text-slate-500">Select a PMAC poll to review.</div>
        )}
      </div>
    </div>
  )
}
