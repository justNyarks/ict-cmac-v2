import type { School } from '@/types'

export const SCHOOLS = ['SNAHS', 'SBAHM', 'SITE', 'SASTE', 'MEDICINE', 'BEU', 'UNIVERSITY', 'HR'] as const satisfies readonly School[]

export const SCHOOL_LABELS: Record<(typeof SCHOOLS)[number], string> = {
  SNAHS: 'SNAHS',
  SBAHM: 'SBAHM',
  SITE: 'SITE',
  SASTE: 'SASTE',
  MEDICINE: 'SOM',
  BEU: 'BEU',
  UNIVERSITY: 'UNIVERSITY',
  HR: 'HR',
}
