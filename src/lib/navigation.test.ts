import { describe, expect, it } from 'vitest'
import { canAccessProjects, getActiveNavigationHref, getNavigationItems } from './navigation'

describe('shared navigation', () => {
  it('exposes projects to assigned members, matching page access', () => {
    expect(canAccessProjects('PMAC_MEMBER')).toBe(true)
    expect(getNavigationItems('PMAC_MEMBER').some(item => item.href === '/pmac/projects')).toBe(true)
    expect(canAccessProjects('PMAC_ASSISTANT_DIRECTOR')).toBe(false)
  })
  it('gives coordinators the canonical poll workspace without duplicate entries', () => {
    const items = getNavigationItems('CMAC_COORDINATOR')
    expect(items.filter(item => item.icon === 'polls').map(item => item.href)).toEqual(['/pmac/polls'])
    expect(new Set(items.map(item => item.href)).size).toBe(items.length)
  })
  it('highlights only the most specific route using segment boundaries', () => {
    const items = getNavigationItems('CMAC_COORDINATOR')
    expect(getActiveNavigationHref('/coordinator/pmac/events', items)).toBe('/coordinator/pmac/events')
    expect(getActiveNavigationHref('/coordinator/pmac/officers', items)).toBe('/coordinator/pmac/officers')
    expect(getActiveNavigationHref('/pmac/projects-other', items)).toBeUndefined()
  })
})
