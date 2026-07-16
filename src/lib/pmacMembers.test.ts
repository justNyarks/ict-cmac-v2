import { describe, expect, it } from 'vitest'

import {
  formatCourseOrDepartment,
  formatPmacMemberEducation,
  getPmacMemberEducation,
  normalizePmacMemberName,
  parseCourseOrDepartment,
} from './pmacMembers'

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

  it('prefers structured education fields while supporting legacy records', () => {
    expect(getPmacMemberEducation({
      department: 'SNAHS',
      course: 'BS Nursing',
      courseOrDepartment: 'SITE - BSIT',
    })).toEqual({
      department: 'SNAHS',
      course: 'BS Nursing',
    })

    expect(getPmacMemberEducation({ courseOrDepartment: 'SITE - BSIT' })).toEqual({
      department: 'SITE',
      course: 'BSIT',
    })

    expect(formatPmacMemberEducation({ department: 'BEU', course: 'Grade 12' })).toBe('BEU - Grade 12')
  })

  it('recognizes a legacy department even when no course was stored', () => {
    expect(parseCourseOrDepartment('SASTE')).toEqual({
      department: 'SASTE',
      course: '',
    })
  })
})
