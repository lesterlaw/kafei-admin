'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LATTE_ART_GROUP,
  LATTE_ART_LOCATOR_CHOICE,
  modifiersToChoiceMap,
  selectModifiersFromGroups,
  type PodItemOption,
} from './cofeplus-test-shared'

export function CofeplusModifierPicker({
  item,
  choices,
  onChange,
}: {
  item: PodItemOption
  choices: Record<string, string>
  onChange: (choices: Record<string, string>) => void
}) {
  if (item.modifierGroups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No customisation options on this drink. Reload the menu on Test to
        pull modifier groups from CofePlus.
      </p>
    )
  }

  const configured = selectModifiersFromGroups(item.modifierGroups, choices)
  const temperatureFlag =
    choices.temperature ||
    configured.find((modifier) => modifier.group === 'temperature')?.flag

  const handleChange = (group: string, flag: string) => {
    const next = modifiersToChoiceMap(
      selectModifiersFromGroups(item.modifierGroups, {
        ...choices,
        [group]: flag,
      })
    )
    if (group === LATTE_ART_GROUP) next[LATTE_ART_GROUP] = flag
    const locator = choices[LATTE_ART_LOCATOR_CHOICE]
    onChange(
      locator ? { ...next, [LATTE_ART_LOCATOR_CHOICE]: locator } : next
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Customise {item.display}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(modifiersToChoiceMap(item.modifiers))}
        >
          Reset defaults
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {item.modifierGroups.map((group) => {
          const options = group.options.filter((option) => {
            if (!option.requires) return true
            if (!temperatureFlag) return true
            if (option.requires.group !== 'temperature') return true
            return option.requires.flags.includes(temperatureFlag)
          })
          const pool = options.length > 0 ? options : group.options
          const value =
            group.group === LATTE_ART_GROUP
              ? choices[group.group] || 'none'
              : choices[group.group] ||
                pool.find((option) => option.isDefault)?.flag ||
                pool[0]?.flag ||
                ''

          return (
            <div key={group.group} className="space-y-1.5">
              <Label className="text-xs">{group.display}</Label>
              <Select
                value={value || undefined}
                onValueChange={(flag) => handleChange(group.group, flag)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={`Select ${group.display}`} />
                </SelectTrigger>
                <SelectContent>
                  {pool.map((option) => (
                    <SelectItem key={option.flag} value={option.flag}>
                      {option.display}
                      {typeof option.price === 'number' && option.price > 0
                        ? ` (+${option.price})`
                        : ''}
                      {option.isDefault ? ' · default' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {group.group === LATTE_ART_GROUP &&
              (value === 'catalog' || value === 'upload') ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Latte art image URL</Label>
                  <Input
                    value={choices[LATTE_ART_LOCATOR_CHOICE] || ''}
                    placeholder="https://example.com/latte-art/heart.jpg"
                    onChange={(event) =>
                      onChange({
                        ...choices,
                        [LATTE_ART_GROUP]: value,
                        [LATTE_ART_LOCATOR_CHOICE]: event.target.value.trim(),
                      })
                    }
                  />
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Required for random catalog art and uploads. JPG, 800x800,
                    72 DPI. Keep the design inside the center 640px circle.
                  </p>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
