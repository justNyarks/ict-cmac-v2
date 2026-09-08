import { getRecommendedAssignmentRoles } from '@/lib/pmac'
import type { DocumentationType, PmacEventDutyRole } from '@/types'

export function getCoverageReadiness(documentationType: DocumentationType | null | undefined, assignments: readonly {
  assignmentRole: PmacEventDutyRole
  availabilityResponse: string | null
}[]) {
  const confirmed = assignments.filter(assignment => assignment.availabilityResponse === 'YES')
  const confirmedRoles = new Set(confirmed.map(assignment => assignment.assignmentRole))
  const missingRoles = getRecommendedAssignmentRoles(documentationType).filter(role => !confirmedRoles.has(role))
  const pendingResponses = assignments.filter(assignment => assignment.availabilityResponse === 'PENDING').length
  return {
    missingRoles, pendingResponses, confirmedCount: confirmed.length,
    isReady: confirmed.length > 0 && pendingResponses === 0 && missingRoles.length === 0,
  }
}
