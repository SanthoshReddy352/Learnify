'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

export const cleanCodeContent = (content) => {
  let cleaned = String(content).replace(/\n$/, '')
  let prev
  do {
    prev = cleaned
    // Recursively strip any combination of leading/trailing backticks and whitespace
    cleaned = cleaned.trim().replace(/^`+|`+$/g, '').trim()
  } while (cleaned !== prev)
  return cleaned
}

// Extract title from Mermaid code (%%title: Title Here)
const parseMermaidTitle = (code) => {
  const titleMatch = code.match(/^%%title:\s*(.+)$/m)
  return titleMatch ? titleMatch[1].trim() : null
}

// Extract description from Mermaid code (%%desc: Description here)
const parseMermaidDescription = (code) => {
  const descMatch = code.match(/^%%desc:\s*(.+)$/m)
  return descMatch ? descMatch[1].trim() : null
}

// Comprehensive Mermaid sanitizer - handles ALL node shapes and syntax issues
const sanitizeMermaidCode = (code) => {
  let result = code
  
  // Remove title and description comments (we extract them separately)
  result = result.replace(/^%%title:.*$/gm, '')
  result = result.replace(/^%%desc:.*$/gm, '')
  
  // Helper to process label content: trim and replace newlines with space
  const formatLabel = (label) => {
    return label.trim().replace(/[\r\n]+/g, ' ').replace(/"/g, "'")
  }
  
  // === UNIVERSAL FIX: Convert problematic labels to quoted format ===
  // We use callbacks to sanitize the inner content (remove newlines, trim) before quoting
  
  // 1. Rectangle [Label]
  result = result.replace(/(\w+)\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]/g, 
    (m, id, label) => `${id}["${formatLabel(label)}"]`)
  
  // 2. Diamond/Rhombus {Label}
  result = result.replace(/(\w+)\{([^}"]*[()&<>#@!, \s][^}"]*)\}/g, 
    (m, id, label) => `${id}{"${formatLabel(label)}"}`)
  
  // 3. Double curly - Hexagon {{Label}}
  result = result.replace(/(\w+)\{\{([^}"]*[()&<>#@!, \s][^}"]*)\}\}/g, 
    (m, id, label) => `${id}{{"${formatLabel(label)}"}}`)
  
  // 4. Stadium shape with nested parens - CONVERT TO RECTANGLE (safest)
  result = result.replace(/(\w+)\(([^)(]*\([^)]*\)[^)(]*)\)/g, 
    (m, id, label) => `${id}["${formatLabel(label)}"]`)
  
  // 5. Circle ((Label))
  result = result.replace(/(\w+)\(\(([^)"]*[()&<>#@!, \s][^)"]*)\)\)/g, 
    (m, id, label) => `${id}(("${formatLabel(label)}"))`)
  
  // 6. Triple circle (((Label)))
  result = result.replace(/(\w+)\(\(\(([^)"]*[()&<>#@!, \s][^)"]*)\)\)\)/g, 
    (m, id, label) => `${id}(((" ${formatLabel(label)} ")))`) // Extra spaces for triple circle visibility
  
  // 7. Subroutine [[Label]]
  result = result.replace(/(\w+)\[\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]\]/g, 
    (m, id, label) => `${id}[["${formatLabel(label)}"]]`)
  
  // 8. Cylinder [(Label)]
  result = result.replace(/(\w+)\[\(([^)"]*[()&<>#@!, \s][^)"]*)\)\]/g, 
    (m, id, label) => `${id}[("${formatLabel(label)}")]`)
  
  // 9. Stadium ([Label])
  result = result.replace(/(\w+)\(\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]\)/g, 
    (m, id, label) => `${id}(["${formatLabel(label)}"])`)
  
  // 10. Asymmetric >Label]
  result = result.replace(/(\w+)>([^\]"]*[()&<>#@!, \s][^\]"]*)\]/g, 
    (m, id, label) => `${id}>"${formatLabel(label)}"]`)
  
  // 11. Parallelogram [/Label/]
  result = result.replace(/(\w+)\[\/([^\/\]"]*[()&<>#@!, \s][^\/\]"]*)\/\]/g, 
    (m, id, label) => `${id}[/"${formatLabel(label)}"/]`)
  
  // 12. Parallelogram alt [\Label\]
  result = result.replace(/(\w+)\[\\([^\\\]"]*[()&<>#@!, \s][^\\\]"]*)\\]/g, 
    (m, id, label) => `${id}[\\"${formatLabel(label)}\\"]`)
  
  // 13. Trapezoid [/Label\]
  result = result.replace(/(\w+)\[\/([^\/\\\]"]*[()&<>#@!, \s][^\/\\\]"]*)\\]/g, 
    (m, id, label) => `${id}[/"${formatLabel(label)}\\"]`)
  
  // 14. Inverted trapezoid [\Label/]
  result = result.replace(/(\w+)\[\\([^\\\]"]*[()&<>#@!, \s][^\\\]"]*)\/\]/g, 
    (m, id, label) => `${id}[\\"${formatLabel(label)}"/]`)
  
  // 15. Simple stadium (Label)
  result = result.replace(/(\w+)\(([^)()"]*[&<>#@!, \s][^)()"]*)\)/g, 
    (m, id, label) => `${id}("${formatLabel(label)}")`)
  
  // === FIX SUBGRAPH LABELS ===
  result = result.replace(/^(\s*subgraph\s+)(\w+)\s*\(([^)]+)\)\s*$/gm, 
    (m, prefix, id, label) => `${prefix}${id}["${formatLabel(label)}"]`)
  result = result.replace(/^(\s*subgraph\s+)([A-Za-z_][A-Za-z0-9_]*)\s+([^"\[\n][^\n]*[^\s])\s*$/gm, 
    (m, prefix, id, label) => `${prefix}${id}["${formatLabel(label)}"]`)
  
  // === FIX LINK/EDGE LABELS ===
  result = result.replace(/(\-\->|\-\-|\.\.>|==>)\|([^|]*[()&<> \s][^|]*)\|/g, 
    (m, arrow, label) => `${arrow}|"${formatLabel(label)}"|`)
  
  // === REMOVE COMMENTS ===
  result = result.replace(/;\s*%[^%\n].*$/gm, ';')
  result = result.replace(/;\s*%%.*$/gm, ';')
  result = result.replace(/(\-\->|\-\-|==>|\.\.>)\s*%[^%\n].*$/gm, '$1')
  result = result.replace(/^\s*%[^%].*$/gm, '')
  
  // === FIX MALFORMED ARROWS ===
  result = result.replace(/\-\-\s*\-\->/g, '-->')
  result = result.replace(/\-\s+\->/g, '-->')
  result = result.replace(/=\s+=>/g, '==>')
  
  // === REMOVE UNSUPPORTED SYNTAX ===
  result = result.replace(/^\s*enum\s+\w+\s*\{[^}]*\}/gm, '')

  // === STRIP INLINE STYLES & CLASSES (Force Theme Colors) ===
  // Remove style lines (e.g., style A fill:#f9f,stroke:#333)
  result = result.replace(/^\s*style\s+.*$/gm, '')
  // Remove classDef lines (e.g., classDef className fill:#f9f)
  result = result.replace(/^\s*classDef\s+.*$/gm, '')
  // Remove class attachments (e.g., A:::className or A:::someClass)
  result = result.replace(/:::\s*[a-zA-Z0-9_-]+/g, '')
  // Remove link styles (e.g., linkStyle 0 stroke-width:2px)
  result = result.replace(/^\s*linkStyle\s+.*$/gm, '')
  
  // === CLEAN UP ===
  result = result.replace(/\n\s*\n\s*\n/g, '\n\n')
  
  return result.trim()
}

