'use client'

import { useState, useEffect, useRef } from 'react'
import { Highlighter } from 'lucide-react'
import { toast } from 'sonner'
import { createPortal } from 'react-dom'

const extractMarkdown = (node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return '';
  }

  const el = node;

  // Check custom data attributes first
  if (el.hasAttribute && el.hasAttribute('data-mermaid-code')) {
    return `\`\`\`mermaid\n${decodeURIComponent(el.getAttribute('data-mermaid-code'))}\n\`\`\`\n`;
  }
  
  if (el.hasAttribute && el.hasAttribute('data-code')) {
    const lang = el.getAttribute('data-language') || '';
    return `\`\`\`${lang}\n${decodeURIComponent(el.getAttribute('data-code'))}\n\`\`\`\n`;
  }

  if (el.tagName === 'IMG') {
    // Only capture actual content images, skip UI icons if they have no alt or don't look like content
    if (el.src && (el.alt || el.className.includes('object-'))) {
        return `![${el.alt || 'Image'}](${el.src})`;
    }
    return '';
  }

  let text = '';
  for (const child of Array.from(el.childNodes)) {
    text += extractMarkdown(child);
  }

  if (el.tagName === 'P' || el.tagName === 'DIV' || /^[H][1-6]$/.test(el.tagName || '')) {
    return `\n${text}\n`;
  }
  if (el.tagName === 'LI') {
    return `\n- ${text}`;
  }

  return text;
};

export default function SelectionHighlighter() {
  const [selectionStyle, setSelectionStyle] = useState(null)
  const [mounted, setMounted] = useState(false)
  const updateTimeoutRef = useRef(null)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    const clearScheduledUpdate = () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
    }

    const updateSelectionBubble = () => {
      const selection = window.getSelection()

      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectionStyle(null)
        return
      }

      const text = selection.toString().trim()
      if (!text.length) {
        setSelectionStyle(null)
        return
      }

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      if (!rect || (!rect.width && !rect.height)) {
        setSelectionStyle(null)
        return
      }

      const viewport = window.visualViewport
      const viewportWidth = viewport?.width || window.innerWidth
      const viewportHeight = viewport?.height || window.innerHeight
      const offsetLeft = viewport?.offsetLeft || 0
      const offsetTop = viewport?.offsetTop || 0
      const isMobileViewport = viewportWidth < 768
      const bubbleWidth = isMobileViewport
        ? Math.min(208, Math.max(168, viewportWidth - 24))
        : (viewportWidth < 420 ? 214 : 246)
      const bubbleHeight = isMobileViewport ? 56 : 44
      const preferredTop = isMobileViewport
        ? rect.bottom + offsetTop + 18
        : rect.top + offsetTop - bubbleHeight - 12
      const fallbackTop = isMobileViewport
        ? rect.top + offsetTop - bubbleHeight - 18
        : rect.bottom + offsetTop + 12
      const clampedLeft = Math.min(
        offsetLeft + viewportWidth - bubbleWidth - 12,
        Math.max(offsetLeft + 12, rect.left + offsetLeft + (rect.width / 2) - (bubbleWidth / 2))
      )
      const maxTop = offsetTop + viewportHeight - bubbleHeight - 16
      const minTop = offsetTop + 8
      const desiredTop = preferredTop <= maxTop ? preferredTop : fallbackTop

      setSelectionStyle({
        top: Math.min(maxTop, Math.max(minTop, desiredTop)),
        left: clampedLeft,
        width: bubbleWidth,
        isMobileViewport
      })
    }

    const scheduleSelectionBubbleUpdate = () => {
      clearScheduledUpdate()
      updateTimeoutRef.current = setTimeout(updateSelectionBubble, 80)
    }

    const handlePointerDown = (event) => {
      if (event.target.closest('#selection-highlighter-btn')) return
      setSelectionStyle(null)
    }

    const handleViewportScroll = () => setSelectionStyle(null)

    document.addEventListener('selectionchange', scheduleSelectionBubbleUpdate)
    document.addEventListener('mouseup', scheduleSelectionBubbleUpdate)
    document.addEventListener('keyup', scheduleSelectionBubbleUpdate)
    document.addEventListener('touchend', scheduleSelectionBubbleUpdate, { passive: true })
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown, { passive: true })
    window.addEventListener('scroll', handleViewportScroll, true)
    window.addEventListener('resize', scheduleSelectionBubbleUpdate)
    window.visualViewport?.addEventListener('resize', scheduleSelectionBubbleUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleSelectionBubbleUpdate)

    return () => {
      document.removeEventListener('selectionchange', scheduleSelectionBubbleUpdate)
      document.removeEventListener('mouseup', scheduleSelectionBubbleUpdate)
      document.removeEventListener('keyup', scheduleSelectionBubbleUpdate)
      document.removeEventListener('touchend', scheduleSelectionBubbleUpdate)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('scroll', handleViewportScroll, true)
      window.removeEventListener('resize', scheduleSelectionBubbleUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleSelectionBubbleUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleSelectionBubbleUpdate)
      clearScheduledUpdate()
    }
  }, [])

  if (!selectionStyle || !mounted) return null

  return createPortal(
    <div
      id="selection-highlighter-btn"
      className={`fixed z-[200] rounded-2xl border border-slate-300/80 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95 animate-in zoom-in-95 duration-100 ${
        selectionStyle.isMobileViewport
          ? 'flex flex-col gap-2 p-2.5'
          : 'flex items-center gap-1.5 p-2'
      }`}
      style={{
        top: selectionStyle.top,
        left: selectionStyle.left,
        width: selectionStyle.width
      }}
    >
      <div className="flex items-center px-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <Highlighter className="w-3.5 h-3.5 mr-1.5" /> Note
      </div>
      <div className={`${selectionStyle.isMobileViewport ? 'hidden' : 'mx-0.5 h-4 w-px'} bg-slate-300 dark:bg-slate-700`} />
      
      {/* Color Options */}
      <div className={`${
        selectionStyle.isMobileViewport
          ? 'grid grid-cols-5 gap-2'
          : 'flex items-center gap-1.5'
      }`}>
        {[
          { id: 'blue', class: 'bg-blue-500 hover:bg-blue-400 border-blue-600' },
          { id: 'green', class: 'bg-emerald-500 hover:bg-emerald-400 border-emerald-600' },
          { id: 'purple', class: 'bg-purple-500 hover:bg-purple-400 border-purple-600' },
          { id: 'amber', class: 'bg-amber-500 hover:bg-amber-400 border-amber-600' },
          { id: 'rose', class: 'bg-rose-500 hover:bg-rose-400 border-rose-600' }
        ].map(color => (
          <button
            key={color.id}
            onClick={() => {
              const selection = window.getSelection()
              if (selection && !selection.isCollapsed) {
                const fragment = selection.getRangeAt(0).cloneContents()
                let text = extractMarkdown(fragment).trim()
                
                // Fallback to text string if parser missed
                if (!text) {
                   text = selection.toString().trim()
                }

                if (text) {
                  window.dispatchEvent(new CustomEvent('add-highlight-to-notes', { 
                    detail: { text, color: color.id } 
                  }))
                  selection.removeAllRanges()
                  setSelectionStyle(null)
                  toast.success(`Added ${color.id} highlight!`)
                }
              }
            }}
            className={`rounded-full border shadow-sm transition-transform hover:scale-110 active:scale-95 ${
              selectionStyle.isMobileViewport ? 'h-7 w-7' : 'h-5 w-5'
            } ${color.class}`}
            title={`Highlight ${color.id}`}
          />
        ))}
      </div>
    </div>,
    document.body
  )
}
