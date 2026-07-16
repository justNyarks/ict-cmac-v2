import { NextRequest, NextResponse } from 'next/server'

import { recordPmacActivity } from '@/lib/pmacActivity'
import { describePmacReportPeriod, parsePmacReportFilters } from '@/lib/pmacReportFilters'
import { buildPmacReportCsv, streamPmacActivityCsv, type PmacReportType } from '@/lib/pmacReports'
import { prisma } from '@/lib/prisma'
import { assertActionAccess } from '@/lib/security'
import { sanitizeSingleLineText } from '@/lib/sanitization'

const ALLOWED_REPORT_TYPES = new Set<PmacReportType>(['members', 'events', 'projects', 'staffing', 'performance', 'attendance', 'polls', 'activity'])

function buildFilename(type: PmacReportType) {
  const dateStamp = new Date().toISOString().slice(0, 10)
  return `pmac-${type}-report-${dateStamp}.csv`
}

function createCsvStream(csv: string) {
  const encoder = new TextEncoder()
  let cursor = 0
  const chunkSize = 64 * 1024

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (cursor >= csv.length) {
        controller.close()
        return
      }

      let end = Math.min(cursor + chunkSize, csv.length)
      if (end < csv.length) {
        const newline = csv.lastIndexOf('\n', end)
        end = newline > cursor ? newline + 1 : end
      }

      controller.enqueue(encoder.encode(csv.slice(cursor, end)))
      cursor = end
    },
  })
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

  return {
    session,
    type,
    filters: parsePmacReportFilters(request.nextUrl.searchParams),
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
    const body = type === 'activity'
      ? createAsyncCsvStream(streamPmacActivityCsv(filters))
      : createCsvStream(await buildPmacReportCsv(type, filters))

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
