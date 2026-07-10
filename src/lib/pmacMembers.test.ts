import { describe, expect, it } from 'vitest'

import { formatCourseOrDepartment, normalizePmacMemberName, parseCourseOrDepartment } from './pmacMembers'

describe('pmac member helpers', () => {
  it('keeps name initials uppercase while normalizing spacing and casing', () => {
    expect(normalizePmacMemberName('  juan d. dela cruz  ')).toBe('Juan D. Dela Cruz')
    expect(normalizePmacMemberName('mika j.r. reyes')).toBe('Mika J.R. Reyes')
  })

  it('formats and parses department/course values', () => {
    const value = formatCourseOrDepartment('SITE', 'BSIT')

    expect(value).toBe('SITE - BSIT')
    expect(parseCourseOrDepartment(value)).toEqual({
      department: 'SITE',
      course: 'BSIT',
    })
  })
})
