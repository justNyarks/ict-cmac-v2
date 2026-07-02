import { Prisma, PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const REQUIRED_V4_DELEGATES = ['pmacActivityLog', 'pmacAttachment'] as const
const USER_SECURITY_FIELDS = ['mustChangePassword', 'passwordUpdatedAt'] as const

function hasRequiredDelegates(client: PrismaClient | undefined) {
  if (!client) {
    return false
  }

  return REQUIRED_V4_DELEGATES.every((delegate) => {
    const candidate = (client as unknown as Record<string, unknown>)[delegate] as { findMany?: unknown } | undefined
    return typeof candidate?.findMany === 'function'
  })
}

function createPrismaClient() {
  return new PrismaClient()
}

function hasModelFields(modelName: string, fields: readonly string[]) {
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === modelName)

  if (!model) {
    return false
  }

  const modelFields = new Set(model.fields.map((field) => field.name))
  return fields.every((field) => modelFields.has(field))
}

export const prisma = hasRequiredDelegates(globalForPrisma.prisma)
  ? globalForPrisma.prisma!
  : createPrismaClient()

export function hasPmacV4Delegates() {
  return hasRequiredDelegates(prisma)
}

export function hasUserSecurityFields() {
  return hasModelFields('User', USER_SECURITY_FIELDS)
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
