const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const DANGEROUS_URL_PROTOCOL_PATTERN = /^(?:javascript|data|vbscript):/i
const SPREADSHEET_FORMULA_PATTERN = /^[\s\t\r]*[=+\-@]/

type TextOptions = {
  fieldName?: string
  maxLength?: number
  required?: boolean
}

type PasswordOptions = {
  fieldName?: string
  minLength?: number
  maxLength?: number
  required?: boolean
}

function normalizeText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARACTERS_PATTERN, '')
}

function assertLength(value: string, fieldName: string, maxLength: number) {
  if (value.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`)
  }
}

export function sanitizeSingleLineText(value: string | null | undefined, options: TextOptions = {}) {
  const fieldName = options.fieldName ?? 'Value'
  const maxLength = options.maxLength ?? 191
  const normalized = normalizeText(value ?? '').replace(/\s+/g, ' ').trim()

  if (!normalized) {
    if (options.required) {
      throw new Error(`${fieldName} is required.`)
    }

    return ''
  }

  assertLength(normalized, fieldName, maxLength)
  return normalized
}

export function sanitizeMultilineText(value: string | null | undefined, options: TextOptions = {}) {
  const fieldName = options.fieldName ?? 'Value'
  const maxLength = options.maxLength ?? 10000
  const normalized = normalizeText(value ?? '')
    .split('\n')
    .map(line => line.replace(/[^\S\n]+/g, ' ').trimEnd())
    .join('\n')
    .trim()

  if (!normalized) {
    if (options.required) {
      throw new Error(`${fieldName} is required.`)
    }

    return ''
  }

  assertLength(normalized, fieldName, maxLength)
  return normalized
}

export function sanitizeEmailAddress(value: string | null | undefined, fieldName = 'Email') {
  const normalized = sanitizeSingleLineText(value, {
    fieldName,
    maxLength: 320,
    required: true,
  }).toLowerCase()

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(normalized)) {
    throw new Error(`Please enter a valid ${fieldName.toLowerCase()}.`)
  }

  return normalized
}

export function sanitizePasswordInput(value: string | null | undefined, options: PasswordOptions = {}) {
  const fieldName = options.fieldName ?? 'Password'
  const minLength = options.minLength ?? 1
  const maxLength = options.maxLength ?? 255
  const rawValue = value ?? ''

  if (!rawValue) {
    if (options.required) {
      throw new Error(`${fieldName} is required.`)
    }

    return ''
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(rawValue)) {
    throw new Error(`${fieldName} contains unsupported control characters.`)
  }

  if (rawValue.length < minLength) {
    throw new Error(`${fieldName} must be at least ${minLength} characters.`)
  }

  assertLength(rawValue, fieldName, maxLength)
  return rawValue
}

export function sanitizeAttachmentReference(value: string | null | undefined) {
  const normalized = sanitizeSingleLineText(value, {
    fieldName: 'Attachment reference',
    maxLength: 500,
  })

  if (!normalized) {
    return null
  }

  if (DANGEROUS_URL_PROTOCOL_PATTERN.test(normalized)) {
    throw new Error('Attachment reference uses an unsupported protocol.')
  }

  return normalized
}

export function sanitizeCsvCell(value: unknown) {
  const normalized = normalizeText(value == null ? '' : String(value))
  const safeValue = SPREADSHEET_FORMULA_PATTERN.test(normalized) ? `'${normalized}` : normalized
  return `"${safeValue.replace(/"/g, '""')}"`
}
