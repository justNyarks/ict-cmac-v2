'use server'

import type { Prisma } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache'
import { getDutyRolesForSpecialties, getRecommendedAssignmentRoles, isPmacAttendanceManagerRole, isPmacStaffingManagerRole, PMAC_ATTENDANCE_STATUSES, PMAC_EVENT_DUTY_ROLES } from '@/lib/pmac'
import { recordPmacActivity } from '@/lib/pmacActivity'
import { prisma } from '@/lib/prisma'
import { revalidatePmacViews } from '@/lib/pmacRevalidation'
import { sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/sanitization'

import { isCoordinatorRole, formatExecutiveTitle, getViewerSession, assertPmacActionSession, getActivityActor, buildWorkloadTier } from './actionShared'
import type { PmacAssignmentInput, PmacAttendanceInput, PmacExecutiveTagPayload } from './actionShared'

export async function getPmacAssignmentsBoard() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  const where: Prisma.PmacEventAssignmentWhereInput = isCoordinatorRole(session.user.role) || isPmacStaffingManagerRole(session.user.role)
    ? {}
    : session.user.pmacMemberId
      ? { memberId: session.user.pmacMemberId }
      : { id: '__missing_member__' }

  const assignments = await prisma.pmacEventAssignment.findMany({
    where,
    include: {
      event: {
        select: {
          id: true,
          title: true,
          venue: true,
          startDateTime: true,
          endDateTime: true,
          status: true,
        },
      },
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          clubRole: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: [
      { event: { startDateTime: 'asc' } },
      { assignmentRole: 'asc' },
    ],
  })

  const now = new Date()
  const soon = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 14))
  const attendanceWindow = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 90))
  const memberIds = Array.from(new Set(assignments.map((assignment) => assignment.memberId)))

  const memberInsights = memberIds.length
    ? await prisma.pmacMember.findMany({
        where: {
          id: {
            in: memberIds,
          },
        },
        select: {
          id: true,
          eventAssignments: {
            where: {
              eventId: {
                notIn: assignments.map((assignment) => assignment.eventId),
              },
              event: {
                status: {
                  in: ['APPROVED', 'COMPLETED'],
                },
                startDateTime: {
                  gte: attendanceWindow,
                  lte: soon,
                },
              },
            },
            select: {
              event: {
                select: {
                  startDateTime: true,
                },
              },
            },
          },
          attendanceRecords: {
            where: {
              recordedAt: {
                gte: attendanceWindow,
              },
            },
            select: {
              status: true,
            },
          },
        },
      })
    : []

  const insightMap = new Map(
    memberInsights.map((member) => {
      const upcomingLoad = member.eventAssignments.filter((assignment) => assignment.event.startDateTime >= now).length
      const attendanceCount = member.attendanceRecords.length
      const attendanceRate = attendanceCount
        ? Math.round(
            (member.attendanceRecords.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').length / attendanceCount) * 100
          )
        : 100

      return [member.id, {
        upcomingLoad,
        attendanceRate,
        workloadTier: buildWorkloadTier(upcomingLoad),
      }]
    })
  )

  return assignments.map((assignment) => ({
    ...assignment,
    memberInsights: insightMap.get(assignment.memberId) ?? {
      upcomingLoad: 0,
      attendanceRate: 100,
      workloadTier: 'Light',
    },
  }))
}

