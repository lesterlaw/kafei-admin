export const DEAL_MAX_IMAGES = 3

const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'ul', 'li'])
const TAG_ALIASES: Record<string, string> = { b: 'strong', div: 'p' }

/** Keep only the formatting the deal editor offers: paragraphs, bold and bullet lists. */
export function sanitizeDealDescription(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\/?)([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (_match, slash, rawTag) => {
      const lower = String(rawTag).toLowerCase()
      const tag = TAG_ALIASES[lower] || lower
      if (!ALLOWED_TAGS.has(tag)) return ''
      if (tag === 'br') return '<br>'
      return `<${slash}${tag}>`
    })
    .replace(/<p>\s*<\/p>/g, '')
    .trim()
}

export function dealDescriptionText(html: string): string {
  return html
    .replace(/<li>/gi, ' • ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeDealImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((url): url is string => typeof url === 'string')
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, DEAL_MAX_IMAGES)
}
