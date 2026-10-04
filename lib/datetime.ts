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
