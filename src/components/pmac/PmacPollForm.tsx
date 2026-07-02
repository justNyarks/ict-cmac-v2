'use client'

import { useState, useTransition } from 'react'

import {
  PMAC_POLL_RESULTS_VISIBILITY,
  PMAC_POLL_RESULTS_VISIBILITY_LABELS,
  PMAC_POLL_TYPES,
  PMAC_POLL_TYPE_LABELS,
  type PmacPollResultsVisibility,
  type PmacPollType,
} from '@/lib/pmac'

type PollFormValues = {
  title: string
  description: string
  type: PmacPollType
  opensAt: string
  closesAt: string
  linkedEventId: string
  resultsVisibility: PmacPollResultsVisibility
}

type PollFormResult = {
  success: boolean
  error?: string
  pollId?: string
}

type EventOption = {
  id: string
  title: string
  status: string
  startDateTime: string | Date
}

type PmacPollFormProps = {
  initialValues?: Partial<PollFormValues>
  submitLabel: string
  helperText: string
  eventOptions?: EventOption[]
  onSubmit: (values: PollFormValues) => Promise<PollFormResult>
}

const DEFAULT_VALUES: PollFormValues = {
  title: '',
  description: '',
  type: 'GENERAL',
  opensAt: '',
  closesAt: '',
  linkedEventId: '',
  resultsVisibility: 'AFTER_CLOSE',
}

function formatEventOptionDate(value: string | Date) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PmacPollForm({
  initialValues,
  submitLabel,
  helperText,
  eventOptions = [],
  onSubmit,
}: PmacPollFormProps) {
  const [values, setValues] = useState<PollFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  })
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const setField = <K extends keyof PollFormValues>(field: K, value: PollFormValues[K]) => {
    setValues(previous => ({ ...previous, [field]: value }))
  }

  return (
    <form
      className="card p-6 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')

        startTransition(async () => {
          const result = await onSubmit(values)
          if (!result.success) {
            setError(result.error || 'Something went wrong while saving the PMAC poll.')
          }
        })
      }}
    >
      <div className="space-y-1">
        <h3 className="font-display text-xl font-bold text-slate-800">PMAC Poll Details</h3>
        <p className="text-sm text-slate-500">{helperText}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Title</label>
          <input
            type="text"
            value={values.title}
            onChange={event => setField('title', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Description</label>
          <textarea
            value={values.description}
            onChange={event => setField('description', event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Poll Type</label>
          <select
            value={values.type}
            onChange={event => setField('type', event.target.value as PmacPollType)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            {PMAC_POLL_TYPES.map(type => (
              <option key={type} value={type}>
                {PMAC_POLL_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Results Visibility</label>
          <select
            value={values.resultsVisibility}
            onChange={event => setField('resultsVisibility', event.target.value as PmacPollResultsVisibility)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            {PMAC_POLL_RESULTS_VISIBILITY.map(visibility => (
              <option key={visibility} value={visibility}>
                {PMAC_POLL_RESULTS_VISIBILITY_LABELS[visibility]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Opens At</label>
          <input
            type="datetime-local"
            value={values.opensAt}
            onChange={event => setField('opensAt', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Closes At</label>
          <input
            type="datetime-local"
            value={values.closesAt}
            onChange={event => setField('closesAt', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Linked PMAC Event</label>
          <select
            value={values.linkedEventId}
            onChange={event => setField('linkedEventId', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">No linked event</option>
            {eventOptions.map(event => (
              <option key={event.id} value={event.id}>
                {event.title} - {event.status} - {formatEventOptionDate(event.startDateTime)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-[#064e3b] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#065f46] disabled:opacity-60"
        >
          {isPending ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
