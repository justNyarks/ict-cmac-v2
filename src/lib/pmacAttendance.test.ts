import { describe, expect, it } from 'vitest'

import { getPmacAttendanceRecordKey, validatePmacAttendanceSubmission } from './pmacAttendance'

const record = { eventId: 'event-1', memberId: 'member-1' }

describe('PMAC attendance submission validation', () => {
  it('accepts unique members assigned to the event', () => {
    expect(validatePmacAttendanceSubmission([record], new Set([getPmacAttendanceRecordKey(record)]))).toBeNull()
  })

  it('rejects empty, duplicate, and oversized submissions', () => {
    expect(validatePmacAttendanceSubmission([])).toMatch(/at least one/i)
    expect(validatePmacAttendanceSubmission([record, record])).toMatch(/only appear once/i)
    expect(validatePmacAttendanceSubmission(Array.from({ length: 501 }, (_, index) => ({
      eventId: 'event-1',
      memberId: `member-${index}`,
    })))).toMatch(/up to 500/i)
  })

  it('rejects members who are not assigned to the event', () => {
    expect(validatePmacAttendanceSubmission([record], new Set())).toMatch(/members assigned/i)
  })
})
