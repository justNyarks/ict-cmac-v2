import { describe, expect, it } from 'vitest'

import { getPmacMemberTransitionProblem, type PmacMemberActiveWork } from './pmacMemberTransitions'

const EMPTY_WORK: PmacMemberActiveWork = { eventDuties: [], projectAssignments: [], headedProjects: [] }

describe('PMAC member role transition safety', () => {
  it('blocks deactivation while active responsibilities remain', () => {
    expect(getPmacMemberTransitionProblem({
      currentClubRole: 'MEMBER',
      nextClubRole: 'MEMBER',
      currentExecutiveTitle: null,
      nextExecutiveTitle: null,
      nextStatus: 'INACTIVE',
      nextSpecialties: ['PHOTOGRAPHY'],
      activeWork: { ...EMPTY_WORK, eventDuties: [{ eventTitle: 'Assembly', assignmentRole: 'PHOTOGRAPHER' }] },
    })).toMatch(/reassign/i)
  })

  it('blocks executive title changes while the member heads active projects', () => {
    expect(getPmacMemberTransitionProblem({
      currentClubRole: 'EXECUTIVE',
      nextClubRole: 'EXECUTIVE',
      currentExecutiveTitle: 'HEAD_PHOTOGRAPHER',
      nextExecutiveTitle: null,
      nextStatus: 'ACTIVE',
      nextSpecialties: ['PHOTOGRAPHY'],
      activeWork: { ...EMPTY_WORK, headedProjects: [{ projectTitle: 'Yearbook', branch: 'HEAD_PHOTOGRAPHER' }] },
    })).toMatch(/project head/i)
  })

  it('blocks specialty removal when it conflicts with current work', () => {
    expect(getPmacMemberTransitionProblem({
      currentClubRole: 'MEMBER',
      nextClubRole: 'MEMBER',
      currentExecutiveTitle: null,
      nextExecutiveTitle: null,
      nextStatus: 'ACTIVE',
      nextSpecialties: ['JOURNALISM'],
      activeWork: { ...EMPTY_WORK, projectAssignments: [{ projectTitle: 'Photo Archive', branch: 'HEAD_PHOTOGRAPHER' }] },
    })).toMatch(/photography/i)
  })

  it('allows transitions that preserve all active-work requirements', () => {
    expect(getPmacMemberTransitionProblem({
      currentClubRole: 'EXECUTIVE',
      nextClubRole: 'EXECUTIVE',
      currentExecutiveTitle: 'HEAD_PHOTOGRAPHER',
      nextExecutiveTitle: 'HEAD_PHOTOGRAPHER',
      nextStatus: 'ACTIVE',
      nextSpecialties: ['PHOTOGRAPHY'],
      activeWork: EMPTY_WORK,
    })).toBeNull()
  })

  it('blocks officer demotion while active work remains assigned', () => {
    expect(getPmacMemberTransitionProblem({
      currentClubRole: 'SECRETARY',
      nextClubRole: 'MEMBER',
      currentExecutiveTitle: null,
      nextExecutiveTitle: null,
      nextStatus: 'ACTIVE',
      nextSpecialties: ['JOURNALISM'],
      activeWork: { ...EMPTY_WORK, eventDuties: [{ eventTitle: 'Assembly', assignmentRole: 'JOURNALIST' }] },
    })).toMatch(/demoting/i)
  })
})
