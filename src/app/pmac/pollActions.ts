'use server'

import { unstable_noStore as noStore } from 'next/cache'
import { isPmacPollVoterRole, PMAC_POLL_CREATOR_ROLES, PMAC_POLL_VOTER_ROLES, PMAC_VOTE_CHOICES } from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { prisma } from '@/lib/prisma'
import { revalidatePmacViews } from '@/lib/pmacRevalidation'
import { sanitizeSingleLineText } from '@/lib/sanitization'

import { ensurePollPayload, isPollOpenForVoting, canViewPollResults, getViewerSession, assertPmacActionSession, getActivityActor, countEligiblePmacVoters, getPmacPollWhere, findPmacPollForUser, buildPollWorkspacePermissions } from './actionShared'
import type { PmacVoteChoice, PmacPollPayload } from './actionShared'

export async function getPmacPolls() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  const [polls, totalEligibleVoters] = await Promise.all([
    prisma.pmacPoll.findMany({
      where: getPmacPollWhere(session.user),
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        opensAt: true,
        closesAt: true,
        resultsVisibility: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        linkedEvent: {
          select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
          },
        },
        _count: {
          select: {
            votes: true,
          },
        },
        votes: {
          where: {
            voterId: session.user.id,
          },
          select: {
            id: true,
            selectedOption: true,
            votedAt: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
        { title: 'asc' },
      ],
    }),
    countEligiblePmacVoters(),
  ])

  const now = new Date()

  return polls.map((poll) => {
    const viewerVote = poll.votes[0] ?? null
    const votesCast = poll._count.votes

    return {
      ...poll,
      viewerVote,
      votesCast,
      totalEligibleVoters,
      participationRate: totalEligibleVoters ? Math.round((votesCast / totalEligibleVoters) * 100) : 0,
      isVotingOpen: isPollOpenForVoting(poll, now),
      resultsVisible: canViewPollResults(poll, now),
      canVote: isPmacPollVoterRole(session.user.role) && !!session.user.pmacMemberId && !viewerVote && isPollOpenForVoting(poll, now),
    }
  })
}

export async function getPmacPollWorkspace(pollId: string) {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return null
  }

  const sanitizedId = sanitizeSingleLineText(pollId, {
    fieldName: 'Poll ID',
    maxLength: 191,
    required: true,
  })

  const poll = await findPmacPollForUser(sanitizedId, session.user)
  if (!poll) {
    return null
  }

  const now = new Date()
  const viewerVote = poll.votes.find((vote: any) => vote.voterId === session.user.id) ?? null
  const permissions = buildPollWorkspacePermissions(session.user, poll, viewerVote, now)

  const [totalEligibleVoters, linkableEvents] = await Promise.all([
    countEligiblePmacVoters(),
    permissions.canEdit
      ? prisma.pmacEvent.findMany({
          select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
          },
          orderBy: [
            { startDateTime: 'desc' },
            { title: 'asc' },
          ],
        })
      : Promise.resolve([]),
  ])

  const voteSummary = PMAC_VOTE_CHOICES.reduce((summary, choice) => {
    summary[choice] = poll.votes.filter((vote: any) => vote.selectedOption === choice).length
    return summary
  }, {} as Record<PmacVoteChoice, number>)

  return {
    poll: {
      ...poll,
      attachments: 'attachments' in poll && Array.isArray(poll.attachments) ? poll.attachments : [],
      activityLogs: 'activityLogs' in poll && Array.isArray(poll.activityLogs) ? poll.activityLogs : [],
      votes: permissions.canViewResults ? poll.votes : [],
    },
    voteSummary: permissions.canViewResults ? voteSummary : null,
    metrics: {
      totalEligibleVoters,
      totalVotesCast: poll._count.votes,
      participationRate: totalEligibleVoters ? Math.round((poll._count.votes / totalEligibleVoters) * 100) : 0,
      isVotingOpen: isPollOpenForVoting(poll, now),
      resultsVisible: permissions.canViewResults,
    },
    viewerRole: session.user.role,
    viewerMemberId: session.user.pmacMemberId,
    viewerVote,
    permissions,
    linkableEvents,
  }
}

