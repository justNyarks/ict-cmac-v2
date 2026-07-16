import { describe, expect, it } from 'vitest'

import {
  getPmacActivityActionLabel,
  redactPmacActivityText,
  sanitizePmacActivityChanges,
} from './pmacActivityAudit'

describe('PMAC activity audit safety', () => {
  it('uses readable labels for important audit actions', () => {
    expect(getPmacActivityActionLabel('PROJECT_MEMBERS_ASSIGNED')).toBe('Team assigned')
    expect(getPmacActivityActionLabel('PROJECT_UPDATED')).toBe('Project details updated')
  })

  it('redacts credentials from audit text', () => {
    expect(redactPmacActivityText('authorization: Bearer abc.def password=secret123')).toBe(
      'authorization=[REDACTED] password=[REDACTED]',
    )
  })

  it('redacts secrets and attachment contents from structured changes', () => {
    expect(sanitizePmacActivityChanges({
      status: { before: 'ACTIVE', after: 'COMPLETED' },
      password: { before: 'old', after: 'new' },
      attachmentContent: { after: 'private file body' },
      metadata: { after: { token: 'abc123', label: 'Final output' } },
    })).toEqual({
      status: { before: 'ACTIVE', after: 'COMPLETED' },
      password: '[REDACTED]',
      attachmentContent: '[REDACTED]',
      metadata: { after: { token: '[REDACTED]', label: 'Final output' } },
    })
  })
})
