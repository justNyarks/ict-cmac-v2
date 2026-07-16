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
export type PmacExecutiveTitle =
  | 'HEAD_PHOTOGRAPHER'
  | 'HEAD_VIDEOGRAPHER'
  | 'HEAD_GRAPHIC_DESIGNER'
  | 'HEAD_JOURNALIST'
  | 'TECHNICAL_HEAD'
  | 'PUBLIC_RELATIONS_OFFICER'
export type PmacSpecialty =
  | 'PHOTOGRAPHY'
  | 'VIDEOGRAPHY'
  | 'GRAPHIC_DESIGN'
  | 'JOURNALISM'
  | 'TECHNICAL_SUPPORT'
  | 'ALL_AROUND'
export type PmacEventStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
export type PmacEventSourceType = 'MANUAL' | 'CMAC_REQUEST'
export type PmacEventDutyRole = 'PHOTOGRAPHER' | 'VIDEOGRAPHER' | 'JOURNALIST' | 'GRAPHIC_DESIGNER' | 'ALL_AROUND'
export type PmacAvailabilityStatus = 'PENDING' | 'YES' | 'NO'
export type PmacAttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
export type PmacPollType = 'GENERAL' | 'EVENT' | 'SCHEDULE_PREFERENCE' | 'OFFICER_DECISION'
export type PmacPollStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'
export type PmacPollResultsVisibility = 'IMMEDIATE' | 'AFTER_CLOSE'
export type PmacVoteChoice = 'YES' | 'NO' | 'ABSTAIN'
export type PmacProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
export type PmacProjectMilestoneStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type PmacProjectLinkType = 'REFERENCE' | 'SUBMISSION'
export type PmacActivityEntityType = 'EVENT' | 'POLL' | 'MEMBER' | 'ACCOUNT' | 'ATTACHMENT' | 'REPORT' | 'PROJECT'

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
export type CampusType = 'IN_CAMPUS' | 'OFF_CAMPUS'

export type RequestStatus =
  | 'PENDING'          // submitted by Secretary, awaiting CMAC Coordinator
  | 'COORDINATOR_APPROVED'  // CMAC Coordinator approved, awaiting ICT Director
  | 'DIRECTOR_APPROVED'     // ICT Director approved — fully approved
  | 'REVISION_REQUESTED'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'REJECTED'
  | 'ARCHIVED'

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
  campusType: CampusType
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
  archivedAt?: string | null
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
