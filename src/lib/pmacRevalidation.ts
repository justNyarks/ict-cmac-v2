import { revalidatePath } from 'next/cache'

const PMAC_REVALIDATE_PATHS = [
  '/coordinator/pmac',
  '/coordinator/pmac/officers',
  '/coordinator/pmac/events',
  '/coordinator/pmac/polls',
  '/coordinator/pmac/activity',
  '/coordinator/pmac/reports',
  '/pmac/director',
  '/pmac/assistant-director',
  '/pmac/secretary',
  '/pmac/executive',
  '/pmac/member',
  '/pmac/events',
  '/pmac/polls',
  '/pmac/polls/new',
  '/pmac/calendar',
  '/pmac/assignments',
  '/pmac/attendance',
  '/pmac/activity',
  '/pmac/reports',
] as const

export function revalidatePmacViews(extraPaths: string[] = []) {
  for (const path of [...PMAC_REVALIDATE_PATHS, ...extraPaths]) {
    revalidatePath(path)
  }
}
