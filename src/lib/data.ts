import { ServiceRequest } from '@/types'

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
