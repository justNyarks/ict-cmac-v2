import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), events: vi.fn(), pending: vi.fn(), polls: vi.fn(), pollCount: vi.fn() }))
vi.mock('@/lib/security', () => ({ requireRoleAccess: mocks.session }))
vi.mock('@/lib/pmacProjects', () => ({ getPmacProjectWhere: async () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  pmacEvent: { count: async () => 2, findMany: mocks.events },
  pmacProject: { count: async () => 0, findMany: async () => [] },
  pmacPoll: { count: mocks.pollCount, findMany: mocks.polls },
  pmacEventAssignment: { count: mocks.pending },
} }))
import PmacRolePage from './PmacRolePage'

describe('dashboard query integration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('React', React)
    mocks.session.mockResolvedValue({ user: { id: 'u1', role: 'PMAC_EXECUTIVE', pmacMemberId: 'm1' } })
    mocks.events.mockResolvedValue([])
    mocks.polls.mockResolvedValue([])
    mocks.pollCount.mockResolvedValue(0)
    mocks.pending.mockResolvedValue(0)
  })
  it('uses approved ongoing events for responses and identical voting filters for cards/counts', async () => {
    await PmacRolePage({ allowedRole: 'PMAC_EXECUTIVE', nextPath: '/pmac/executive', accessSummary: '' })
    expect(mocks.pending).toHaveBeenCalledWith({ where: {
      memberId: 'm1', availabilityResponse: 'PENDING',
      event: { status: 'APPROVED', endDateTime: { gte: expect.any(Date) } },
    } })
    expect(mocks.pollCount.mock.calls[0][0].where).toEqual(mocks.polls.mock.calls[0][0].where)
    expect(mocks.pollCount.mock.calls[0][0].where.AND).toHaveLength(2)
    const upcoming = mocks.events.mock.calls.find(([args]) => args.take === 3)?.[0]
    expect(upcoming.where.status).toBe('APPROVED')
    expect(upcoming.where.assignments).toEqual({ some: { memberId: 'm1' } })
  })
  it('shows partially staffed imported events in the workload count', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'u1', role: 'PMAC_SECRETARY', pmacMemberId: 'm1' } })
    mocks.events.mockImplementation(async args => args.select.assignments ? [
      { sourceDocumentationType: 'BOTH', assignments: [{ assignmentRole: 'PHOTOGRAPHER', availabilityResponse: 'YES' }] },
      { sourceDocumentationType: 'PHOTO', assignments: [
        { assignmentRole: 'PHOTOGRAPHER', availabilityResponse: 'YES' },
        { assignmentRole: 'JOURNALIST', availabilityResponse: 'YES' },
      ] },
    ] : [])
    const page = await PmacRolePage({ allowedRole: 'PMAC_SECRETARY', nextPath: '/pmac/secretary', accessSummary: '' })
    expect(page.props.stats).toContainEqual({ label: 'Needs Staffing', value: 1 })
  })
})
