const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

type SeedPmacRole =
  | 'PMAC_DIRECTOR'
  | 'PMAC_ASSISTANT_DIRECTOR'
  | 'PMAC_SECRETARY'
  | 'PMAC_EXECUTIVE'
  | 'PMAC_MEMBER'

type SeedPmacClubRole =
  | 'DIRECTOR'
  | 'ASSISTANT_DIRECTOR'
  | 'SECRETARY'
  | 'EXECUTIVE'
  | 'MEMBER'

type SeedPmacExecutiveTitle =
  | 'HEAD_PHOTOGRAPHER'
  | 'HEAD_VIDEOGRAPHER'
  | 'HEAD_GRAPHIC_DESIGNER'
  | 'HEAD_JOURNALIST'
  | 'TECHNICAL_HEAD'

type SeedPmacSpecialty =
  | 'PHOTOGRAPHY'
  | 'VIDEOGRAPHY'
  | 'GRAPHIC_DESIGN'
  | 'JOURNALISM'
  | 'TECHNICAL_SUPPORT'
  | 'ALL_AROUND'

type SeedPmacAccount = {
  key: string
  email: string
  fullName: string
  role: SeedPmacRole
  clubRole: SeedPmacClubRole
  department: 'SASTE' | 'SBAHM' | 'SNAHS' | 'SITE' | 'SOM' | 'BEU'
  course: string
  executiveTitle: SeedPmacExecutiveTitle | null
  specialties: SeedPmacSpecialty[]
}

type SeedServiceRequest = {
  id: string
  createdAt: Date
  eventTitle: string
  eventDate: Date
  endDate: Date | null
  startTime: string | null
  endTime: string | null
  eventVenue: string
  school: string
  documentationType: string
  campusType: string
  letterContent: string | null
  eventDetails: string | null
  secretaryId: string
  coordinatorApprovedAt: Date | null
  directorId: string | null
  directorApprovedAt: Date | null
  directorNote: string | null
  coordinatorNote: string | null
}

function applyTime(date: Date, time: string | null, fallbackHour: number, fallbackMinute: number) {
  const next = new Date(date)

  if (time) {
    const [hours, minutes] = time.split(':').map(Number)
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      next.setHours(hours, minutes, 0, 0)
      return next
    }
  }

  next.setHours(fallbackHour, fallbackMinute, 0, 0)
  return next
}

function buildPmacEventScheduleFromRequest(request: Pick<SeedServiceRequest, 'eventDate' | 'endDate' | 'startTime' | 'endTime'>) {
  const startDateTime = applyTime(request.eventDate, request.startTime, 8, 0)
  const endDateBase = request.endDate ?? request.eventDate
  let endDateTime = applyTime(endDateBase, request.endTime, 17, 0)

  if (endDateTime <= startDateTime) {
    endDateTime = new Date(startDateTime.getTime() + (60 * 60 * 1000))
  }

  return {
    startDateTime,
    endDateTime,
  }
}

function formatDocumentationType(value: string) {
  switch (value) {
    case 'BOTH':
      return 'Photo and Video'
    case 'PHOTO':
      return 'Photo'
    case 'VIDEO':
      return 'Video'
    default:
      return value
  }
}

function buildImportedEventDescription(request: Pick<SeedServiceRequest, 'school' | 'documentationType' | 'campusType' | 'eventDetails'>) {
  const details = request.eventDetails?.trim()

  return [
    'Approved CMAC request routed to PMAC for event coverage.',
    `School/Department: ${request.school}`,
    `Documentation: ${formatDocumentationType(request.documentationType)}`,
    `Campus Type: ${request.campusType === 'OFF_CAMPUS' ? 'Off-Campus' : 'In-Campus'}`,
    details ? `Request Notes: ${details}` : null,
  ].filter(Boolean).join('\n\n')
}

function buildApprovalRemarks(request: Pick<SeedServiceRequest, 'directorNote' | 'coordinatorNote'>) {
  return request.directorNote || request.coordinatorNote || 'Approved in CMAC and released to PMAC for staffing.'
}

