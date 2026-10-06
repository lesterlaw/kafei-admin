'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DealDescriptionEditorProps {
  id?: string
  initialHtml: string
  onChange: (html: string) => void
  disabled?: boolean
}

/** Small rich text box: bold and bullet points only, which is all the app renders. */
export function DealDescriptionEditor({
  id,
  initialHtml,
  onChange,
  disabled,
}: DealDescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState({ bold: false, list: false })

  // Set once: React must not re-render the editable content while the admin types
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshActive = () => {
    setActive({
      bold: document.queryCommandState('bold'),
      list: document.queryCommandState('insertUnorderedList'),
    })
  }

  const emit = () => {
    onChange(editorRef.current?.innerHTML || '')
    refreshActive()
  }

  const run = (command: 'bold' | 'insertUnorderedList') => {
    editorRef.current?.focus()
    document.execCommand(command)
    emit()
  }

  return (
    <div className="rounded-md border bg-white">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          type="button"
          variant={active.bold ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1 px-2"
          disabled={disabled}
          // Keep the text selection while the toolbar button is pressed
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('bold')}
          aria-pressed={active.bold}
        >
          <Bold className="h-4 w-4" />
          Bold
        </Button>
        <Button
          type="button"
          variant={active.list ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1 px-2"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('insertUnorderedList')}
          aria-pressed={active.list}
        >
          <List className="h-4 w-4" />
          Bullet points
        </Button>
      </div>
      <div
        id={id}
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={cn(
          'min-h-36 px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          '[&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_ul]:mb-2',
          disabled && 'opacity-60'
        )}
        onInput={emit}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        onPaste={(event) => {
          // Plain text only, so pasted pages do not bring their own styling
          event.preventDefault()
          document.execCommand(
            'insertText',
            false,
            event.clipboardData.getData('text/plain')
          )
        }}
      />
    </div>
  )
}
