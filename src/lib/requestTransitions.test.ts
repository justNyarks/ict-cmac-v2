import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import {
  applyAtomicRequestTransition,
  assertRequestTransition,
  getRequestTransitionTarget,
} from '@/lib/requestTransitions'

describe('CMAC request transitions', () => {
  it('enforces the coordinator, director, and secretary workflow', () => {
    expect(getRequestTransitionTarget('CMAC_COORDINATOR', 'PENDING', 'APPROVE')).toBe('COORDINATOR_APPROVED')
    expect(getRequestTransitionTarget('ICT_DIRECTOR', 'COORDINATOR_APPROVED', 'APPROVE')).toBe('DIRECTOR_APPROVED')
    expect(getRequestTransitionTarget('ICT_DIRECTOR', 'PENDING', 'APPROVE')).toBeNull()
    expect(getRequestTransitionTarget('ICT_DIRECTOR', 'PENDING', 'REJECT')).toBeNull()
    expect(getRequestTransitionTarget('ICT_DIRECTOR', 'PENDING', 'REQUEST_REVISION')).toBeNull()
    expect(getRequestTransitionTarget('ICT_DIRECTOR', 'DIRECTOR_APPROVED', 'CANCEL')).toBe('CANCELLED')
    expect(getRequestTransitionTarget('SECRETARY', 'REVISION_REQUESTED', 'RESUBMIT')).toBe('PENDING')
    expect(getRequestTransitionTarget('SECRETARY', 'PENDING', 'APPROVE')).toBeNull()
    expect(getRequestTransitionTarget('CMAC_COORDINATOR', 'DIRECTOR_APPROVED', 'REJECT')).toBeNull()
  })

  it('rejects invalid lifecycle jumps with a readable error', () => {
    expect(() => assertRequestTransition('CMAC_COORDINATOR', 'DIRECTOR_APPROVED', 'ARCHIVE')).toThrow(/not allowed/i)
  })

  it('uses a status-matched update and rejects a stale concurrent mutation', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const findUniqueOrThrow = vi.fn()
    const database = {
      serviceRequest: { updateMany, findUniqueOrThrow },
    } as unknown as Pick<Prisma.TransactionClient, 'serviceRequest'>

    await expect(applyAtomicRequestTransition(
      database,
      { id: 'request-1', status: 'PENDING' },
      'CMAC_COORDINATOR',
      'APPROVE'
    )).rejects.toThrow(/changed while you were reviewing/i)

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'request-1', status: 'PENDING', deletedAt: null },
    }))
    expect(findUniqueOrThrow).not.toHaveBeenCalled()
  })
})
