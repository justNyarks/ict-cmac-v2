import type { Session } from "next-auth"

import { sanitizeAttachmentReference, sanitizeMultilineText, sanitizeSingleLineText } from "@/lib/sanitization"
import type { DocumentationType, School, ServiceType } from "@/types"

export interface RequestInput {
  eventTitle: string
  eventDate: string
  endDate?: string
  startTime?: string
  endTime?: string
  eventVenue: string
  school: School
  serviceType?: ServiceType | null
  documentationType: DocumentationType
  letterUrl?: string | null
  letterContent?: string | null
  needsSameDayEdit?: boolean
  needsSameDayPhoto?: boolean
  campusType?: "IN_CAMPUS" | "OFF_CAMPUS"
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
  letterContent: string | null
  needsSameDayEdit: boolean
  needsSameDayPhoto: boolean
  campusType: "IN_CAMPUS" | "OFF_CAMPUS"
}

type SessionUser = Session["user"]

const MIN_ADVANCE_DAYS = 3
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const SCHOOLS = ['SNAHS', 'SBAHM', 'SITE', 'SASTE', 'MEDICINE', 'BEU', 'UNIVERSITY', 'HR'] as const satisfies readonly School[]
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

export function validateAndNormalizeRequestInput(
  formData: RequestInput,
  user: SessionUser
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
  if (!isDirector) {
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
    letterContent: sanitizeMultilineText(formData.letterContent, {
      fieldName: "Request letter",
      maxLength: 10000,
    }) || null,
    needsSameDayEdit: Boolean(formData.needsSameDayEdit),
    needsSameDayPhoto: Boolean(formData.needsSameDayPhoto),
    campusType,
  }
}
