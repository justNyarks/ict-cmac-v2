import { describe, expect, it } from 'vitest'

import {
  buildAnalyticsSnapshot,
  parseAnalyticsFilters,
  type AnalyticsSourceRequest,
} from './analytics'

function request(overrides: Partial<AnalyticsSourceRequest>): AnalyticsSourceRequest {
  return {
    school: 'SITE',
    serviceType: 'CMAC',
    documentationType: 'PHOTO',
    status: 'PENDING',
    eventDate: new Date('2026-07-16T08:00:00.000Z'),
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    directorApprovedAt: null,
    needsSameDayEdit: false,
    needsSameDayPhoto: false,
    ...overrides,
  }
}

describe('CMAC analytics', () => {
  it('builds decision and operational metrics from request data', () => {
    const snapshot = buildAnalyticsSnapshot([
      request({
        status: 'DIRECTOR_APPROVED',
        eventDate: new Date('2026-07-20T08:00:00.000Z'),
        directorApprovedAt: new Date('2026-07-02T08:00:00.000Z'),
      }),
      request({
        school: 'SASTE',
        serviceType: 'PMAC',
        documentationType: 'BOTH',
        status: 'DIRECTOR_APPROVED',
        eventDate: new Date('2026-07-10T08:00:00.000Z'),
        createdAt: new Date('2026-07-01T08:00:00.000Z'),
        directorApprovedAt: new Date('2026-07-03T08:00:00.000Z'),
      }),
      request({
        school: 'SBAHM',
        serviceType: null,
        documentationType: 'VIDEO',
        status: 'REJECTED',
        eventDate: new Date('2026-07-15T08:00:00.000Z'),
        needsSameDayEdit: true,
      }),
      request({
        status: 'PENDING',
        eventDate: new Date('2026-07-14T08:00:00.000Z'),
        needsSameDayPhoto: true,
      }),
      request({
        school: 'SNAHS',
        serviceType: null,
        status: 'COORDINATOR_APPROVED',
        eventDate: new Date('2026-07-17T08:00:00.000Z'),
      }),
    ], new Date('2026-07-16T12:00:00.000Z'))

    expect(snapshot.totalRequests).toBe(5)
    expect(snapshot.approvalRate).toBe(67)
    expect(snapshot.approved).toBe(2)
    expect(snapshot.rejected).toBe(1)
    expect(snapshot.pendingReview).toBe(2)
    expect(snapshot.upcomingEvents).toBe(1)
    expect(snapshot.overdueReview).toBe(1)
    expect(snapshot.unassignedService).toBe(2)
    expect(snapshot.sameDayRequirements).toBe(2)
    expect(snapshot.averageApprovalHours).toBe(36)
    expect(snapshot.bySchool[0]).toEqual({ label: 'SITE', value: 2 })
  })

  it('validates schools and normalizes reversed date filters', () => {
    expect(parseAnalyticsFilters({
      from: '2026-07-31',
      to: '2026-07-01',
      school: 'SITE',
    })).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      school: 'SITE',
    })

    expect(parseAnalyticsFilters({ from: 'bad-date', school: 'UNKNOWN' })).toEqual({
      from: undefined,
      to: undefined,
      school: undefined,
    })
  })
})
