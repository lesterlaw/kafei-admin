import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveCofeplusEnvironment } from '@/lib/cofeplus/settings'
import {
  HAND_LATTE_ART_ITEM_CODES,
  isPlainHotLatte,
} from '@/lib/cofeplus/latte-art-contract'

interface MachineOption {
  label: string
  isDefault: boolean
}

/** group -> flag -> option, as the machine menu lists them for one drink */
type MachineGroups = Map<string, { label: string; options: Map<string, MachineOption> }>

async function loadMachineGroups(
  supabase: SupabaseClient,
  itemCode: string,
  environment: string
): Promise<MachineGroups | null> {
  const { data } = await supabase
    .from('cofeplus_menu_items')
    .select('raw')
    .eq('environment', environment)
    .eq('item_code', itemCode)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const rawGroups = (data?.raw as { modifierGroups?: unknown } | null)?.modifierGroups
  if (!Array.isArray(rawGroups)) return null

  const groups: MachineGroups = new Map()
  for (const entry of rawGroups) {
    const group = entry as {
      group?: string
      display?: string
      options?: { flag?: string; display?: string; isDefault?: boolean }[]
    }
    if (!group.group) continue
    const options = new Map<string, MachineOption>()
    for (const option of group.options || []) {
      if (!option.flag) continue
      options.set(option.flag, {
        label: option.display || option.flag,
        isDefault: option.isDefault === true,
      })
    }
    groups.set(group.group, { label: group.display || group.group, options })
  }
  return groups
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const productId = request.nextUrl.searchParams.get('productId')?.trim() || ''
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('add_ons')
      .select('*, product_addons(product_id)')
      .eq('is_hidden', false)
      .order('name', { ascending: true })

    if (error) {
      return createApiError(error.message, 500)
    }

    const rows = data || []
    if (!productId) {
      return createApiResponse(
        rows.map(({ product_addons: _links, ...addon }) => addon)
      )
    }

    const taggedForProduct = rows.filter((row) => {
      const links = Array.isArray(row.product_addons) ? row.product_addons : []
      return links.some((link: { product_id: string }) => link.product_id === productId)
    })

    // Product-specific tags win. Untagged catalog stays global so existing drinks keep working.
    const visible = taggedForProduct.length > 0
      ? taggedForProduct
      : rows.filter((row) => {
          const links = Array.isArray(row.product_addons) ? row.product_addons : []
          return links.length === 0
        })

    const addons = visible.map(({ product_addons: _links, ...addon }) => addon)

    // Only offer what the machine can actually make for this drink. Anything
    // else would be accepted at checkout and then silently left out of the cup.
    const { data: product } = await supabase
      .from('products')
      .select('name, temperature, cofeplus_item_code')
      .eq('id', productId)
      .maybeSingle()

    const itemCode = product?.cofeplus_item_code?.trim() || ''
    const environment = await getActiveCofeplusEnvironment(supabase)
    const machine = itemCode
      ? await loadMachineGroups(supabase, itemCode, environment)
      : null

    // No synced menu for this drink: keep the full list rather than hide everything
    if (!machine) {
      return createApiResponse(addons)
    }

    // Heart / Leaf are poured from a separate machine item with fewer options
    const handArt =
      product && isPlainHotLatte(product.name || '', product.temperature)
        ? await loadMachineGroups(
            supabase,
            HAND_LATTE_ART_ITEM_CODES.heart,
            environment
          )
        : null

    const supported = addons.flatMap((addon) => {
      const group = typeof addon.cofeplus_group === 'string' ? addon.cofeplus_group : ''
      const flag = typeof addon.cofeplus_flag === 'string' ? addon.cofeplus_flag : ''
      if (!group || !flag) return [addon]

      const machineGroup = machine.get(group)
      const option = machineGroup?.options.get(flag)
      if (!machineGroup || !option) return []

      return [
        {
          ...addon,
          group_label: machineGroup.label,
          is_default: option.isDefault,
          hand_art_supported: handArt
            ? Boolean(handArt.get(group)?.options.has(flag))
            : true,
        },
      ]
    })

    return createApiResponse(supported)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}