export async function getPmacExecutiveTagBoard() {
  noStore()

  const session = await getViewerSession()
  if (!session || session.user.role !== 'PMAC_EXECUTIVE' || !session.user.pmacMemberId) {
    return null
  }

  const viewer = await prisma.pmacMember.findUnique({
    where: { id: session.user.pmacMemberId },
    select: {
      id: true,
      fullName: true,
      executiveTitle: true,
      specialties: {
        select: {
          specialty: true,
        },
        orderBy: {
          specialty: 'asc',
        },
      },
    },
  })

  if (!viewer) {
    return null
  }

  const members = await prisma.pmacMember.findMany({
    where: {
      id: {
        not: viewer.id,
      },
      clubRole: 'MEMBER',
      status: 'ACTIVE',
      account: {
        is: {
          isActive: true,
        },
      },
    },
    select: {
      id: true,
      fullName: true,
      clubRole: true,
      executiveTitle: true,
      specialties: {
        select: {
          specialty: true,
        },
        orderBy: {
          specialty: 'asc',
        },
      },
      receivedTags: {
        include: {
          assignedByMember: {
            select: {
              id: true,
              fullName: true,
              executiveTitle: true,
            },
          },
        },
        orderBy: [
          { label: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
    orderBy: [
      { clubRole: 'asc' },
      { fullName: 'asc' },
    ],
  })

  return {
    viewer,
    members,
  }
}

export async function savePmacExecutiveTags(payload: PmacExecutiveTagPayload) {
  try {
    const session = await assertPmacActionSession(['PMAC_EXECUTIVE'])
    const executiveMemberId = session.user.pmacMemberId as string
    const memberId = sanitizeSingleLineText(payload.memberId, {
      fieldName: 'Member ID',
      maxLength: 191,
      required: true,
    })

    if (memberId === executiveMemberId) {
      return { success: false, error: 'Executive heads cannot tag their own member profile.' }
    }

    const normalizedTags = Array.from(
      new Map(
        (payload.tags ?? [])
          .map((tag) => sanitizeSingleLineText(tag, {
            fieldName: 'Tag',
            maxLength: 64,
          }))
          .filter(Boolean)
          .map((tag) => [tag.toLowerCase(), tag])
      ).values()
    )

    const [viewer, member] = await Promise.all([
      prisma.pmacMember.findUnique({
        where: { id: executiveMemberId },
        select: {
          id: true,
          fullName: true,
          executiveTitle: true,
        },
      }),
      prisma.pmacMember.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          fullName: true,
          clubRole: true,
          status: true,
          account: {
            select: {
              isActive: true,
            },
          },
        },
      }),
    ])

    if (!viewer?.executiveTitle) {
      return { success: false, error: 'This executive account is missing a branch head title.' }
    }

    if (!member) {
      return { success: false, error: 'PMAC member not found.' }
    }

    if (member.clubRole !== 'MEMBER' || member.status !== 'ACTIVE' || !member.account?.isActive) {
      return { success: false, error: 'Executive tags can only be assigned to active PMAC members.' }
    }

    const existing = await prisma.pmacMemberTag.findMany({
      where: {
        memberId,
        assignedByMemberId: executiveMemberId,
      },
      select: {
        id: true,
        label: true,
      },
    })

    const nextTagSet = new Set(normalizedTags.map((tag) => tag.toLowerCase()))

    await prisma.$transaction(async (tx) => {
      const removeIds = existing
        .filter((tag) => !nextTagSet.has(tag.label.toLowerCase()))
        .map((tag) => tag.id)

      if (removeIds.length) {
        await tx.pmacMemberTag.deleteMany({
          where: {
            id: {
              in: removeIds,
            },
          },
        })
      }

      for (const label of normalizedTags) {
        await tx.pmacMemberTag.upsert({
          where: {
            memberId_assignedByMemberId_label: {
              memberId,
              assignedByMemberId: executiveMemberId,
              label,
            },
          },
          update: {},
          create: {
            memberId,
            assignedByMemberId: executiveMemberId,
            label,
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'MEMBER',
        entityId: member.id,
        memberId: member.id,
        ...getActivityActor(session.user),
        action: 'MEMBER_TAGS_UPDATED',
        summary: `Updated ${formatExecutiveTitle(viewer.executiveTitle) || 'executive'} tags for ${member.fullName}.`,
        details: normalizedTags.length
          ? `Current tags: ${normalizedTags.join(', ')}.`
          : 'All tags from this branch head were cleared.',
      })
    })

    revalidatePmacViews(['/pmac/tags', '/pmac/executive', '/pmac/member', '/pmac/members'])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update executive tags.' }
  }
}

export async function getPmacAttendanceBoard() {
  noStore()

  const session = await getViewerSession()
  if (!session) {
    return []
  }

  if (!isCoordinatorRole(session.user.role) && !isPmacAttendanceManagerRole(session.user.role)) {
    return []
  }

  return prisma.pmacEvent.findMany({
    where: {
      status: {
        in: ['APPROVED', 'COMPLETED'],
      },
    },
    include: {
      attendance: {
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              clubRole: true,
              email: true,
            },
          },
          recordedBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          member: {
            fullName: 'asc',
          },
        },
      },
      assignments: {
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              clubRole: true,
              email: true,
            },
          },
        },
        orderBy: {
          member: {
            fullName: 'asc',
          },
        },
      },
    },
    orderBy: {
      startDateTime: 'asc',
    },
  })
}

