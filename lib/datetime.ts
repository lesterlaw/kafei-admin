const SINGAPORE_TIME_ZONE = 'Asia/Singapore'

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function formatSingaporeDateTime(
  value: string | Date | null | undefined
): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleString('en-SG', {
    timeZone: SINGAPORE_TIME_ZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatSingaporeDate(
  value: string | Date | null | undefined
): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-SG', {
    timeZone: SINGAPORE_TIME_ZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

const DATETIME_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/

/**
 * Value from an <input type="datetime-local"> is Singapore wall-clock time with no offset.
 * Parse it as Singapore time, whatever timezone the server runs in.
 */
export function parseSingaporeDateTimeLocal(value: string): Date | null {
  const match = value.trim().match(DATETIME_LOCAL)
  const date = match
    ? new Date(`${match[1]}T${match[2]}${match[3] ?? ':00'}+08:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** ISO timestamp to the YYYY-MM-DDTHH:mm a datetime-local input expects, in Singapore time. */
export function toSingaporeDateTimeLocal(value?: string | null): string {
  const date = toDate(value)
  if (!date) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SINGAPORE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

/**
 * Prepare one value for a CSV export: timestamps in Singapore time (matching the screen),
 * and text that a spreadsheet would run as a formula is neutralised.
 */
export function toCsvCell(value: unknown): unknown {
  if (value instanceof Date) return formatSingaporeDateTime(value)
  if (typeof value !== 'string') return value
  if (ISO_TIMESTAMP.test(value)) return formatSingaporeDateTime(value)
  if (/^[=+\-@\t\r]/.test(value) && Number.isNaN(Number(value))) return `'${value}`
  return value
}
