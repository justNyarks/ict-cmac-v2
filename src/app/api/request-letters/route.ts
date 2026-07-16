import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { validateRequestLetterFile } from '@/lib/requestLetterUpload'
import { assertActionAccess, assertSameOriginMutation } from '@/lib/security'
import { sanitizeSingleLineText } from '@/lib/sanitization'

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request)
    const session = await assertActionAccess(['SECRETARY', 'ICT_DIRECTOR'])
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) throw new Error('Please select a request letter.')

    const bytes = Buffer.from(await file.arrayBuffer())
    validateRequestLetterFile(file, bytes)
    const fileName = sanitizeSingleLineText(file.name, {
      fieldName: 'File name',
      maxLength: 191,
      required: true,
    })

    const staleUploadCutoff = new Date(Date.now() - (24 * 60 * 60 * 1000))
    await prisma.requestLetterAttachment.deleteMany({
      where: {
        uploadedById: session.user.id,
        requestId: null,
        createdAt: { lt: staleUploadCutoff },
      },
    })

    const attachment = await prisma.requestLetterAttachment.create({
      data: {
        uploadedById: session.user.id,
        fileName,
        mimeType: file.type,
        sizeBytes: file.size,
        data: bytes,
      },
      select: { id: true, fileName: true, sizeBytes: true },
    })

    return NextResponse.json({
      attachment: {
        ...attachment,
        url: `/api/request-letters/${attachment.id}`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload the request letter.'
    const status = message === 'Invalid request origin' || message === 'Unauthorized'
      ? 403
      : message === 'Not authenticated'
        ? 401
        : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOriginMutation(request)
    const session = await assertActionAccess(['SECRETARY', 'ICT_DIRECTOR'])
    const body = await request.json()
    const id = sanitizeSingleLineText(body?.id, {
      fieldName: 'Attachment ID',
      maxLength: 191,
      required: true,
    })

    const removed = await prisma.requestLetterAttachment.deleteMany({
      where: { id, uploadedById: session.user.id, requestId: null },
    })
    if (removed.count !== 1) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove the request letter.'
    return NextResponse.json({ error: message }, { status: message === 'Not authenticated' ? 401 : 400 })
  }
}
