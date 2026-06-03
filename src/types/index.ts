export type Role = 'SECRETARY' | 'CMAC_COORDINATOR' | 'ICT_DIRECTOR'

export type School =
  | 'SNAHS'
  | 'SBAHM'
  | 'SITE'
  | 'SASTE'
  | 'MEDICINE'
  | 'BEU'
  | 'UNIVERSITY'

export type ServiceType = 'CMAC' | 'PMAC'
export type DocumentationType = 'PHOTO' | 'VIDEO' | 'BOTH'

export type RequestStatus =
  | 'PENDING'          // submitted by Secretary, awaiting CMAC Coordinator
  | 'COORDINATOR_APPROVED'  // CMAC Coordinator approved, awaiting ICT Director
  | 'DIRECTOR_APPROVED'     // ICT Director approved — fully approved
  | 'REJECTED'

export interface ServiceRequest {
  id: string
  createdAt: string
  updatedAt: string
  eventTitle: string
  eventDate: string
  endDate?: string
  startTime?: string
  endTime?: string
  eventVenue: string
  school: School
  serviceType?: ServiceType | null  // Assigned by Director only
  documentationType: DocumentationType
  campusType: 'IN_CAMPUS' | 'OFF_CAMPUS'
  letterUrl?: string
  letterContent?: string
  eventDetails?: string
  needsSameDayEdit: boolean
  needsSameDayPhoto: boolean
  status: RequestStatus
  coordinatorNote?: string
  directorNote?: string
  coordinatorApprovedAt?: string
  directorApprovedAt?: string
  deletedAt?: string | null
  // Relations
  secretaryId: string
  coordinatorId?: string
  directorId?: string
}

export interface User {
  id: string
  name: string
  role: Role
  school?: School
  avatarInitials: string
}
