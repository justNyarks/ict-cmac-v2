import { describe, expect, it } from 'vitest'
import { assertPreviewDatabaseIsolation } from './deploymentPolicy'

describe('preview database isolation', () => {
  it('blocks all database use in an unconfigured preview', () => {
    expect(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: 'preview' })).toThrow('Preview database access is disabled')
    expect(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: 'preview', PREVIEW_DATABASE_ISOLATED: 'false' })).toThrow()
  })
  it('requires explicit configuration and leaves production/development unaffected', () => {
    expect(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: 'preview', PREVIEW_DATABASE_ISOLATED: 'true' })).not.toThrow()
    expect(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: 'production' })).not.toThrow()
    expect(() => assertPreviewDatabaseIsolation({})).not.toThrow()
  })
})
