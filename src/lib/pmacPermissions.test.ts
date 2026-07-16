import { describe, expect, it } from 'vitest'

import {
  PMAC_EXECUTIVE_BRANCH_SPECIALTY,
  PMAC_EXECUTIVE_TITLE_LABELS,
  PMAC_EXECUTIVE_TITLES,
  isPmacAssignmentResponderRole,
  isPmacAttendanceManagerRole,
  isPmacCreatorRole,
  isPmacEventManagerRole,
  isPmacPollManagerRole,
  isPmacPollMonitorRole,
  isPmacPollVoterRole,
  isPmacProjectLauncherRole,
  isPmacStaffingManagerRole,
} from './pmac'

describe('PMAC role permissions', () => {
  it('treats the public relations officer as an executive-level PMAC title', () => {
    expect(PMAC_EXECUTIVE_TITLES).toContain('PUBLIC_RELATIONS_OFFICER')
    expect(PMAC_EXECUTIVE_TITLE_LABELS.PUBLIC_RELATIONS_OFFICER).toBe('Public Relations Officer (PRO)')
    expect(PMAC_EXECUTIVE_BRANCH_SPECIALTY.PUBLIC_RELATIONS_OFFICER).toBe('JOURNALISM')
    expect(isPmacAssignmentResponderRole('PMAC_EXECUTIVE')).toBe(true)
  })

  it('keeps event creation and event management with PMAC leadership', () => {
    expect(isPmacCreatorRole('PMAC_DIRECTOR')).toBe(true)
    expect(isPmacCreatorRole('PMAC_ASSISTANT_DIRECTOR')).toBe(true)
    expect(isPmacEventManagerRole('PMAC_SECRETARY')).toBe(false)
    expect(isPmacEventManagerRole('PMAC_EXECUTIVE')).toBe(false)
  })

  it('keeps staffing, attendance, and assignment responses separated', () => {
    expect(isPmacStaffingManagerRole('PMAC_SECRETARY')).toBe(true)
    expect(isPmacStaffingManagerRole('PMAC_EXECUTIVE')).toBe(false)
    expect(isPmacAttendanceManagerRole('PMAC_SECRETARY')).toBe(true)
    expect(isPmacAttendanceManagerRole('PMAC_DIRECTOR')).toBe(false)
    expect(isPmacAssignmentResponderRole('PMAC_EXECUTIVE')).toBe(true)
    expect(isPmacAssignmentResponderRole('PMAC_MEMBER')).toBe(true)
    expect(isPmacAssignmentResponderRole('CMAC_COORDINATOR')).toBe(false)
  })

  it('keeps poll management separate from voting and monitoring', () => {
    expect(isPmacPollManagerRole('CMAC_COORDINATOR')).toBe(true)
    expect(isPmacPollManagerRole('PMAC_SECRETARY')).toBe(false)
    expect(isPmacPollMonitorRole('PMAC_SECRETARY')).toBe(true)
    expect(isPmacPollVoterRole('PMAC_MEMBER')).toBe(true)
    expect(isPmacPollVoterRole('CMAC_COORDINATOR')).toBe(false)
  })

  it('allows only the configured launch roles to launch PMAC projects', () => {
    expect(isPmacProjectLauncherRole('CMAC_COORDINATOR')).toBe(true)
    expect(isPmacProjectLauncherRole('PMAC_DIRECTOR')).toBe(true)
    expect(isPmacProjectLauncherRole('PMAC_SECRETARY')).toBe(true)
    expect(isPmacProjectLauncherRole('PMAC_ASSISTANT_DIRECTOR')).toBe(false)
    expect(isPmacProjectLauncherRole('PMAC_EXECUTIVE')).toBe(false)
  })
})
