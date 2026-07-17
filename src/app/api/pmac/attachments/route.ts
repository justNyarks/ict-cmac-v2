import { randomUUID } from 'crypto'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'

import { NextRequest, NextResponse } from 'next/server'

import {
  MalwareDetectedError,
  MalwareScannerUnavailableError,
  scanUploadedFile,
} from '@/lib/malwareScan'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { prisma } from '@/lib/prisma'
import { assertActionAccess, assertSameOriginMutation } from '@/lib/security'
import { sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'

export const runtime = 'nodejs'

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads', 'pmac')
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = {
  'application/pdf': {
    storedExtension: '.pdf',
    acceptedExtensions: ['.pdf'],
  },
  'image/jpeg': {
    storedExtension: '.jpg',
    acceptedExtensions: ['.jpg', '.jpeg'],
  },
  'image/png': {
    storedExtension: '.png',
    acceptedExtensions: ['.png'],
  },
  'image/webp': {
    storedExtension: '.webp',
    acceptedExtensions: ['.webp'],
  },
  'application/msword': {
    storedExtension: '.doc',
    acceptedExtensions: ['.doc'],
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    storedExtension: '.docx',
    acceptedExtensions: ['.docx'],
  },
} as const

type AllowedUploadMimeType = keyof typeof ALLOWED_UPLOAD_TYPES

function getAllowedUploadType(mimeType: string) {
  return ALLOWED_UPLOAD_TYPES[mimeType as AllowedUploadMimeType] ?? null
}

function hasBytesPrefix(bytes: Buffer, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function hasAllowedFileSignature(bytes: Buffer, mimeType: AllowedUploadMimeType) {
  switch (mimeType) {
    case 'application/pdf':
      return hasBytesPrefix(bytes, [0x25, 0x50, 0x44, 0x46])
    case 'image/jpeg':
      return hasBytesPrefix(bytes, [0xff, 0xd8, 0xff])
    case 'image/png':
      return hasBytesPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return bytes.length >= 12
        && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
        && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    case 'application/msword':
      return hasBytesPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return hasBytesPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])
    default:
      return false
  }
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
    assertSameOriginMutation(request)
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

    const allowedUploadType = getAllowedUploadType(file.type)
    if (!allowedUploadType) {
      return NextResponse.json({ error: 'This file type is not supported for PMAC attachments.' }, { status: 400 })
    }

    const sanitizedFileName = sanitizeSingleLineText(file.name, {
      fieldName: 'File name',
      maxLength: 191,
      required: true,
    })
    const originalExtension = path.extname(sanitizedFileName).toLowerCase()
    if (!allowedUploadType.acceptedExtensions.some(extension => extension === originalExtension)) {
      return NextResponse.json({ error: 'The file extension does not match the uploaded file type.' }, { status: 400 })
    }

    const target = await ensureAttachmentAccess(session.user.role, targetType, targetId)

    const monthFolder = new Date().toISOString().slice(0, 7)
    const extension = allowedUploadType.storedExtension
    const storedName = `${randomUUID()}${extension}`
    const directory = path.join(UPLOAD_ROOT, monthFolder)
    const absolutePath = path.join(directory, storedName)
    const filePath = `/uploads/pmac/${monthFolder}/${storedName}`
    const bytes = Buffer.from(await file.arrayBuffer())

    if (!hasAllowedFileSignature(bytes, file.type as AllowedUploadMimeType)) {
      return NextResponse.json({ error: 'The uploaded file contents do not match the declared file type.' }, { status: 400 })
    }

    await scanUploadedFile(bytes)
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
      error instanceof MalwareDetectedError
        ? 422
        : error instanceof MalwareScannerUnavailableError
          ? 503
          : message === 'Invalid request origin'
            ? 403
            : message === 'Not authenticated'
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
    assertSameOriginMutation(request)
    const session = await assertActionAccess(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'], {
      zeroTrust: true,
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
      message === 'Invalid request origin'
        ? 403
        : message === 'Not authenticated'
        ? 401
        : message === 'Unauthorized'
          ? 403
          : message === 'Zero trust verification required'
            ? 428
            : 500

    return NextResponse.json({ error: message }, { status })
  }
}
