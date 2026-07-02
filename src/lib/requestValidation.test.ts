import { describe, expect, it } from 'vitest'

import { validateAndNormalizeRequestInput } from './requestValidation'

const baseUser = {
  id: 'user-1',
  role: 'SECRETARY' as const,
  school: 'SNAHS' as const,
}

const validInput = {
  eventTitle: 'Founding Anniversary',
  eventDate: '2026-07-10',
  endDate: '2026-07-10',
  startTime: '08:00',
  endTime: '10:00',
  eventVenue: 'SC(Students Center)',
  school: 'SNAHS' as const,
  documentationType: 'PHOTO' as const,
  campusType: 'IN_CAMPUS' as const,
}

describe('validateAndNormalizeRequestInput', () => {
  it('rejects an invalid school before Prisma is called', () => {
    expect(() => validateAndNormalizeRequestInput({
      ...validInput,
      school: '' as never,
    }, baseUser)).toThrow('School / Department is required.')
  })

  it('rejects an invalid documentation type before Prisma is called', () => {
    expect(() => validateAndNormalizeRequestInput({
      ...validInput,
      documentationType: '' as never,
    }, baseUser)).toThrow('Documentation type is required.')
  })

  it('rejects an invalid campus type before Prisma is called', () => {
    expect(() => validateAndNormalizeRequestInput({
      ...validInput,
      campusType: '' as never,
    }, baseUser)).toThrow('Campus type is required.')
  })

  it('rejects an invalid director service type before Prisma is called', () => {
    expect(() => validateAndNormalizeRequestInput({
      ...validInput,
      serviceType: 'INVALID' as never,
    }, {
      id: 'user-2',
      role: 'ICT_DIRECTOR',
    })).toThrow('Service type is invalid.')
  })
})
