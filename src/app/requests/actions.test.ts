import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertActionAccess: vi.fn(),
  findRequestConflicts: vi.fn(),
  syncPmacEventFromServiceRequest: vi.fn(),
  revalidatePmacViews: vi.fn(),
  revalidateRequestViews: vi.fn(),
  transaction: vi.fn(),
  getServerSession: vi.fn(),
}))

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/conflicts', () => ({ findRequestConflicts: mocks.findRequestConflicts }))
vi.mock('@/lib/pmacRevalidation', () => ({ revalidatePmacViews: mocks.revalidatePmacViews }))
vi.mock('@/lib/pmacRequestSync', () => ({ syncPmacEventFromServiceRequest: mocks.syncPmacEventFromServiceRequest }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    serviceRequest: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/requestWorkflow', () => ({
  getCalendarWhere: vi.fn(),
  getRequestListWhere: vi.fn(),
  revalidateRequestViews: mocks.revalidateRequestViews,
}))
vi.mock('@/lib/security', () => ({ assertActionAccess: mocks.assertActionAccess }))
vi.mock('@/lib/roles', () => ({ isCoreWorkflowRole: vi.fn(() => true) }))
vi.mock('@/lib/zeroTrust', () => ({ isPrivilegedRole: vi.fn(() => false) }))

import { createServiceRequest } from '@/app/new-request/actions'
import {
  approveRequest,
  archiveRequest,
  cancelRequest,
  rejectRequest,
  requestRevision,
  resubmitRequest,
  updateServiceRequest,
  withdrawRequest,
} from '@/app/requests/actions'

type TestRequestStatus =
  | 'PENDING'
  | 'COORDINATOR_APPROVED'
  | 'DIRECTOR_APPROVED'
  | 'REVISION_REQUESTED'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'REJECTED'
  | 'ARCHIVED'

function sessionFor(role: 'SECRETARY' | 'CMAC_COORDINATOR' | 'ICT_DIRECTOR') {
  return {
    user: {
      id: `${role.toLowerCase()}-1`,
      name: `${role} User`,
      email: `${role.toLowerCase()}@spup.edu.ph`,
      role,
      school: role === 'SECRETARY' ? 'SITE' : null,
      pmacMemberId: null,
      mustChangePassword: false,
    },
  }
}

function makeRequest(status: TestRequestStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    updatedAt: new Date('2026-07-01T08:00:00.000Z'),
    eventTitle: 'Founders Day',
    eventDate: new Date('2026-08-20T00:00:00.000Z'),
    endDate: new Date('2026-08-20T00:00:00.000Z'),
    startTime: '08:00',
    endTime: '10:00',
    eventVenue: 'MM Hall',
    school: 'SITE',
    serviceType: 'PMAC',
    documentationType: 'PHOTO',
    campusType: 'IN_CAMPUS',
    letterUrl: null,
    eventDetails: null,
    letterContent: 'Request details',
    needsSameDayEdit: false,
    needsSameDayPhoto: false,
    status,
    coordinatorNote: null,
    directorNote: null,
    secretaryId: 'secretary-1',
    coordinatorId: null,
    coordinatorApprovedAt: null,
    directorId: null,
    directorApprovedAt: null,
    deletedAt: null,
    archivedAt: null,
    ...overrides,
  }
}

function makeTransaction(initialRequest: ReturnType<typeof makeRequest>) {
  let request = { ...initialRequest }
  const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' })
  const serviceCreate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const status = typeof data.status === 'string' ? data.status as TestRequestStatus : 'PENDING'
    request = { ...makeRequest(status), ...data }
    return request
  })

  const tx = {
    serviceRequest: {
      findUnique: vi.fn().mockImplementation(async () => request),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => request),
      updateMany: vi.fn().mockImplementation(async ({
        where,
        data,
      }: {
        where: { status?: TestRequestStatus }
        data: Record<string, unknown>
      }) => {
        if (where.status && where.status !== request.status) return { count: 0 }
        request = { ...request, ...data }
        return { count: 1 }
      }),
      create: serviceCreate,
    },
    auditLog: {
      create: auditCreate,
      findFirst: vi.fn(),
    },
    requestLetterAttachment: {
      findFirst: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }

  return { tx, auditCreate, serviceCreate, current: () => request }
}

