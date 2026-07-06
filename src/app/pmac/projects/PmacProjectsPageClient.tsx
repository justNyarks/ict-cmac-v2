'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { CalendarDays, ExternalLink, FolderKanban, Link as LinkIcon, Plus, RefreshCw, Users } from 'lucide-react'

import {
  assignPmacProjectMembers,
  attachPmacProjectLink,
  getPmacProjects,
  savePmacProject,
  savePmacProjectMilestone,
  submitPmacProjectOutput,
  updatePmacProjectMilestoneStatus,
  updatePmacProjectStatus,
} from '@/app/pmac/actions'
import {
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_PROJECT_MILESTONE_STATUS_LABELS,
  PMAC_PROJECT_MILESTONE_STATUSES,
  PMAC_PROJECT_LINK_TYPE_LABELS,
  PMAC_PROJECT_LINK_TYPES,
  PMAC_PROJECT_STATUS_LABELS,
  PMAC_PROJECT_STATUSES,
  getPmacProjectMilestoneStatusBadgeClass,
  getPmacProjectStatusBadgeClass,
} from '@/lib/pmac'
import type { PmacExecutiveTitle, PmacProjectLinkType, PmacProjectMilestoneStatus, PmacProjectStatus } from '@/types'

type ProjectBoard = Awaited<ReturnType<typeof getPmacProjects>>
type ProjectRecord = ProjectBoard['projects'][number]

const DEFAULT_PROJECT_FORM = {
  title: '',
  summary: '',
  branch: 'HEAD_PHOTOGRAPHER' as PmacExecutiveTitle,
  headMemberId: '',
  status: 'ACTIVE' as PmacProjectStatus,
  startDate: '',
  targetDate: '',
}

const DEFAULT_MILESTONE_FORM = {
  title: '',
  dueDate: '',
}