export async function savePmacAssignments(eventId: string, assignments: PmacAssignmentInput[]) {
  try {
    const session = await assertPmacActionSession(['PMAC_DIRECTOR', 'PMAC_ASSISTANT_DIRECTOR', 'PMAC_SECRETARY'])
    const sanitizedId = sanitizeSingleLineText(eventId, {
      fieldName: 'Event ID',
      maxLength: 191,
      required: true,
    })

    const event = await prisma.pmacEvent.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        title: true,
        status: true,
        startDateTime: true,
        endDateTime: true,
        sourceDocumentationType: true,
      },
    })

    if (!event) {
      return { success: false, error: 'PMAC event not found.' }
    }

    if (event.status !== 'APPROVED' && event.status !== 'COMPLETED') {
      return { success: false, error: 'Assignments can only be managed for approved or completed PMAC events.' }
    }

    const normalizedAssignments = assignments.map((assignment) => {
      const memberId = sanitizeSingleLineText(assignment.memberId, {
        fieldName: 'Member ID',
        maxLength: 191,
        required: true,
      })
      if (!PMAC_EVENT_DUTY_ROLES.includes(assignment.assignmentRole)) {
        throw new Error('Please choose a valid PMAC assignment role.')
      }
      const assignmentNotes = sanitizeMultilineText(assignment.assignmentNotes, {
        fieldName: 'Assignment notes',
        maxLength: 2000,
      })

      return {
        memberId,
        assignmentRole: assignment.assignmentRole,
        assignmentNotes: assignmentNotes || null,
      }
    })

    const assignmentKeys = normalizedAssignments.map(assignment => `${assignment.memberId}:${assignment.assignmentRole}`)
    if (new Set(assignmentKeys).size !== assignmentKeys.length) {
      return { success: false, error: 'Each PMAC member-duty combination can only be assigned once per event.' }
    }

    const memberIds = Array.from(new Set(normalizedAssignments.map(assignment => assignment.memberId)))
    const activeMembers = await prisma.pmacMember.findMany({
      where: {
        id: {
          in: memberIds,
        },
        status: 'ACTIVE',
        account: {
          is: {
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        fullName: true,
        specialties: {
          select: {
            specialty: true,
          },
        },
      },
    })

    if (activeMembers.length !== memberIds.length) {
      return { success: false, error: 'All assigned PMAC members must be active.' }
    }

    const activeMemberById = new Map(activeMembers.map(member => [member.id, member]))
    for (const assignment of normalizedAssignments) {
      const member = activeMemberById.get(assignment.memberId)
      const allowedRoles = getDutyRolesForSpecialties(member?.specialties.map(entry => entry.specialty) ?? [])

      if (!allowedRoles.includes(assignment.assignmentRole)) {
        return {
          success: false,
          error: `${member?.fullName || 'Selected member'} can only be assigned duties linked to their PMAC specialty.`,
        }
      }
    }

    const existingAssignments = await prisma.pmacEventAssignment.findMany({
      where: {
        eventId: sanitizedId,
      },
      select: {
        id: true,
        memberId: true,
        assignmentRole: true,
        member: {
          select: {
            fullName: true,
          },
        },
      },
    })

    const existingByKey = new Map(
      existingAssignments.map(assignment => [
        `${assignment.memberId}:${assignment.assignmentRole}`,
        assignment,
      ])
    )
    const nextKeys = new Set(normalizedAssignments.map(assignment => `${assignment.memberId}:${assignment.assignmentRole}`))
    const overlappingAssignments = memberIds.length
      ? await prisma.pmacEventAssignment.findMany({
          where: {
            memberId: {
              in: memberIds,
            },
            eventId: {
              not: sanitizedId,
            },
            event: {
              status: {
                in: ['APPROVED', 'COMPLETED'],
              },
              startDateTime: {
                lt: event.endDateTime,
              },
              endDateTime: {
                gt: event.startDateTime,
              },
            },
          },
          select: {
            memberId: true,
            event: {
              select: {
                id: true,
                title: true,
                startDateTime: true,
                endDateTime: true,
              },
            },
          },
        })
      : []

    if (overlappingAssignments.length) {
      const memberNames = new Map(activeMembers.map((member) => [member.id, member.fullName]))
      const conflictMessages = overlappingAssignments.map((assignment) => (
        `${memberNames.get(assignment.memberId) || 'A PMAC member'} is already assigned to "${assignment.event.title}" during the same time window.`
      ))

      return {
        success: false,
        error: conflictMessages.join(' '),
      }
    }

    const warnings: string[] = []
    const assignedRoleSet = new Set(normalizedAssignments.map((assignment) => assignment.assignmentRole))
    const missingRoles = event.sourceDocumentationType
      ? getRecommendedAssignmentRoles(event.sourceDocumentationType).filter((role) => !assignedRoleSet.has(role))
      : []
    if (missingRoles.length) {
      warnings.push(`Recommended coverage roles still missing: ${missingRoles.join(', ')}.`)
    }

    const rolesPerMember = normalizedAssignments.reduce<Map<string, number>>((totals, assignment) => {
      totals.set(assignment.memberId, (totals.get(assignment.memberId) ?? 0) + 1)
      return totals
    }, new Map())

    const multiplyAssignedMembers = Array.from(rolesPerMember.entries()).filter(([, count]) => count > 1)
    if (multiplyAssignedMembers.length && activeMembers.length > rolesPerMember.size) {
      const memberNames = new Map(activeMembers.map((member) => [member.id, member.fullName]))
      warnings.push(`Workload is concentrated on ${multiplyAssignedMembers.map(([memberId]) => memberNames.get(memberId) || 'one member').join(', ')} while other active members remain unassigned.`)
    }

    const weekAfterEvent = new Date(event.startDateTime.getTime() + (1000 * 60 * 60 * 24 * 7))
    const surroundingAssignments = memberIds.length
      ? await prisma.pmacEventAssignment.findMany({
          where: {
            memberId: {
              in: memberIds,
            },
            eventId: {
              not: sanitizedId,
            },
            event: {
              startDateTime: {
                gte: event.startDateTime,
                lte: weekAfterEvent,
              },
              status: {
                in: ['APPROVED', 'COMPLETED'],
              },
            },
          },
          select: {
            memberId: true,
          },
        })
      : []

    const surroundingAssignmentCounts = surroundingAssignments.reduce<Map<string, number>>((totals, assignment) => {
      totals.set(assignment.memberId, (totals.get(assignment.memberId) ?? 0) + 1)
      return totals
    }, new Map())

    const highLoadMembers = activeMembers.filter((member) => (
      (surroundingAssignmentCounts.get(member.id) ?? 0) + (rolesPerMember.get(member.id) ?? 0) >= 4
    ))

    if (highLoadMembers.length) {
      warnings.push(`High upcoming workload detected for ${highLoadMembers.map((member) => member.fullName).join(', ')} within seven days of "${event.title}".`)
    }

    await prisma.$transaction(async (tx) => {
      const deletions = existingAssignments
        .filter(assignment => !nextKeys.has(`${assignment.memberId}:${assignment.assignmentRole}`))
        .map(assignment => assignment.id)

      if (deletions.length) {
        await tx.pmacEventAssignment.deleteMany({
          where: {
            id: {
              in: deletions,
            },
          },
        })
      }

      for (const assignment of normalizedAssignments) {
        const key = `${assignment.memberId}:${assignment.assignmentRole}`
        const existingAssignment = existingByKey.get(key)

        if (existingAssignment) {
          await tx.pmacEventAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              assignmentNotes: assignment.assignmentNotes,
              assignedById: session.user.id,
            },
          })
          continue
        }

        await tx.pmacEventAssignment.create({
          data: {
            eventId: sanitizedId,
            memberId: assignment.memberId,
            assignmentRole: assignment.assignmentRole,
            assignmentNotes: assignment.assignmentNotes,
            assignedById: session.user.id,
          },
        })
      }

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: sanitizedId,
        eventId: sanitizedId,
        ...getActivityActor(session.user),
        action: 'ASSIGNMENTS_UPDATED',
        summary: `Updated PMAC staffing assignments for ${normalizedAssignments.length} duty slot(s).`,
        changes: {
          team: {
            before: existingAssignments.map((assignment) => `${assignment.member.fullName} - ${assignment.assignmentRole}`),
            after: normalizedAssignments.map((assignment) => `${activeMemberById.get(assignment.memberId)?.fullName ?? 'PMAC member'} - ${assignment.assignmentRole}`),
          },
        },
      })
    })

    revalidatePmacViews([`/pmac/events/${sanitizedId}`])
    return { success: true, warnings }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save PMAC assignments.' }
  }
}

