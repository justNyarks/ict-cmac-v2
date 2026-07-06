'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Plus, Tags, X } from 'lucide-react'
import clsx from 'clsx'

import Portal from '@/components/Portal'
import { getPmacExecutiveTagBoard, savePmacExecutiveTags } from '@/app/pmac/actions'
import {
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_SPECIALTY_LABELS,
} from '@/lib/pmac'
import { PMAC_CLUB_ROLE_LABELS } from '@/lib/roles'
import type { PmacExecutiveTitle, PmacSpecialty } from '@/types'

type TagBoard = Awaited<ReturnType<typeof getPmacExecutiveTagBoard>>
type TagMember = NonNullable<TagBoard>['members'][number]

export default function PmacExecutiveTagsPageClient() {
  const [board, setBoard] = useState<TagBoard>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<TagMember | null>(null)
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    window.setTimeout(() => setToast(null), 4000)
  }

  const fetchBoard = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPmacExecutiveTagBoard()
      setBoard(data)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to load executive tags.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  const viewerId = board?.viewer.id ?? null
  const viewerTitleLabel = board?.viewer.executiveTitle
    ? PMAC_EXECUTIVE_TITLE_LABELS[board.viewer.executiveTitle as PmacExecutiveTitle]
    : 'Executive'

  const openEditor = (member: TagMember) => {
    setSelectedMember(member)
    setDraftTags(
      member.receivedTags
        .filter((tag) => tag.assignedByMember.id === board?.viewer.id)
        .map((tag) => tag.label)
    )
    setNewTag('')
  }

  const closeEditor = () => {
    if (saving) {
      return
    }

    setSelectedMember(null)
    setDraftTags([])
    setNewTag('')
  }

  const addTag = () => {
    const normalized = newTag.trim()
    if (!normalized) {
      return
    }

    setDraftTags((previous) => (
      previous.some((tag) => tag.toLowerCase() === normalized.toLowerCase())
        ? previous
        : [...previous, normalized]
    ))
    setNewTag('')
  }

  const removeTag = (tagLabel: string) => {
    setDraftTags((previous) => previous.filter((tag) => tag !== tagLabel))
  }

  const handleSave = async () => {
    if (!selectedMember) {
      return
    }

    setSaving(true)
    try {
      const result = await savePmacExecutiveTags({
        memberId: selectedMember.id,
        tags: draftTags,
      })

      if (!result.success) {
        showToast('error', result.error || 'Failed to save member tags.')
        return
      }

      showToast('success', `Updated ${viewerTitleLabel.toLowerCase()} tags for ${selectedMember.fullName}.`)
      closeEditor()
      await fetchBoard()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to save member tags.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading executive tags...</div>
  }

  if (!board) {
    return <div className="p-10 text-center text-slate-400">Executive tag board is not available.</div>
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
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toast.msg}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl bg-[#0f172a] p-6 text-white shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Executive Tagging</p>
          <h2 className="mt-3 font-display text-3xl font-bold">{board.viewer.fullName}</h2>
          <p className="mt-2 text-sm text-emerald-100">{viewerTitleLabel}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {board.viewer.specialties.map((entry) => (
              <span key={entry.specialty} className="status-badge border-white/20 bg-white/10 text-white">
                {PMAC_SPECIALTY_LABELS[entry.specialty as PmacSpecialty]}
              </span>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">How It Works</p>
          <p className="mt-3 text-sm text-slate-600">Assign branch-specific tags to PMAC members without changing their system role, club role, or specialties.</p>
          <p className="mt-3 text-sm text-slate-600">Members can carry multiple tags from different heads at the same time.</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="font-semibold text-slate-800">Member Tag Board</h3>
            <p className="mt-1 text-xs text-slate-400">Your tags stay independent from other executive heads&apos; tags.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {board.members.length} active members
          </span>
        </div>

        <div className="divide-y divide-slate-50">
          {board.members.map((member) => {
            const myTags = member.receivedTags.filter((tag) => tag.assignedByMember.id === board.viewer.id)
            const otherTags = member.receivedTags.filter((tag) => tag.assignedByMember.id !== board.viewer.id)

            return (
              <div key={member.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{member.fullName}</p>
                    <span className="status-badge bg-sky-50 text-sky-700 border-sky-200">
                      {PMAC_CLUB_ROLE_LABELS[member.clubRole]}
                    </span>
                    {member.executiveTitle ? (
                      <span className="status-badge bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200">
                        {PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle as PmacExecutiveTitle]}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {member.specialties.map((entry) => (
                      <span key={`${member.id}-${entry.specialty}`} className="status-badge bg-amber-50 text-amber-700 border-amber-200">
                        {PMAC_SPECIALTY_LABELS[entry.specialty as PmacSpecialty]}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">Your Branch Tags</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {myTags.length ? myTags.map((tag) => (
                          <span key={tag.id} className="status-badge bg-emerald-50 text-emerald-700 border-emerald-200">
                            {tag.label}
                          </span>
                        )) : (
                          <span className="text-xs text-slate-400">No tags assigned by you yet.</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Other Head Tags</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {otherTags.length ? otherTags.map((tag) => (
                          <span key={tag.id} className="status-badge bg-slate-100 text-slate-700 border-slate-200">
                            {tag.label} · {tag.assignedByMember.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[tag.assignedByMember.executiveTitle as PmacExecutiveTitle] : tag.assignedByMember.fullName}
                          </span>
                        )) : (
                          <span className="text-xs text-slate-400">No tags from other heads yet.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openEditor(member)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#065f46]"
                >
                  <Tags size={14} />
                  Manage My Tags
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {selectedMember ? (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={closeEditor}>
            <div className="w-full max-w-2xl space-y-5 rounded-2xl bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold text-slate-800">Manage Tags for {selectedMember.fullName}</h3>
                <p className="text-sm text-slate-500">These tags belong only to {viewerTitleLabel.toLowerCase()} and will not overwrite tags from other executive heads.</p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Current Tags From Your Branch</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {draftTags.length ? draftTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                    >
                      {tag}
                      <X size={12} />
                    </button>
                  )) : (
                    <p className="text-sm text-slate-500">No tags from your branch yet.</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Add Tag</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder="Example: Portrait Coverage"
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Existing Tags From Other Heads</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedMember.receivedTags.filter((tag) => tag.assignedByMember.id !== viewerId).length ? (
                    selectedMember.receivedTags
                      .filter((tag) => tag.assignedByMember.id !== viewerId)
                      .map((tag) => (
                        <span key={tag.id} className="status-badge bg-slate-100 text-slate-700 border-slate-200">
                          {tag.label} · {tag.assignedByMember.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[tag.assignedByMember.executiveTitle as PmacExecutiveTitle] : tag.assignedByMember.fullName}
                        </span>
                      ))
                  ) : (
                    <p className="text-sm text-slate-500">No tags from other heads yet.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-[#064e3b] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#065f46] disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Tags'}
                </button>
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  )
}
