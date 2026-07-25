'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { stripMarkdownForSpeech, chunkForSpeech } from './speech-text'

// Free TTS narration via the browser Web Speech API (Plan P7.1). Zero token
// cost, works on web and in the Android WebView. Narrates markdown lesson
// content chunk-by-chunk (long utterances stall in some engines) with
// play / pause / resume / stop.
export function useTts() {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'

  const [status, setStatus] = useState('idle') // idle | playing | paused

  const chunksRef = useRef([])
  const indexRef = useRef(0)
  const cancelledRef = useRef(false)

  const hardStop = useCallback(() => {
    if (!supported) return
    cancelledRef.current = true
    window.speechSynthesis.cancel()
    indexRef.current = 0
    chunksRef.current = []
  }, [supported])

  const speakNext = useCallback(() => {
    if (!supported || cancelledRef.current) return
    const chunks = chunksRef.current
    if (indexRef.current >= chunks.length) {
      setStatus('idle')
      indexRef.current = 0
      return
    }
    const utterance = new window.SpeechSynthesisUtterance(chunks[indexRef.current])
    utterance.rate = 1
    const advance = () => {
      if (cancelledRef.current) return
      indexRef.current += 1
      speakNext()
    }
    utterance.onend = advance
    utterance.onerror = advance // skip a failed chunk rather than stalling
    window.speechSynthesis.speak(utterance)
  }, [supported])

  const speak = useCallback(
    (markdown) => {
      if (!supported) return
      cancelledRef.current = true
      window.speechSynthesis.cancel()

      const chunks = chunkForSpeech(stripMarkdownForSpeech(markdown))
      if (chunks.length === 0) return

      cancelledRef.current = false
      chunksRef.current = chunks
      indexRef.current = 0
      setStatus('playing')
      speakNext()
    },
    [supported, speakNext]
  )

  const pause = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.pause()
    setStatus('paused')
  }, [supported])

  const resume = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.resume()
    setStatus('playing')
  }, [supported])

  const stop = useCallback(() => {
    hardStop()
    setStatus('idle')
  }, [hardStop])

  // Stop narration if the component unmounts (e.g. navigating away).
  useEffect(() => hardStop, [hardStop])

  return { supported, status, speak, pause, resume, stop }
}
