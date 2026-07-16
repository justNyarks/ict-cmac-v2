import { describe, expect, it } from 'vitest'

import { buildPmacActivityNotificationWhere, PMAC_PROJECT_NOTIFICATION_ACTIONS } from './pmacNotificationPolicy'

const since = new Date('2026-07-01T00:00:00.000Z')

describe('PMAC notification recipient policy', () => {
  it.each(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'] as const)(
    'allows %s to receive PMAC operational activity',
    (role) => {
      expect(buildPmacActivityNotificationWhere({ role, pmacMemberId: null }, since)).toEqual({
        createdAt: { gte: since },
        entityType: { not: 'PROJECT' },
      })
    },
  )

  it('limits the coordinator activity feed to PMAC events', () => {
    expect(buildPmacActivityNotificationWhere({ role: 'CMAC_COORDINATOR', pmacMemberId: null }, since)).toEqual({
      createdAt: { gte: since },
      entityType: 'EVENT',
    })
  })

  it.each(['PMAC_EXECUTIVE', 'PMAC_MEMBER'] as const)(
    'limits %s activity to assigned events, polls, and their own member record',
    (role) => {
      const where = buildPmacActivityNotificationWhere({ role, pmacMemberId: 'member-1' }, since)

      expect(where).toEqual(expect.objectContaining({
        entityType: { not: 'PROJECT' },
        OR: expect.arrayContaining([
          { event: { is: { assignments: { some: { memberId: 'member-1' } } } } },
          { pollId: { not: null } },
          { memberId: 'member-1' },
        ]),
      }))
    },
  )

  it('returns no activity audience for a PMAC member account without a member identity', () => {
    expect(buildPmacActivityNotificationWhere({ role: 'PMAC_MEMBER', pmacMemberId: null }, since)).toBeNull()
  })

  it('includes closure and milestone changes in project notifications', () => {
    expect(PMAC_PROJECT_NOTIFICATION_ACTIONS).toEqual(expect.arrayContaining([
      'PROJECT_DIRECTOR_CHECKED',
      'PROJECT_MILESTONE_CREATED',
      'PROJECT_MILESTONE_UPDATED',
      'PROJECT_MILESTONE_STATUS_UPDATED',
      'PROJECT_UPDATED',
    ]))
  })
})
