import { Prisma, PrismaClient } from '@prisma/client'
import { assertPreviewDatabaseIsolation } from '@/lib/deploymentPolicy'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaSignature: string | undefined
}

const REQUIRED_DELEGATES = ['pmacActivityLog', 'pmacAttachment', 'pmacAttachmentContent', 'pmacProject', 'pmacProjectMilestone', 'pmacProjectLink', 'pmacProjectAssignment'] as const
const USER_SECURITY_FIELDS = ['mustChangePassword', 'passwordUpdatedAt'] as const
const REQUIRED_MODEL_FIELDS = {
  PmacMember: ['clubRole', 'status', 'executiveTitle', 'department', 'course', 'specialties'],
  PmacMemberSpecialty: ['memberId', 'specialty'],
  PmacProject: ['branch', 'status', 'startDate', 'targetDate', 'outputSummary', 'outputSubmittedAt', 'headMemberId', 'milestones', 'links', 'memberAssignments', 'activityLogs'],
  PmacProjectAssignment: ['projectId', 'memberId', 'assignedById'],
  PmacProjectMilestone: ['projectId', 'dueDate', 'status'],
  PmacProjectLink: ['projectId', 'type', 'label', 'url', 'addedById'],
  PmacActivityLog: ['projectId'],
  User: USER_SECURITY_FIELDS,
  PmacAttachmentContent: ['attachmentId', 'data'],
} as const

function hasRequiredDelegates(client: PrismaClient | undefined) {
  if (!client) {
    return false
  }

  return REQUIRED_DELEGATES.every((delegate) => {
    const candidate = (client as unknown as Record<string, unknown>)[delegate] as { findMany?: unknown } | undefined
    return typeof candidate?.findMany === 'function'
  })
}

function createPrismaClient() {
  if (!Object.entries(REQUIRED_MODEL_FIELDS).every(([model, fields]) => hasModelFields(model, fields))) {
    throw new Error('Generated Prisma client is outdated. Run prisma generate and apply the reviewed database migrations.')
  }
  const client = new PrismaClient()
  // Check on every query, not at build/import time. Read actions can reconcile
  // statuses, so blocking only explicit writes would not isolate previews.
  client.$use(async (params, next) => {
    assertPreviewDatabaseIsolation()
    return next(params)
  })
  return client
}

function hasModelFields(modelName: string, fields: readonly string[]) {
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === modelName)

  if (!model) {
    return false
  }

  const modelFields = new Set(model.fields.map((field) => field.name))
  return fields.every((field) => modelFields.has(field))
}

function buildSchemaSignature() {
  return Object.entries(REQUIRED_MODEL_FIELDS)
    .map(([modelName, fields]) => `${modelName}:${fields.filter((field) => hasModelFields(modelName, [field])).join(',')}`)
    .join('|')
}

const PRISMA_SCHEMA_SIGNATURE = buildSchemaSignature()

export const prisma = hasRequiredDelegates(globalForPrisma.prisma)
  && globalForPrisma.prismaSchemaSignature === PRISMA_SCHEMA_SIGNATURE
  ? globalForPrisma.prisma!
  : createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaSchemaSignature = PRISMA_SCHEMA_SIGNATURE
}
