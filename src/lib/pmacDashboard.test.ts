import { describe, expect, it } from 'vitest'
import { getCoverageReadiness } from './pmacReadiness'
import { getOpenVotingWhere, isPollOpenForVoting } from './pmacVotingWindow'

describe('dashboard workflow rules', () => {
  it('counts partial, declined and pending staffing as needing attention', () => {
    expect(getCoverageReadiness('BOTH', [{ assignmentRole: 'PHOTOGRAPHER', availabilityResponse: 'YES' }]).isReady).toBe(false)
    expect(getCoverageReadiness('PHOTO', [{ assignmentRole: 'PHOTOGRAPHER', availabilityResponse: 'NO' }]).missingRoles).toContain('PHOTOGRAPHER')
    expect(getCoverageReadiness('PHOTO', [{ assignmentRole: 'PHOTOGRAPHER', availabilityResponse: 'PENDING' }]).isReady).toBe(false)
    expect(getCoverageReadiness('PHOTO', [
      { assignmentRole: 'PHOTOGRAPHER', availabilityResponse: 'YES' },
      { assignmentRole: 'JOURNALIST', availabilityResponse: 'YES' },
    ]).isReady).toBe(true)
    expect(getCoverageReadiness(null, []).isReady).toBe(false)
  })
  it('excludes future polls and treats the closing instant as closed', () => {
    const now = new Date('2026-09-08T10:00:00Z')
    expect(isPollOpenForVoting({ status: 'OPEN', closesAt: now }, now)).toBe(false)
    expect(isPollOpenForVoting({ status: 'OPEN', opensAt: new Date(now.getTime() + 1) }, now)).toBe(false)
    expect(isPollOpenForVoting({ status: 'DRAFT' }, now)).toBe(false)
    expect(isPollOpenForVoting({ status: 'OPEN', opensAt: now }, now)).toBe(true)
    expect(getOpenVotingWhere(now)).toEqual({
      status: 'OPEN', AND: [
        { OR: [{ opensAt: null }, { opensAt: { lte: now } }] },
        { OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
      ],
    })
  })
})
