const BODY_PREVIEW_LIMIT = 2000

export function redactSecret(value: string | undefined | null): string {
  if (!value) return '(none)'
  if (value.length <= 16) return '***'
  return `${value.slice(0, 8)}…${value.slice(-6)} (${value.length} chars)`
}

export function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (/^(authorization|x-api-key)$/i.test(key)) {
      const token = value.replace(/^Bearer\s+/i, '')
      next[key] = value.toLowerCase().startsWith('bearer ')
        ? `Bearer ${redactSecret(token)}`
        : redactSecret(value)
    } else {
      next[key] = value
    }
  }
  return next
}

export function previewBody(body: string | null | undefined): string {
  if (body == null || body === '') return '(empty)'
  const trimmed = body.trim()
  try {
    const pretty = JSON.stringify(JSON.parse(trimmed), null, 2)
    if (pretty.length <= BODY_PREVIEW_LIMIT) return pretty
    return `${pretty.slice(0, BODY_PREVIEW_LIMIT)}\n… [truncated ${pretty.length - BODY_PREVIEW_LIMIT} chars]`
  } catch {
    if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed
    return `${trimmed.slice(0, BODY_PREVIEW_LIMIT)}… [truncated ${trimmed.length - BODY_PREVIEW_LIMIT} chars]`
  }
}

export function logCofeplusRequest(input: {
  environment?: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string | null
  authSource?: string
}) {
  console.log(
    [
      '',
      '──────── COFEPLUS REQUEST ────────',
      `env:     ${input.environment || 'n/a'}`,
      `auth:    ${input.authSource || 'n/a'}`,
      `method:  ${input.method}`,
      `url:     ${input.url}`,
      `headers: ${JSON.stringify(redactHeaders(input.headers))}`,
      `body:`,
      previewBody(input.body),
      '──────────────────────────────────',
    ].join('\n')
  )
}

export function logCofeplusResponse(input: {
  environment?: string
  method: string
  url: string
  status: number
  statusText: string
  durationMs: number
  body: string
  ok: boolean
}) {
  console.log(
    [
      '',
      `──────── COFEPLUS RESPONSE ${input.ok ? '✓' : '✗'} ────────`,
      `env:      ${input.environment || 'n/a'}`,
      `method:   ${input.method}`,
      `url:      ${input.url}`,
      `status:   ${input.status} ${input.statusText}`,
      `duration: ${input.durationMs}ms`,
      `body:`,
      previewBody(input.body),
      '───────────────────────────────────',
      '',
    ].join('\n')
  )
}
