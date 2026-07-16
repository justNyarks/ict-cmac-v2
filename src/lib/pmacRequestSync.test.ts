import { describe, expect, it, vi } from 'vitest'

import { buildPmacEventScheduleFromRequest, shouldMirrorRequestToPmacEvent, syncPmacEventFromServiceRequest } from './pmacRequestSync'

describe('pmacRequestSync', () => {
  it('mirrors only approved PMAC requests that are not deleted', () => {
    expect(shouldMirrorRequestToPmacEvent({
      serviceType: 'PMAC',
      status: 'DIRECTOR_APPROVED',
      deletedAt: null,
    })).toBe(true)

    expect(shouldMirrorRequestToPmacEvent({
      serviceType: 'CMAC',
      status: 'DIRECTOR_APPROVED',
      deletedAt: null,
    })).toBe(false)

    expect(shouldMirrorRequestToPmacEvent({
      serviceType: 'PMAC',
      status: 'REJECTED',
      deletedAt: null,
    })).toBe(false)
  })

  it('builds PMAC event date-times from the request schedule', () => {
    const schedule = buildPmacEventScheduleFromRequest({
      eventDate: new Date('2026-07-10T00:00:00'),
      endDate: new Date('2026-07-11T00:00:00'),
      startTime: '09:15',
      endTime: '14:45',
    })

    expect(schedule.startDateTime.getHours()).toBe(9)
    expect(schedule.startDateTime.getMinutes()).toBe(15)
    expect(schedule.endDateTime.getDate()).toBe(11)
    expect(schedule.endDateTime.getHours()).toBe(14)
    expect(schedule.endDateTime.getMinutes()).toBe(45)
  })

  it('falls back to a safe minimum duration when request times are incomplete', () => {
    const schedule = buildPmacEventScheduleFromRequest({
      eventDate: new Date('2026-07-10T00:00:00'),
      endDate: null,
      startTime: '17:00',
      endTime: '08:00',
    })

    expect(schedule.endDateTime.getTime()).toBeGreaterThan(schedule.startDateTime.getTime())
  })

  it('updates imported events found by source request id', async () => {
    const update = vi.fn()
    const tx = {
      pmacEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'existing-pmac-event',
          status: 'APPROVED',
          title: 'Old PMAC Coverage',
          startDateTime: new Date('2026-07-12T08:00:00'),
          endDateTime: new Date('2026-07-12T10:00:00'),
          venue: 'Old Auditorium',
        }),
        update,
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    }

    await syncPmacEventFromServiceRequest(tx as never, {
      id: 'service-request-1',
      createdAt: new Date('2026-07-01T08:00:00'),
      eventTitle: 'Current PMAC Coverage',
      eventDate: new Date('2026-07-12T00:00:00'),
      endDate: null,
      startTime: '09:00',
      endTime: '11:00',
      eventVenue: 'Auditorium',
      school: 'SITE',
      serviceType: 'PMAC',
      documentationType: 'PHOTO',
      campusType: 'IN_CAMPUS',
      letterContent: 'Raw formal request letter should stay out of the PMAC operations brief.',
      eventDetails: 'Use the latest approved request data.',
      status: 'DIRECTOR_APPROVED',
      deletedAt: null,
      secretaryId: 'secretary-1',
      coordinatorApprovedAt: new Date('2026-07-01T09:00:00'),
      directorId: 'director-1',
      directorApprovedAt: new Date('2026-07-01T10:00:00'),
      directorNote: 'Approved.',
      coordinatorNote: null,
    })

    expect(tx.pmacEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { id: 'service-request-1' },
          { sourceRequestId: 'service-request-1' },
        ],
      },
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'existing-pmac-event' },
      data: expect.objectContaining({
        title: 'Current PMAC Coverage',
        createdById: 'secretary-1',
        sourceRequestId: 'service-request-1',
      }),
    }))
    expect(update.mock.calls[0][0].data.description).toContain('Approved CMAC request routed to PMAC')
    expect(update.mock.calls[0][0].data.description).toContain('Request Notes: Use the latest approved request data.')
    expect(update.mock.calls[0][0].data.description).not.toContain('Raw formal request letter')
    expect(tx.pmacEvent.create).not.toHaveBeenCalled()
  })

  it('closes but retains an imported PMAC event when its CMAC request is cancelled', async () => {
    const update = vi.fn()
    const tx = {
      pmacEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'pmac-event-1',
          title: 'Cancelled Coverage',
          status: 'APPROVED',
        }),
        update,
      },
    }

    const retained = await syncPmacEventFromServiceRequest(tx as never, {
      id: 'service-request-2',
      createdAt: new Date('2026-07-01T08:00:00'),
      eventTitle: 'Cancelled Coverage',
      eventDate: new Date('2026-07-20T00:00:00'),
      endDate: null,
      startTime: '09:00',
      endTime: '11:00',
      eventVenue: 'MM Hall',
      school: 'SITE',
      serviceType: 'PMAC',
      documentationType: 'PHOTO',
      campusType: 'IN_CAMPUS',
      letterContent: null,
      eventDetails: null,
      status: 'CANCELLED',
      deletedAt: null,
      secretaryId: 'secretary-1',
      coordinatorApprovedAt: new Date('2026-07-01T09:00:00'),
      directorId: 'director-1',
      directorApprovedAt: new Date('2026-07-01T10:00:00'),
      directorNote: 'Cancelled.',
      coordinatorNote: null,
    })

    expect(retained).toBe(true)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pmac-event-1' },
      data: expect.objectContaining({
        status: 'REJECTED',
        sourceLabel: 'Retained from a closed CMAC request',
      }),
    }))
  })
})
