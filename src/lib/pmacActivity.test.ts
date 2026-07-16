import type { Session } from 'next-auth'
import { describe, expect, it } from 'vitest'

import { buildPmacActivityWhere, parsePmacActivitySearchParams } from './pmacActivity'

function buildUser(overrides: Partial<Session['user']> = {}): Session['user'] {
  return {
    id: 'user-1',
    name: 'PMAC User',
    email: 'pmac@example.com',
    role: 'PMAC_MEMBER',
    school: null,
    isActive: true,
    pmacMemberId: 'member-1',
    mustChangePassword: false,
    ...overrides,
  }
}

describe('buildPmacActivityWhere', () => {
  it.each(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'] as const)(
    'allows %s to review the full audit feed',
    (role) => {
      expect(buildPmacActivityWhere(buildUser({ role }))).toEqual({})
    },
  )

  it('limits a PMAC member to assigned events, polls, assigned projects, their member record, and their own actions', () => {
    expect(buildPmacActivityWhere(buildUser())).toEqual({
      OR: [
        {
          event: {
            is: {
              assignments: {
                some: {
                  memberId: 'member-1',
                },
              },
            },
          },
        },
        {
          pollId: {
            not: null,
          },
        },
        {
          project: {
            is: {
              memberAssignments: {
                some: {
                  memberId: 'member-1',
                },
              },
            },
          },
        },
        {
          memberId: 'member-1',
        },
        {
          actorId: 'user-1',
        },
      ],
    })
  })

  it('includes head and team project activity for an executive', () => {
    const where = buildPmacActivityWhere(buildUser({ role: 'PMAC_EXECUTIVE' }))

    expect(where).toMatchObject({
      OR: expect.arrayContaining([
        {
          project: {
            is: {
              OR: [
                { headMemberId: 'member-1' },
                {
                  memberAssignments: {
                    some: {
                      memberId: 'member-1',
                    },
                  },
                },
              ],
            },
          },
        },
      ]),
    })
  })

  it('denies an operational account without a linked PMAC member', () => {
    expect(buildPmacActivityWhere(buildUser({ pmacMemberId: null }))).toEqual({
      id: '__missing_activity_access__',
    })
  })
})

describe('parsePmacActivitySearchParams', () => {
  it('uses the first value and preserves supported activity filters', () => {
    expect(parsePmacActivitySearchParams({
      page: '3',
      query: ['deadline', 'ignored'],
      entityType: 'PROJECT',
      action: 'PROJECT_STATUS_UPDATED',
      actorId: 'user-2',
      subject: 'PROJECT:project-1',
      from: '2026-07-01',
      to: '2026-07-31',
    })).toEqual({
      page: 3,
      query: 'deadline',
      entityType: 'PROJECT',
      action: 'PROJECT_STATUS_UPDATED',
      actorId: 'user-2',
      subject: 'PROJECT:project-1',
      from: '2026-07-01',
      to: '2026-07-31',
    })
  })
})
