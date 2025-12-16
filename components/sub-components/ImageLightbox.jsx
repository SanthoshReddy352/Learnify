'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

// Fullscreen Image Lightbox Component with Zoom
export default function ImageLightbox({ src, alt, onClose }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // Pinch-to-zoom state
  const [initialDistance, setInitialDistance] = useState(null)
  const [initialScale, setInitialScale] = useState(1)

  const minScale = 0.5
  const maxScale = 4

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
    setScale(prev => Math.min(prev + 0.5, maxScale))
  }, [])

  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.5, minScale))
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setInitialDistance(null)
  }, [])

  // Handle wheel zoom (event already prevented by document listener)
  const handleWheel = useCallback((e) => {
    // Check if it's a pinch gesture on trackpad (ctrlKey is often true for trackpad pinch)
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.01;
        setScale(prev => Math.min(Math.max(prev + delta, minScale), maxScale));
    } else {
        const delta = e.deltaY > 0 ? -0.2 : 0.2
        setScale(prev => Math.min(Math.max(prev + delta, minScale), maxScale))
    }
  }, [])

  // Handle drag to pan
  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
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
      setInitialDistance(distance)
      setInitialScale(scale)
      setIsDragging(false) // Disable dragging during pinch
    } else if (e.touches.length === 1 && scale > 1) {
      // Pan started
      setIsDragging(true)
      setDragStart({ 
        x: e.touches[0].clientX - position.x, 
        y: e.touches[0].clientY - position.y 
      })
    }
  }

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && initialDistance !== null) {
      // Pinching
      const distance = getDistance(e.touches)
      const ratio = distance / initialDistance
      const newScale = Math.min(Math.max(initialScale * ratio, minScale), maxScale)
      setScale(newScale)
    } else if (isDragging && scale > 1 && e.touches.length === 1) {
      // Panning
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      })
    }
  }

  const handleTouchEnd = (e) => {
    // If fewer than 2 touches, reset pinch state
    if (e.touches.length < 2) {
      setInitialDistance(null)
    }
    // If no touches left, stop dragging
    if (e.touches.length === 0) {
      setIsDragging(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <img
          src={src}
          alt={alt || 'Image'}
          className="max-w-[90vw] max-h-[85vh] object-contain select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            transition: isDragging || (initialDistance !== null) ? 'none' : 'transform 0.2s ease-out'
          }}
          draggable={false}
          onClick={() => scale === 1 && zoomIn()}
        />
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-6 mb-[env(safe-area-inset-bottom)] right-6 mr-[env(safe-area-inset-right)] z-50 text-white/40 text-xs hidden md:block">
        <span>ESC to close • Scroll to zoom • Drag to pan</span>
      </div>
    </div>
  )
}
