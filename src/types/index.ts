export type Role = 'SECRETARY' | 'CMAC_COORDINATOR' | 'ICT_DIRECTOR'

export type School =
  | 'SNAHS'
  | 'SBAHM'
  | 'SITE'
  | 'SASTE'
  | 'School of Medicine'
  | 'BEU'

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
  eventDate: string
  eventTitle: string
  eventVenue: string
  school: School
  requestedBy: string // name of the secretary
  serviceType: ServiceType
  documentationType: DocumentationType
  letterUrl?: string  // uploaded request letter file name/url
  status: RequestStatus
  coordinatorNote?: string
  directorNote?: string
  coordinatorApprovedAt?: string
  directorApprovedAt?: string
}

export interface User {
  id: string
  name: string
  role: Role
  school?: School
  avatarInitials: string
}
