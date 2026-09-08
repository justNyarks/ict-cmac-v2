import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { Prisma, PrismaClient } from '@prisma/client'

import { saveFirstCoverageResponse } from '../src/lib/pmacCoverageResponse'
import { closeOpenPmacPoll, completeApprovedPmacEvent, recordVoteWhileOpen } from '../src/lib/pmacLifecycleWrites'
import { closeAssignedPmacProject, lockEditablePmacProject } from '../src/lib/pmacProjectClosure'

async function main() {
  loadEnvConfig(process.cwd())
  if (process.env.PMAC_CONCURRENCY_TESTS !== '1' || process.env.NODE_ENV === 'production') {
    throw new Error('Set PMAC_CONCURRENCY_TESTS=1 to permit temporary fixtures in a local development database.')
  }
  const connection = process.env.PMAC_TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!connection) throw new Error('A local PostgreSQL database URL is required.')
  const url = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Concurrency tests only permit loopback PostgreSQL databases; remote databases are refused.')
  }
  // Both transaction callbacks must acquire separate connections before racing.
  url.searchParams.set('connection_limit', '5')
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
  const prefix = `concurrency-${randomUUID()}`
  const memberId = `${prefix}-member`
  const userId = `${prefix}-user`
  const eventId = `${prefix}-event`
  const assignmentId = `${prefix}-assignment`
  const pollId = `${prefix}-poll`
  const projectId = `${prefix}-project`
  let created = false

  // A gate ensures both transactions are open before either attempts its write.
  async function race<T>(write: (tx: Prisma.TransactionClient, choice: 'YES' | 'NO') => Promise<T>) {
    let arrived = 0
    let release!: () => void
    const ready = new Promise<void>((resolve) => { release = resolve })
    return Promise.allSettled((['YES', 'NO'] as const).map((choice) => db.$transaction(async (tx) => {
      arrived += 1
      if (arrived === 2) release()
      await ready
      await write(tx, choice)
      return choice
    }, { maxWait: 5000, timeout: 10000 })))
  }

  try {
    await db.$queryRaw`SELECT 1`
    console.log(`Temporary fixture scope: ${prefix}`)
    await db.$transaction(async (tx) => {
      await tx.pmacMember.create({ data: { id: memberId, fullName: prefix, email: `${prefix}@example.invalid`, status: 'INACTIVE' } })
      await tx.user.create({ data: {
        id: userId, name: prefix, email: `${prefix}@example.invalid`, password: `disabled-${randomUUID()}`,
        role: 'PMAC_MEMBER', isActive: false, pmacMemberId: memberId,
      } })
      await tx.pmacEvent.create({ data: {
        id: eventId, title: prefix, venue: 'Temporary database test', status: 'APPROVED',
        startDateTime: new Date('2000-01-01T00:00:00Z'), endDateTime: new Date('2000-01-01T01:00:00Z'), createdById: userId,
      } })
      await tx.pmacEventAssignment.create({ data: {
        id: assignmentId, eventId, memberId, assignedById: userId, assignmentRole: 'PHOTOGRAPHER',
      } })
      await tx.pmacPoll.create({ data: { id: pollId, title: prefix, createdById: userId } })
      await tx.pmacProject.create({ data: {
        id: projectId, title: prefix, branch: 'HEAD_PHOTOGRAPHER', headMemberId: memberId,
        launchedById: userId, startDate: new Date('2000-01-01'), targetDate: new Date('2000-02-01'),
        outputSummary: 'Temporary test output',
      } })
      await tx.pmacActivityLog.create({ data: {
        entityType: 'PROJECT', entityId: projectId, projectId, actorId: userId,
        actorName: prefix, actorRole: 'PMAC_DIRECTOR', action: 'PROJECT_DIRECTOR_CHECKED', summary: 'Temporary test review',
      } })
    })
    created = true

    for (let round = 0; round < 5; round += 1) {
      await db.pmacEventAssignment.update({ where: { id: assignmentId }, data: { availabilityResponse: 'PENDING', respondedAt: null } })
      const results = await race((tx, choice) => saveFirstCoverageResponse(tx, assignmentId, memberId, choice))
      const winners = results.filter((result) => result.status === 'fulfilled')
      assert.equal(winners.length, 1, 'Exactly one competing coverage response must succeed.')
      const loser = results.find((result) => result.status === 'rejected')
      assert(loser?.status === 'rejected' && loser.reason instanceof Error)
      assert.match(loser.reason.message, /already been submitted/)
      const saved = await db.pmacEventAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
      assert.equal(saved.availabilityResponse, winners[0].value)
      assert(saved.respondedAt)
      await assert.rejects(saveFirstCoverageResponse(db, assignmentId, memberId, saved.availabilityResponse === 'YES' ? 'NO' : 'YES'), /already been submitted/)
    }
    console.log('PASS: five simultaneous Yes/No races; exactly one winner and no later overwrite.')

    await db.pmacEventAssignment.update({ where: { id: assignmentId }, data: { availabilityResponse: 'PENDING', respondedAt: null } })
    await assert.rejects(saveFirstCoverageResponse(db, assignmentId, `${prefix}-unrelated`, 'YES'), /already been submitted/)
    await db.pmacEvent.update({ where: { id: eventId }, data: { status: 'COMPLETED' } })
    const locked = await race((tx, choice) => saveFirstCoverageResponse(tx, assignmentId, memberId, choice))
    assert(locked.every((result) => result.status === 'rejected' && result.reason instanceof Error && /already been submitted/.test(result.reason.message)))
    assert.equal((await db.pmacEventAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).availabilityResponse, 'PENDING')
    console.log('PASS: unrelated member and completed-event coverage writes rejected.')

    // This exercises database vote uniqueness, not session/poll-state authorization.
    const votes = await race((tx, selectedOption) => tx.pmacVote.create({ data: { pollId, voterId: userId, voterMemberId: memberId, selectedOption } }))
    assert.equal(votes.filter((result) => result.status === 'fulfilled').length, 1)
    const duplicate = votes.find((result) => result.status === 'rejected')
    assert(duplicate?.status === 'rejected' && duplicate.reason instanceof Prisma.PrismaClientKnownRequestError && duplicate.reason.code === 'P2002')
    assert.equal(await db.pmacVote.count({ where: { pollId } }), 1)
    console.log('PASS: simultaneous duplicate votes produce one row and one unique-constraint rejection.')

    await db.pmacPoll.update({ where: { id: pollId }, data: { status: 'OPEN', opensAt: null, closesAt: null } })
    const closures = await race((tx) => closeOpenPmacPoll(tx, pollId))
    assert.equal(closures.filter((result) => result.status === 'fulfilled').length, 1)
    assert(closures.some((result) => result.status === 'rejected' && /Only open polls/.test(result.reason.message)))
    assert.equal((await db.pmacPoll.findUniqueOrThrow({ where: { id: pollId } })).status, 'CLOSED')
    console.log('PASS: simultaneous poll closure has one winner.')

    await db.pmacVote.deleteMany({ where: { pollId } })
    await assert.rejects(db.$transaction((tx) => recordVoteWhileOpen(tx, { pollId, voterId: userId, voterMemberId: memberId, selectedOption: 'YES' })), /only available while the poll is open/)
    await db.pmacPoll.update({ where: { id: pollId }, data: { status: 'OPEN', closesAt: null } })
    const votingAndClosure = await race((tx, choice) => choice === 'YES'
      ? closeOpenPmacPoll(tx, pollId)
      : recordVoteWhileOpen(tx, { pollId, voterId: userId, voterMemberId: memberId, selectedOption: 'NO' }).then(() => undefined))
    assert.equal(votingAndClosure[0].status, 'fulfilled', 'Closure must succeed, either before or after the competing vote.')
    if (votingAndClosure[1].status === 'rejected') assert.match(votingAndClosure[1].reason.message, /only available while the poll is open/)
    await assert.rejects(db.$transaction((tx) => recordVoteWhileOpen(tx, { pollId, voterId: userId, voterMemberId: memberId, selectedOption: 'YES' })), /only available while the poll is open/)
    assert.equal(await db.pmacVote.count({ where: { pollId } }), votingAndClosure[1].status === 'fulfilled' ? 1 : 0)
    console.log('PASS: vote/closure serialize and no vote can be inserted after closure.')

    await db.pmacEvent.update({ where: { id: eventId }, data: { status: 'APPROVED', completedAt: null } })
    await db.pmacEventAssignment.update({ where: { id: assignmentId }, data: { availabilityResponse: 'YES', assignmentRole: 'ALL_AROUND' } })
    await db.pmacAttendance.create({ data: { eventId, memberId, status: 'PRESENT', recordedById: userId } })
    const completions = await race((tx) => completeApprovedPmacEvent(tx, eventId))
    assert.equal(completions.filter((result) => result.status === 'fulfilled').length, 1)
    assert(completions.some((result) => result.status === 'rejected' && /Only approved/.test(result.reason.message)))
    assert.equal((await db.pmacEvent.findUniqueOrThrow({ where: { id: eventId } })).status, 'COMPLETED')
    console.log('PASS: simultaneous event completion has one winner.')

    await assert.rejects(db.$transaction((tx) => closeAssignedPmacProject(tx, projectId, { role: 'PMAC_EXECUTIVE', pmacMemberId: `${prefix}-other` })), /Only the assigned executive head/)
    const projectClosures = await race((tx) => closeAssignedPmacProject(tx, projectId, { role: 'PMAC_EXECUTIVE', pmacMemberId: memberId }))
    assert.equal(projectClosures.filter((result) => result.status === 'fulfilled').length, 1)
    assert(projectClosures.some((result) => result.status === 'rejected' && /already closed/.test(result.reason.message)))
    assert.equal((await db.pmacProject.findUniqueOrThrow({ where: { id: projectId } })).status, 'COMPLETED')
    console.log('PASS: only the assigned head can close; simultaneous project closure has one winner.')

    await db.pmacProject.update({ where: { id: projectId }, data: { status: 'ACTIVE', completedAt: null } })
    const milestone = await db.pmacProjectMilestone.create({ data: { projectId, title: 'Temporary milestone', dueDate: new Date(), status: 'DONE' } })
    const milestoneRace = await race(async (tx, choice) => {
      if (choice === 'YES') await closeAssignedPmacProject(tx, projectId, { role: 'PMAC_EXECUTIVE', pmacMemberId: memberId })
      else {
        await lockEditablePmacProject(tx, projectId)
        await tx.pmacProjectMilestone.update({ where: { id: milestone.id }, data: { status: 'TODO' } })
      }
    })
    assert.equal(milestoneRace.filter((result) => result.status === 'fulfilled').length, 1)
    const finalProject = await db.pmacProject.findUniqueOrThrow({ where: { id: projectId }, include: { milestones: true } })
    assert.equal(finalProject.milestones[0].status, finalProject.status === 'COMPLETED' ? 'DONE' : 'TODO')
    const blockedEdit = milestoneRace.find((result) => result.status === 'rejected')
    assert(blockedEdit?.status === 'rejected' && /Complete every project milestone|cannot be edited/.test(blockedEdit.reason.message))
    console.log('PASS: milestone edit versus project closure cannot leave an incomplete milestone on a closed project.')

    const attachment = await db.pmacAttachment.create({ data: {
      eventId, uploadedById: userId, fileName: 'test.pdf', storedName: prefix + '.pdf',
      filePath: '/private/uploads/pmac/2000-01/' + prefix + '.pdf',
      mimeType: 'application/pdf', sizeBytes: 4,
      content: { create: { data: Buffer.from([0, 255, 13, 10]) } },
    } })
    // Normal metadata queries must not include binary content.
    assert.equal('content' in attachment, false)
    assert.deepEqual((await db.pmacAttachmentContent.findUniqueOrThrow({ where: { attachmentId: attachment.id } })).data, Buffer.from([0, 255, 13, 10]))
    await db.pmacAttachment.delete({ where: { id: attachment.id } })
    assert.equal(await db.pmacAttachmentContent.count({ where: { attachmentId: attachment.id } }), 0)
    console.log('PASS: database attachment bytes round-trip and cascade on deletion.')
  } finally {
    try {
      if (created) {
        // Exact generated IDs only; event and poll children cascade. Never clean user data.
        await db.$transaction([
          db.pmacProject.delete({ where: { id: projectId } }),
          db.pmacPoll.delete({ where: { id: pollId } }),
          db.pmacEvent.delete({ where: { id: eventId } }),
          db.user.delete({ where: { id: userId } }),
          db.pmacMember.delete({ where: { id: memberId } }),
        ])
        console.log(`Removed temporary fixtures: ${prefix}`)
      }
    } finally {
      await db.$disconnect()
    }
  }
}

main().catch((error: unknown) => {
  // Avoid printing a connection URL or Prisma's expanded query diagnostics.
  console.error(error instanceof Prisma.PrismaClientKnownRequestError ? `Database check failed: ${error.code}` : error instanceof Error ? error.message : 'Concurrency check failed.')
  process.exitCode = 1
})
