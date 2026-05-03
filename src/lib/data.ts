import { ServiceRequest, User } from '@/types'

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Maria Santos',   role: 'SECRETARY',         school: 'SNAHS',            avatarInitials: 'MS' },
  { id: 'u2', name: 'Jose Reyes',     role: 'SECRETARY',         school: 'SBAHM',            avatarInitials: 'JR' },
  { id: 'u3', name: 'Ana Cruz',       role: 'SECRETARY',         school: 'SITE',             avatarInitials: 'AC' },
  { id: 'u4', name: 'Pedro Lim',      role: 'SECRETARY',         school: 'SASTE',            avatarInitials: 'PL' },
  { id: 'u5', name: 'Rosa Garcia',    role: 'SECRETARY',         school: 'School of Medicine', avatarInitials: 'RG' },
  { id: 'u6', name: 'Carlo Bautista', role: 'SECRETARY',         school: 'BEU',              avatarInitials: 'CB' },
  { id: 'u7', name: 'Liza Mendoza',   role: 'CMAC_COORDINATOR',                              avatarInitials: 'LM' },
  { id: 'u8', name: 'Dir. Ramon Dela Cruz', role: 'ICT_DIRECTOR',                           avatarInitials: 'RD' },
]

export const MOCK_REQUESTS: ServiceRequest[] = [
  {
    id: 'req-001',
    createdAt: '2026-04-20T09:00:00Z',
    eventDate: '2026-05-10',
    eventTitle: 'SNAHS Founding Anniversary',
    eventVenue: 'Main Gymnasium',
    school: 'SNAHS',
    requestedBy: 'Maria Santos',
    serviceType: 'CMAC',
    documentationType: 'BOTH',
    status: 'DIRECTOR_APPROVED',
    coordinatorNote: 'Confirmed. Team assigned.',
    directorNote: 'Approved. Priority event.',
    coordinatorApprovedAt: '2026-04-21T10:00:00Z',
    directorApprovedAt: '2026-04-22T08:30:00Z',
  },
  {
    id: 'req-002',
    createdAt: '2026-04-25T14:00:00Z',
    eventDate: '2026-05-15',
    eventTitle: 'SBAHM Research Symposium',
    eventVenue: 'Conference Hall B',
    school: 'SBAHM',
    requestedBy: 'Jose Reyes',
    serviceType: 'PMAC',
    documentationType: 'PHOTO',
    status: 'COORDINATOR_APPROVED',
    coordinatorNote: 'Approved. Awaiting director sign-off.',
    coordinatorApprovedAt: '2026-04-26T09:00:00Z',
  },
  {
    id: 'req-003',
    createdAt: '2026-04-28T11:00:00Z',
    eventDate: '2026-05-20',
    eventTitle: 'SITE Tech Expo 2026',
    eventVenue: 'ICT Building Lobby',
    school: 'SITE',
    requestedBy: 'Ana Cruz',
    serviceType: 'CMAC',
    documentationType: 'VIDEO',
    status: 'PENDING',
  },
  {
    id: 'req-004',
    createdAt: '2026-04-29T08:30:00Z',
    eventDate: '2026-05-25',
    eventTitle: 'SASTE Environmental Summit',
    eventVenue: 'Auditorium',
    school: 'SASTE',
    requestedBy: 'Pedro Lim',
    serviceType: 'PMAC',
    documentationType: 'BOTH',
    status: 'PENDING',
  },
  {
    id: 'req-005',
    createdAt: '2026-04-15T10:00:00Z',
    eventDate: '2026-04-30',
    eventTitle: 'Med School White Coat Ceremony',
    eventVenue: 'Medicine Hall',
    school: 'School of Medicine',
    requestedBy: 'Rosa Garcia',
    serviceType: 'CMAC',
    documentationType: 'BOTH',
    status: 'DIRECTOR_APPROVED',
    coordinatorNote: 'VIP event — full crew.',
    directorNote: 'Approved.',
    coordinatorApprovedAt: '2026-04-16T09:00:00Z',
    directorApprovedAt: '2026-04-17T07:00:00Z',
  },
  {
    id: 'req-006',
    createdAt: '2026-04-27T15:00:00Z',
    eventDate: '2026-05-18',
    eventTitle: 'BEU Entrepreneurship Day',
    eventVenue: 'Business Center',
    school: 'BEU',
    requestedBy: 'Carlo Bautista',
    serviceType: 'PMAC',
    documentationType: 'VIDEO',
    status: 'REJECTED',
    coordinatorNote: 'Conflict with another booking. Please reschedule.',
  },
]

export function getStatusLabel(status: ServiceRequest['status']): string {
  switch (status) {
    case 'PENDING': return 'Pending Review'
    case 'COORDINATOR_APPROVED': return 'Coordinator Approved'
    case 'DIRECTOR_APPROVED': return 'Director Approved'
    case 'REJECTED': return 'Rejected'
    default: return status || 'Unknown'
  }
}

export function getStatusColor(status: ServiceRequest['status']): string {
  switch (status) {
    case 'PENDING': return 'text-amber-600 bg-amber-50 border-amber-200'
    case 'COORDINATOR_APPROVED': return 'text-emerald-500 bg-emerald-50 border-emerald-100'
    case 'DIRECTOR_APPROVED': return 'text-white bg-emerald-600 border-emerald-600'
    case 'REJECTED': return 'text-red-600 bg-red-50 border-red-200'
    default: return 'text-slate-500 bg-slate-50 border-slate-200'
  }
}
