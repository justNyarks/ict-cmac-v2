import { describe, expect, it } from 'vitest'

import {
  filterPmacActivity,
  filterPmacEvents,
  filterPmacMembers,
  filterPmacPolls,
} from './pmacFilters'

describe('pmacFilters', () => {
  it('filters members by query, status, and club role', () => {
    const members = [
      { fullName: 'Paula Ramos', email: 'paula@example.com', department: 'SASTE', course: 'Communication', courseOrDepartment: 'Leadership', notes: 'Director', status: 'ACTIVE', clubRole: 'DIRECTOR' },
      { fullName: 'John Villanueva', email: 'john@example.com', department: 'SITE', course: 'BSIT', courseOrDepartment: 'General Membership', notes: '', status: 'INACTIVE', clubRole: 'MEMBER' },
    ]

    expect(filterPmacMembers(members, 'paula', 'ACTIVE', 'DIRECTOR')).toHaveLength(1)
    expect(filterPmacMembers(members, 'membership', 'ALL', 'MEMBER')).toHaveLength(1)
    expect(filterPmacMembers(members, 'bsit', 'ALL', 'ALL')).toHaveLength(1)
    expect(filterPmacMembers(members, 'missing', 'ALL', 'ALL')).toHaveLength(0)
  })

  it('filters events by query and status', () => {
    const events = [
      { title: 'Workshop', venue: 'Media Lab', description: 'Camera practice', status: 'APPROVED' },
      { title: 'Orientation', venue: 'Auditorium', description: 'Freshmen coverage', status: 'PENDING_APPROVAL' },
    ]

    expect(filterPmacEvents(events, 'media', 'APPROVED')).toHaveLength(1)
    expect(filterPmacEvents(events, '', 'PENDING_APPROVAL')).toHaveLength(1)
    expect(filterPmacEvents(events, 'camera', 'PENDING_APPROVAL')).toHaveLength(0)
  })

  it('filters polls by query, status, and type', () => {
    const polls = [
      { title: 'Uniform Update', description: 'Approve new uniform', status: 'OPEN', type: 'GENERAL' },
      { title: 'Meeting Slot', description: 'Pick a weekly schedule', status: 'CLOSED', type: 'SCHEDULE_PREFERENCE' },
    ]

    expect(filterPmacPolls(polls, 'uniform', 'OPEN', 'GENERAL')).toHaveLength(1)
    expect(filterPmacPolls(polls, 'weekly', 'CLOSED', 'SCHEDULE_PREFERENCE')).toHaveLength(1)
    expect(filterPmacPolls(polls, '', 'OPEN', 'SCHEDULE_PREFERENCE')).toHaveLength(0)
  })

  it('filters activity by query and entity type', () => {
    const entries = [
      { summary: 'Approved a PMAC event', details: 'Coordinator review complete', actorName: 'Liza', action: 'EVENT_APPROVED', entityType: 'EVENT' },
      { summary: 'Uploaded budget draft', details: 'Poll reference attachment', actorName: 'Miguel', action: 'ATTACHMENT_UPLOADED', entityType: 'ATTACHMENT' },
    ]

    expect(filterPmacActivity(entries, 'budget', 'ATTACHMENT')).toHaveLength(1)
    expect(filterPmacActivity(entries, 'liza', 'EVENT')).toHaveLength(1)
    expect(filterPmacActivity(entries, 'review', 'POLL')).toHaveLength(0)
  })
})
