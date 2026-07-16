import type { Prisma, RequestStatus, Role } from '@prisma/client'

export type RequestTransitionAction =
  | 'APPROVE'
  | 'REJECT'
  | 'REQUEST_REVISION'
  | 'WITHDRAW'
  | 'RESUBMIT'
  | 'CANCEL'
  | 'ARCHIVE'

const CLOSED_STATUSES: readonly RequestStatus[] = ['WITHDRAWN', 'CANCELLED', 'REJECTED']

export function getRequestTransitionTarget(
  role: Role,
  current: RequestStatus,
  action: RequestTransitionAction
): RequestStatus | null {
  if (role === 'CMAC_COORDINATOR') {
    if (current === 'PENDING' && action === 'APPROVE') return 'COORDINATOR_APPROVED'
    if (current === 'PENDING' && action === 'REJECT') return 'REJECTED'
    if (current === 'PENDING' && action === 'REQUEST_REVISION') return 'REVISION_REQUESTED'
    if (CLOSED_STATUSES.includes(current) && action === 'ARCHIVE') return 'ARCHIVED'
  }

  if (role === 'ICT_DIRECTOR') {
    if ((current === 'PENDING' || current === 'COORDINATOR_APPROVED') && action === 'APPROVE') return 'DIRECTOR_APPROVED'
    if ((current === 'PENDING' || current === 'COORDINATOR_APPROVED') && action === 'REJECT') return 'REJECTED'
    if ((current === 'PENDING' || current === 'COORDINATOR_APPROVED') && action === 'REQUEST_REVISION') return 'REVISION_REQUESTED'
    if (current === 'DIRECTOR_APPROVED' && action === 'CANCEL') return 'CANCELLED'
    if (CLOSED_STATUSES.includes(current) && action === 'ARCHIVE') return 'ARCHIVED'
  }

  if (role === 'SECRETARY') {
    if ((current === 'PENDING' || current === 'REVISION_REQUESTED') && action === 'WITHDRAW') return 'WITHDRAWN'
    if ((current === 'REVISION_REQUESTED' || current === 'WITHDRAWN' || current === 'REJECTED') && action === 'RESUBMIT') return 'PENDING'
  }

  return null
}

export function assertRequestTransition(role: Role, current: RequestStatus, action: RequestTransitionAction) {
  const target = getRequestTransitionTarget(role, current, action)
  if (!target) {
    const actionLabel = action.toLowerCase().replaceAll('_', ' ')
    const statusLabel = current.toLowerCase().replaceAll('_', ' ')
    throw new Error(`This ${actionLabel} action is not allowed while the request is ${statusLabel}.`)
  }
  return target
}

export async function applyAtomicRequestTransition(
  tx: Pick<Prisma.TransactionClient, 'serviceRequest'>,
  request: { id: string; status: RequestStatus },
  role: Role,
  action: RequestTransitionAction,
  data: Prisma.ServiceRequestUncheckedUpdateManyInput = {}
) {
  const nextStatus = assertRequestTransition(role, request.status, action)
  const updated = await tx.serviceRequest.updateMany({
    where: { id: request.id, status: request.status, deletedAt: null },
    data: { ...data, status: nextStatus },
  })

  if (updated.count !== 1) {
    throw new Error('This request changed while you were reviewing it. Refresh the page and try again.')
  }

  return tx.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })
}
