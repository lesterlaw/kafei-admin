/** CofePlus LatteArtModifierDto. Locator is required whenever art is sent. */
export const LATTE_ART_GROUP = 'latte-art'
export const LATTE_ART_LOCATOR_CHOICE = 'latte-art.locator'
export const LATTE_ART_CANVAS = 800
export const LATTE_ART_SAFE_DIAMETER = 640
export const LATTE_ART_DPI = 72

export const LATTE_ART_FLAGS = ['none', 'catalog', 'upload'] as const
export type LatteArtFlag = (typeof LATTE_ART_FLAGS)[number]

/** App choices. heart/leaf are stored as catalog plus a hand-art locator. */
export const LATTE_ART_REQUEST_FLAGS = [
  'none',
  'catalog',
  'upload',
  'heart',
  'leaf',
] as const
export type LatteArtRequestFlag = (typeof LATTE_ART_REQUEST_FLAGS)[number]

/** CofePlus Hand Art Coffee. The design is the drink, not a printed picture. */
export const HAND_LATTE_ART_ITEM_CODES = {
  heart: 'test0116310013',
  leaf: 'test0116310014',
} as const

export type HandLatteArtDesign = keyof typeof HAND_LATTE_ART_ITEM_CODES

export function isLatteArtFlag(value: unknown): value is LatteArtFlag {
  return value === 'none' || value === 'catalog' || value === 'upload'
}

export function isPlainHotLatte(name: string, temperature?: string | null) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (
    normalized.startsWith('iced ') ||
    normalized.startsWith('ice ') ||
    temperature === 'cold'
  ) {
    return false
  }
  if (
    /matcha|mint|caramel|hazelnut|vanilla|coconut|chocolate|mocha|chai/.test(
      normalized
    )
  ) {
    return false
  }
  return /\blatte\b/.test(normalized)
}

export function handArtLocator(design: HandLatteArtDesign) {
  return `hand-art:${design}`
}

export function parseHandArtLocator(value: string): HandLatteArtDesign | null {
  if (value === 'hand-art:heart') return 'heart'
  if (value === 'hand-art:leaf') return 'leaf'
  return null
}
