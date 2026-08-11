import type { CofeplusEnvironment } from '@/lib/cofeplus/config'

/** Simulated / estimated seconds one machine dispense occupies the pod */
export const TEST_DISPENSE_SECONDS = 5

/**
 * Live estimate per drink while waiting (scan + brew + collect).
 * Real completion still comes from CofePlus dispatch state.
 */
export const LIVE_DISPENSE_ESTIMATE_SECONDS = 90

export function dispenseSecondsForEnvironment(
  environment: CofeplusEnvironment
): number {
  return environment === 'live'
    ? LIVE_DISPENSE_ESTIMATE_SECONDS
    : TEST_DISPENSE_SECONDS
}

export function formatWaitLabel(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Ready now'
  if (totalSeconds < 60) return `About ${totalSeconds} sec`
  const mins = Math.ceil(totalSeconds / 60)
  return mins === 1 ? 'About 1 min' : `About ${mins} min`
}
