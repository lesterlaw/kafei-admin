'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface KioskCopyFieldProps {
  id: string
  label: string
  value: string
  displayValue?: string
  large?: boolean
}

export function KioskCopyField({
  id,
  label,
  value,
  displayValue,
  large,
}: KioskCopyFieldProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={displayValue || value}
          readOnly
          className={
            large
              ? 'font-mono text-2xl font-bold tracking-[0.2em]'
              : 'font-mono text-xs'
          }
        />
        <Button type="button" variant="outline" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
