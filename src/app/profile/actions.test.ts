import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), update: vi.fn(), compare: vi.fn(), hash: vi.fn() }))
vi.mock('@/lib/security', () => ({ getAuthenticatedSession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user, update: mocks.update } } }))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare, hash: mocks.hash } }))
import { updateProfile } from './actions'

describe('temporary password replacement', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.session.mockResolvedValue({ user: { id: 'u1' } })
    mocks.user.mockResolvedValue({ id: 'u1', password: 'hash', mustChangePassword: true })
    mocks.hash.mockResolvedValue('new-hash')
  })
  it('rejects a profile-only update while replacement is required', async () => {
    expect(await updateProfile({ name: 'Member' })).toMatchObject({ success: false })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.session).toHaveBeenCalledWith({ allowPasswordChange: true })
  })
  it('rejects retaining the temporary password', async () => {
    mocks.compare.mockResolvedValue(true)
    expect(await updateProfile({ name: 'Member', currentPassword: 'Temporary123', newPassword: 'Temporary123' })).toMatchObject({ success: false })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('clears the requirement only after verifying and hashing a different password', async () => {
    mocks.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await updateProfile({ name: 'Member', currentPassword: 'Temporary123', newPassword: 'Personal456' })).toMatchObject({ success: true })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: {
      name: 'Member', password: 'new-hash', mustChangePassword: false, passwordUpdatedAt: expect.any(Date),
    } })
  })
})
