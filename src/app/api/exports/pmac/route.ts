import { NextRequest, NextResponse } from 'next/server'

import { recordPmacActivity } from '@/lib/pmacActivity'
import { buildPmacReportCsv, type PmacReportType } from '@/lib/pmacReports'
import { prisma } from '@/lib/prisma'
import { assertActionAccess } from '@/lib/security'
import { sanitizeSingleLineText } from '@/lib/sanitization'

const ALLOWED_REPORT_TYPES = new Set<PmacReportType>(['members', 'events', 'polls', 'activity'])

function buildFilename(type: PmacReportType) {
  const dateStamp = new Date().toISOString().slice(0, 10)
  return `pmac-${type}-report-${dateStamp}.csv`
}

export async function GET(request: NextRequest) {
  try {
    const session = await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    })

    const typeParam = request.nextUrl.searchParams.get('type') ?? 'events'
    const type = sanitizeSingleLineText(typeParam, {
      fieldName: 'Report type',
      maxLength: 32,
      required: true,
    }) as PmacReportType

    if (!ALLOWED_REPORT_TYPES.has(type)) {
      return NextResponse.json({ error: 'Unsupported PMAC report type.' }, { status: 400 })
    }

    const csv = await buildPmacReportCsv(type)

    await recordPmacActivity(prisma, {
      entityType: 'REPORT',
      entityId: type,
      actorId: session.user.id,
      actorName: session.user.name || 'PMAC User',
      actorRole: session.user.role,
      action: 'REPORT_EXPORTED',
      summary: `Exported the PMAC ${type} report.`,
    })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildFilename(type)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export PMAC report.'
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