export async function respondToPmacAssignment(assignmentId: string, response: 'YES' | 'NO') {
  try {
    const session = await assertPmacActionSession(['PMAC_EXECUTIVE', 'PMAC_MEMBER'])
    const sanitizedId = sanitizeSingleLineText(assignmentId, {
      fieldName: 'Assignment ID',
      maxLength: 191,
      required: true,
    })

    const assignment = await prisma.pmacEventAssignment.findUnique({
      where: { id: sanitizedId },
      include: {
        event: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    })

    if (!assignment || assignment.memberId !== session.user.pmacMemberId) {
      return { success: false, error: 'Assignment not found.' }
    }

    if (assignment.event.status !== 'APPROVED' && assignment.event.status !== 'COMPLETED') {
      return { success: false, error: 'Availability can only be updated after the PMAC event is approved.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pmacEventAssignment.update({
        where: { id: sanitizedId },
        data: {
          availabilityResponse: response,
          respondedAt: new Date(),
        },
      })

      await recordPmacActivity(tx, {
        entityType: 'EVENT',
        entityId: assignment.event.id,
        eventId: assignment.event.id,
        memberId: assignment.memberId,
        ...getActivityActor(session.user),
        action: 'ASSIGNMENT_RESPONSE_UPDATED',
        summary: `Updated assignment availability to ${response}.`,
      })
    })

    revalidatePmacViews([`/pmac/events/${assignment.event.id}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update availability response.' }
  }
}

export async function savePmacAttendance(records: PmacAttendanceInput[]) {
  try {
    const session = await assertPmacActionSession(['PMAC_SECRETARY'])

    const normalizedRecords = records.map((record) => {
      const eventId = sanitizeSingleLineText(record.eventId, {
        fieldName: 'Event ID',
        maxLength: 191,
        required: true,
      })
      const memberId = sanitizeSingleLineText(record.memberId, {
        fieldName: 'Member ID',
        maxLength: 191,
        required: true,
      })
      if (!PMAC_ATTENDANCE_STATUSES.includes(record.status)) {
        throw new Error('Please choose a valid attendance status.')
      }
      const notes = sanitizeMultilineText(record.notes, {
        fieldName: 'Attendance notes',
        maxLength: 2000,
      })

      return {
        eventId,
        memberId,
        status: record.status,
        notes: notes || null,
      }
    })

    const eventIds = Array.from(new Set(normalizedRecords.map(record => record.eventId)))
    const events = await prisma.pmacEvent.findMany({
      where: {
        id: {
          in: eventIds,
        },
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (events.length !== eventIds.length || events.some(event => event.status !== 'APPROVED' && event.status !== 'COMPLETED')) {
      return { success: false, error: 'Attendance can only be recorded for approved or completed PMAC events.' }
    }

    await prisma.$transaction(async (tx) => {
      for (const record of normalizedRecords) {
        await tx.pmacAttendance.upsert({
          where: {
            eventId_memberId: {
              eventId: record.eventId,
              memberId: record.memberId,
            },
          },
          update: {
            status: record.status,
            notes: record.notes,
            recordedById: session.user.id,
            recordedAt: new Date(),
          },
          create: {
            eventId: record.eventId,
            memberId: record.memberId,
            status: record.status,
            notes: record.notes,
            recordedById: session.user.id,
            recordedAt: new Date(),
          },
        })
      }

      for (const eventId of eventIds) {
        await recordPmacActivity(tx, {
          entityType: 'EVENT',
          entityId: eventId,
          eventId,
          ...getActivityActor(session.user),
          action: 'ATTENDANCE_UPDATED',
          summary: 'Updated PMAC attendance records.',
        })
      }
    })

    revalidatePmacViews(eventIds.map(eventId => `/pmac/events/${eventId}`))
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save attendance.' }
  }
}
