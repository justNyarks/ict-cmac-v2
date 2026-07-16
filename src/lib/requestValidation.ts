import type { Session } from "next-auth"

import { SCHOOLS } from "@/lib/schools"
import { sanitizeAttachmentReference, sanitizeMultilineText, sanitizeSingleLineText } from "@/lib/sanitization"
import type { CampusType, DocumentationType, Role, School, ServiceType } from "@/types"

export interface RequestInput {
  eventTitle: string
  eventDate: string
  endDate?: string
  startTime?: string
  endTime?: string
  eventVenue: string
  school: School
  serviceType?: ServiceType | '' | null
  documentationType: DocumentationType
  letterUrl?: string | null
  letterAttachmentId?: string | null
  letterContent?: string | null
  needsSameDayEdit?: boolean
  needsSameDayPhoto?: boolean
  campusType?: CampusType
  directorBypassReason?: string | null
}

export interface NormalizedRequestInput {
  eventTitle: string
  eventDate: Date
  endDate: Date | null
  startTime: string | null
  endTime: string | null
  eventVenue: string
  school: School
  serviceType: ServiceType | null
  documentationType: DocumentationType
  letterUrl: string | null
  letterAttachmentId: string | null
  letterContent: string | null
  needsSameDayEdit: boolean
  needsSameDayPhoto: boolean
  campusType: CampusType
}

type SessionUser = Session["user"]
export type RequestQualityStep = 1 | 2 | 3 | 4
export type RequestSubmissionMethod = 'upload' | 'generate'
export type RequestQualityAssessment = {
  errors: string[]
  warnings: string[]
  score: number
}
export type RequestQualityInput = Pick<
  RequestInput,
  | 'eventTitle'
  | 'eventDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'eventVenue'
  | 'serviceType'
  | 'needsSameDayEdit'
  | 'directorBypassReason'
> & {
  school: School | ''
  documentationType: DocumentationType | ''
  campusType?: CampusType | ''
  letterContent?: string | null
}

const MIN_ADVANCE_DAYS = 3
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const SERVICE_TYPES = ['CMAC', 'PMAC'] as const satisfies readonly ServiceType[]
const DOCUMENTATION_TYPES = ['PHOTO', 'VIDEO', 'BOTH'] as const satisfies readonly DocumentationType[]
const CAMPUS_TYPES = ['IN_CAMPUS', 'OFF_CAMPUS'] as const