async function removeLegacyPmacMockData() {
  await prisma.pmacPoll.deleteMany({
    where: {
      OR: [
        {
          title: 'PMAC Uniform Update Approval',
          description: 'Draft governance poll for finalizing the updated PMAC identification uniform guidelines.',
        },
        {
          title: 'Homecoming Coverage Theme Approval',
          description: 'Approve the proposed creative treatment for the alumni homecoming PMAC coverage package.',
        },
        {
          title: 'Preferred Weekly PMAC Meeting Slot',
          description: 'Internal schedule preference poll for the regular weekly PMAC coordination meeting.',
        },
      ],
    },
  })

  await prisma.pmacEvent.deleteMany({
    where: {
      OR: [
        {
          title: 'PMAC Skills Workshop Planning',
          description: 'Draft internal workshop for camera handling and coverage preparation.',
          venue: 'Media Lab 2',
        },
        {
          title: 'Freshmen Media Orientation Coverage',
          description: 'Pending PMAC event awaiting CMAC approval for student orientation coverage.',
          venue: 'Auditorium',
        },
        {
          title: 'Alumni Homecoming PMAC Coverage',
          description: 'Approved PMAC event for photo, video, and article coverage during alumni homecoming.',
          venue: 'Main Gymnasium',
        },
        {
          title: 'Campus Ministry Feature Story',
          description: 'Completed PMAC feature coverage with follow-up attendance records.',
          venue: 'Chapel Grounds',
        },
      ],
    },
  })

  await prisma.pmacMemberTag.deleteMany({
    where: {
      label: {
        in: [
          'Portrait Coverage',
          'Feature Writer',
          'Layout Support',
          'B-Roll Support',
          'Livestream Backup',
        ],
      },
      member: {
        email: {
          in: ['pmac.member@spup.edu.ph', 'pmac.member.support@spup.edu.ph'],
        },
      },
    },
  })
}

async function syncApprovedPmacRequestsFromCurrentData() {
  const requests = await prisma.serviceRequest.findMany({
    where: {
      serviceType: 'PMAC',
      status: 'DIRECTOR_APPROVED',
      deletedAt: null,
    },
  })

  let syncedCount = 0

  for (const request of requests as SeedServiceRequest[]) {
    const existingEvent = await prisma.pmacEvent.findFirst({
      where: {
        OR: [
          { id: request.id },
          { sourceRequestId: request.id },
        ],
      },
      select: {
        id: true,
        status: true,
      },
    })
    const { startDateTime, endDateTime } = buildPmacEventScheduleFromRequest(request)
    const eventData = {
      title: request.eventTitle,
      description: buildImportedEventDescription(request),
      venue: request.eventVenue,
      startDateTime,
      endDateTime,
      status: existingEvent?.status === 'COMPLETED' ? 'COMPLETED' : 'APPROVED',
      sourceType: 'CMAC_REQUEST',
      sourceRequestId: request.id,
      sourceLabel: 'Imported from approved CMAC request',
      sourceSchool: request.school,
      sourceDocumentationType: request.documentationType,
      sourceCampusType: request.campusType,
      createdById: request.secretaryId,
      approvedById: request.directorId,
      approvalRemarks: buildApprovalRemarks(request),
      submittedAt: request.coordinatorApprovedAt ?? request.createdAt,
      approvedAt: request.directorApprovedAt ?? request.createdAt,
      rejectedAt: null,
    }

    if (existingEvent) {
      await prisma.pmacEvent.update({
        where: { id: existingEvent.id },
        data: eventData,
      })
    } else {
      await prisma.pmacEvent.create({
        data: {
          id: request.id,
          ...eventData,
        },
      })
    }

    syncedCount += 1
  }

  await prisma.pmacEvent.deleteMany({
    where: {
      sourceType: 'CMAC_REQUEST',
      sourceRequestId: {
        not: null,
        notIn: requests.map((request: SeedServiceRequest) => request.id),
      },
    },
  })

  return syncedCount
}