let activeTransaction: ReturnType<typeof makeTransaction>

beforeEach(() => {
  vi.clearAllMocks()
  activeTransaction = makeTransaction(makeRequest('PENDING'))
  mocks.transaction.mockImplementation(async (callback: (tx: typeof activeTransaction.tx) => Promise<unknown>) => callback(activeTransaction.tx))
  mocks.findRequestConflicts.mockResolvedValue({ hasConflict: false, conflicts: [], sameDayEvents: [] })
  mocks.syncPmacEventFromServiceRequest.mockResolvedValue(true)
})

describe('CMAC request server actions', () => {
  it('submits a secretary request and creates its audit record in one transaction', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('SECRETARY'))
    const eventDate = new Date()
    eventDate.setDate(eventDate.getDate() + 10)
    const date = eventDate.toISOString().slice(0, 10)

    const result = await createServiceRequest({
      eventTitle: 'University Foundation Celebration',
      eventDate: date,
      endDate: date,
      startTime: '08:00',
      endTime: '10:00',
      eventVenue: 'MM Hall',
      school: 'SITE',
      documentationType: 'PHOTO',
      campusType: 'IN_CAMPUS',
      letterContent: 'Formal request letter.',
    })

    expect(result.success).toBe(true)
    expect(activeTransaction.serviceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', secretaryId: 'secretary-1' }),
    }))
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SUBMITTED', requestId: 'request-1' }),
    }))
  })

  it('atomically records coordinator approval and its routing recommendation', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('CMAC_COORDINATOR'))

    await approveRequest('request-1', 'Recommended for PMAC coverage.', 'PMAC')

    expect(activeTransaction.tx.serviceRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'request-1', status: 'PENDING', deletedAt: null },
      data: expect.objectContaining({ status: 'COORDINATOR_APPROVED', serviceType: 'PMAC' }),
    }))
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'COORDINATOR_APPROVED' }),
    }))
  })

  it('blocks director decisions on pending requests', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('ICT_DIRECTOR'))

    await expect(approveRequest('request-1', 'Bypass attempt', 'PMAC')).rejects.toThrow(/invalid action/i)
    await expect(rejectRequest('request-1', 'Bypass rejection')).rejects.toThrow(/not allowed/i)
    expect(activeTransaction.auditCreate).not.toHaveBeenCalled()
    expect(mocks.syncPmacEventFromServiceRequest).not.toHaveBeenCalled()
  })

  it('records a valid rejection and synchronizes the PMAC closure policy', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('CMAC_COORDINATOR'))

    await rejectRequest('request-1', 'Schedule information is incomplete.')

    expect(activeTransaction.current().status).toBe('REJECTED')
    expect(mocks.syncPmacEventFromServiceRequest).toHaveBeenCalledWith(
      activeTransaction.tx,
      expect.objectContaining({ status: 'REJECTED' }),
      expect.objectContaining({ role: 'CMAC_COORDINATOR' })
    )
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REJECTED' }),
    }))
  })

  it('fails approval safely when conflict checking is unavailable', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('ICT_DIRECTOR'))
    activeTransaction = makeTransaction(makeRequest('COORDINATOR_APPROVED'))
    mocks.findRequestConflicts.mockRejectedValue(new Error('Conflict service unavailable'))

    await expect(approveRequest('request-1', '', 'PMAC')).rejects.toThrow('Conflict service unavailable')
    expect(activeTransaction.tx.serviceRequest.updateMany).not.toHaveBeenCalled()
    expect(activeTransaction.auditCreate).not.toHaveBeenCalled()
    expect(mocks.syncPmacEventFromServiceRequest).not.toHaveBeenCalled()
  })

  it('approves after coordinator review and synchronizes PMAC with the audited result', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('ICT_DIRECTOR'))
    activeTransaction = makeTransaction(makeRequest('COORDINATOR_APPROVED'))

    await approveRequest('request-1', 'Approved for operations.', 'PMAC')

    expect(activeTransaction.current().status).toBe('DIRECTOR_APPROVED')
    expect(mocks.syncPmacEventFromServiceRequest).toHaveBeenCalledWith(
      activeTransaction.tx,
      expect.objectContaining({ status: 'DIRECTOR_APPROVED' }),
      expect.objectContaining({ role: 'ICT_DIRECTOR' })
    )
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'DIRECTOR_APPROVED' }),
    }))
  })

  it('cancels approved requests, retains PMAC synchronization, and requires archive reasons', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('ICT_DIRECTOR'))
    activeTransaction = makeTransaction(makeRequest('DIRECTOR_APPROVED'))

    await cancelRequest('request-1', 'Event was called off by the organizer.')
    expect(activeTransaction.current().status).toBe('CANCELLED')
    expect(mocks.syncPmacEventFromServiceRequest).toHaveBeenCalledWith(
      activeTransaction.tx,
      expect.objectContaining({ status: 'CANCELLED' }),
      expect.any(Object)
    )
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'CANCELLED' }),
    }))

    await expect(archiveRequest('request-1', '')).rejects.toThrow(/archive reason is required/i)
    await archiveRequest('request-1', 'Archived after cancellation review.')
    expect(activeTransaction.current().status).toBe('ARCHIVED')
    expect(activeTransaction.auditCreate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ARCHIVED', details: 'Archived after cancellation review.' }),
    }))
  })

  it('withdraws and resubmits a secretary-owned request without creating a duplicate', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('SECRETARY'))

    await withdrawRequest('request-1', 'The event schedule is being revised.')
    expect(activeTransaction.current().status).toBe('WITHDRAWN')

    await resubmitRequest('request-1', 'The corrected schedule is now final.')
    expect(activeTransaction.current().status).toBe('PENDING')
    expect(activeTransaction.auditCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ action: 'WITHDRAWN' }),
    }))
    expect(activeTransaction.auditCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ action: 'RESUBMITTED' }),
    }))
  })

  it('requires saved corrections before a revised request can be resubmitted', async () => {
    mocks.assertActionAccess.mockResolvedValue(sessionFor('ICT_DIRECTOR'))
    activeTransaction = makeTransaction(makeRequest('COORDINATOR_APPROVED'))

    await requestRevision('request-1', 'Clarify the final venue and schedule.')
    expect(activeTransaction.current().status).toBe('REVISION_REQUESTED')

    mocks.assertActionAccess.mockResolvedValue(sessionFor('SECRETARY'))
    const eventDate = new Date()
    eventDate.setDate(eventDate.getDate() + 10)
    const date = eventDate.toISOString().slice(0, 10)
    await updateServiceRequest('request-1', {
      eventTitle: 'Founders Day Updated',
      eventDate: date,
      endDate: date,
      startTime: '09:00',
      endTime: '11:00',
      eventVenue: 'Global Function Room 1',
      school: 'SITE',
      documentationType: 'PHOTO',
      campusType: 'IN_CAMPUS',
      letterContent: 'Corrected formal request letter.',
    })

    activeTransaction.tx.auditLog.findFirst
      .mockResolvedValueOnce({ createdAt: new Date('2026-07-10T08:00:00.000Z') })
      .mockResolvedValueOnce({ id: 'correction-1' })
    await resubmitRequest('request-1', 'Corrections completed.')

    expect(activeTransaction.current().status).toBe('PENDING')
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REVISION_REQUESTED' }),
    }))
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'CORRECTED' }),
    }))
    expect(activeTransaction.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESUBMITTED' }),
    }))
  })

  it('enforces authorization before opening a transaction', async () => {
    mocks.assertActionAccess.mockRejectedValue(new Error('Unauthorized'))

    await expect(withdrawRequest('request-1', 'No longer needed.')).rejects.toThrow('Unauthorized')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
