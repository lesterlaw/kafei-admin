export function normalizeDrinkName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[*]+$/g, '')
    .replace(/\s+/g, ' ')
}

/** "Iced Latte" / "Hot Cappuccino" → "latte" / "cappuccino" */
export function baseDrinkName(name: string) {
  return normalizeDrinkName(name).replace(/^(hot|iced|ice)\s+/, '')
}

export function isIcedDrink(
  name: string,
  temperature?: string | null
): boolean {
  const normalized = normalizeDrinkName(name)
  if (
    normalized.startsWith('iced ') ||
    normalized.startsWith('ice ') ||
    normalized.includes(' cold')
  ) {
    return true
  }
  return temperature === 'cold'
}

export function drinkModifierPreferences(
  name: string,
  temperature?: string | null
): Record<string, string> {
  return {
    temperature: isIcedDrink(name, temperature) ? 'iced-regular' : 'hot',
  }
}

type MenuCandidate = {
  itemCode: string
  display: string
}

export function matchMenuItem(
  productName: string,
  items: MenuCandidate[]
): MenuCandidate | null {
  const exact = normalizeDrinkName(productName)
  const base = baseDrinkName(productName)

  let best: { item: MenuCandidate; score: number } | null = null
  for (const item of items) {
    if (!item.itemCode || !item.display) continue
    const rawDisplay = item.display.trim().toLowerCase()
    const display = normalizeDrinkName(item.display)
    let score = 0
    if (display === exact) score = 100
    else if (display === base) score = 90
    if (score === 0) continue
    // Prefer classic drinks over 3D-print (*) and latte-art variants
    if (rawDisplay.includes('*') || rawDisplay.includes('art')) score -= 25
    if (!best || score > best.score) {
      best = { item, score }
    }
  }
  return best?.item ?? null
}
