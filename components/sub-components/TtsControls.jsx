'use client'

import { Button } from '@/components/ui/button'
import { Volume2, Pause, Play, Square } from 'lucide-react'
import { useTts } from '@/lib/tts/useTts'

// Listen controls for lesson content (Plan P7.1). Renders nothing when the
// browser has no speech synthesis, so it degrades gracefully.
export default function TtsControls({ text, className = '' }) {
  const { supported, status, speak, pause, resume, stop } = useTts()

  if (!supported || !text) return null

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {status === 'idle' && (
        <Button variant="outline" size="sm" onClick={() => speak(text)}>
          <Volume2 className="mr-2 h-4 w-4" />
          Listen
        </Button>
      )}

      {status === 'playing' && (
        <>
          <Button variant="outline" size="sm" onClick={pause} aria-label="Pause narration">
            <Pause className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={stop} aria-label="Stop narration">
            <Square className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground animate-pulse">Narrating…</span>
        </>
      )}

      {status === 'paused' && (
        <>
          <Button variant="outline" size="sm" onClick={resume} aria-label="Resume narration">
            <Play className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={stop} aria-label="Stop narration">
            <Square className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Paused</span>
        </>
      )}
    </div>
  )
}
