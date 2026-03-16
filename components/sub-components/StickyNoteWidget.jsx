'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { PenLine, X, Loader2, Save, Mic, List, AlertCircle, Lightbulb, CheckSquare, Clock, Edit2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveTopicNotes } from '@/lib/actions'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'

export default function StickyNoteWidget({ initialNotes = '', topicId, topicTitle, onSaveNotes = null }) {
  const [isOpen, setIsOpen] = useState(false)
  const defaultNote = initialNotes ? initialNotes : (topicTitle ? `# ${topicTitle}\n\n` : '')
  const [notes, setNotes] = useState(defaultNote)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(initialNotes ? 'saved' : 'saving')
  const [isRecording, setIsRecording] = useState(false)
  const [isPreparingMic, setIsPreparingMic] = useState(false)
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const recognitionRef = useRef(null)
  const textareaRef = useRef(null)
  const shouldKeepRecordingRef = useRef(false)
  const recordingTimeoutRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  const isRecognitionStartingRef = useRef(false)
  const microphoneStreamRef = useRef(null)

  const handleSave = useCallback(async (currentNotes) => {
    setIsSaving(true)
    setSaveStatus('saving')

    try {
      const result = onSaveNotes
        ? await onSaveNotes(topicId, currentNotes)
        : await saveTopicNotes(topicId, currentNotes)

      if (result.success) {
        setSaveStatus('saved')
        toast.success('✅ Notes saved!', { id: 'notes-saved', duration: 2000 })
      } else {
        setSaveStatus('error')
        toast.error(`Failed to save notes: ${result.error}`)
      }
    } catch (error) {
      setSaveStatus('error')
      toast.error('Failed to save notes')
    } finally {
      setIsSaving(false)
    }
  }, [onSaveNotes, topicId])

  useEffect(() => {
    if (notes === initialNotes) return

    const timeoutId = setTimeout(() => {
      handleSave(notes)
    }, 1500)

    return () => clearTimeout(timeoutId)
  }, [notes, initialNotes, handleSave])

  useEffect(() => {
    if (initialNotes !== null && initialNotes !== undefined && initialNotes !== '') {
      setNotes(initialNotes)
      setSaveStatus('saved')
    }
  }, [initialNotes])

  const releaseMicrophone = useCallback(() => {
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop())
      microphoneStreamRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    shouldKeepRecordingRef.current = false
    isRecognitionStartingRef.current = false
    setIsPreparingMic(false)
    setIsRecording(false)

    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
      restartTimeoutRef.current = null
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }

    releaseMicrophone()
  }, [releaseMicrophone])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setHasSpeechSupport(false)
      return undefined
    }

    const recognition = new SpeechRecognition()
    const isNative = Capacitor.isNativePlatform()
    recognition.continuous = !isNative // Non-continuous on Android native for stability
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) {
          continue
        }

        const transcript = event.results[i][0].transcript.trim()
        if (!transcript) {
          continue
        }

        setNotes((previous) => {
          const separator = previous && !previous.endsWith(' ') && !previous.endsWith('\n') ? ' ' : ''
          const newNotes = `${previous}${separator}${transcript}. `
          setSaveStatus('saving')
          return newNotes
        })
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error)
      isRecognitionStartingRef.current = false

      if (event.error === 'aborted') {
        return
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopRecording()
        toast.error('Microphone permission was denied.')
        return
      }

      if (event.error === 'audio-capture') {
        stopRecording()
        toast.error('No microphone was detected for voice notes.')
        return
      }

      if (event.error === 'no-speech') {
        return
      }

      stopRecording()
      toast.error('Voice recording stopped unexpectedly.')
    }

    recognition.onend = () => {
      isRecognitionStartingRef.current = false

      if (!shouldKeepRecordingRef.current) {
        setIsPreparingMic(false)
        setIsRecording(false)
        releaseMicrophone()
        return
      }

      // On Android (non-continuous mode), restart automatically to keep recording
      restartTimeoutRef.current = window.setTimeout(() => {
        if (!recognitionRef.current || !shouldKeepRecordingRef.current) {
          return
        }

        try {
          isRecognitionStartingRef.current = true
          recognitionRef.current.start()
        } catch (restartError) {
          console.error('Speech recognition restart failed', restartError)
          stopRecording()
          toast.error('Voice recording ended unexpectedly.')
        }
      }, 300)
    }

    recognitionRef.current = recognition
    setHasSpeechSupport(true)

    return () => {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      stopRecording()
      recognitionRef.current = null
    }
  }, [releaseMicrophone, stopRecording])

  useEffect(() => {
    const handleAddSnippet = (event) => {
      const { text, color = 'blue' } = event.detail
      setNotes((previous) => {
        const spacer = previous.endsWith('\n\n') ? '' : (previous ? '\n\n' : '')
        // Do not wrap code blocks/mermaid diagrams in blockquotes
        const isCodeBlock = text.startsWith('```')
        const newNotes = isCodeBlock 
          ? `${previous}${spacer}${text}\n\n`
          : `${previous}${spacer}> [${color}] ${text}\n\n`
        setSaveStatus('saving')
        return newNotes
      })
      setIsOpen(true)
    }

    window.addEventListener('add-highlight-to-notes', handleAddSnippet)
    return () => window.removeEventListener('add-highlight-to-notes', handleAddSnippet)
  }, [])

  const ensureMicrophoneAccess = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return true
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      releaseMicrophone()
      microphoneStreamRef.current = stream
      return true
    } catch (error) {
      console.error('Microphone permission error', error)

      if (Capacitor.isNativePlatform()) {
        toast.error('Allow microphone access in the app settings to use voice notes.')
      } else {
        toast.error('Allow microphone access in your browser to use voice notes.')
      }

      return false
    }
  }, [releaseMicrophone])

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording()
      toast.info('⏹️ Recording stopped.')
      return
    }

    if (!recognitionRef.current || !hasSpeechSupport) {
      toast.error('Speech recognition is not supported on this device.')
      return
    }

    if (isRecognitionStartingRef.current || isPreparingMic) {
      return
    }

    setIsPreparingMic(true)
    toast.loading('Preparing microphone...', { id: 'mic-prep' })
    const microphoneReady = await ensureMicrophoneAccess()
    toast.dismiss('mic-prep')
    if (!microphoneReady) {
      setIsPreparingMic(false)
      return
    }

    try {
      shouldKeepRecordingRef.current = true
      isRecognitionStartingRef.current = true
      recognitionRef.current.start()
      setIsRecording(true)
      setIsPreparingMic(false)
      toast.success('🎙️ Recording started — speak now!')

      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current)
      }

      recordingTimeoutRef.current = window.setTimeout(() => {
        stopRecording()
        toast.info('Voice recording stopped after 5 minutes.')
      }, 5 * 60 * 1000)
    } catch (error) {
      console.error(error)
      stopRecording()
      toast.error('Could not start voice recording.')
    }
  }

  const insertAtCursor = (text) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const prefix = notes.substring(0, start)
    const suffix = notes.substring(end)
    let formattedText = text

    if (['- ', 'Important: ', 'Idea: '].includes(text)) {
      const needsNewLine = prefix.length > 0 && !prefix.endsWith('\n')
      formattedText = `${needsNewLine ? '\n' : ''}${text}`
    }

    const newNotes = prefix + formattedText + suffix
    setNotes(newNotes)
    setSaveStatus('saving')

    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + formattedText.length
      textarea.focus()
    }, 0)
  }

  const handleManualSave = () => {
    handleSave(notes)
  }

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 md:bottom-[6.5rem] md:right-8 h-14 w-14 rounded-full border border-slate-300/50 bg-slate-200 text-blue-600 shadow-2xl transition-transform hover:scale-105 hover:bg-slate-300 active:scale-95 dark:border-slate-700/50 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 z-[105]"
          aria-label="Open Notes"
        >
          <PenLine className="h-6 w-6" />
        </Button>
      )}

      {isOpen && (
        <div className="fixed inset-x-0 bottom-0 md:inset-x-auto md:bottom-8 md:right-8 h-[70vh] md:h-[min(60vh,450px)] w-full md:w-[400px] z-[110] flex flex-col overflow-hidden rounded-t-2xl md:rounded-xl border border-slate-200/50 shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300 dark:border-slate-700/50">
          <div className="z-10 flex items-center justify-between border-b border-slate-200/80 bg-slate-100 px-4 py-3 text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-2 font-semibold text-blue-600 dark:text-blue-400">
              <PenLine className="h-4 w-4" />
              <span>Learner Notes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex min-w-[60px] items-center justify-end gap-1.5 text-xs font-medium opacity-80">
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving
                  </>
                )}
                {saveStatus === 'saved' && <span className="text-green-800 dark:text-green-200">Saved</span>}
                {saveStatus === 'error' && <span className="text-red-800 dark:text-red-200">Error</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualSave}
                className="h-7 w-7 rounded-full text-current hover:bg-black/10 dark:hover:bg-white/10"
                title="Save Notes"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 rounded-full text-current hover:bg-black/10 dark:hover:bg-white/10"
                title="Close Notes"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-2 py-1.5 transition-colors dark:border-slate-700/80 dark:bg-slate-800/80">
            {!isPreview ? (
              <div className="flex gap-0.5 overflow-x-auto no-scrollbar mask-fade-right">
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('- [ ] ')} className="h-7 w-7 shrink-0 rounded text-slate-600 hover:bg-blue-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400" title="Checkbox">
                  <CheckSquare className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('⏰ Reminder: ')} className="h-7 w-7 shrink-0 rounded text-slate-600 hover:bg-blue-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400" title="Reminder">
                  <Clock className="h-4 w-4" />
                </Button>
                <div className="mx-1 h-4 w-px shrink-0 self-center bg-slate-300 dark:bg-slate-600" />
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('- ')} className="h-7 w-7 shrink-0 rounded text-slate-600 hover:bg-blue-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400" title="Bullet Point">
                  <List className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('⚠️ Important: ')} className="h-7 w-7 shrink-0 rounded text-slate-600 hover:bg-blue-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400" title="Important">
                  <AlertCircle className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('💡 Idea: ')} className="h-7 w-7 shrink-0 rounded text-slate-600 hover:bg-blue-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400" title="Idea">
                  <Lightbulb className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Previewing Markdown
              </div>
            )}

            <div className="ml-1 flex shrink-0 items-center gap-1">
              {!isPreview && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleRecording}
                  disabled={!hasSpeechSupport || isPreparingMic}
                  className={`h-7 w-7 rounded ${
                    isRecording
                      ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30 dark:text-red-400'
                      : 'text-slate-600 hover:bg-blue-100 dark:text-slate-300 dark:hover:bg-blue-900/30'
                  } ${(!hasSpeechSupport || isPreparingMic) ? 'cursor-not-allowed opacity-60' : ''}`}
                  title={isRecording ? 'Stop Recording' : 'Voice Record (5 min max)'}
                >
                  {isPreparingMic ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mic className={`h-3.5 w-3.5 ${isRecording ? 'animate-pulse' : ''}`} />
                  )}
                </Button>
              )}

              <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPreview(!isPreview)}
                className={`h-7 rounded px-2 text-xs font-medium ${
                  isPreview
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {isPreview ? <Edit2 className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                {isPreview ? 'Edit' : 'Preview'}
              </Button>
            </div>
          </div>

          <div className="relative flex flex-1 flex-col overflow-hidden bg-white dark:bg-[#1a1c23]">
            {isPreview ? (
              <div className="prose max-w-none flex-1 overflow-y-auto p-5 text-sm leading-relaxed scroll-smooth prose-p:text-slate-700 prose-headings:text-slate-800 prose-a:text-blue-600 dark:prose-invert dark:prose-p:text-slate-300 dark:prose-headings:text-slate-100 dark:prose-a:text-blue-400" style={{ fontFamily: "'Virgil', cursive" }}>
                {notes ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      blockquote: ({ node, ...props }) => {
                        let color = 'blue'
                        let found = false

                        const processChildren = (children) => React.Children.map(children, (child) => {
                          if (typeof child === 'string') {
                            if (!found) {
                              const match = child.match(/^\[(blue|green|purple|amber|rose)\]\s*/)
                              if (match) {
                                color = match[1]
                                found = true
                                return child.replace(match[0], '')
                              }
                            }
                            return child
                          }

                          if (React.isValidElement(child) && child.props && child.props.children) {
                            return React.cloneElement(child, {
                              children: processChildren(child.props.children)
                            })
                          }

                          return child
                        })

                        const modifiedChildren = processChildren(props.children)
                        const colorThemes = {
                          blue: { border: 'border-blue-500', bg: 'from-blue-500/10', shine: 'via-blue-400/10' },
                          green: { border: 'border-emerald-500', bg: 'from-emerald-500/10', shine: 'via-emerald-400/10' },
                          purple: { border: 'border-purple-500', bg: 'from-purple-500/10', shine: 'via-purple-400/10' },
                          amber: { border: 'border-amber-500', bg: 'from-amber-500/10', shine: 'via-amber-400/10' },
                          rose: { border: 'border-rose-500', bg: 'from-rose-500/10', shine: 'via-rose-400/10' }
                        }
                        const theme = colorThemes[color] || colorThemes.blue

                        return (
                          <blockquote className={`not-prose relative my-4 overflow-hidden rounded-r-lg border-l-4 bg-gradient-to-r py-3 pl-4 pr-4 italic text-slate-700 shadow-sm group dark:text-slate-300 ${theme.border} ${theme.bg} to-transparent`}>
                            <div className={`absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent ${theme.shine} to-transparent group-hover:animate-[shimmer_2s_infinite]`} />
                            <div className="relative z-10">
                              {modifiedChildren}
                            </div>
                          </blockquote>
                        )
                      },
                      input: ({ node, ...props }) => (
                        <input {...props} className="mr-2 accent-blue-500" />
                      ),
                      code: CodeBlock,
                      pre: ({ node, children, ...props }) => (
                        <div className="my-3" {...props}>
                          {children}
                        </div>
                      )
                    }}
                  >
                    {notes}
                  </ReactMarkdown>
                ) : (
                  <p className="mt-10 text-center italic text-slate-400 dark:text-slate-500">Click edit to start writing...</p>
                )}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                className="relative z-10 h-full w-full resize-none border-none bg-transparent p-5 leading-[26px] text-slate-800 placeholder:text-slate-400/60 focus:outline-none focus:ring-0 scroll-smooth selection:bg-blue-500/20 dark:text-slate-200 dark:placeholder:text-slate-500/50"
                style={{ fontFamily: "'Virgil', cursive" }}
                placeholder="Jot down your learner notes here... Markdown is supported!"
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value)
                  setSaveStatus('saving')
                }}
                spellCheck="false"
              />
            )}
          </div>

          <div className="pointer-events-none absolute bottom-0 right-0 h-8 w-8 rounded-tl-xl bg-gradient-to-tl from-slate-200/50 to-transparent dark:from-slate-800/80" />
        </div>
      )}
    </>
  )
}
