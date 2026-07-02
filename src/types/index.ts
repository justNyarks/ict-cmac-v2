export type Role =
  | 'SECRETARY'
  | 'CMAC_COORDINATOR'
  | 'ICT_DIRECTOR'
  | 'PMAC_DIRECTOR'
  | 'PMAC_ASSISTANT_DIRECTOR'
  | 'PMAC_SECRETARY'
  | 'PMAC_EXECUTIVE'
  | 'PMAC_MEMBER'

export type PmacClubRole =
  | 'DIRECTOR'
  | 'ASSISTANT_DIRECTOR'
  | 'SECRETARY'
  | 'EXECUTIVE'
  | 'MEMBER'

export type PmacMemberStatus = 'ACTIVE' | 'INACTIVE'
export type PmacEventStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
export type PmacEventDutyRole = 'PHOTOGRAPHER' | 'VIDEOGRAPHER' | 'JOURNALIST' | 'GRAPHIC_DESIGNER' | 'ALL_AROUND'
export type PmacAvailabilityStatus = 'PENDING' | 'YES' | 'NO'
export type PmacAttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
export type PmacPollType = 'GENERAL' | 'EVENT' | 'SCHEDULE_PREFERENCE' | 'OFFICER_DECISION'
export type PmacPollStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'
export type PmacPollResultsVisibility = 'IMMEDIATE' | 'AFTER_CLOSE'
export type PmacVoteChoice = 'YES' | 'NO' | 'ABSTAIN'
export type PmacActivityEntityType = 'EVENT' | 'POLL' | 'MEMBER' | 'ACCOUNT' | 'ATTACHMENT' | 'REPORT'

export type School =
  | 'SNAHS'
  | 'SBAHM'
  | 'SITE'
  | 'SASTE'
  | 'MEDICINE'
  | 'BEU'
  | 'UNIVERSITY'
  | 'HR'

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
  mustChangePassword?: boolean
  avatarInitials: string
}
