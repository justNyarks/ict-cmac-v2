'use client'

import { useState, useTransition } from 'react'

type EventFormValues = {
  title: string
  description: string
  venue: string
  startDateTime: string
  endDateTime: string
}

type EventFormResult = {
  success: boolean
  error?: string
  eventId?: string
}

type PmacEventFormProps = {
  initialValues?: Partial<EventFormValues>
  submitLabel: string
  helperText: string
  onSubmit: (values: EventFormValues) => Promise<EventFormResult>
}

const DEFAULT_VALUES: EventFormValues = {
  title: '',
  description: '',
  venue: '',
  startDateTime: '',
  endDateTime: '',
}

export default function PmacEventForm({
  initialValues,
  submitLabel,
  helperText,
  onSubmit,
}: PmacEventFormProps) {
  const [values, setValues] = useState<EventFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  })
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const setField = <K extends keyof EventFormValues>(field: K, value: EventFormValues[K]) => {
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
            setError(result.error || 'Something went wrong while saving the PMAC event.')
          }
        })
      }}
    >
      <div className="space-y-1">
        <h3 className="font-display text-xl font-bold text-slate-800">PMAC Event Details</h3>
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
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Venue</label>
          <input
            type="text"
            value={values.venue}
            onChange={event => setField('venue', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div></div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Start</label>
          <input
            type="datetime-local"
            value={values.startDateTime}
            onChange={event => setField('startDateTime', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">End</label>
          <input
            type="datetime-local"
            value={values.endDateTime}
            onChange={event => setField('endDateTime', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
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
