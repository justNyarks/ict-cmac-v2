import { NextResponse } from 'next/server'

import { assertActionAccess } from '@/lib/security'
import { buildPastEventsCsv, getPastEventRequestsForExport } from '@/lib/pastEventsExport'

function buildFilename() {
  const dateStamp = new Date().toISOString().slice(0, 10)
  return `ict-cmac-monthly-activities-${dateStamp}.csv`
}

export async function GET() {
  try {
    const session = await assertActionAccess(['CMAC_COORDINATOR', 'ICT_DIRECTOR'], { zeroTrust: true })
    const requests = await getPastEventRequestsForExport(session.user)
    const csv = buildPastEventsCsv(requests)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildFilename()}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export past events.'
    const status =
      message === 'Not authenticated'
        ? 401
        : message === 'Unauthorized'
          ? 403
          : message === 'Zero trust verification required'
            ? 428
            : 500

    return NextResponse.json({ error: message }, { status })
  }
}