async function main() {
  const seedPassword = process.env.SEED_DEFAULT_PASSWORD
  if (!seedPassword) {
    throw new Error('SEED_DEFAULT_PASSWORD is required. Refusing to seed accounts with a predictable default password.')
  }

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

  const pmacAccounts: SeedPmacAccount[] = [
    {
      key: 'director',
      email: 'pmac.director@spup.edu.ph',
      fullName: 'Paula Ramos',
      role: 'PMAC_DIRECTOR',
      clubRole: 'DIRECTOR',
      department: 'SASTE',
      course: 'BA Communication',
      executiveTitle: null,
      specialties: ['ALL_AROUND', 'JOURNALISM'],
    },
    {
      key: 'assistant',
      email: 'pmac.assistant@spup.edu.ph',
      fullName: 'Miguel Torres',
      role: 'PMAC_ASSISTANT_DIRECTOR',
      clubRole: 'ASSISTANT_DIRECTOR',
      department: 'SITE',
      course: 'BS Information Technology',
      executiveTitle: null,
      specialties: ['VIDEOGRAPHY', 'ALL_AROUND'],
    },
    {
      key: 'secretary',
      email: 'pmac.secretary@spup.edu.ph',
      fullName: 'Andrea Flores',
      role: 'PMAC_SECRETARY',
      clubRole: 'SECRETARY',
      department: 'SASTE',
      course: 'BA Communication',
      executiveTitle: null,
      specialties: ['JOURNALISM', 'GRAPHIC_DESIGN'],
    },
    {
      key: 'exec_photo',
      email: 'pmac.exec.photo@spup.edu.ph',
      fullName: 'Carla Mendoza',
      role: 'PMAC_EXECUTIVE',
      clubRole: 'EXECUTIVE',
      department: 'SASTE',
      course: 'BA Communication',
      executiveTitle: 'HEAD_PHOTOGRAPHER',
      specialties: ['PHOTOGRAPHY', 'ALL_AROUND'],
    },
    {
      key: 'exec_video',
      email: 'pmac.exec.video@spup.edu.ph',
      fullName: 'Luis Navarro',
      role: 'PMAC_EXECUTIVE',
      clubRole: 'EXECUTIVE',
      department: 'SITE',
      course: 'BS Information Technology',
      executiveTitle: 'HEAD_VIDEOGRAPHER',
      specialties: ['VIDEOGRAPHY', 'TECHNICAL_SUPPORT'],
    },
    {
      key: 'exec_graphics',
      email: 'pmac.exec.graphics@spup.edu.ph',
      fullName: 'Bea Santos',
      role: 'PMAC_EXECUTIVE',
      clubRole: 'EXECUTIVE',
      department: 'SASTE',
      course: 'BA Communication',
      executiveTitle: 'HEAD_GRAPHIC_DESIGNER',
      specialties: ['GRAPHIC_DESIGN', 'JOURNALISM'],
    },
    {
      key: 'exec_journal',
      email: 'pmac.exec.journal@spup.edu.ph',
      fullName: 'Mika Reyes',
      role: 'PMAC_EXECUTIVE',
      clubRole: 'EXECUTIVE',
      department: 'SASTE',
      course: 'BA Communication',
      executiveTitle: 'HEAD_JOURNALIST',
      specialties: ['JOURNALISM', 'PHOTOGRAPHY'],
    },
    {
      key: 'exec_technical',
      email: 'pmac.exec.tech@spup.edu.ph',
      fullName: 'Paolo Cruz',
      role: 'PMAC_EXECUTIVE',
      clubRole: 'EXECUTIVE',
      department: 'SITE',
      course: 'BS Information Technology',
      executiveTitle: 'TECHNICAL_HEAD',
      specialties: ['TECHNICAL_SUPPORT', 'VIDEOGRAPHY'],
    },
    {
      key: 'member_primary',
      email: 'pmac.member@spup.edu.ph',
      fullName: 'John Villanueva',
      role: 'PMAC_MEMBER',
      clubRole: 'MEMBER',
      department: 'SASTE',
      course: 'BA Communication',
      executiveTitle: null,
      specialties: ['PHOTOGRAPHY', 'JOURNALISM'],
    },
    {
      key: 'member_support',
      email: 'pmac.member.support@spup.edu.ph',
      fullName: 'Nina Garcia',
      role: 'PMAC_MEMBER',
      clubRole: 'MEMBER',
      department: 'SITE',
      course: 'BS Information Technology',
      executiveTitle: null,
      specialties: ['GRAPHIC_DESIGN', 'VIDEOGRAPHY'],
    },
  ]
  const legacySharedExecutiveEmail = 'pmac.executive@spup.edu.ph'

  for (const account of pmacAccounts) {
    const member = await prisma.pmacMember.upsert({
      where: { email: account.email },
      update: {
        fullName: account.fullName,
        clubRole: account.clubRole,
        status: 'ACTIVE',
        department: account.department,
        course: account.course,
        courseOrDepartment: `${account.department} - ${account.course}`,
        executiveTitle: account.executiveTitle,
      },
      create: {
        fullName: account.fullName,
        clubRole: account.clubRole,
        status: 'ACTIVE',
        email: account.email,
        department: account.department,
        course: account.course,
        courseOrDepartment: `${account.department} - ${account.course}`,
        executiveTitle: account.executiveTitle,
        joinedAt: new Date(),
      },
    })

    await prisma.pmacMemberSpecialty.deleteMany({
      where: {
        memberId: member.id,
      },
    })

    await prisma.pmacMemberSpecialty.createMany({
      data: account.specialties.map((specialty) => ({
        memberId: member.id,
        specialty,
      })),
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

  await prisma.user.deleteMany({
    where: {
      email: legacySharedExecutiveEmail,
    },
  })
  await prisma.pmacMember.deleteMany({
    where: {
      email: legacySharedExecutiveEmail,
    },
  })

  await removeLegacyPmacMockData()
  const syncedPmacRequestCount = await syncApprovedPmacRequestsFromCurrentData()

  console.log(`Seed completed. Core CMAC/ICT accounts and PMAC accounts are ready. Synced ${syncedPmacRequestCount} approved PMAC request(s) into the PMAC calendar.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
