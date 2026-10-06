'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatBytes, prepareImageForUpload } from '@/lib/image-upload'
import { DEAL_MAX_IMAGES } from '@/lib/deals'
import { cn } from '@/lib/utils'

const BUCKET = 'product-images'

interface DealImageUploaderProps {
  value: string[]
  onChange: (urls: string[]) => void
  disabled?: boolean
}

export function DealImageUploader({
  value,
  onChange,
  disabled,
}: DealImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const remaining = DEAL_MAX_IMAGES - value.length
  const canAdd = remaining > 0 && !disabled && !isUploading

  const uploadFiles = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) {
      setError('Only image files can be uploaded')
      return
    }

    setError(null)
    setIsUploading(true)
    const supabase = createClient()
    const uploaded: string[] = []
    const nextNotices: string[] = []

    try {
      if (images.length > remaining) {
        nextNotices.push(
          `Only ${remaining} more image${remaining === 1 ? '' : 's'} can be added (maximum ${DEAL_MAX_IMAGES}).`
        )
      }

      for (const original of images.slice(0, remaining)) {
        const prepared = await prepareImageForUpload(original)
        if (prepared.resized) {
          nextNotices.push(
            `${original.name} was resized from ${formatBytes(prepared.originalBytes)} to ${formatBytes(prepared.file.size)}.`
          )
        }

        const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `deals/${crypto.randomUUID()}.${ext}`
        // Straight from the browser to storage; the admin session authorises the upload
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, prepared.file, {
            contentType: prepared.file.type || 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Upload failed for ${original.name}: ${uploadError.message}`)
        }

        uploaded.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Image upload failed'
      )
    } finally {
      if (uploaded.length > 0) {
        onChange([...value, ...uploaded])
      }
      setNotices(nextNotices)
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {value.map((url, index) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Deal image ${index + 1}`}
                className="h-24 w-40 rounded-md border object-cover"
              />
              <button
                type="button"
                className="absolute -right-2 -top-2 rounded-full border bg-white p-1 shadow-sm hover:bg-muted disabled:opacity-50"
                onClick={() => onChange(value.filter((item) => item !== url))}
                disabled={disabled || isUploading}
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={canAdd ? 0 : -1}
        aria-disabled={!canAdd}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center text-sm transition-colors',
          canAdd ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed opacity-60',
          isDragging && canAdd && 'border-primary bg-muted/60'
        )}
        onClick={() => canAdd && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!canAdd) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (canAdd) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          if (!canAdd) return
          void uploadFiles(Array.from(event.dataTransfer.files))
        }}
      >
        {isUploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="font-medium">
          {isUploading
            ? 'Uploading...'
            : remaining > 0
              ? 'Drag and drop images here, or click to browse'
              : `Maximum of ${DEAL_MAX_IMAGES} images reached`}
        </span>
        <span className="text-xs text-muted-foreground">
          {value.length} of {DEAL_MAX_IMAGES} images. Files over 2 MB are resized
          automatically.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || [])
            event.target.value = ''
            if (files.length > 0) void uploadFiles(files)
          }}
        />
      </div>

      {notices.map((notice) => (
        <p
          key={notice}
          className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {notice}
        </p>
      ))}
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
