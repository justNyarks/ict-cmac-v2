import type { checkConflict, getRequests } from './actions'
import { SCHOOL_LABELS } from '@/lib/schools'

export type RequestItem = Awaited<ReturnType<typeof getRequests>>[number]
export type ConflictResult = Awaited<ReturnType<typeof checkConflict>>
export type ConflictItem = ConflictResult['conflicts'][number]
export type SameDayEventItem = ConflictResult['sameDayEvents'][number]

export function getRequesterName(request: RequestItem) {
  const letterContent = request.letterContent
  if (typeof letterContent === 'string') {
    const match = letterContent.match(/Sincerely,\s*\n+\s*(.+?)\s*\n(?:Secretary|Director),/i)
    if (match?.[1]?.trim()) {
      return match[1].trim()
    }
  }

  return request.secretary?.name || 'Authorized Personnel'
}

export function getSecretaryTitle(school?: string) {
  if (!school) return 'School Secretary'
  return `${SCHOOL_LABELS[school as keyof typeof SCHOOL_LABELS] || school} Secretary`
}

export function getSlaLabel(request: RequestItem, referenceTime: number) {
  const createdAt = new Date(request.createdAt)
  const eventDate = new Date(request.eventDate)
  const ageHours = Math.floor((referenceTime - createdAt.getTime()) / 3_600_000)
  const daysUntilEvent = Math.ceil((eventDate.getTime() - referenceTime) / 86_400_000)

  if (request.status === 'PENDING' && ageHours >= 24) return 'Needs coordinator review'
  if (request.status === 'COORDINATOR_APPROVED' && ageHours >= 48) return 'Needs director sign-off'
  if (request.status === 'DIRECTOR_APPROVED' && daysUntilEvent <= 2) return 'Upcoming soon'
  if (request.status === 'REJECTED') return 'Closed'
  return 'On track'
}
