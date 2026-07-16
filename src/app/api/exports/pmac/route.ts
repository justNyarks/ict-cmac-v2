import { NextRequest, NextResponse } from 'next/server'

import { recordPmacActivity } from '@/lib/pmacActivity'
import {
  describePmacReportPeriod,
  parsePmacReportFilters,
  PMAC_REPORT_STATUS_OPTIONS,
  type PmacReportType,
} from '@/lib/pmacReportFilters'
import { streamPmacReportCsv } from '@/lib/pmacReports'
import { prisma } from '@/lib/prisma'
import { assertActionAccess } from '@/lib/security'
import { sanitizeSingleLineText } from '@/lib/sanitization'

const ALLOWED_REPORT_TYPES = new Set<PmacReportType>(['members', 'events', 'projects', 'staffing', 'performance', 'attendance', 'polls', 'activity'])

function buildFilename(type: PmacReportType) {
  const dateStamp = new Date().toISOString().slice(0, 10)
  return `pmac-${type}-report-${dateStamp}.csv`
}

function createAsyncCsvStream(chunks: AsyncIterable<string>) {
  const encoder = new TextEncoder()
  const iterator = chunks[Symbol.asyncIterator]()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await iterator.next()
      if (result.done) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(result.value))
    },
    async cancel() {
      await iterator.return?.()
    },
  })
}

function getExportErrorStatus(message: string) {
  if (message.startsWith('Authentication required') || message === 'Not authenticated') {
    return 401
  }
  if (message === 'Unauthorized') {
    return 403
  }
  if (message === 'Zero trust verification required') {
    return 428
  }
  if (message === 'Unsupported PMAC report type.' || message.startsWith('Invalid report filter:')) {
    return 400
  }
  if (message.startsWith('Report is too large.')) {
    return 413
  }
  return 500
}

async function authorizeExportRequest(request: NextRequest) {
  const session = await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    zeroTrust: true,
  })
  const typeParam = request.nextUrl.searchParams.get('type') ?? 'events'
  const type = sanitizeSingleLineText(typeParam, {
    fieldName: 'Report type',
    maxLength: 32,
    required: true,
  }) as PmacReportType

  if (!ALLOWED_REPORT_TYPES.has(type)) {
    throw new Error('Unsupported PMAC report type.')
  }

  const filters = parsePmacReportFilters(request.nextUrl.searchParams)
  if (filters.report && filters.report !== type) {
    throw new Error('Invalid report filter: selected report type does not match the export.')
  }
  if (filters.status && !PMAC_REPORT_STATUS_OPTIONS[type].includes(filters.status)) {
    throw new Error('Invalid report filter: status does not apply to this report type.')
  }

  return {
    session,
    type,
    filters,
  }
}

export async function HEAD(request: NextRequest) {
  try {
    await authorizeExportRequest(request)
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to authorize PMAC report export.'
    return new NextResponse(null, { status: getExportErrorStatus(message) })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { session, type, filters } = await authorizeExportRequest(request)
    const body = createAsyncCsvStream(streamPmacReportCsv(type, filters))

    await recordPmacActivity(prisma, {
      entityType: 'REPORT',
      entityId: type,
      actorId: session.user.id,
      actorName: session.user.name || 'PMAC User',
      actorRole: session.user.role,
      action: 'REPORT_EXPORTED',
      summary: `Exported the PMAC ${type} report.`,
      details: `${describePmacReportPeriod(filters)}. Status: ${filters.status ?? 'all'}. Department: ${filters.department ?? 'all'}. Branch: ${filters.branch ?? 'all'}. Scope: ${filters.subject ?? 'all'}.`,
    })

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildFilename(type)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export PMAC report.'

    return NextResponse.json({ error: message }, { status: getExportErrorStatus(message) })
  }
}
