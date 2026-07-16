import { PMAC_MEMBER_STATUSES } from '@/lib/roles'
import type { PmacMemberStatus } from '@/types'

export function isPmacMemberStatus(value: string): value is PmacMemberStatus {
  return PMAC_MEMBER_STATUSES.includes(value as PmacMemberStatus)
}

export function normalizePmacPhone(value: string) {
  const phone = value.replace(/\s+/g, ' ').trim()
  if (!phone) return ''

  if (!/^\+?[0-9(). -]+$/.test(phone)) {
    throw new Error('Phone number may only contain digits, spaces, parentheses, periods, hyphens, and an optional leading +.')
  }

  const digitCount = phone.replace(/\D/g, '').length
  if (digitCount < 7 || digitCount > 15) {
    throw new Error('Phone number must contain between 7 and 15 digits.')
  }

  return phone
}

export function parsePmacJoinedDate(value?: string | null) {
  if (!value) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('Joined date must use the YYYY-MM-DD format.')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error('Joined date is invalid.')
  }

  return parsed
}
