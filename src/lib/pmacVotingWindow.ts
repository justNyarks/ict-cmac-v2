import type { Prisma } from '@prisma/client'

export function getOpenVotingWhere(now: Date): Prisma.PmacPollWhereInput {
  return {
    status: 'OPEN',
    AND: [
      { OR: [{ opensAt: null }, { opensAt: { lte: now } }] },
      { OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
    ],
  }
}

export function isPollOpenForVoting(
  poll: Pick<Prisma.PmacPollUncheckedCreateInput, 'status' | 'opensAt' | 'closesAt'>,
  now = new Date(),
) {
  return poll.status === 'OPEN'
    && (!poll.opensAt || new Date(poll.opensAt) <= now)
    && (!poll.closesAt || new Date(poll.closesAt) > now)
}
