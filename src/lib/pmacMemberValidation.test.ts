import { describe, expect, it } from 'vitest'

import { isPmacMemberStatus, normalizePmacPhone, parsePmacJoinedDate } from './pmacMemberValidation'

describe('PMAC member input validation', () => {
  it('validates member statuses explicitly', () => {
    expect(isPmacMemberStatus('ACTIVE')).toBe(true)
    expect(isPmacMemberStatus('DISABLED')).toBe(false)
  })

  it('normalizes valid phone numbers and rejects invalid input', () => {
    expect(normalizePmacPhone(' +63 917 123 4567 ')).toBe('+63 917 123 4567')
    expect(normalizePmacPhone('')).toBe('')
    expect(() => normalizePmacPhone('call-me')).toThrow(/only contain/i)
    expect(() => normalizePmacPhone('123')).toThrow(/between 7 and 15/i)
  })

  it('parses exact calendar dates without rollover', () => {
    expect(parsePmacJoinedDate('2026-07-16')?.toISOString()).toBe('2026-07-16T00:00:00.000Z')
    expect(() => parsePmacJoinedDate('2026-02-31')).toThrow(/invalid/i)
    expect(() => parsePmacJoinedDate('07/16/2026')).toThrow(/YYYY-MM-DD/i)
  })
})
