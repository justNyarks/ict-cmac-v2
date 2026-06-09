import type { Session } from "next-auth"

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

export function validateAndNormalizeRequestInput(
  formData: RequestInput,
  user: SessionUser
): NormalizedRequestInput {
  const eventTitle = formData.eventTitle.trim()
  if (!eventTitle) {
    throw new Error("Event title is required.")
  }

  const eventVenue = formData.eventVenue.trim()
  if (!eventVenue) {
    throw new Error("Venue is required.")
  }

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
    school: formData.school,
    serviceType: formData.serviceType ?? null,
    documentationType: formData.documentationType,
    letterUrl: formData.letterUrl?.trim() || null,
    letterContent: formData.letterContent?.trim() || null,
    needsSameDayEdit: Boolean(formData.needsSameDayEdit),
    needsSameDayPhoto: Boolean(formData.needsSameDayPhoto),
    campusType: formData.campusType ?? "IN_CAMPUS",
  }
}
