import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ session: vi.fn(), attachment: vi.fn(), event: vi.fn(), read: vi.fn(), content: vi.fn() }))
vi.mock('@/lib/security', () => ({ getAuthenticatedSession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { pmacAttachment: { findFirst: mocks.attachment }, pmacEvent: { findFirst: mocks.event }, pmacAttachmentContent: { findUnique: mocks.content } } }))
vi.mock('fs/promises', () => ({ readFile: mocks.read }))
import { GET } from './route'

describe('PMAC attachment downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.content.mockResolvedValue(null)
    mocks.session.mockResolvedValue({ user: { id: 'u1', role: 'PMAC_MEMBER', pmacMemberId: 'm1' } })
    mocks.attachment.mockResolvedValue({ id: 'a1', eventId: 'e1', filePath: '/uploads/pmac/2026-07/abc.pdf', mimeType: 'application/pdf', fileName: 'brief.pdf' })
  })
  it('rejects anonymous callers before looking up a file', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await GET(new NextRequest('http://localhost/api/pmac/attachments/download?id=a1'))).status).toBe(401)
    expect(mocks.attachment).not.toHaveBeenCalled()
  })
  it('denies a known URL when the member cannot access the event', async () => {
    mocks.event.mockResolvedValue(null)
    expect((await GET(new NextRequest('http://localhost/api/pmac/attachments/download?legacyPath=/uploads/pmac/2026-07/abc.pdf'))).status).toBe(403)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.content).not.toHaveBeenCalled()
    expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ id: 'e1' }, { assignments: { some: { memberId: 'm1' } } }] } }))
  })
  it('serves authorized legacy files with no-store headers', async () => {
    mocks.event.mockResolvedValue({ id: 'e1' })
    mocks.read.mockResolvedValue(Buffer.from('test'))
    const response = await GET(new NextRequest('http://localhost/api/pmac/attachments/download?id=a1'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.text()).toBe('test')
  })
  it('serves database-backed bytes without accessing the filesystem', async () => {
    mocks.event.mockResolvedValue({ id: 'e1' })
    mocks.content.mockResolvedValue({ data: Buffer.from('persisted file') })
    const response = await GET(new NextRequest('http://localhost/api/pmac/attachments/download?id=a1'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('persisted file')
    expect(mocks.read).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
