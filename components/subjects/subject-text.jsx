'use client'

// Text-formatting helpers for the subject workspace, extracted from
// app/(app)/subjects/[id]/page.js. Pure presentation/parsing logic —
// no page state involved.

import React from 'react'
import MarkdownComponents from '@/components/sub-components/MarkdownComponents'
import CodeBlock from '@/components/sub-components/CodeBlock'

export function buildSafeFilename(title, suffix, extension) {
  const base = (title || 'learnify')
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()

  return `${base || 'learnify'}_${suffix}.${extension}`
}

export async function exportBlob({ blob, filename, title, mimeType }) {
  if (typeof window === 'undefined') {
    return false
  }

  const file = typeof File !== 'undefined'
    ? new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' })
    : null

  if (navigator.share && navigator.canShare && file && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: title || filename,
      files: [file]
    })
    return true
  }

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return true
}

export function normalizeSubjectText(value) {
  const normalized = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/\t/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ ]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized
}

const SUBJECT_SECTION_PATTERN = /^(\d+)[.)]\s+(.+)$/
const SUBJECT_BULLET_PATTERN = /^(?:[-*]|•)\s+(.+)$/
const SUBJECT_NUMBERED_ITEM_PATTERN = /^\d+[\).\]-]?\s+(.+)$/
const SUBJECT_LABEL_PATTERN = /^([A-Za-z][A-Za-z0-9/&(),' -]{1,50}):\s*(.*)$/
const SUBJECT_LIST_LABEL_PATTERN = /^(topics?|modules?|chapters?|units?|subtopics?|concepts?|coverage|contents?|includes?|outline|steps?|skills?|tools?|prerequisites?|references?)$/i

function isCompactSubjectLine(line) {
  return Boolean(line) && line.length <= 100 && !/[.!?;:]$/.test(line)
}

function isSubjectHeadingLine(line) {
  return Boolean(line)
    && line.length <= 80
    && !SUBJECT_LABEL_PATTERN.test(line)
    && !SUBJECT_BULLET_PATTERN.test(line)
    && !SUBJECT_NUMBERED_ITEM_PATTERN.test(line)
    && !/[.!?]$/.test(line)
}

function splitSubjectSections(value) {
  const normalized = normalizeSubjectText(value)
  if (!normalized) {
    return { introLines: [], sections: [] }
  }

  const introLines = []
  const sections = []
  let currentSection = null

  normalized.split('\n').forEach((line) => {
    const sectionMatch = line.match(SUBJECT_SECTION_PATTERN)

    if (sectionMatch) {
      currentSection = {
        title: sectionMatch[2].trim(),
        lines: []
      }
      sections.push(currentSection)
      return
    }

    if (currentSection) {
      currentSection.lines.push(line)
      return
    }

    introLines.push(line)
  })

  return { introLines, sections }
}

function buildSubjectContentNodes(lines) {
  const nodes = []
  let paragraphBuffer = []
  let activeList = null

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return
    }

    nodes.push({
      type: 'paragraph',
      content: paragraphBuffer.join(' ')
    })
    paragraphBuffer = []
  }

  const flushList = () => {
    if (!activeList || activeList.items.length === 0) {
      activeList = null
      return
    }

    nodes.push(activeList)
    activeList = null
  }

  const openList = ({ title = '', ordered = false }) => {
    if (
      activeList
      && activeList.ordered === ordered
      && (activeList.title || '') === (title || '')
    ) {
      return
    }

    flushParagraph()
    flushList()
    activeList = {
      type: 'list',
      title,
      ordered,
      items: []
    }
  }

  const addListItem = (item) => {
    if (!activeList) {
      openList({ ordered: false })
    }

    activeList.items.push(item)
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || '').trim()
    const nextLine = String(lines[index + 1] || '').trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const labelMatch = line.match(SUBJECT_LABEL_PATTERN)
    if (labelMatch) {
      const label = labelMatch[1].trim()
      const inlineContent = labelMatch[2].trim()

      flushParagraph()
      flushList()

      if (inlineContent) {
        nodes.push({
          type: 'detail',
          label,
          content: inlineContent
        })
      } else if (SUBJECT_LIST_LABEL_PATTERN.test(label)) {
        activeList = {
          type: 'list',
          title: label,
          ordered: false,
          items: []
        }
      } else {
        nodes.push({
          type: 'heading',
          content: label
        })
      }
      continue
    }

    const bulletMatch = line.match(SUBJECT_BULLET_PATTERN)
    if (bulletMatch) {
      openList({
        title: activeList?.title || '',
        ordered: false
      })
      addListItem(bulletMatch[1].trim())
      continue
    }

    const numberedItemMatch = line.match(SUBJECT_NUMBERED_ITEM_PATTERN)
    if (numberedItemMatch) {
      openList({
        title: activeList?.title || '',
        ordered: true
      })
      addListItem(numberedItemMatch[1].trim())
      continue
    }

    if (activeList && activeList.title) {
      addListItem(line)
      continue
    }

    if (isCompactSubjectLine(line) && isCompactSubjectLine(nextLine)) {
      openList({ ordered: false })
      addListItem(line)
      continue
    }

    if (isSubjectHeadingLine(line) && !nextLine.match(SUBJECT_SECTION_PATTERN)) {
      flushParagraph()
      flushList()
      nodes.push({
        type: 'heading',
        content: line
      })
      continue
    }

    flushList()
    paragraphBuffer.push(line)
  }

  flushParagraph()
  flushList()

  return nodes
}

