'use client'

import { useRouter } from 'next/navigation'

import { createPmacEvent } from '@/app/pmac/actions'
import PmacEventForm from '@/components/pmac/PmacEventForm'

export default function PmacNewEventClient() {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">PMAC Director Flow</p>
        <h2 className="font-display text-3xl font-bold text-slate-800">Create Draft Event</h2>
        <p className="text-sm text-slate-500">Drafts stay inside the PMAC module until you submit them for CMAC approval.</p>
      </div>

      <PmacEventForm
        submitLabel="Create Draft Event"
        helperText="This creates a PMAC draft event that can be refined before submission."
        onSubmit={async values => {
          const result = await createPmacEvent(values)
          if (result.success && result.eventId) {
            router.push(`/pmac/events/${result.eventId}`)
          }
          return result
        }}
      />
    </div>
  )
}