const DEFAULT_LINK_FORM = {
  label: '',
  url: '',
  type: 'REFERENCE' as PmacProjectLinkType,
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function healthClass(tone: string) {
  switch (tone) {
    case 'red':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'orange':
      return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'amber':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'emerald':
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
}

export default function PmacProjectsPageClient() {
  const [board, setBoard] = useState<ProjectBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [projectForm, setProjectForm] = useState(DEFAULT_PROJECT_FORM)
  const [milestoneForms, setMilestoneForms] = useState<Record<string, typeof DEFAULT_MILESTONE_FORM>>({})
  const [outputForms, setOutputForms] = useState<Record<string, string>>({})
  const [linkForms, setLinkForms] = useState<Record<string, typeof DEFAULT_LINK_FORM>>({})
  const [teamForms, setTeamForms] = useState<Record<string, string[]>>({})

  const visibleProjects = useMemo(() => board?.projects ?? [], [board])

  async function loadProjects() {
    const result = await getPmacProjects()
    setBoard(result)
    setLoading(false)
  }

  useEffect(() => {
    loadProjects()
  }, [])

  function submitProject() {
    setMessage('')
    startTransition(async () => {
      const result = await savePmacProject(projectForm)
      if (result.success) {
        setProjectForm(DEFAULT_PROJECT_FORM)
        await loadProjects()
        setMessage('Project launched.')
      } else {
        setMessage(result.error ?? 'Unable to launch project.')
      }
    })
  }

  function assignProjectMembers(projectId: string, currentMemberIds: string[]) {
    const memberIds = teamForms[projectId] ?? currentMemberIds
    setMessage('')
    startTransition(async () => {
      const result = await assignPmacProjectMembers({
        projectId,
        memberIds,
      })
      if (result.success) {
        await loadProjects()
        setMessage('Project members assigned.')
      } else {
        setMessage(result.error ?? 'Unable to assign project members.')
      }
    })
  }

  function submitMilestone(projectId: string) {
    const form = milestoneForms[projectId] ?? DEFAULT_MILESTONE_FORM
    setMessage('')
    startTransition(async () => {
      const result = await savePmacProjectMilestone({
        projectId,
        title: form.title,
        dueDate: form.dueDate,
        status: 'TODO',
      })
      if (result.success) {
        setMilestoneForms(previous => ({ ...previous, [projectId]: DEFAULT_MILESTONE_FORM }))
        await loadProjects()
        setMessage('Milestone added.')
      } else {
        setMessage(result.error ?? 'Unable to add milestone.')
      }
    })
  }

  function changeProjectStatus(projectId: string, status: PmacProjectStatus) {
    setMessage('')
    startTransition(async () => {
      const result = await updatePmacProjectStatus(projectId, status)
      if (result.success) {
        await loadProjects()
      } else {
        setMessage(result.error ?? 'Unable to update project status.')
      }
    })
  }

  function changeMilestoneStatus(milestoneId: string, status: PmacProjectMilestoneStatus) {
    setMessage('')
    startTransition(async () => {
      const result = await updatePmacProjectMilestoneStatus(milestoneId, status)
      if (result.success) {
        await loadProjects()
      } else {
        setMessage(result.error ?? 'Unable to update milestone status.')
      }
    })
  }

  function submitOutput(projectId: string) {
    const outputSummary = outputForms[projectId] ?? ''
    setMessage('')
    startTransition(async () => {
      const result = await submitPmacProjectOutput({
        projectId,
        outputSummary,
      })
      if (result.success) {
        setOutputForms(previous => ({ ...previous, [projectId]: '' }))
        await loadProjects()
        setMessage('Project output submitted.')
      } else {
        setMessage(result.error ?? 'Unable to submit project output.')
      }
    })
  }

  function submitProjectLink(projectId: string) {
    const form = linkForms[projectId] ?? DEFAULT_LINK_FORM
    setMessage('')
    startTransition(async () => {
      const result = await attachPmacProjectLink({
        projectId,
        label: form.label,
        url: form.url,
        type: form.type,
      })
      if (result.success) {
        setLinkForms(previous => ({ ...previous, [projectId]: DEFAULT_LINK_FORM }))
        await loadProjects()
        setMessage('Project link attached.')
      } else {
        setMessage(result.error ?? 'Unable to attach project link.')
      }
    })
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400">Loading branch projects...</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Projects</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-800">Branch Project Control</h2>
          <p className="mt-2 text-sm text-slate-500">
            Launch branch projects, assign timelines, and let executive heads manage milestones through completion.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => startTransition(loadProjects)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <Link
            href="/pmac/projects/calendar"
            className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
          >
            <CalendarDays size={14} />
            Project Calendar
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Projects</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{board?.stats.total ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Active</p>
          <p className="mt-3 text-3xl font-bold text-slate-800">{board?.stats.active ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Needs Attention</p>
          <p className="mt-3 text-3xl font-bold text-red-700">{board?.stats.needsAttention ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Due Soon</p>
          <p className="mt-3 text-3xl font-bold text-orange-700">{board?.stats.dueSoon ?? 0}</p>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      {board?.canLaunch ? (
        <div className="card bg-[#f9f6ee] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-slate-800">Launch Branch Project</h3>
              <p className="text-sm text-slate-500">Assign a project to one executive branch and define its working timeline.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={projectForm.title}
              onChange={event => setProjectForm(previous => ({ ...previous, title: event.target.value }))}
              placeholder="Project title"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <select
              value={projectForm.headMemberId}
              onChange={event => {
                const selectedHead = board?.executiveHeads.find(head => head.id === event.target.value)
                setProjectForm(previous => ({
                  ...previous,
                  headMemberId: event.target.value,
                  branch: (selectedHead?.executiveTitle ?? previous.branch) as PmacExecutiveTitle,
                }))
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">Assign executive head</option>
              {board?.executiveHeads.map(head => (
                <option key={head.id} value={head.id}>
                  {head.fullName} - {head.executiveTitle ? PMAC_EXECUTIVE_TITLE_LABELS[head.executiveTitle] : 'Executive Head'}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={projectForm.startDate}
              onChange={event => setProjectForm(previous => ({ ...previous, startDate: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <input
              type="date"
              value={projectForm.targetDate}
              onChange={event => setProjectForm(previous => ({ ...previous, targetDate: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <textarea
              value={projectForm.summary}
              onChange={event => setProjectForm(previous => ({ ...previous, summary: event.target.value }))}
              placeholder="Project summary"
              className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 md:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={submitProject}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
          >
            <FolderKanban size={14} />
            Launch Project
          </button>
        </div>
      ) : null}

      <div className="grid gap-4">
        {visibleProjects.length ? visibleProjects.map((project: ProjectRecord) => {
          const milestoneForm = milestoneForms[project.id] ?? DEFAULT_MILESTONE_FORM
          const linkForm = linkForms[project.id] ?? DEFAULT_LINK_FORM
          const assignedMemberIds = project.memberAssignments.map(assignment => assignment.memberId)
          const selectedTeamMemberIds = teamForms[project.id] ?? assignedMemberIds
          const teamOptions = (board?.assignableMembers ?? []).filter(member => member.id !== project.headMemberId)
          return (
            <div key={project.id} className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`status-badge ${getPmacProjectStatusBadgeClass(project.status)}`}>
                      {PMAC_PROJECT_STATUS_LABELS[project.status]}
                    </span>
                    <span className={`status-badge ${healthClass(project.health.tone)}`}>
                      {project.health.label}
                    </span>
                    <span className="status-badge bg-indigo-50 text-indigo-700 border-indigo-200">
                      {PMAC_EXECUTIVE_TITLE_LABELS[project.branch]}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-bold text-slate-900">{project.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(project.startDate)} to {formatDate(project.targetDate)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    Head: {project.headMember?.fullName ?? PMAC_EXECUTIVE_TITLE_LABELS[project.branch]}
                  </p>
                  {project.summary ? <p className="mt-3 max-w-3xl text-sm text-slate-600">{project.summary}</p> : null}
                  {project.outputSummary ? (
                    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Output Submitted</p>
                      <p className="mt-1 text-sm text-emerald-900">{project.outputSummary}</p>
                      <p className="mt-1 text-xs text-emerald-700">{formatDate(project.outputSubmittedAt)}</p>
                    </div>
                  ) : null}
                </div>
                {project.canManageProject ? (
                  <select
                    value={project.status}
                    onChange={event => changeProjectStatus(project.id, event.target.value as PmacProjectStatus)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {PMAC_PROJECT_STATUSES.map(status => (
                      <option key={status} value={status}>{PMAC_PROJECT_STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                ) : null}
              </div>

              <div className="mt-5">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${project.health.progress}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {project.health.progress}% milestone completion{project.health.nextDueAt ? ` | Next due ${formatDate(project.health.nextDueAt)}` : ''}
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Users size={16} className="text-slate-500" />
                  <p className="text-sm font-bold text-slate-800">Project Team</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.memberAssignments.length ? project.memberAssignments.map(assignment => (
                    <span key={assignment.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                      {assignment.member.fullName}
                    </span>
                  )) : (
                    <span className="text-sm text-slate-400">No members assigned yet.</span>
                  )}
                </div>
                {project.canManageMembers ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                    <select
                      multiple
                      value={selectedTeamMemberIds}
                      onChange={event => setTeamForms(previous => ({
                        ...previous,
                        [project.id]: Array.from(event.target.selectedOptions, option => option.value),
                      }))}
                      className="min-h-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      {teamOptions.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}{member.executiveTitle ? ` - ${PMAC_EXECUTIVE_TITLE_LABELS[member.executiveTitle]}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => assignProjectMembers(project.id, assignedMemberIds)}
                      className="rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60 md:self-start"
                    >
                      Assign Members
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                <div className="space-y-2">
                  {project.milestones.length ? project.milestones.map(milestone => (
                    <div key={milestone.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{milestone.title}</p>
                          <p className="mt-1 text-xs text-slate-500">Due {formatDate(milestone.dueDate)}</p>
                        </div>
                        {project.canManageProject ? (
                          <select
                            value={milestone.status}
                            onChange={event => changeMilestoneStatus(milestone.id, event.target.value as PmacProjectMilestoneStatus)}
                            className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${getPmacProjectMilestoneStatusBadgeClass(milestone.status)}`}
                          >
                            {PMAC_PROJECT_MILESTONE_STATUSES.map(status => (
                              <option key={status} value={status}>{PMAC_PROJECT_MILESTONE_STATUS_LABELS[status]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`rounded-xl border px-3 py-2 text-xs font-bold ${getPmacProjectMilestoneStatusBadgeClass(milestone.status)}`}>
                            {PMAC_PROJECT_MILESTONE_STATUS_LABELS[milestone.status]}
                          </span>
                        )}
                      </div>
                      {milestone.notes ? <p className="mt-2 text-xs text-slate-500">{milestone.notes}</p> : null}
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                      No milestones yet.
                    </div>
                  )}
                </div>

                {project.canManageProject ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                    <p className="text-sm font-bold text-slate-800">Add Milestone</p>
                    <input
                      value={milestoneForm.title}
                      onChange={event => setMilestoneForms(previous => ({ ...previous, [project.id]: { ...milestoneForm, title: event.target.value } }))}
                      placeholder="Milestone title"
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    <input
                      type="date"
                      value={milestoneForm.dueDate}
                      onChange={event => setMilestoneForms(previous => ({ ...previous, [project.id]: { ...milestoneForm, dueDate: event.target.value } }))}
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => submitMilestone(project.id)}
                      className="mt-3 w-full rounded-xl bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
                    >
                      Add Milestone
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <LinkIcon size={16} className="text-slate-500" />
                    <p className="text-sm font-bold text-slate-800">Project Links</p>
                  </div>
                  {project.links.length ? (
                    <div className="space-y-2">
                      {project.links.map(link => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          <span>
                            <span className="font-semibold text-slate-800">{link.label}</span>
                            <span className="ml-2 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              {PMAC_PROJECT_LINK_TYPE_LABELS[link.type]}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-400">
                              Added by {link.addedBy.name || 'PMAC user'}
                            </span>
                          </span>
                          <ExternalLink size={14} className="shrink-0 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                      No project links attached yet.
                    </div>
                  )}
                </div>

                {project.canManageProject ? (
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                    <p className="text-sm font-bold text-slate-800">Attach Link</p>
                    <select
                      value={linkForm.type}
                      onChange={event => setLinkForms(previous => ({ ...previous, [project.id]: { ...linkForm, type: event.target.value as PmacProjectLinkType } }))}
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      {PMAC_PROJECT_LINK_TYPES.map(type => (
                        <option key={type} value={type}>{PMAC_PROJECT_LINK_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                    <input
                      value={linkForm.label}
                      onChange={event => setLinkForms(previous => ({ ...previous, [project.id]: { ...linkForm, label: event.target.value } }))}
                      placeholder="Link label"
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <input
                      value={linkForm.url}
                      onChange={event => setLinkForms(previous => ({ ...previous, [project.id]: { ...linkForm, url: event.target.value } }))}
                      placeholder="https://..."
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => submitProjectLink(project.id)}
                      className="mt-3 w-full rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
                    >
                      Attach Link
                    </button>
                  </div>
                ) : null}
              </div>

              {project.canManageProject && project.status !== 'COMPLETED' ? (
                <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                  <p className="text-sm font-bold text-slate-800">Submit Project Output</p>
                  <textarea
                    value={outputForms[project.id] ?? ''}
                    onChange={event => setOutputForms(previous => ({ ...previous, [project.id]: event.target.value }))}
                    placeholder="Describe the completed output, final links, deliverables, or turnover notes"
                    className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => submitOutput(project.id)}
                    className="mt-3 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
                  >
                    Submit Output & Complete
                  </button>
                </div>
              ) : null}
            </div>
          )
        }) : (
          <div className="card p-10 text-center text-slate-400">
            No branch projects yet.
          </div>
        )}
      </div>
    </div>
  )
}
