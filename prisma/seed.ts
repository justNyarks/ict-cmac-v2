const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const seedPassword = process.env.SEED_DEFAULT_PASSWORD || 'password123'
  const password = await bcrypt.hash(seedPassword, 10)

  // Must match the School enum in schema.prisma exactly
  const schools = ['SNAHS', 'SBAHM', 'SITE', 'SASTE', 'MEDICINE', 'BEU', 'UNIVERSITY', 'HR']
  
  // Create Secretary for each department
  for (const s of schools) {
    await prisma.user.upsert({
      where: { email: `secretary@${s.toLowerCase()}.edu` },
      update: {
        role: 'SECRETARY',
        school: s,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
      create: {
        email: `secretary@${s.toLowerCase()}.edu`,
        name: `Secretary of ${s}`,
        password: password,
        role: 'SECRETARY',
        school: s,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    })
  }   

  // Create Coordinator
  await prisma.user.upsert({
    where: { email: 'coordinator@ict.edu' },
    update: { role: 'CMAC_COORDINATOR', mustChangePassword: false, passwordUpdatedAt: new Date() },
    create: {
      email: 'coordinator@ict.edu',
      name: 'Liza Mendoza',
      password: password,
      role: 'CMAC_COORDINATOR',
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    },
  })

  // Create Director
  await prisma.user.upsert({
    where: { email: 'director@ict.edu' },
    update: { role: 'ICT_DIRECTOR', mustChangePassword: false, passwordUpdatedAt: new Date() },
    create: {
      email: 'director@ict.edu',
      name: 'Dir. Ramon Dela Cruz',
      password: password,
      role: 'ICT_DIRECTOR',
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    },
  })

  const pmacAccounts = [
    {
      email: 'pmac.director@spup.edu.ph',
      fullName: 'Paula Ramos',
      role: 'PMAC_DIRECTOR',
      clubRole: 'DIRECTOR',
      courseOrDepartment: 'PMAC Leadership',
    },
    {
      email: 'pmac.assistant@spup.edu.ph',
      fullName: 'Miguel Torres',
      role: 'PMAC_ASSISTANT_DIRECTOR',
      clubRole: 'ASSISTANT_DIRECTOR',
      courseOrDepartment: 'PMAC Leadership',
    },
    {
      email: 'pmac.secretary@spup.edu.ph',
      fullName: 'Andrea Flores',
      role: 'PMAC_SECRETARY',
      clubRole: 'SECRETARY',
      courseOrDepartment: 'PMAC Secretariat',
    },
    {
      email: 'pmac.executive@spup.edu.ph',
      fullName: 'Carla Mendoza',
      role: 'PMAC_EXECUTIVE',
      clubRole: 'EXECUTIVE',
      courseOrDepartment: 'PMAC Executive Board',
    },
    {
      email: 'pmac.member@spup.edu.ph',
      fullName: 'John Villanueva',
      role: 'PMAC_MEMBER',
      clubRole: 'MEMBER',
      courseOrDepartment: 'General Membership',
    },
  ]

  for (const account of pmacAccounts) {
    const member = await prisma.pmacMember.upsert({
      where: { email: account.email },
      update: {
        fullName: account.fullName,
        clubRole: account.clubRole,
        status: 'ACTIVE',
        courseOrDepartment: account.courseOrDepartment,
      },
      create: {
        fullName: account.fullName,
        clubRole: account.clubRole,
        status: 'ACTIVE',
        email: account.email,
        courseOrDepartment: account.courseOrDepartment,
        joinedAt: new Date(),
      },
    })

    await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.fullName,
        role: account.role,
        school: null,
        isActive: true,
        pmacMemberId: member.id,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
      },
      create: {
        email: account.email,
        name: account.fullName,
        password,
        role: account.role,
        isActive: true,
        pmacMemberId: member.id,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
      },
    })
  }

  const pmacUsers = await prisma.user.findMany({
    where: {
      email: {
        in: pmacAccounts.map(account => account.email),
      },
    },
    select: {
      id: true,
      email: true,
      pmacMemberId: true,
    },
  })
  const coordinator = await prisma.user.findUnique({
    where: { email: 'coordinator@ict.edu' },
    select: { id: true },
  })

  let directorUser = null
  let assistantUser = null
  let secretaryUser = null
  let executiveUser = null
  let memberUser = null

  for (const user of pmacUsers) {
    if (user.email === 'pmac.director@spup.edu.ph') {
      directorUser = user
    } else if (user.email === 'pmac.assistant@spup.edu.ph') {
      assistantUser = user
    } else if (user.email === 'pmac.secretary@spup.edu.ph') {
      secretaryUser = user
    } else if (user.email === 'pmac.executive@spup.edu.ph') {
      executiveUser = user
    } else if (user.email === 'pmac.member@spup.edu.ph') {
      memberUser = user
    }
  }

  if (
    coordinator &&
    directorUser?.pmacMemberId &&
    assistantUser?.pmacMemberId &&
    secretaryUser?.pmacMemberId &&
    executiveUser?.pmacMemberId &&
    memberUser?.pmacMemberId
  ) {
    await prisma.pmacVote.deleteMany()
    await prisma.pmacAttachment.deleteMany()
    await prisma.pmacActivityLog.deleteMany()
    await prisma.pmacPoll.deleteMany()
    await prisma.pmacAttendance.deleteMany()
    await prisma.pmacEventAssignment.deleteMany()
    await prisma.pmacEvent.deleteMany()

    const draftEvent = await prisma.pmacEvent.create({
      data: {
        title: 'PMAC Skills Workshop Planning',
        description: 'Draft internal workshop for camera handling and coverage preparation.',
        venue: 'Media Lab 2',
        startDateTime: new Date('2026-07-12T09:00:00'),
        endDateTime: new Date('2026-07-12T12:00:00'),
        status: 'DRAFT',
        createdById: directorUser.id,
      },
    })

    const pendingEvent = await prisma.pmacEvent.create({
      data: {
        title: 'Freshmen Media Orientation Coverage',
        description: 'Pending PMAC event awaiting CMAC approval for student orientation coverage.',
        venue: 'Auditorium',
        startDateTime: new Date('2026-07-18T08:00:00'),
        endDateTime: new Date('2026-07-18T11:30:00'),
        status: 'PENDING_APPROVAL',
        createdById: directorUser.id,
        submittedAt: new Date('2026-07-02T08:15:00'),
      },
    })

    const approvedEvent = await prisma.pmacEvent.create({
      data: {
        title: 'Alumni Homecoming PMAC Coverage',
        description: 'Approved PMAC event for photo, video, and article coverage during alumni homecoming.',
        venue: 'Main Gymnasium',
        startDateTime: new Date('2026-07-20T14:00:00'),
        endDateTime: new Date('2026-07-20T18:30:00'),
        status: 'APPROVED',
        createdById: directorUser.id,
        approvedById: coordinator.id,
        submittedAt: new Date('2026-07-01T09:00:00'),
        approvedAt: new Date('2026-07-02T10:00:00'),
        approvalRemarks: 'Approved for PMAC coverage. Coordinate staffing and attendance.',
      },
    })

    const completedEvent = await prisma.pmacEvent.create({
      data: {
        title: 'Campus Ministry Feature Story',
        description: 'Completed PMAC feature coverage with follow-up attendance records.',
        venue: 'Chapel Grounds',
        startDateTime: new Date('2026-06-28T15:00:00'),
        endDateTime: new Date('2026-06-28T17:00:00'),
        status: 'COMPLETED',
        createdById: assistantUser.id,
        approvedById: coordinator.id,
        submittedAt: new Date('2026-06-24T09:00:00'),
        approvedAt: new Date('2026-06-25T08:30:00'),
        completedAt: new Date('2026-06-28T18:00:00'),
        approvalRemarks: 'Approved. Event completed successfully.',
      },
    })

    await prisma.pmacEventAssignment.createMany({
      data: [
        {
          eventId: approvedEvent.id,
          memberId: executiveUser.pmacMemberId,
          assignmentRole: 'VIDEOGRAPHER',
          availabilityResponse: 'PENDING',
          assignmentNotes: 'Bring tripod and backup storage.',
          assignedById: directorUser.id,
        },
        {
          eventId: approvedEvent.id,
          memberId: memberUser.pmacMemberId,
          assignmentRole: 'PHOTOGRAPHER',
          availabilityResponse: 'YES',
          assignmentNotes: 'Focus on stage and audience coverage.',
          assignedById: secretaryUser.id,
          respondedAt: new Date('2026-07-02T11:00:00'),
        },
        {
          eventId: completedEvent.id,
          memberId: executiveUser.pmacMemberId,
          assignmentRole: 'JOURNALIST',
          availabilityResponse: 'YES',
          assignmentNotes: 'Prepare interview guide before the feature story.',
          assignedById: assistantUser.id,
          respondedAt: new Date('2026-06-26T08:00:00'),
        },
        {
          eventId: completedEvent.id,
          memberId: memberUser.pmacMemberId,
          assignmentRole: 'GRAPHIC_DESIGNER',
          availabilityResponse: 'YES',
          assignmentNotes: 'Deliver recap graphics after the event.',
          assignedById: assistantUser.id,
          respondedAt: new Date('2026-06-26T08:30:00'),
        },
      ],
    })

    await prisma.pmacAttendance.createMany({
      data: [
        {
          eventId: completedEvent.id,
          memberId: executiveUser.pmacMemberId,
          status: 'PRESENT',
          notes: 'Interview notes submitted on time.',
          recordedById: secretaryUser.id,
          recordedAt: new Date('2026-06-28T18:10:00'),
        },
        {
          eventId: completedEvent.id,
          memberId: memberUser.pmacMemberId,
          status: 'LATE',
          notes: 'Arrived after venue setup but completed deliverables.',
          recordedById: secretaryUser.id,
          recordedAt: new Date('2026-06-28T18:15:00'),
        },
      ],
    })

    await prisma.pmacPoll.create({
      data: {
        title: 'PMAC Uniform Update Approval',
        description: 'Draft governance poll for finalizing the updated PMAC identification uniform guidelines.',
        type: 'GENERAL',
        status: 'DRAFT',
        opensAt: new Date('2026-07-08T09:00:00'),
        closesAt: new Date('2026-07-10T18:00:00'),
        resultsVisibility: 'AFTER_CLOSE',
        createdById: directorUser.id,
      },
    })

    const openPoll = await prisma.pmacPoll.create({
      data: {
        title: 'Homecoming Coverage Theme Approval',
        description: 'Approve the proposed creative treatment for the alumni homecoming PMAC coverage package.',
        type: 'EVENT',
        status: 'OPEN',
        opensAt: new Date('2026-07-02T09:00:00'),
        closesAt: new Date('2026-07-05T18:00:00'),
        linkedEventId: approvedEvent.id,
        resultsVisibility: 'IMMEDIATE',
        createdById: assistantUser.id,
      },
    })

    const closedPoll = await prisma.pmacPoll.create({
      data: {
        title: 'Preferred Weekly PMAC Meeting Slot',
        description: 'Internal schedule preference poll for the regular weekly PMAC coordination meeting.',
        type: 'SCHEDULE_PREFERENCE',
        status: 'CLOSED',
        opensAt: new Date('2026-06-29T08:00:00'),
        closesAt: new Date('2026-07-01T18:00:00'),
        resultsVisibility: 'AFTER_CLOSE',
        createdById: directorUser.id,
      },
    })

    await prisma.pmacVote.createMany({
      data: [
        {
          pollId: openPoll.id,
          voterId: executiveUser.id,
          voterMemberId: executiveUser.pmacMemberId,
          selectedOption: 'YES',
          votedAt: new Date('2026-07-02T11:30:00'),
        },
        {
          pollId: openPoll.id,
          voterId: memberUser.id,
          voterMemberId: memberUser.pmacMemberId,
          selectedOption: 'ABSTAIN',
          votedAt: new Date('2026-07-02T11:45:00'),
        },
        {
          pollId: closedPoll.id,
          voterId: directorUser.id,
          voterMemberId: directorUser.pmacMemberId,
          selectedOption: 'YES',
          votedAt: new Date('2026-06-29T09:00:00'),
        },
        {
          pollId: closedPoll.id,
          voterId: assistantUser.id,
          voterMemberId: assistantUser.pmacMemberId,
          selectedOption: 'YES',
          votedAt: new Date('2026-06-29T09:15:00'),
        },
        {
          pollId: closedPoll.id,
          voterId: secretaryUser.id,
          voterMemberId: secretaryUser.pmacMemberId,
          selectedOption: 'NO',
          votedAt: new Date('2026-06-29T10:00:00'),
        },
        {
          pollId: closedPoll.id,
          voterId: executiveUser.id,
          voterMemberId: executiveUser.pmacMemberId,
          selectedOption: 'YES',
          votedAt: new Date('2026-06-29T11:00:00'),
        },
        {
          pollId: closedPoll.id,
          voterId: memberUser.id,
          voterMemberId: memberUser.pmacMemberId,
          selectedOption: 'ABSTAIN',
          votedAt: new Date('2026-06-29T11:30:00'),
        },
      ],
    })

    await prisma.pmacActivityLog.createMany({
      data: [
        {
          entityType: 'EVENT',
          entityId: approvedEvent.id,
          eventId: approvedEvent.id,
          actorId: coordinator.id,
          actorName: 'Liza Mendoza',
          actorRole: 'CMAC_COORDINATOR',
          action: 'EVENT_APPROVED',
          summary: 'Approved a PMAC event for operations.',
          details: 'Seeded sample activity for the V4 PMAC dashboard.',
        },
        {
          entityType: 'POLL',
          entityId: openPoll.id,
          pollId: openPoll.id,
          actorId: assistantUser.id,
          actorName: 'Miguel Torres',
          actorRole: 'PMAC_ASSISTANT_DIRECTOR',
          action: 'POLL_OPENED',
          summary: 'Opened a PMAC governance poll for member voting.',
          details: 'Seeded sample activity for the V4 PMAC dashboard.',
        },
        {
          entityType: 'POLL',
          entityId: openPoll.id,
          pollId: openPoll.id,
          actorId: executiveUser.id,
          action: 'VOTE_CAST',
          actorName: 'Carla Mendoza',
          actorRole: 'PMAC_EXECUTIVE',
          summary: 'Recorded a yes vote in a PMAC poll.',
          details: null,
        },
      ],
    })
  }

  console.log('Seed completed. Core CMAC/ICT accounts, PMAC starter accounts, PMAC V2 sample events, and PMAC V3 sample polls are ready.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