function parseDateOnly(value: string, label: string) {
  if (!value) {
    throw new Error(`${label} is required.`)
  }

  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`)
  }

  return parsed
}

function normalizeOptionalTime(value?: string) {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null
  if (!TIME_PATTERN.test(trimmed)) {
    throw new Error("Time values must use HH:mm format.")
  }

  return trimmed
}

function startOfLocalDay(date: Date) {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function differenceInDays(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000)
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function assertAllowedValue<T extends string>(
  value: string | null | undefined,
  allowedValues: readonly T[],
  fieldName: string
): T {
  const normalized = sanitizeSingleLineText(value, {
    fieldName,
    maxLength: 191,
    required: true,
  })

  if (!allowedValues.includes(normalized as T)) {
    throw new Error(`${fieldName} is invalid.`)
  }

  return normalized as T
}

export function getMinimumAdvanceRequestDate(now = new Date()) {
  const minimumDate = startOfLocalDay(now)
  minimumDate.setDate(minimumDate.getDate() + MIN_ADVANCE_DAYS)
  return formatDateInput(minimumDate)
}

export function buildRequestQualityAssessment(
  formData: RequestQualityInput,
  options: {
    role?: Role | null
    submissionMethod: RequestSubmissionMethod
    maxStep: RequestQualityStep
    now?: Date
    hasUploadedLetter?: boolean
    isEditing?: boolean
  }
): RequestQualityAssessment {
  const errors: string[] = []
  const warnings: string[] = []
  const requiredChecks: boolean[] = []
  const isDirector = options.role === 'ICT_DIRECTOR'
  const referenceDate = startOfLocalDay(options.now ?? new Date())

  if (options.maxStep >= 1) {
    requiredChecks.push(!!formData.campusType)
    if (!formData.campusType) errors.push('Location type is missing.')

    requiredChecks.push(!!formData.school)
    if (!formData.school) errors.push('School/Department is missing.')

    const eventTitle = formData.eventTitle?.trim() ?? ''
    requiredChecks.push(!!eventTitle)
    if (!eventTitle) {
      errors.push('Event title is missing.')
    } else if (eventTitle.length < 6) {
      warnings.push('Event title is very short and may need refinement.')
    }

    requiredChecks.push(!!formData.eventDate)
    if (!formData.eventDate) errors.push('Event date is missing.')

    requiredChecks.push(!!formData.endDate)
    if (!formData.endDate) errors.push('End date is missing.')

    requiredChecks.push(!!formData.startTime)
    if (!formData.startTime) errors.push('Start time is missing.')

    requiredChecks.push(!!formData.endTime)
    if (!formData.endTime) errors.push('End time is missing.')

    const venue = formData.eventVenue?.trim() ?? ''
    requiredChecks.push(!!venue)
    if (!venue) errors.push('Venue is missing.')

    if (formData.eventDate) {
      const eventDate = parseDateOnly(formData.eventDate, 'Event date')
      const leadDays = differenceInDays(referenceDate, startOfLocalDay(eventDate))
      if (leadDays < 0) {
        errors.push('Event date cannot be in the past.')
      } else if (leadDays < MIN_ADVANCE_DAYS && !isDirector && !options.isEditing) {
        errors.push('Lead time is below the 3-day requirement.')
      } else if (leadDays <= 5) {
        warnings.push('This request is close to the lead-time minimum.')
      }
    }

    if (formData.eventDate && formData.endDate && formData.endDate < formData.eventDate) {
      errors.push('End date cannot be before the start date.')
    }

    if (
      formData.eventDate
      && formData.endDate
      && formData.eventDate === formData.endDate
      && formData.startTime
      && formData.endTime
      && formData.startTime >= formData.endTime
    ) {
      errors.push('End time must be after the start time for a single-day event.')
    }

    if (formData.campusType === 'OFF_CAMPUS' && venue && venue.length < 6) {
      warnings.push('Off-campus venue details look incomplete.')
    }
  }

  if (options.maxStep >= 2) {
    requiredChecks.push(!!formData.documentationType)
    if (!formData.documentationType) errors.push('Documentation type has not been selected.')

    if (isDirector) {
      requiredChecks.push(!!formData.serviceType)
      if (!formData.serviceType) errors.push('Service type is missing.')
    }

    if (formData.documentationType === 'PHOTO' && formData.needsSameDayEdit) {
      warnings.push('Same-day edit is enabled while documentation type is Photo only.')
    }
  }

  if (options.maxStep >= 3) {
    const hasDocument = options.submissionMethod === 'generate'
      ? !!formData.letterContent?.trim()
      : !!options.hasUploadedLetter
    requiredChecks.push(hasDocument)
    if (!hasDocument) {
      errors.push(options.submissionMethod === 'generate' ? 'Generated request letter is still empty.' : 'No request file has been uploaded yet.')
    }
  }

  if (options.maxStep >= 4 && isDirector) {
    requiredChecks.push(!!formData.directorBypassReason?.trim())
    if (!formData.directorBypassReason?.trim()) {
      errors.push('Director bypass reason is missing.')
    }
  }

  const totalRequired = requiredChecks.length
  const completedRequired = requiredChecks.filter(Boolean).length
  const baseScore = totalRequired ? Math.round((completedRequired / totalRequired) * 100) : 100
  const warningPenalty = Math.min(warnings.length * 6, 18)
  const errorPenalty = errors.length ? 8 : 0

  return {
    errors,
    warnings,
    score: Math.max(0, baseScore - warningPenalty - errorPenalty),
  }
}

export function getRequestBlockingError(
  formData: RequestQualityInput,
  options: {
    role?: Role | null
    submissionMethod: RequestSubmissionMethod
    maxStep: RequestQualityStep
    now?: Date
    hasUploadedLetter?: boolean
    isEditing?: boolean
  }
) {
  return buildRequestQualityAssessment(formData, options).errors[0] ?? ''
}

export function validateAndNormalizeRequestInput(
  formData: RequestInput,
  user: SessionUser,
  options: { isEditing?: boolean } = {}
): NormalizedRequestInput {
  const eventTitle = sanitizeSingleLineText(formData.eventTitle, {
    fieldName: "Event title",
    maxLength: 191,
    required: true,
  })

  const eventVenue = sanitizeSingleLineText(formData.eventVenue, {
    fieldName: "Venue",
    maxLength: 191,
    required: true,
  })
  const school = assertAllowedValue(formData.school, SCHOOLS, 'School / Department')
  const documentationType = assertAllowedValue(formData.documentationType, DOCUMENTATION_TYPES, 'Documentation type')
  const campusType = assertAllowedValue(formData.campusType, CAMPUS_TYPES, 'Campus type')
  const serviceType = formData.serviceType == null || formData.serviceType === ''
    ? null
    : assertAllowedValue(formData.serviceType, SERVICE_TYPES, 'Service type')

  const eventDate = parseDateOnly(formData.eventDate, "Start date")
  const endDate = formData.endDate?.trim()
    ? parseDateOnly(formData.endDate, "End date")
    : null

  if (endDate && endDate < eventDate) {
    throw new Error("End date cannot be earlier than the start date.")
  }

  const startTime = normalizeOptionalTime(formData.startTime)
  const endTime = normalizeOptionalTime(formData.endTime)

  if ((startTime && !endTime) || (!startTime && endTime)) {
    throw new Error("Both start and end time are required when scheduling a timed event.")
  }

  const effectiveEndDate = endDate ?? eventDate
  if (
    startTime &&
    endTime &&
    eventDate.getTime() === effectiveEndDate.getTime() &&
    startTime >= endTime
  ) {
    throw new Error("End time must be after the start time for single-day events.")
  }

  const isDirector = user.role === "ICT_DIRECTOR"
  if (!isDirector && !options.isEditing) {
    const today = startOfLocalDay(new Date())
    const advanceDays = differenceInDays(today, startOfLocalDay(eventDate))

    if (advanceDays < 0) {
      throw new Error("Event date cannot be in the past.")
    }

    if (advanceDays < MIN_ADVANCE_DAYS) {
      throw new Error("Service requests must be submitted at least 3 days in advance.")
    }
  }

  if (isDirector && !formData.serviceType) {
    throw new Error("Directly approved events must have a service type.")
  }

  return {
    eventTitle,
    eventDate,
    endDate,
    startTime,
    endTime,
    eventVenue,
    school,
    serviceType,
    documentationType,
    letterUrl: sanitizeAttachmentReference(formData.letterUrl),
    letterAttachmentId: sanitizeSingleLineText(formData.letterAttachmentId, {
      fieldName: 'Request letter attachment ID',
      maxLength: 191,
    }) || null,
    letterContent: sanitizeMultilineText(formData.letterContent, {
      fieldName: "Request letter",
      maxLength: 10000,
    }) || null,
    needsSameDayEdit: Boolean(formData.needsSameDayEdit),
    needsSameDayPhoto: Boolean(formData.needsSameDayPhoto),
    campusType,
  }
}
