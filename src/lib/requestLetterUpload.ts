import path from 'path'

export const MAX_REQUEST_LETTER_BYTES = 5 * 1024 * 1024

export const REQUEST_LETTER_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
} as const

export type RequestLetterMimeType = keyof typeof REQUEST_LETTER_TYPES

function hasPrefix(bytes: Buffer, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

export function validateRequestLetterFile(file: { name: string; type: string; size: number }, bytes: Buffer) {
  if (!file.name.trim()) throw new Error('Request letter file name is missing.')
  if (file.size <= 0) throw new Error('Request letter file is empty.')
  if (file.size > MAX_REQUEST_LETTER_BYTES) throw new Error('Request letter must be 5 MB or smaller.')

  const extensions = REQUEST_LETTER_TYPES[file.type as RequestLetterMimeType]
  if (!extensions) throw new Error('Request letters must be PDF, DOC, or DOCX files.')
  if (!extensions.includes(path.extname(file.name).toLowerCase() as never)) {
    throw new Error('The request letter extension does not match its file type.')
  }

  const validSignature = file.type === 'application/pdf'
    ? hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])
    : file.type === 'application/msword'
      ? hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      : hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])

  if (!validSignature) throw new Error('The request letter contents do not match the selected file type.')
}
