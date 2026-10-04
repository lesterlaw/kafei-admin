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

function asIcedName(name: string) {
  return normalizeDrinkName(name).replace(/^ice\s+/, 'iced ')
}

/** Manual Kafei add-ons that were never tagged with a CofePlus group/flag. */
export function inferAddonModifier(
  name: string
): { group: string; flag: string } | null {
  const normalized = normalizeDrinkName(name)
  if (normalized.includes('oat')) {
    return { group: 'milk', flag: 'milk2' }
  }
  if (normalized.includes('whole milk') || normalized === 'milk1') {
    return { group: 'milk', flag: 'milk1' }
  }
  if (normalized.includes('almond') || normalized.includes('soy')) {
    return { group: 'milk', flag: 'milk2' }
  }
  return null
}

export function drinkModifierPreferences(
  name: string,
  temperature?: string | null
): Record<string, string> {
  if (isIcedDrink(name, temperature)) {
    return {
      temperature: 'iced-regular',
      cupSize: 'legacy-cold-default',
    }
  }
  return {
    temperature: 'hot',
    cupSize: 'legacy-hot-default',
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
  const exactIced = asIcedName(productName)
  const base = baseDrinkName(productName)
  const productIced = isIcedDrink(productName)

  let best: { item: MenuCandidate; score: number } | null = null
  for (const item of items) {
    if (!item.itemCode || !item.display) continue
    const rawDisplay = item.display.trim().toLowerCase()
    const display = normalizeDrinkName(item.display)
    const displayIced = asIcedName(item.display)
    const displayBase = baseDrinkName(item.display)
    let score = 0
    if (display === exact) score = 100
    else if (displayIced === exactIced && displayBase === base) score = 98
    else if (productIced && displayBase === base && isIcedDrink(item.display)) {
      score = 96
    } else if (display === base) score = 90
    if (score === 0) continue
    // Prefer classic drinks over 3D-print (*) and latte-art variants
    if (rawDisplay.includes('*') || rawDisplay.includes('art')) score -= 25
    if (!best || score > best.score) {
      best = { item, score }
    }
  }
  return best?.item ?? null
}
