'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

// Fullscreen Image Lightbox Component with Zoom
export default function ImageLightbox({ src, alt, onClose }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  
  // Use refs for mutable values during gestures to avoid stale closures in event handlers
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const initialDistance = useRef(null)
  const initialScale = useRef(1)
  const lastScale = useRef(1) // Keep track of scale for synchronous updates
  const lastPosition = useRef({ x: 0, y: 0 }) // Keep track of position

  const minScale = 0.5
  const maxScale = 4

  // Sync refs with state when state changes programmatically (e.g. buttons)
  useEffect(() => {
    lastScale.current = scale
  }, [scale])

  useEffect(() => {
    lastPosition.current = position
  }, [position])

  // Handle keyboard events and prevent scroll
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
    // We add non-passive listeners to document to be absolutely sure we stop scrolling
    document.addEventListener('wheel', preventScroll, { passive: false })
    document.addEventListener('touchmove', preventScroll, { passive: false })
    
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = 'hidden'
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('wheel', preventScroll)
      document.removeEventListener('touchmove', preventScroll)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const zoomIn = useCallback(() => {
    const newScale = Math.min(lastScale.current + 0.5, maxScale)
    setScale(newScale)
  }, [])

  const zoomOut = useCallback(() => {
    const newScale = Math.max(lastScale.current - 0.5, minScale)
    setScale(newScale)
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    initialDistance.current = null
  }, [])

  // Handle wheel zoom (event already prevented by document listener)
  const handleWheel = useCallback((e) => {
    // Check if it's a pinch gesture on trackpad (ctrlKey is often true for trackpad pinch)
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.01;
        const newScale = Math.min(Math.max(lastScale.current + delta, minScale), maxScale)
        setScale(newScale)
    } else {
        const delta = e.deltaY > 0 ? -0.2 : 0.2
        const newScale = Math.min(Math.max(lastScale.current + delta, minScale), maxScale)
        setScale(newScale)
    }
  }, [])

  // Handle drag to pan
  const handleMouseDown = (e) => {
    if (lastScale.current > 1) {
      isDragging.current = true
      dragStart.current = { x: e.clientX - lastPosition.current.x, y: e.clientY - lastPosition.current.y }
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging.current && lastScale.current > 1) {
        const newX = e.clientX - dragStart.current.x
        const newY = e.clientY - dragStart.current.y
        setPosition({ x: newX, y: newY })
    }
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  // Calculate distance between two touch points
  const getDistance = (touches) => {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    )
  }

  // Handle touch events for mobile (Pan & Pinch-to-Zoom)
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      // Pinch started
      const distance = getDistance(e.touches)
      initialDistance.current = distance
      initialScale.current = lastScale.current
      isDragging.current = false // Disable dragging during pinch
    } else if (e.touches.length === 1 && lastScale.current > 1) {
      // Pan started
      isDragging.current = true
      dragStart.current = { 
        x: e.touches[0].clientX - lastPosition.current.x, 
        y: e.touches[0].clientY - lastPosition.current.y 
      }
    }
  }

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && initialDistance.current !== null) {
      // Pinching
      const distance = getDistance(e.touches)
      const ratio = distance / initialDistance.current
      const newScale = Math.min(Math.max(initialScale.current * ratio, minScale), maxScale)
      setScale(newScale)
    } else if (isDragging.current && lastScale.current > 1 && e.touches.length === 1) {
      // Panning
      const newX = e.touches[0].clientX - dragStart.current.x
      const newY = e.touches[0].clientY - dragStart.current.y
      setPosition({ x: newX, y: newY })
    }
  }

  const handleTouchEnd = (e) => {
    // If fewer than 2 touches, reset pinch state
    if (e.touches.length < 2) {
      initialDistance.current = null
    }
    // If no touches left, stop dragging
    if (e.touches.length === 0) {
      isDragging.current = false
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] touch-none"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Close Button - Solid background for visibility */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 mt-[env(safe-area-inset-top)] mr-[env(safe-area-inset-right)] z-50 p-3 rounded-full bg-gray-900 hover:bg-gray-800 text-white transition-all hover:scale-110 border border-white/20 shadow-lg"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Zoom Controls - Solid dark background */}
      <div className="absolute bottom-6 mb-[env(safe-area-inset-bottom)] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 border border-white/20 shadow-lg">
        <button
          onClick={zoomOut}
          disabled={scale <= minScale}
          className="p-2 rounded-full hover:bg-white/10 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-mono min-w-[4ch] text-center font-medium">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={scale >= maxScale}
          className="p-2 rounded-full hover:bg-white/10 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/30" />
        <button
          onClick={resetZoom}
          className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
          aria-label="Reset zoom"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Alt text - Solid background */}
      {alt && (
        <div className="absolute top-4 mt-[env(safe-area-inset-top)] left-1/2 -translate-x-1/2 z-50 max-w-md px-4 py-2 rounded-full bg-gray-900 border border-white/20 shadow-lg">
          <p className="text-white text-sm text-center truncate font-medium">{alt}</p>
        </div>
      )}

      {/* Image Container */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
      >
        <img
          src={src}
          alt={alt || 'Image'}
          className="max-w-[90vw] max-h-[85vh] object-contain select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'zoom-in',
            transition: isDragging.current || (initialDistance.current !== null) ? 'none' : 'transform 0.2s ease-out'
          }}
          draggable={false}
          onClick={(e) => {
             e.stopPropagation(); // prevent closing when clicking image
             if(scale === 1) zoomIn();
          }}
        />
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-6 mb-[env(safe-area-inset-bottom)] right-6 mr-[env(safe-area-inset-right)] z-50 text-white/40 text-xs hidden md:block">
        <span>ESC to close • Scroll to zoom • Drag to pan</span>
      </div>
    </div>
  )
}
