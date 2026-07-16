export const PMAC_DEPARTMENTS = ['SASTE', 'SBAHM', 'SNAHS', 'SITE', 'SOM', 'BEU'] as const

export type PmacDepartment = (typeof PMAC_DEPARTMENTS)[number]

type PmacMemberEducationInput = {
  department?: string | null
  course?: string | null
  courseOrDepartment?: string | null
}

const DEPARTMENT_SEPARATOR = ' - '

function capitalizeNameWord(word: string) {
  if (!word) {
    return word
  }

  return word
    .split('-')
    .map(part => {
      if (/^[a-z]\.?$/i.test(part)) {
        return part.charAt(0).toUpperCase() + (part.endsWith('.') ? '.' : '')
      }

      if (/^(?:[a-z]\.){2,}$/i.test(part)) {
        return part.toUpperCase()
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('-')
}

export function normalizePmacMemberName(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(capitalizeNameWord)
    .join(' ')
}

export function isPmacDepartment(value: string): value is PmacDepartment {
  return PMAC_DEPARTMENTS.includes(value as PmacDepartment)
}

export function formatCourseOrDepartment(department: string, course: string) {
  return `${department}${DEPARTMENT_SEPARATOR}${course}`
}

export function parseCourseOrDepartment(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''

  if (!normalized) {
    return {
      department: '',
      course: '',
    }
  }

  const [possibleDepartment, ...courseParts] = normalized.split(DEPARTMENT_SEPARATOR)
  if (possibleDepartment && isPmacDepartment(possibleDepartment)) {
    return {
      department: possibleDepartment,
      course: courseParts.join(DEPARTMENT_SEPARATOR).trim(),
    }
  }

  return {
    department: '',
    course: normalized,
  }
}

export function getPmacMemberEducation(member: PmacMemberEducationInput) {
  const legacy = parseCourseOrDepartment(member.courseOrDepartment)
  const department = member.department?.trim() ?? ''
  const course = member.course?.trim() ?? ''

  return {
    department: isPmacDepartment(department) ? department : legacy.department,
    course: course || legacy.course,
  }
}

export function formatPmacMemberEducation(member: PmacMemberEducationInput) {
  const { department, course } = getPmacMemberEducation(member)
  return [department, course].filter(Boolean).join(DEPARTMENT_SEPARATOR)
}