// Diagram Lightbox Component
const DiagramLightbox = ({ svg, onClose, isDarkMode, title }) => {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const minScale = 0.5
  const maxScale = 4

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') zoomIn()
      if (e.key === '-') zoomOut()
      if (e.key === '0') resetZoom()
    }

    // Prevent all scroll events from reaching the background
    const preventScroll = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }
    
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('wheel', preventScroll, { passive: false })
    document.addEventListener('touchmove', preventScroll, { passive: false })
    
    document.body.style.overflow = 'hidden'
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('wheel', preventScroll)
      document.removeEventListener('touchmove', preventScroll)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const zoomIn = () => setScale(prev => Math.min(prev + 0.5, maxScale))
  const zoomOut = () => setScale(prev => Math.max(prev - 0.5, minScale))
  const resetZoom = () => { setScale(1); setPosition({ x: 0, y: 0 }) }

  // Handle wheel zoom (event already prevented by document listener)
  const handleWheel = (e) => {
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setScale(prev => Math.min(Math.max(prev + delta, minScale), maxScale))
  }

  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Close Button - Solid background for visibility */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-3 rounded-full bg-gray-900 hover:bg-gray-800 text-white transition-all hover:scale-110 border border-white/20 shadow-lg"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Zoom Controls - Solid dark background */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 border border-white/20 shadow-lg">
        <button onClick={zoomOut} disabled={scale <= minScale} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors disabled:opacity-30">
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-mono min-w-[4ch] text-center font-medium">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} disabled={scale >= maxScale} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors disabled:opacity-30">
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/30" />
        <button onClick={resetZoom} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors">
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Title - Solid background */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-md px-4 py-2 rounded-full bg-gray-900 border border-white/20 shadow-lg">
        <p className="text-white text-sm font-medium truncate">{title || 'Diagram'}</p>
      </div>

      {/* Diagram Container - Theme-aware background */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden p-8"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div
          className={`rounded-xl p-6 shadow-2xl [&_svg]:max-w-full [&_svg]:h-auto ${
            isDarkMode 
              ? 'bg-slate-900 border border-purple-500/30' 
              : 'bg-white border border-gray-200'
          }`}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            transition: isDragging ? 'none' : 'transform 0.2s ease-out'
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
          onClick={() => scale === 1 && zoomIn()}
        />
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-6 right-6 z-50 text-white/40 text-xs hidden md:block">
        <span>ESC to close • Scroll to zoom • Drag to pan</span>
      </div>
    </div>
  )
}

