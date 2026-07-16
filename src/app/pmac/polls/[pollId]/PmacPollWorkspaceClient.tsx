'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft, CheckCircle2, Eye, Lock, Paperclip, Upload, Vote, XCircle } from 'lucide-react'
import clsx from 'clsx'

import {
  archivePmacPoll,
  castPmacVote,
  closePmacPoll,
  getPmacPollWorkspace,
  openPmacPoll,
  updatePmacPoll,
} from '@/app/pmac/actions'
import { PmacPollStatusBadge, PmacPollTypeBadge, PmacVoteChoiceBadge } from '@/components/pmac/PmacBadges'
import PmacPollForm from '@/components/pmac/PmacPollForm'
import {
  PMAC_POLL_RESULTS_VISIBILITY_LABELS,
  PMAC_VOTE_CHOICES,
  PMAC_VOTE_CHOICE_LABELS,
} from '@/lib/pmac'
import { runWithReverification } from '@/lib/reverificationClient'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'

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

function formatDateTimeInput(value: string | Date | null | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export default function PmacPollWorkspaceClient({ pollId }: { pollId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentDescription, setAttachmentDescription] = useState('')
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      setLoading(true)
      const result = await getPmacPollWorkspace(pollId)
      if (!cancelled) {
        setWorkspace(result)
        setLoading(false)
      }
    }

    loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [pollId])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeout = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
  }

  const refreshWorkspace = async () => {
    const result = await getPmacPollWorkspace(pollId)
    setWorkspace(result)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading PMAC poll workspace...</div>
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
        <div className="card p-8 text-center space-y-4">
          <h2 className="font-display text-2xl font-bold text-slate-800">PMAC poll not available</h2>
          <p className="text-sm text-slate-500">This poll may not exist or you may not have access to it.</p>
          <div>
            <Link
              href="/pmac/polls"
              className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
            >
              <ArrowLeft size={14} />
              Back to PMAC Polls
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { poll, metrics, permissions, voteSummary, viewerVote, linkableEvents } = workspace
  const canManageAttachments = permissions.canEdit || permissions.canOpen || permissions.canClose || permissions.canArchive

  const uploadAttachment = async () => {
    if (!attachmentFile) {
      showToast('error', 'Choose a file before uploading.')
      return
    }

    setAttachmentBusy(true)

    try {
      const formData = new FormData()
      formData.set('targetType', 'poll')
      formData.set('targetId', poll.id)
      formData.set('description', attachmentDescription)
      formData.set('file', attachmentFile)

      const response = await fetch('/api/pmac/attachments', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()

      if (!response.ok) {
        showToast('error', payload.error || 'Failed to upload attachment.')
        return
      }

      setAttachmentFile(null)
      setAttachmentDescription('')
      showToast('success', 'Attachment uploaded.')
      await refreshWorkspace()
    } finally {
      setAttachmentBusy(false)
    }
  }

  const deleteAttachment = async (attachmentId: string) => {
    setAttachmentBusy(true)

    try {
      await runWithReverification(async () => {
        const response = await fetch('/api/pmac/attachments', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ attachmentId }),
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to remove attachment.')
        }

        return payload
      })

      showToast('success', 'Attachment removed.')
      await refreshWorkspace()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to remove attachment.')
    } finally {
      setAttachmentBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      {toast ? (
        <div
          className={clsx(
            'fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-2xl',
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Governance</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-800">{poll.title}</h2>
          <p className="mt-2 text-sm text-slate-500">Internal PMAC poll workspace for publishing decisions, collecting votes, and monitoring participation.</p>
        </div>
        <Link
          href="/pmac/polls"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft size={14} />
          Back to PMAC Polls
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div
          className="px-6 py-7 text-white"
          style={{ background: 'var(--hero-gradient)' }}
        >
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <PmacPollStatusBadge status={poll.status} />
                <PmacPollTypeBadge type={poll.type} />
              </div>
              <p className="text-sm text-emerald-100">Results: {PMAC_POLL_RESULTS_VISIBILITY_LABELS[poll.resultsVisibility as keyof typeof PMAC_POLL_RESULTS_VISIBILITY_LABELS]}</p>
              <p className="text-sm text-emerald-100">
                {formatDateTime(poll.opensAt)} to {formatDateTime(poll.closesAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm backdrop-blur-sm">
              <p>Created by: {poll.createdBy.name || 'Unknown'}</p>
              <p className="mt-1">Eligible voters: {metrics.totalEligibleVoters}</p>
              <p className="mt-1">Votes cast: {metrics.totalVotesCast}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-4 md:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Description</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{poll.description || 'No poll description yet.'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Participation</p>
            <p className="mt-3 text-2xl font-bold text-slate-800">{metrics.participationRate}%</p>
            <p className="mt-1 text-sm text-slate-500">{metrics.totalVotesCast} of {metrics.totalEligibleVoters} eligible voters</p>
          </div>
        </div>
      </div>

      {permissions.canEdit ? (
        <PmacPollForm
          initialValues={{
            title: poll.title,
            description: poll.description || '',
            type: poll.type,
            opensAt: formatDateTimeInput(poll.opensAt),
            closesAt: formatDateTimeInput(poll.closesAt),
            linkedEventId: poll.linkedEventId || '',
            resultsVisibility: poll.resultsVisibility,
          }}
          submitLabel="Save Draft Changes"
          helperText="Draft polls can be refined here before you open them to PMAC voters."
          eventOptions={linkableEvents.map((event) => ({
            id: event.id,
            title: event.title,
            status: event.status,
            startDateTime: event.startDateTime,
          }))}
          onSubmit={async values => {
            const result = await updatePmacPoll({
              pollId,
              ...values,
            })
            if (result.success) {
              showToast('success', 'PMAC poll draft updated.')
              await refreshWorkspace()
            }
            return result
          }}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {(permissions.canOpen || permissions.canClose || permissions.canArchive) ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Poll Actions</h3>
                <p className="text-sm text-slate-500">Manage the voting lifecycle as this poll moves from draft to published governance record.</p>
              </div>

              <div className="flex flex-wrap gap-3">
                {permissions.canOpen ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await openPmacPoll(poll.id)
                        if (!result.success) {
                          showToast('error', result.error || 'Failed to open PMAC poll.')
                          return
                        }
                        showToast('success', 'PMAC poll opened for voting.')
                        await refreshWorkspace()
                      })
                    }}
                    className="rounded-xl bg-[#064e3b] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#065f46] disabled:opacity-60"
                  >
                    {isPending ? 'Saving...' : 'Open Poll'}
                  </button>
                ) : null}

                {permissions.canClose ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await closePmacPoll(poll.id)
                        if (!result.success) {
                          showToast('error', result.error || 'Failed to close PMAC poll.')
                          return
                        }
                        showToast('success', 'PMAC poll closed.')
                        await refreshWorkspace()
                      })
                    }}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
                  >
                    {isPending ? 'Saving...' : 'Close Poll'}
                  </button>
                ) : null}

                {permissions.canArchive ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await archivePmacPoll(poll.id)
                        if (!result.success) {
                          showToast('error', result.error || 'Failed to archive PMAC poll.')
                          return
                        }
                        showToast('success', 'PMAC poll archived.')
                        await refreshWorkspace()
                      })
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-60"
                  >
                    {isPending ? 'Saving...' : 'Archive Poll'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {permissions.canVote || viewerVote ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Voting</h3>
                <p className="text-sm text-slate-500">Each eligible PMAC user can submit only one vote for this poll.</p>
              </div>

              {viewerVote ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Your Vote</p>
                  <div className="mt-3 flex items-center gap-3">
                    <PmacVoteChoiceBadge choice={viewerVote.selectedOption} />
                    <span className="text-sm text-emerald-800">Recorded on {formatDateTime(viewerVote.votedAt)}</span>
                  </div>
                </div>
              ) : null}

              {permissions.canVote ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {PMAC_VOTE_CHOICES.map(choice => (
                    <button
                      key={choice}
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await castPmacVote(poll.id, choice)
                          if (!result.success) {
                            showToast('error', result.error || 'Failed to submit PMAC vote.')
                            return
                          }
                          showToast('success', `Vote recorded: ${PMAC_VOTE_CHOICE_LABELS[choice]}.`)
                          await refreshWorkspace()
                        })
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      <p className="text-sm font-semibold text-slate-800">{PMAC_VOTE_CHOICE_LABELS[choice]}</p>
                      <p className="mt-2 text-xs text-slate-500">Submit your one allowed vote for this PMAC poll.</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  Voting is unavailable because this poll is not currently open for your account.
                </div>
              )}
            </div>
          ) : null}

          <div className="card p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-xl font-bold text-slate-800">Linked Context</h3>
              <p className="text-sm text-slate-500">Keep governance decisions connected to PMAC operations when needed.</p>
            </div>

            {poll.linkedEvent ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-800">{poll.linkedEvent.title}</p>
                <p className="mt-1 text-xs text-slate-400">{poll.linkedEvent.status} - {formatDateTime(poll.linkedEvent.startDateTime)}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                This poll is not linked to a PMAC event.
              </div>
            )}
          </div>

          <div className="card p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-xl font-bold text-slate-800">Attachments</h3>
              <p className="text-sm text-slate-500">Attach poll references, approval materials, or supporting PMAC governance files.</p>
            </div>

            {canManageAttachments ? (
              <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <input
                  type="file"
                  onChange={event => setAttachmentFile(event.target.files?.[0] ?? null)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600"
                />
                <input
                  type="text"
                  value={attachmentDescription}
                  onChange={event => setAttachmentDescription(event.target.value)}
                  placeholder="Optional attachment note"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={attachmentBusy}
                    onClick={uploadAttachment}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                  >
                    <Upload size={14} />
                    {attachmentBusy ? 'Uploading...' : 'Upload Attachment'}
                  </button>
                </div>
              </div>
            ) : null}

            {poll.attachments.length ? (
              <div className="space-y-3">
                {poll.attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <a href={attachment.filePath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                          <Paperclip size={14} />
                          {attachment.fileName}
                        </a>
                        <p className="mt-1 text-xs text-slate-400">
                          Uploaded by {attachment.uploadedBy.name || 'Unknown'} · {formatDateTime(attachment.createdAt)}
                        </p>
                      </div>
                      {canManageAttachments ? (
                        <button
                          type="button"
                          disabled={attachmentBusy}
                          onClick={() => deleteAttachment(attachment.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    {attachment.description ? <p className="mt-3 text-sm text-slate-500">{attachment.description}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                No PMAC poll attachments have been added yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              {metrics.resultsVisible ? (
                <Eye className="text-emerald-600" size={18} />
              ) : (
                <Lock className="text-amber-600" size={18} />
              )}
              <div>
                <h3 className="font-display text-xl font-bold text-slate-800">Results</h3>
                <p className="text-sm text-slate-500">
                  {metrics.resultsVisible
                    ? 'Vote breakdown is visible based on the current poll visibility rule.'
                    : 'Vote breakdown is hidden until this poll closes.'}
                </p>
              </div>
            </div>

            {metrics.resultsVisible && voteSummary ? (
              <div className="grid gap-3 md:grid-cols-3">
                {PMAC_VOTE_CHOICES.map(choice => (
                  <div key={choice} className="rounded-2xl bg-slate-50 px-4 py-4">
                    <PmacVoteChoiceBadge choice={choice} />
                    <p className="mt-3 text-2xl font-bold text-slate-800">{voteSummary[choice]}</p>
                    <p className="mt-1 text-sm text-slate-500">votes</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                Results are currently hidden by the poll visibility configuration.
              </div>
            )}
          </div>

          {metrics.resultsVisible && poll.votes.length ? (
            <div className="card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Voter Log</h3>
                <p className="text-sm text-slate-500">Participation visibility for PMAC governance tracking.</p>
              </div>

              <div className="space-y-3">
                {poll.votes.map((vote) => (
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
            </div>
          ) : null}

          <div className="card p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-xl font-bold text-slate-800">Activity History</h3>
              <p className="text-sm text-slate-500">Recent governance actions recorded for this PMAC poll.</p>
            </div>

            {poll.activityLogs.length ? (
              <div className="space-y-3">
                {poll.activityLogs.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{entry.summary}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {entry.actorName} · {entry.actorRole.replaceAll('_', ' ')} · {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                      <span className="status-badge bg-slate-100 text-slate-700 border-slate-200">{entry.action.replaceAll('_', ' ')}</span>
                    </div>
                    {entry.details ? <p className="mt-3 text-sm text-slate-500">{entry.details}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                No PMAC activity entries have been recorded for this poll yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
