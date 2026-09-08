import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { assertMigrationConnections, migrationDigest, MIGRATION_MODELS } from '../../scripts/migrationData'

describe('MySQL to PostgreSQL transfer safeguards', () => {
  it('requires different database providers', () => {
    expect(() => assertMigrationConnections('mysql://test@localhost/old', 'mysql://test@localhost/new')).toThrow('destination must be PostgreSQL')
    expect(() => assertMigrationConnections('mysql://test@localhost/old', 'postgresql://test@localhost/new')).not.toThrow()
  })
  it('requires TLS for a hosted destination and hides invalid URL values', () => {
    expect(() => assertMigrationConnections('mysql://test@localhost/old', 'postgres://test@db.example/new')).toThrow('require TLS')
    expect(() => assertMigrationConnections('secret-value', 'postgres://test@localhost/new')).toThrow('connection URL is invalid')
  })
  it('preserves dates, bytes, JSON, and password hashes regardless of row/key order', () => {
    const a = { id: '1', data: Buffer.from([0, 255, 3]), date: new Date(0), password: 'hashed', json: { b: 2, a: 1 } }
    const b = { id: '2', data: null }
    expect(migrationDigest([a, b])).toBe(migrationDigest([b, { ...a, json: { a: 1, b: 2 }, data: new Uint8Array([0, 255, 3]) }]))
    expect(migrationDigest([a])).not.toBe(migrationDigest([{ ...a, password: 'changed' }]))
    expect(migrationDigest([a])).not.toBe(migrationDigest([{ ...a, data: Buffer.from([0, 254, 3]) }]))
  })
  it('copies referenced parents before dependent rows', () => {
    expect(MIGRATION_MODELS.indexOf('user')).toBeLessThan(MIGRATION_MODELS.indexOf('serviceRequest'))
    expect(MIGRATION_MODELS.indexOf('serviceRequest')).toBeLessThan(MIGRATION_MODELS.indexOf('pmacEvent'))
    expect(MIGRATION_MODELS.indexOf('pmacPoll')).toBeLessThan(MIGRATION_MODELS.indexOf('pmacVote'))
  })
  it('covers every legacy model and identifies PostgreSQL-only storage separately', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8')
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1][0].toLowerCase() + match[1].slice(1))
    expect([...MIGRATION_MODELS, 'pmacAttachmentContent'].sort()).toEqual(models.sort())
    expect(schema).toContain('provider = "postgresql"')
    expect(schema).toContain('@db.ByteA')
    expect(schema).not.toContain('@db.LongBlob')
  })
})
