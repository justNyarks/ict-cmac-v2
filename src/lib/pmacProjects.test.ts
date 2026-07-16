import { describe, expect, it } from 'vitest'

import { buildPmacProjectWhere } from './pmacProjects'

describe('buildPmacProjectWhere', () => {
  it.each(['CMAC_COORDINATOR', 'PMAC_DIRECTOR', 'PMAC_SECRETARY'] as const)(
    'allows project launchers with role %s to view all projects',
    (role) => {
      expect(buildPmacProjectWhere({ role, pmacMemberId: null })).toEqual({})
    },
  )

  it('limits executives to projects they head or are assigned to', () => {
    expect(buildPmacProjectWhere({
      role: 'PMAC_EXECUTIVE',
      pmacMemberId: 'member-1',
    })).toEqual({
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
    })
  })

  it('limits regular members to explicitly assigned projects', () => {
    expect(buildPmacProjectWhere({
      role: 'PMAC_MEMBER',
      pmacMemberId: 'member-2',
    })).toEqual({
      memberAssignments: {
        some: {
          memberId: 'member-2',
        },
      },
    })
  })

  it('denies project access when the account has no PMAC member identity', () => {
    expect(buildPmacProjectWhere({
      role: 'PMAC_MEMBER',
      pmacMemberId: null,
    })).toEqual({ id: '__missing_project_access__' })
  })
})
