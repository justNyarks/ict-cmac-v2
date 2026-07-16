import { describe, expect, it } from 'vitest'

import { MAX_REQUEST_LETTER_BYTES, validateRequestLetterFile } from '@/lib/requestLetterUpload'

describe('request letter uploads', () => {
  it('accepts a PDF with a matching signature and extension', () => {
    expect(() => validateRequestLetterFile(
      { name: 'request.pdf', type: 'application/pdf', size: 8 },
      Buffer.from('%PDF-1.7')
    )).not.toThrow()
  })

  it('rejects mismatched and oversized uploads', () => {
    expect(() => validateRequestLetterFile(
      { name: 'request.pdf', type: 'application/pdf', size: 8 },
      Buffer.from('not-pdf!')
    )).toThrow(/contents/i)

    expect(() => validateRequestLetterFile(
      { name: 'request.pdf', type: 'application/pdf', size: MAX_REQUEST_LETTER_BYTES + 1 },
      Buffer.from('%PDF')
    )).toThrow(/5 MB/i)
  })
})
