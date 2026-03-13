'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import CodeBlock from '@/components/sub-components/CodeBlock'
import ImageLightbox from '@/components/sub-components/ImageLightbox'

// Clickable Image Component with Lightbox
const ContentImage = ({ src, alt, ...props }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [imageError, setImageError] = useState(false)

  if (imageError) {
    return null // Don't render broken images
  }

  return (
    <>
      <figure className="my-8 group">
        <div 
          className="relative rounded-xl overflow-hidden border border-border shadow-lg cursor-zoom-in transition-all hover:shadow-xl hover:border-primary/30 bg-neutral-100 dark:bg-neutral-900"
          onClick={() => setIsOpen(true)}
        >
          <img 
            src={src} 
            alt={alt || 'Educational image'}
            className="w-full object-contain max-h-[500px] p-2"
            onError={() => setImageError(true)}
            loading="lazy"
            {...props}
          />
          {/* Zoom indicator overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 dark:bg-white/20 text-white px-3 py-1.5 rounded-full text-sm backdrop-blur-sm">
              Click to expand
            </span>
          </div>
        </div>
        {alt && (
          <figcaption className="mt-2 text-center text-sm text-muted-foreground italic">
            {alt}
          </figcaption>
        )}
      </figure>

      {/* Lightbox Portal - renders at document root level, above everything */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <ImageLightbox 
          src={src} 
          alt={alt} 
          onClose={() => setIsOpen(false)} 
        />,
        document.body
      )}
    </>
  )
}

const MarkdownComponents = {
  h1: ({ node, ...props }) => (
    <h1 className="text-2xl md:text-3xl font-bold mt-6 md:mt-10 mb-4 md:mb-6 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent inline-block pb-2 border-b border-border w-full break-words" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <div className="flex items-center gap-2 mt-6 md:mt-8 mb-3 md:mb-4 group break-words">
      <div className="h-6 w-1 md:h-8 md:w-1 bg-primary rounded-full shrink-0" />
      <h2 className="text-lg md:text-2xl font-bold text-foreground m-0 p-0" {...props} />
    </div>
  ),
  h3: ({ node, ...props }) => (
    <h3 className="text-lg md:text-xl font-semibold mt-5 md:mt-6 mb-2 md:mb-3 text-foreground/90 pl-3 md:pl-4 border-l-2 border-primary/30 break-words" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="mb-4 md:mb-6 leading-relaxed text-muted-foreground text-base md:text-lg break-words" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="list-disc list-outside ml-4 md:ml-6 space-y-2 md:space-y-3 my-4 md:my-6 text-muted-foreground marker:text-primary" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="list-decimal list-outside ml-4 md:ml-6 space-y-2 md:space-y-3 my-4 md:my-6 text-muted-foreground marker:text-primary list-decimal" {...props} />
  ),
  li: ({ node, ...props }) => (
    <li className="[&>p]:!my-0 [&>p]:!inline pl-1 md:pl-0 break-words" {...props}>
      {props.children}
    </li>
  ),
  code: CodeBlock,
  pre: ({ node, ...props }) => (
    <div className="!bg-transparent !p-0 !m-0 !rounded-none !border-none !shadow-none !ring-0 overflow-visible" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote className="my-8 pl-6 border-l-4 border-primary bg-primary/5 py-4 pr-4 rounded-r-xl italic text-lg text-muted-foreground" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto my-8 rounded-xl border border-border shadow-lg">
      <table className="w-full text-left border-collapse bg-card" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="border-b border-border p-4 font-semibold text-foreground bg-muted/50" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border-b border-border/50 p-4 text-muted-foreground tabular-nums" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a className="text-primary hover:text-primary/80 transition-colors underline decoration-primary/30 underline-offset-4 hover:decoration-primary break-words" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  hr: ({ node, ...props }) => (
    <hr className="my-10 border-border" {...props} />
  ),
  img: ContentImage
}

export default MarkdownComponents

