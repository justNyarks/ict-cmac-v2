import { describe, expect, it } from 'vitest'

import {
  describePmacReportPeriod,
  getPmacReportDateRange,
  getPmacReportSubject,
  parsePmacReportFilters,
} from './pmacReportFilters'

describe('PMAC report filters', () => {
  it('parses supported report filters', () => {
    const filters = parsePmacReportFilters(new URLSearchParams({
      from: '2026-07-01',
      to: '2026-07-31',
      status: 'COMPLETED',
      branch: 'HEAD_PHOTOGRAPHER',
      department: 'SITE',
      subject: 'EVENT:event-1',
    }))

    expect(filters).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      status: 'COMPLETED',
      branch: 'HEAD_PHOTOGRAPHER',
      department: 'SITE',
      subject: 'EVENT:event-1',
    })
    expect(getPmacReportSubject(filters)).toEqual({ type: 'EVENT', id: 'event-1' })
    expect(describePmacReportPeriod(filters)).toBe('2026-07-01 to 2026-07-31')
  })

  it('uses Manila day boundaries', () => {
    const range = getPmacReportDateRange({ from: '2026-07-01', to: '2026-07-01' })

    expect(range?.gte?.toISOString()).toBe('2026-06-30T16:00:00.000Z')
    expect(range?.lte?.toISOString()).toBe('2026-07-01T15:59:59.999Z')
  })

  it('rejects inverted dates and unsupported values', () => {
    expect(() => parsePmacReportFilters(new URLSearchParams({ from: '2026-08-01', to: '2026-07-01' }))).toThrow(/From date/)
    expect(() => parsePmacReportFilters(new URLSearchParams({ from: '2026-02-31' }))).toThrow(/valid date/)
    expect(() => parsePmacReportFilters(new URLSearchParams({ status: 'EVERYTHING' }))).toThrow(/status/)
    expect(() => parsePmacReportFilters(new URLSearchParams({ subject: 'EVENT:../secret' }))).toThrow(/selection/)
  })
})