export async function createPmacPoll(payload: PmacPollPayload) {
  try {
    const session = await assertPmacActionSession(PMAC_POLL_CREATOR_ROLES)
    const data = ensurePollPayload(payload)

    if (data.linkedEventId) {
      const linkedEvent = await prisma.pmacEvent.findUnique({
        where: { id: data.linkedEventId },
        select: { id: true },
      })

      if (!linkedEvent) {
        return { success: false, error: 'Linked PMAC event was not found.' }
      }
    }

    const poll = await prisma.$transaction(async (tx) => {
      const createdPoll = await tx.pmacPoll.create({
        data: {
          ...data,
          createdById: session.user.id,
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: createdPoll.id,
        pollId: createdPoll.id,
        ...getActivityActor(session.user),
        action: 'POLL_CREATED',
        summary: `Created PMAC poll "${createdPoll.title}".`,
        details: createdPoll.description,
      })

      return createdPoll
    })

    revalidatePmacViews([`/pmac/polls/${poll.id}`])
    return { success: true, pollId: poll.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create PMAC poll.' }
  }
}

export async function updatePmacPoll(payload: PmacPollPayload) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const pollId = sanitizeSingleLineText(payload.pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })
    const data = ensurePollPayload(payload)

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: pollId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status !== 'DRAFT') {
      return { success: false, error: 'Only draft polls can be edited.' }
    }

    if (data.linkedEventId) {
      const linkedEvent = await prisma.pmacEvent.findUnique({
        where: { id: data.linkedEventId },
        select: { id: true },
      })

      if (!linkedEvent) {
        return { success: false, error: 'Linked PMAC event was not found.' }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: pollId },
        data,
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: pollId,
        pollId,
        ...getActivityActor(session.user),
        action: 'POLL_UPDATED',
        summary: `Updated draft PMAC poll "${data.title}".`,
        details: data.description,
      })
    })

    revalidatePmacViews([`/pmac/polls/${pollId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update PMAC poll.' }
  }
}

export async function openPmacPoll(pollId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
        opensAt: true,
        closesAt: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status !== 'DRAFT') {
      return { success: false, error: 'Only draft polls can be opened.' }
    }

    if (poll.closesAt && poll.closesAt <= new Date()) {
      return { success: false, error: 'This poll has already passed its close time. Update the schedule before opening it.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: sanitizedId },
        data: {
          status: 'OPEN',
          opensAt: poll.opensAt ?? new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'POLL_OPENED',
        summary: 'Opened a PMAC poll for voting.',
        changes: {
          status: { before: poll.status, after: 'OPEN' },
        },
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to open PMAC poll.' }
  }
}

export async function closePmacPoll(pollId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status !== 'OPEN') {
      return { success: false, error: 'Only open polls can be closed.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: sanitizedId },
        data: {
          status: 'CLOSED',
          closesAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'POLL_CLOSED',
        summary: 'Closed a PMAC poll.',
        changes: {
          status: { before: poll.status, after: 'CLOSED' },
        },
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to close PMAC poll.' }
  }
}

export async function archivePmacPoll(pollId: string) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'CMAC_COORDINATOR'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (poll.status === 'ARCHIVED') {
      return { success: false, error: 'This poll is already archived.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacPoll.update({
        where: { id: sanitizedId },
        data: {
          status: 'ARCHIVED',
          ...(poll.status === 'OPEN' ? { closesAt: new Date() } : {}),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'POLL_ARCHIVED',
        summary: 'Archived a PMAC poll.',
        changes: {
          status: { before: poll.status, after: 'ARCHIVED' },
        },
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to archive PMAC poll.' }
  }
}

export async function castPmacVote(pollId: string, selectedOption: PmacVoteChoice) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY', 'PMAC_EXECUTIVE', 'PMAC_MEMBER'])
    const sanitizedId = sanitizeSingleLineText(pollId, {
      fieldName: 'Poll ID',
      maxLength: 191,
      required: true,
    })

    if (!PMAC_VOTE_CHOICES.includes(selectedOption)) {
      return { success: false, error: 'Please choose a valid vote option.' }
    }

    const voter = await prisma.user.findFirst({
      where: {
        id: session.user.id,
        role: {
          in: [...PMAC_POLL_VOTER_ROLES],
        },
        isActive: true,
        pmacMember: {
          is: {
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        pmacMemberId: true,
      },
    })

    if (!voter?.pmacMemberId) {
      return { success: false, error: 'Your PMAC membership is not eligible for voting.' }
    }

    const voterMemberId = voter.pmacMemberId

    const poll = await prisma.pmacPoll.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        status: true,
        opensAt: true,
        closesAt: true,
      },
    })

    if (!poll) {
      return { success: false, error: 'PMAC poll not found.' }
    }

    if (!isPollOpenForVoting(poll)) {
      return { success: false, error: 'Voting is only available while the poll is open.' }
    }

    const existingVote = await prisma.pmacVote.findFirst({
      where: {
        pollId: sanitizedId,
        voterId: voter.id,
      },
      select: {
        id: true,
      },
    })

    if (existingVote) {
      return { success: false, error: 'You have already voted in this poll.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacVote.create({
        data: {
          pollId: sanitizedId,
          voterId: voter.id,
          voterMemberId,
          selectedOption,
          votedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'POLL',
        entityId: sanitizedId,
        pollId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'VOTE_CAST',
        summary: `Recorded a ${selectedOption.toLowerCase()} vote in a PMAC poll.`,
      })
    })

    revalidatePmacViews([`/pmac/polls/${sanitizedId}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit PMAC vote.' }
  }
}