// Mermaid Diagram Component with Lightbox
const MermaidDiagram = ({ code }) => {
  const containerRef = useRef(null)
  const uniqueId = useId().replace(/:/g, '-')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [theme, setTheme] = useState('light')
  
  // Parse title and description from code
  const diagramTitle = parseMermaidTitle(code)
  const diagramDescription = parseMermaidDescription(code)

  // Watch for theme changes
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark')
      setTheme(isDark ? 'dark' : 'light')
    }
    
    // Initial check
    checkTheme()
    
    // Watch for class changes on document element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkTheme()
        }
      })
    })
    
    observer.observe(document.documentElement, { attributes: true })
    
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const renderDiagram = async () => {
      try {
        const cleanCode = sanitizeMermaidCode(code)
        
        // Use theme state instead of direct DOM check
        const isDarkMode = theme === 'dark'
        
        const mermaid = (await import('mermaid')).default
        
        // Comprehensive purple-only theme - NO other colors allowed
        const themeConfig = isDarkMode ? {
          theme: 'dark',
          themeVariables: {
            // Core colors - all purple
            primaryColor: '#1e1b4b',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#7c3aed',
            secondaryColor: '#1e1b4b',
            secondaryTextColor: '#ffffff',
            secondaryBorderColor: '#7c3aed',
            tertiaryColor: '#1e1b4b',
            tertiaryTextColor: '#ffffff',
            tertiaryBorderColor: '#7c3aed',
            
            // Backgrounds
            background: '#0f172a',
            mainBkg: '#1e1b4b',
            nodeBkg: '#1e1b4b',
            nodeBorder: '#7c3aed',
            nodeTextColor: '#ffffff',
            lineColor: '#7c3aed',
            
            // Clusters
            clusterBkg: '#0f172a',
            clusterBorder: '#7c3aed',
            
            // Text
            titleColor: '#ffffff',
            textColor: '#ffffff',
            edgeLabelBackground: '#1e1b4b',
            
            // Mindmap fills (0-9) - all same color
            'fill0': '#1e1b4b', 'fill1': '#1e1b4b', 'fill2': '#1e1b4b',
            'fill3': '#1e1b4b', 'fill4': '#1e1b4b', 'fill5': '#1e1b4b',
            'fill6': '#1e1b4b', 'fill7': '#1e1b4b', 'fill8': '#1e1b4b', 'fill9': '#1e1b4b',
            
            // Sequence diagram
            actorBkg: '#1e1b4b', actorBorder: '#7c3aed', actorTextColor: '#ffffff',
            actorLineColor: '#7c3aed', signalColor: '#7c3aed', signalTextColor: '#ffffff',
            labelBoxBkgColor: '#1e1b4b', labelBoxBorderColor: '#7c3aed',
            labelTextColor: '#ffffff', loopTextColor: '#ffffff',
            activationBorderColor: '#7c3aed', activationBkgColor: '#312e81',
            
            // Notes
            noteBkgColor: '#312e81', noteTextColor: '#ffffff', noteBorderColor: '#7c3aed',
            
            // Class diagram - override defaults
            classText: '#ffffff',
            
            // State diagram
            labelColor: '#ffffff',
            altBackground: '#1e1b4b',
            
            // Gantt - override crit/done colors
            critBkgColor: '#312e81', critBorderColor: '#7c3aed',
            doneTaskBkgColor: '#1e1b4b', doneTaskBorderColor: '#7c3aed',
            activeTaskBkgColor: '#312e81', activeTaskBorderColor: '#7c3aed',
            taskBkgColor: '#1e1b4b', taskBorderColor: '#7c3aed', taskTextColor: '#ffffff',
            sectionBkgColor: '#0f172a', sectionBkgColor2: '#1e1b4b',
            gridColor: '#7c3aed', todayLineColor: '#a78bfa',
            
            // Pie chart
            pie1: '#7c3aed', pie2: '#8b5cf6', pie3: '#a78bfa', pie4: '#c4b5fd',
            pie5: '#6d28d9', pie6: '#5b21b6', pie7: '#4c1d95', pie8: '#312e81',
            pieStrokeColor: '#1e1b4b', pieLegendTextColor: '#ffffff',
            
            // Journey
            fillType0: '#1e1b4b', fillType1: '#1e1b4b', fillType2: '#1e1b4b',
            fillType3: '#1e1b4b', fillType4: '#1e1b4b', fillType5: '#1e1b4b',
            fillType6: '#1e1b4b', fillType7: '#1e1b4b',
            
            fontFamily: 'Inter, system-ui, sans-serif',
          }
        } : {
          theme: 'default',
          themeVariables: {
            // Core colors - all purple on white
            primaryColor: '#ffffff',
            primaryTextColor: '#5b21b6',
            primaryBorderColor: '#7c3aed',
            secondaryColor: '#ffffff',
            secondaryTextColor: '#5b21b6',
            secondaryBorderColor: '#7c3aed',
            tertiaryColor: '#ffffff',
            tertiaryTextColor: '#5b21b6',
            tertiaryBorderColor: '#7c3aed',
            
            // Backgrounds
            background: '#ffffff',
            mainBkg: '#ffffff',
            nodeBkg: '#ffffff',
            nodeBorder: '#7c3aed',
            nodeTextColor: '#5b21b6',
            lineColor: '#7c3aed',
            
            // Clusters
            clusterBkg: '#faf5ff',
            clusterBorder: '#7c3aed',
            
            // Text
            titleColor: '#4c1d95',
            textColor: '#5b21b6',
            edgeLabelBackground: '#ffffff',
            
            // Mindmap fills (0-9) - all white
            'fill0': '#ffffff', 'fill1': '#ffffff', 'fill2': '#ffffff',
            'fill3': '#ffffff', 'fill4': '#ffffff', 'fill5': '#ffffff',
            'fill6': '#ffffff', 'fill7': '#ffffff', 'fill8': '#ffffff', 'fill9': '#ffffff',
            
            // Sequence diagram
            actorBkg: '#ffffff', actorBorder: '#7c3aed', actorTextColor: '#5b21b6',
            actorLineColor: '#7c3aed', signalColor: '#7c3aed', signalTextColor: '#5b21b6',
            labelBoxBkgColor: '#ffffff', labelBoxBorderColor: '#7c3aed',
            labelTextColor: '#5b21b6', loopTextColor: '#5b21b6',
            activationBorderColor: '#7c3aed', activationBkgColor: '#ede9fe',
            
            // Notes
            noteBkgColor: '#faf5ff', noteTextColor: '#5b21b6', noteBorderColor: '#7c3aed',
            
            // Class diagram
            classText: '#5b21b6',
            
            // State diagram
            labelColor: '#5b21b6',
            altBackground: '#faf5ff',
            
            // Gantt - override crit/done colors to purple
            critBkgColor: '#ede9fe', critBorderColor: '#7c3aed',
            doneTaskBkgColor: '#faf5ff', doneTaskBorderColor: '#7c3aed',
            activeTaskBkgColor: '#ede9fe', activeTaskBorderColor: '#7c3aed',
            taskBkgColor: '#ffffff', taskBorderColor: '#7c3aed', taskTextColor: '#5b21b6',
            sectionBkgColor: '#faf5ff', sectionBkgColor2: '#ffffff',
            gridColor: '#7c3aed', todayLineColor: '#7c3aed',
            
            // Pie chart - purple shades only
            pie1: '#7c3aed', pie2: '#8b5cf6', pie3: '#a78bfa', pie4: '#c4b5fd',
            pie5: '#6d28d9', pie6: '#5b21b6', pie7: '#4c1d95', pie8: '#ede9fe',
            pieStrokeColor: '#ffffff', pieLegendTextColor: '#5b21b6',
            
            // Journey - all white/light purple
            fillType0: '#ffffff', fillType1: '#faf5ff', fillType2: '#ede9fe',
            fillType3: '#ffffff', fillType4: '#faf5ff', fillType5: '#ede9fe',
            fillType6: '#ffffff', fillType7: '#faf5ff',
            
            fontFamily: 'Inter, system-ui, sans-serif',
          }
        }

        mermaid.initialize({
          startOnLoad: false,
          ...themeConfig,
          flowchart: { 
            curve: 'basis', 
            padding: 20,
            htmlLabels: true,
            useMaxWidth: true,
          },
          sequence: {
            useMaxWidth: true,
            boxMargin: 10,
            mirrorActors: false,
          },
          pie: {
            useMaxWidth: true,
          },
          gantt: {
            useMaxWidth: true,
            barHeight: 30,
            fontSize: 12,
          },
          securityLevel: 'loose',
        })
        
        // Use unique ID for each render to avoid caching issues
        const renderId = `mermaid-${uniqueId}-${theme}-${Date.now()}`
        const { svg: renderedSvg } = await mermaid.render(renderId, cleanCode)
        setSvg(renderedSvg)
        setError(null)
      } catch (err) {
        console.error('Mermaid rendering error:', err)
        setError(err.message || 'Failed to render diagram')
      }
    }
    
    if (code) {
      renderDiagram()
    }
  }, [code, uniqueId, theme]) // Added theme dependency

  if (error) {
    return null
  }

  return (
    <>
      <figure className="my-8 group">
        <div 
          className="rounded-xl overflow-hidden border border-border shadow-lg cursor-zoom-in transition-all hover:shadow-xl hover:border-primary/30 bg-card"
          onClick={() => setIsOpen(true)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></div>
              <span className="text-xs font-medium text-muted-foreground truncate">
                {diagramTitle || 'Diagram'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
              Click to expand
            </span>
          </div>
          {/* Diagram Content */}
          <div 
            ref={containerRef}
            className="p-4 flex justify-center items-center overflow-x-auto custom-scrollbar [&_svg]:max-w-full [&_svg]:h-auto bg-card"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
        {/* Description Caption */}
        {diagramDescription && (
          <figcaption className="mt-3 px-4 text-sm text-muted-foreground italic text-center leading-relaxed" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
            {diagramDescription}
          </figcaption>
        )}
      </figure>

      {/* Lightbox Portal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <DiagramLightbox svg={svg} onClose={() => setIsOpen(false)} isDarkMode={theme === 'dark'} title={diagramTitle} />,
        document.body
      )}
    </>
  )
}

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const codeContent = cleanCodeContent(children)
  
  const [copied, setCopied] = useState(false)
  const isSingleLine = !codeContent.includes('\n') && codeContent.length < 80
  const isShortSnippet = !codeContent.includes('\n') && codeContent.length < 60

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Handle Mermaid diagrams
  if (language === 'mermaid') {
    return <MermaidDiagram code={codeContent} />
  }

  // Force inline style for actual inline code OR short snippets
  if (inline || isShortSnippet) {
    return (
      <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-mono text-sm border border-primary/20 break-words whitespace-pre-wrap align-middle" {...props}>
        {codeContent}
      </code>
    )
  }

  // "Single Line" Block
  if (isSingleLine) {
    return (
      <div className="relative group my-4 inline-block max-w-full align-middle w-full">
         <div className="absolute -top-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
             <button
            onClick={handleCopy}
            className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded shadow-sm hover:bg-primary/90 transition-colors"
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
        <code className={`block ${className} bg-zinc-50 dark:bg-[#0d1117] px-4 py-3 rounded-lg border border-border dark:border-white/10 shadow-sm font-mono text-sm leading-relaxed overflow-x-auto custom-scrollbar whitespace-pre-wrap break-words placeholder:break-all text-zinc-900 dark:text-zinc-100`} {...props}>
          {codeContent}
        </code>
      </div>
    )
  }

  return (
    <div className="relative group my-8 rounded-xl overflow-hidden border border-border dark:border-white/5 shadow-2xl bg-zinc-50 dark:bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 dark:bg-white/5 border-b border-border dark:border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm" />
          </div>
          {language && (
            <span className="ml-3 text-xs font-mono text-muted-foreground font-medium uppercase tracking-wider">
              {language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-200 dark:hover:bg-white/5"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                <span className="uppercase text-[10px] font-bold tracking-wider text-green-500">Copied</span>
              </>
            ) : (
              <span className="uppercase text-[10px] font-bold tracking-wider">Copy</span>
            )}
          </button>
        </div>
      </div>
      <div className="p-4 overflow-x-auto custom-scrollbar">
        <code className={`${className} font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100`} {...props}>
          {codeContent}
        </code>
      </div>
    </div>
  )
}

export default CodeBlock
