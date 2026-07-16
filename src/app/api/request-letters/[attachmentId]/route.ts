import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isCoreWorkflowRole } from '@/lib/roles'

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isCoreWorkflowRole(session.user.role)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { attachmentId } = await context.params
  const attachment = await prisma.requestLetterAttachment.findUnique({
    where: { id: attachmentId },
    include: { request: { select: { secretaryId: true } } },
  })
  if (!attachment) return NextResponse.json({ error: 'Request letter not found.' }, { status: 404 })

  const isLeadership = session.user.role === 'CMAC_COORDINATOR' || session.user.role === 'ICT_DIRECTOR'
  const ownsAttachment = attachment.uploadedById === session.user.id
  const ownsRequest = attachment.request?.secretaryId === session.user.id
  if (!isLeadership && !ownsAttachment && !ownsRequest) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const bytes = Uint8Array.from(attachment.data)
  return new NextResponse(bytes.buffer, {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.sizeBytes),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
