import { randomUUID } from 'crypto'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'

import { NextRequest, NextResponse } from 'next/server'

import { recordPmacActivity } from '@/lib/pmacActivity'
import { prisma } from '@/lib/prisma'
import { assertActionAccess } from '@/lib/security'
import { sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads', 'pmac')
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function getExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  return extension || '.bin'
}

async function ensureAttachmentAccess(
  role: string,
  targetType: 'event' | 'poll' | 'member',
  targetId: string
) {
  if (targetType === 'event') {
    const event = await prisma.pmacEvent.findUnique({
      where: { id: targetId },
      select: { id: true },
    })

    if (!event) {
      throw new Error('PMAC event not found.')
    }

    if (!['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'].includes(role)) {
      throw new Error('Unauthorized')
    }

    return { eventId: event.id, pollId: null, memberId: null }
  }

  if (targetType === 'poll') {
    const poll = await prisma.pmacPoll.findUnique({
      where: { id: targetId },
      select: { id: true },
    })

    if (!poll) {
      throw new Error('PMAC poll not found.')
    }

    if (!['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'].includes(role)) {
      throw new Error('Unauthorized')
    }

    return { eventId: null, pollId: poll.id, memberId: null }
  }

  const member = await prisma.pmacMember.findUnique({
    where: { id: targetId },
    select: { id: true },
  })

  if (!member) {
    throw new Error('PMAC member not found.')
  }

  if (role !== 'CMAC_COORDINATOR') {
    throw new Error('Unauthorized')
  }

  return { eventId: null, pollId: null, memberId: member.id }
}

async function removeStoredFile(filePath: string) {
  const absolutePath = path.join(process.cwd(), 'public', filePath.replace(/^\/+/, ''))

  try {
    await unlink(absolutePath)
  } catch {
    // Ignore missing files so DB cleanup can still succeed.
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    })
    const formData = await request.formData()

    const targetType = sanitizeSingleLineText(String(formData.get('targetType') ?? ''), {
      fieldName: 'Attachment target type',
      maxLength: 20,
      required: true,
    }).toLowerCase() as 'event' | 'poll' | 'member'
    const targetId = sanitizeSingleLineText(String(formData.get('targetId') ?? ''), {
      fieldName: 'Attachment target ID',
      maxLength: 191,
      required: true,
    })
    const description = sanitizeMultilineText(String(formData.get('description') ?? ''), {
      fieldName: 'Attachment description',
      maxLength: 2000,
    })
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Please choose a file to upload.' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Attachment must be 5 MB or smaller.' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'This file type is not supported for PMAC attachments.' }, { status: 400 })
    }

    const sanitizedFileName = sanitizeSingleLineText(file.name, {
      fieldName: 'File name',
      maxLength: 191,
      required: true,
    })
    const target = await ensureAttachmentAccess(session.user.role, targetType, targetId)

    const monthFolder = new Date().toISOString().slice(0, 7)
    const extension = getExtension(sanitizedFileName)
    const storedName = `${randomUUID()}${extension}`
    const directory = path.join(UPLOAD_ROOT, monthFolder)
    const absolutePath = path.join(directory, storedName)
    const filePath = `/uploads/pmac/${monthFolder}/${storedName}`
    const bytes = Buffer.from(await file.arrayBuffer())

    await mkdir(directory, { recursive: true })
    await writeFile(absolutePath, bytes)

    const attachment = await prisma.$transaction(async (tx) => {
      const createdAttachment = await tx.pmacAttachment.create({
        data: {
          ...target,
          uploadedById: session.user.id,
          fileName: sanitizedFileName,
          storedName,
          filePath,
          mimeType: file.type,
          sizeBytes: file.size,
          description: description || null,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'ATTACHMENT',
        entityId: createdAttachment.id,
        eventId: createdAttachment.eventId,
        pollId: createdAttachment.pollId,
        memberId: createdAttachment.memberId,
        actorId: session.user.id,
        actorName: session.user.name || 'PMAC User',
        actorRole: session.user.role,
        action: 'ATTACHMENT_UPLOADED',
        summary: `Uploaded "${sanitizedFileName}" to a PMAC ${targetType} record.`,
        details: description || null,
      })

      return createdAttachment
    })

    return NextResponse.json({ attachment })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload PMAC attachment.'
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
    })
    const body = await request.json()
    const attachmentId = sanitizeSingleLineText(body?.attachmentId, {
      fieldName: 'Attachment ID',
      maxLength: 191,
      required: true,
    })

    const attachment = await prisma.pmacAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        eventId: true,
        pollId: true,
        memberId: true,
      },
    })

    if (!attachment) {
      return NextResponse.json({ error: 'PMAC attachment not found.' }, { status: 404 })
    }

    if (attachment.memberId && session.user.role !== 'CMAC_COORDINATOR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (attachment.pollId && !['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (attachment.eventId && !['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacAttachment.delete({
        where: { id: attachmentId },
      })

      await recordPmacActivity(tx, {
        entityType: 'ATTACHMENT',
        entityId: attachmentId,
        eventId: attachment.eventId,
        pollId: attachment.pollId,
        memberId: attachment.memberId,
        actorId: session.user.id,
        actorName: session.user.name || 'PMAC User',
        actorRole: session.user.role,
        action: 'ATTACHMENT_DELETED',
        summary: `Removed PMAC attachment "${attachment.fileName}".`,
      })
    })

    await removeStoredFile(attachment.filePath)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove PMAC attachment.'
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
