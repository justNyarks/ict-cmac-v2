import { readFile } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedSession } from '@/lib/security'
import { prisma } from '@/lib/prisma'
import { getPmacEventWhere, getPmacPollWhere, isPmacAllowedRole } from '@/app/pmac/actionShared'
import { resolvePmacAttachmentPath } from '@/lib/pmacAttachmentStorage'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await getAuthenticatedSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isPmacAllowedRole(session.user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  const legacyPath = request.nextUrl.searchParams.get('legacyPath')
  if (!id && !legacyPath) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
  const attachment = await prisma.pmacAttachment.findFirst({ where: id ? { id } : { filePath: legacyPath! } })
  if (!attachment) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })

  // Authorization is checked against the current parent record, never the URL or uploader alone.
  let allowed = false
  if (attachment.eventId) {
    allowed = !!await prisma.pmacEvent.findFirst({ where: { AND: [{ id: attachment.eventId }, getPmacEventWhere(session.user)] }, select: { id: true } })
  } else if (attachment.pollId) {
    allowed = !!await prisma.pmacPoll.findFirst({ where: { AND: [{ id: attachment.pollId }, getPmacPollWhere(session.user)] }, select: { id: true } })
  } else if (attachment.memberId) {
    allowed = session.user.role === 'CMAC_COORDINATOR' || session.user.pmacMemberId === attachment.memberId
  }
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    // Read bytes only after parent authorization. Legacy disk files remain supported.
    const content = await prisma.pmacAttachmentContent.findUnique({
      where: { attachmentId: attachment.id }, select: { data: true },
    })
    const bytes = content?.data ?? await readFile(resolvePmacAttachmentPath(attachment.filePath))
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    return NextResponse.json({ error: 'Attachment file is unavailable.' }, { status: 404 })
  }
}
