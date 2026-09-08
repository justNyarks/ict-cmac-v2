import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ events: vi.fn(), members: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pmacAttendance: { groupBy: async () => [] },
    pmacEvent: { findMany: mocks.events }, pmacMember: { findMany: mocks.members },
    pmacProject: { groupBy: async () => [], findMany: async () => [] },
    pmacProjectMilestone: { findMany: async () => [] },
  },
}))
import { buildPmacReportAnalytics } from './pmacReports'

describe('report accuracy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.members.mockResolvedValue([])
    mocks.events.mockResolvedValue([])
  })
  it('counts only confirmed duties toward coverage', async () => {
    mocks.events.mockResolvedValue([{ id: 'e1', title: 'Event', startDateTime: new Date(), sourceDocumentationType: 'BOTH', assignments: [
      { assignmentRole: 'PHOTOGRAPHER', availabilityResponse: 'YES' },
      { assignmentRole: 'VIDEOGRAPHER', availabilityResponse: 'NO' },
      { assignmentRole: 'VIDEOGRAPHER', availabilityResponse: 'PENDING' },
    ] }])
    const result = await buildPmacReportAnalytics()
    // BOTH recommends photographer, videographer and journalist: one of three is confirmed.
    expect(result.coverage[0]).toMatchObject({ assigned: 3, confirmed: 1, pending: 1, percentage: 33 })
  })
  it('keeps no attendance history separate from perfect attendance', async () => {
    mocks.members.mockResolvedValue([{ id: 'm1', fullName: 'Member', department: null, eventAssignments: [], attendanceRecords: [] }])
    expect((await buildPmacReportAnalytics()).members[0].attendanceRate).toBeNull()
  })
  it('attributes late-entered attendance to the event month', async () => {
    mocks.members.mockResolvedValue([{ id: 'm1', fullName: 'Member', department: null, eventAssignments: [], attendanceRecords: [
      { status: 'PRESENT', recordedAt: new Date('2026-09-01'), event: { startDateTime: new Date('2026-07-01') } },
    ] }])
    const result = await buildPmacReportAnalytics()
    expect(result.trends[0]).toMatchObject({ key: '2026-07', reliableAttendance: 1 })
    expect(mocks.members.mock.calls[0][0].select.attendanceRecords.where).toHaveProperty('event.startDateTime')
    expect(mocks.members.mock.calls[0][0].select.attendanceRecords.where).not.toHaveProperty('recordedAt')
  })
})
