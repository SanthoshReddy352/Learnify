'use client'

import { useState, useEffect } from 'react'
import { Highlighter } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    return `\n\`\`\`mermaid\n${decodeURIComponent(el.getAttribute('data-mermaid-code'))}\n\`\`\`\n`;
  }
  
  if (el.hasAttribute && el.hasAttribute('data-code')) {
    const lang = el.getAttribute('data-language') || '';
    return `\n\`\`\`${lang}\n${decodeURIComponent(el.getAttribute('data-code'))}\n\`\`\`\n`;
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

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    let timeoutId = null;

    const handleMouseUp = () => {
      // Small timeout to allow double-clicks to resolve selection
      timeoutId = setTimeout(() => {
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) {
          const text = selection.toString().trim()
          if (text.length > 0) {
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            
            // Show button directly above the selected text
            setSelectionStyle({
              top: Math.max(0, rect.top + window.scrollY - 45),
              left: rect.left + window.scrollX + (rect.width / 2) - 50
            })
          } else {
            setSelectionStyle(null)
          }
        } else {
          setSelectionStyle(null)
        }
      }, 50)
    }

    const handleMouseDown = (e) => {
      // Don't hide if clicking on our own button
      if (e.target.closest('#selection-highlighter-btn')) return
      setSelectionStyle(null)
    }
    
    // Listen for selection changes via mouse
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  if (!selectionStyle || !mounted) return null

  return createPortal(
    <div
      id="selection-highlighter-btn"
      className="absolute z-[200] p-1.5 rounded-lg bg-slate-800 dark:bg-slate-900 shadow-xl border border-slate-700/50 flex items-center gap-1.5 animate-in zoom-in-95 duration-100"
      style={selectionStyle}
    >
      <div className="text-xs font-semibold text-slate-300 pr-1 pl-1 flex items-center">
        <Highlighter className="w-3.5 h-3.5 mr-1.5" /> Note
      </div>
      <div className="w-px h-4 bg-slate-700 mx-0.5" />
      
      {/* Color Options */}
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
          className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-110 active:scale-95 ${color.class}`}
          title={`Highlight ${color.id}`}
        />
      ))}
    </div>,
    document.body
  )
}
