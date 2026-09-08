export function assertPreviewDatabaseIsolation(environment: {
  VERCEL_ENV?: string
  PREVIEW_DATABASE_ISOLATED?: string
} = { VERCEL_ENV: process.env.VERCEL_ENV, PREVIEW_DATABASE_ISOLATED: process.env.PREVIEW_DATABASE_ISOLATED }) {
  if (environment.VERCEL_ENV === 'preview' && environment.PREVIEW_DATABASE_ISOLATED !== 'true') {
    throw new Error('Preview database access is disabled. Configure a separate Preview database, then set PREVIEW_DATABASE_ISOLATED=true for Preview only.')
  }
}
