'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createPmacPoll, getPmacEvents } from '@/app/pmac/actions'
import PmacPollForm from '@/components/pmac/PmacPollForm'

type EventOption = Awaited<ReturnType<typeof getPmacEvents>>[number]

export default function PmacNewPollClient() {
  const router = useRouter()
  const [events, setEvents] = useState<EventOption[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadEvents() {
      const result = await getPmacEvents()
      if (!cancelled) {
        setEvents(result)
      }
    }

    loadEvents()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Officer Flow</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">Create Draft Poll</h2>
        <p className="text-sm text-slate-500">Draft polls let PMAC officers prepare governance decisions before opening them to the club.</p>
      </div>

      <PmacPollForm
        submitLabel="Create Draft Poll"
        helperText="This creates a PMAC draft poll with the fixed Yes, No, and Abstain voting choices."
        eventOptions={events.map(event => ({
          id: event.id,
          title: event.title,
          status: event.status,
          startDateTime: event.startDateTime,
        }))}
        onSubmit={async values => {
          const result = await createPmacPoll(values)
          if (result.success && result.pollId) {
            router.push(`/pmac/polls/${result.pollId}`)
          }
          return result
        }}
      />
    </div>
  )
}
