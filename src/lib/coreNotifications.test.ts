import { describe, expect, it } from 'vitest'

import { buildCoreNotificationWhere } from '@/lib/notifications'

const baseUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@spup.edu.ph',
  school: null,
  isActive: true,
  pmacMemberId: null,
  mustChangePassword: false,
}

describe('CMAC notification visibility', () => {
  it('limits secretaries to workflow changes on their requests plus approved shared events', () => {
    expect(buildCoreNotificationWhere({ ...baseUser, role: 'SECRETARY' })).toEqual({
      OR: expect.arrayContaining([
        expect.objectContaining({
          action: { in: ['COORDINATOR_APPROVED', 'DIRECTOR_APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'CANCELLED'] },
          request: { is: expect.objectContaining({ secretaryId: 'user-1' }) },
        }),
        expect.objectContaining({
          action: { in: ['DIRECTOR_APPROVED', 'DIRECT_BYPASS'] },
          request: { is: expect.objectContaining({ status: 'DIRECTOR_APPROVED' }) },
        }),
      ]),
    })
  })

  it('routes submissions and resubmissions to the coordinator', () => {
    const where = buildCoreNotificationWhere({ ...baseUser, role: 'CMAC_COORDINATOR' })
    expect(where).toEqual(expect.objectContaining({
      OR: expect.arrayContaining([
        expect.objectContaining({ action: { in: ['SUBMITTED', 'RESUBMITTED'] } }),
        expect.objectContaining({ action: 'CANCELLED' }),
      ]),
    }))
  })

  it('routes only coordinator-approved requests to the director', () => {
    expect(buildCoreNotificationWhere({ ...baseUser, role: 'ICT_DIRECTOR' })).toEqual({
      action: 'COORDINATOR_APPROVED',
      request: {
        is: {
          deletedAt: null,
          status: 'COORDINATOR_APPROVED',
        },
      },
    })
  })

  it('does not expose core workflow notifications to PMAC accounts', () => {
    expect(buildCoreNotificationWhere({ ...baseUser, role: 'PMAC_MEMBER' })).toEqual({ id: '__never__' })
  })
})
