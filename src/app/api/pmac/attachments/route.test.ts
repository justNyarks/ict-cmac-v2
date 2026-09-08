import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({
  session: vi.fn(), event: vi.fn(), create: vi.fn(), activity: vi.fn(), scan: vi.fn(), transaction: vi.fn(),
}))
vi.mock('@/lib/security', () => ({ assertActionAccess: mocks.session, assertSameOriginMutation: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  pmacEvent: { findUnique: mocks.event }, $transaction: mocks.transaction,
} }))
vi.mock('@/lib/pmacActivity', () => ({ recordPmacActivity: mocks.activity }))
vi.mock('@/lib/malwareScan', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/malwareScan')>(), scanUploadedFile: mocks.scan,
}))
import { POST } from './route'
import { MalwareScannerUnavailableError } from '@/lib/malwareScan'
import { MAX_UPLOAD_BYTES } from '@/lib/uploadLimits'

function request(file = new File(['%PDF-clean'], 'brief.pdf', { type: 'application/pdf' })) {
  const form = new FormData()
  form.set('targetType', 'event'); form.set('targetId', 'e1'); form.set('file', file)
  // Preserve the same File constructor in Node tests.
  return { method: 'POST', formData: async () => form } as NextRequest
}
describe('database-backed PMAC uploads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.session.mockResolvedValue({ user: { id: 'u1', name: 'Secretary', role: 'PMAC_SECRETARY' } })
    mocks.event.mockResolvedValue({ id: 'e1' })
    mocks.create.mockResolvedValue({ id: 'a1', fileName: 'brief.pdf' })
    mocks.transaction.mockImplementation(async callback => callback({ pmacAttachment: { create: mocks.create } }))
  })
  it('stores scanned content and metadata in one transaction without returning bytes', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.scan).toHaveBeenCalledWith(Buffer.from('%PDF-clean'))
    expect(mocks.scan.mock.invocationCallOrder[0]).toBeLessThan(mocks.transaction.mock.invocationCallOrder[0])
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      eventId: 'e1', content: { create: { data: Buffer.from('%PDF-clean') } },
    }) }))
    expect(await response.json()).toEqual({ attachment: { id: 'a1', fileName: 'brief.pdf' } })
  })
  it('never stores a file when the scanner is unavailable', async () => {
    mocks.scan.mockRejectedValue(new MalwareScannerUnavailableError())
    expect((await POST(request())).status).toBe(503)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects oversize files before scanning or database insertion', async () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'brief.pdf', { type: 'application/pdf' })
    expect((await POST(request(file))).status).toBe(400)
    expect(mocks.scan).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('does not upload event files for a member without management permission', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'u2', role: 'PMAC_MEMBER' } })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.scan).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