function buildStructuredSubjectDocument(value) {
  const { introLines, sections } = splitSubjectSections(value)

  return {
    introNodes: buildSubjectContentNodes(introLines),
    sections: sections.map((section, index) => ({
      number: index + 1,
      title: section.title,
      nodes: buildSubjectContentNodes(section.lines)
    }))
  }
}

function renderSubjectContentNodes(nodes, scopeKey) {
  return nodes.map((node, index) => {
    if (node.type === 'heading') {
      return (
        <h4
          key={`${scopeKey}-heading-${index}`}
          className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/65 break-words"
        >
          {node.content}
        </h4>
      )
    }

    if (node.type === 'detail') {
      return (
        <div
          key={`${scopeKey}-detail-${index}`}
          className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 shadow-sm"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
            {node.label}
          </div>
          <p className="mt-2 break-words text-sm leading-7 text-muted-foreground md:text-[15px]">
            {node.content}
          </p>
        </div>
      )
    }

    if (node.type === 'list') {
      const ListTag = node.ordered ? 'ol' : 'ul'

      return (
        <div
          key={`${scopeKey}-list-${index}`}
          className="rounded-2xl border border-border/40 bg-background/35 px-4 py-4"
        >
          {node.title ? (
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
              {node.title}
            </div>
          ) : null}
          <ListTag
            className={
              node.ordered
                ? 'space-y-2 pl-5 text-sm leading-7 text-muted-foreground marker:font-semibold marker:text-primary md:text-[15px]'
                : 'space-y-2 pl-5 text-sm leading-7 text-muted-foreground marker:text-primary md:text-[15px] list-disc'
            }
          >
            {node.items.map((item, itemIndex) => (
              <li key={`${scopeKey}-list-item-${index}-${itemIndex}`} className="break-words pl-1">
                {item}
              </li>
            ))}
          </ListTag>
        </div>
      )
    }

    return (
      <p
        key={`${scopeKey}-paragraph-${index}`}
        className="break-words text-sm leading-7 text-muted-foreground md:text-[15px]"
      >
        {node.content}
      </p>
    )
  })
}

export function FormattedSubjectText({ value }) {
  const document = buildStructuredSubjectDocument(value)
  const hasSections = document.sections.length > 0

  return (
    <div className="max-w-full space-y-5 overflow-hidden">
      {document.introNodes.length > 0 ? (
        <div className="space-y-3 rounded-[22px] border border-border/50 bg-gradient-to-br from-background to-accent/15 px-4 py-4 shadow-sm md:px-5">
          {renderSubjectContentNodes(document.introNodes, 'subject-intro')}
        </div>
      ) : null}

      {hasSections ? (
        <div className="space-y-4">
          {document.sections.map((section) => (
            <section
              key={`subject-section-${section.number}`}
              className="rounded-[24px] border border-border/60 bg-gradient-to-br from-background via-background to-accent/20 px-4 py-4 shadow-sm md:px-5"
            >
              <div className="flex items-start gap-3 md:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary shadow-sm">
                  {section.number}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-base font-semibold leading-snug text-foreground md:text-lg">
                    {section.title}
                  </h3>
                  {section.nodes.length > 0 ? (
                    <div className="mt-4 space-y-4 border-l border-border/60 pl-4 md:pl-5">
                      {renderSubjectContentNodes(section.nodes, `subject-section-${section.number}`)}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const noteMarkdownComponents = {
  ...MarkdownComponents,
  code: ({ node, inline, className, children, ...props }) => (
    <CodeBlock
      node={node}
      inline={inline}
      className={className}
      allowAddToNotes={false}
      {...props}
    >
      {children}
    </CodeBlock>
  ),
  blockquote: ({ node, ...props }) => {
    let color = 'blue'
    let found = false

    const processChildren = (children) => {
      return React.Children.map(children, child => {
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
    }

    const modifiedChildren = processChildren(props.children)

    const hlThemes = {
      blue: { border: 'border-blue-500', shadow: 'from-blue-500/10', shine: 'via-blue-400/10' },
      green: { border: 'border-emerald-500', shadow: 'from-emerald-500/10', shine: 'via-emerald-400/10' },
      purple: { border: 'border-purple-500', shadow: 'from-purple-500/10', shine: 'via-purple-400/10' },
      amber: { border: 'border-amber-500', shadow: 'from-amber-500/10', shine: 'via-amber-400/10' },
      rose: { border: 'border-rose-500', shadow: 'from-rose-500/10', shine: 'via-rose-400/10' }
    }
    const hlTheme = hlThemes[color] || hlThemes.blue

    return (
      <blockquote
        className={`not-prose my-3 pl-4 py-2 pr-4 rounded-r block border-l-4 ${hlTheme.border} bg-gradient-to-r ${hlTheme.shadow} to-transparent italic text-slate-700 dark:text-slate-300 shadow-sm relative overflow-hidden`}
      >
        <div className={`absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent ${hlTheme.shine} to-transparent animate-[shimmer_3s_infinite] opacity-50`} />
        <div className="relative z-10">
          {modifiedChildren}
        </div>
      </blockquote>
    )
  },
  input: ({ node, ...props }) => (
    <input {...props} className="mr-2 accent-primary" />
  )
}
