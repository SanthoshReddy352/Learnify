// Canonical Mermaid text transforms — shared by the SERVER validator
// (lib/ai/mermaid.js) and the CLIENT renderer (components/sub-components/CodeBlock.jsx).
//
// WHY THIS MODULE EXISTS:
//
// These transforms used to live only in CodeBlock.jsx. The server validated raw
// model output with mermaid.parse(), the client rendered a heavily rewritten
// version of that same code with mermaid.render(), and the two never agreed —
// so the server happily signed off on code that the client could not draw, and
// "Diagram unavailable" appeared in lessons that had passed validation.
//
// Rule to preserve: whatever the client is about to hand to mermaid.render(),
// the server must have handed the identical string to mermaid.parse(). That is
// what `prepareMermaidCode` is — call it on both sides, never re-implement it.
//
// This file must stay dependency-free and isomorphic (no node builtins, no DOM):
// it is imported into a 'use client' component and into server-only code.

// --- Title / description ---------------------------------------------------

// Diagrams carry their caption inline as `%%title:` / `%%desc:` comment lines so
// the metadata survives being copied around as plain markdown. They are stripped
// before rendering and surfaced as the figure caption + a11y label instead.

export const parseMermaidTitle = (code) => {
  const m = String(code || '').match(/^%%title:\s*(.+)$/m)
  return m ? m[1].trim() : null
}

export const parseMermaidDescription = (code) => {
  const m = String(code || '').match(/^%%desc:\s*(.+)$/m)
  return m ? m[1].trim() : null
}

// --- Fenced-block repair ---------------------------------------------------

const FENCE_OPEN = /^(\s*)(`{3,})[^\S\n]*([A-Za-z0-9_+-]*)[^\S\n]*$/
const FENCE_CLOSE = /^\s*(`{3,})\s*$/
// A markdown ATX heading. Mermaid has no line-initial `#` construct (its
// comments are `%%`), so a heading inside a mermaid fence is proof the model
// forgot the closing fence rather than proof of an exotic diagram.
const MARKDOWN_HEADING = /^\s{0,3}#{1,6}\s+\S/

/**
 * Close mermaid fences the model forgot to terminate.
 *
 * This is the highest-value fix in the whole diagram pipeline, because an
 * unterminated fence defeats every downstream guard at once:
 *
 *   - the extractor's regex requires a closing fence, so the block is never
 *     found, never validated, never repaired and never dropped;
 *   - the markdown renderer then treats everything to EOF as diagram source,
 *     so the broken diagram eats the remainder of the lesson body.
 *
 * The observed failure looked like `Parse error ... "]## Key Roles in the Hac` —
 * a section heading swallowed into the diagram.
 *
 * Only `mermaid` fences are early-closed on a heading; other languages (a
 * markdown or shell sample) can legitimately contain `#` at line start, so for
 * those we only close a fence still open at EOF.
 */
export function repairMarkdownFences(markdown) {
  const lines = String(markdown || '').split('\n')
  const out = []

  let openFence = null // { backticks, lang, indent }

  for (const line of lines) {
    if (!openFence) {
      const open = line.match(FENCE_OPEN)
      if (open) {
        openFence = { backticks: open[2], lang: (open[3] || '').toLowerCase(), indent: open[1] }
      }
      out.push(line)
      continue
    }

    // Inside a fence: a bare run of >= as many backticks closes it.
    const close = line.match(FENCE_CLOSE)
    if (close && close[1].length >= openFence.backticks.length) {
      openFence = null
      out.push(line)
      continue
    }

    // Inside a MERMAID fence, a markdown heading means the fence was never
    // closed. Close it immediately before the heading and resume prose.
    if (openFence.lang === 'mermaid' && MARKDOWN_HEADING.test(line)) {
      out.push(openFence.backticks)
      out.push('')
      openFence = null
      out.push(line)
      continue
    }

    out.push(line)
  }

  // Still open at EOF — terminate it so the block is at least extractable.
  if (openFence) out.push(openFence.backticks)

  return out.join('\n')
}

/**
 * Run `fn` over the text OUTSIDE fenced code blocks only.
 *
 * Prose-level cleanups must not reach into diagram source. `<br>` is the
 * motivating case: the generation prompt instructs the model to use `<br>` for
 * line breaks inside mermaid labels, and a document-wide `<br>` -> newline
 * rewrite turned every one of those into a literal newline — which is exactly
 * the construct mermaid cannot parse. The cleanup was breaking the diagrams the
 * prompt had carefully asked for.
 */
export function mapOutsideFences(markdown, fn) {
  const lines = String(markdown || '').split('\n')
  const out = []
  let openFence = null

  for (const line of lines) {
    if (openFence) {
      const close = line.match(FENCE_CLOSE)
      if (close && close[1].length >= openFence.length) openFence = null
      out.push(line)
      continue
    }
    const open = line.match(FENCE_OPEN)
    if (open) {
      openFence = open[2]
      out.push(line)
      continue
    }
    out.push(fn(line))
  }

  return out.join('\n')
}

// --- Syntax normalization --------------------------------------------------

// Trim, flatten newlines, and demote double quotes so a label is safe to wrap
// in double quotes.
const formatLabel = (label) => String(label).trim().replace(/[\r\n]+/g, ' ').replace(/"/g, "'")

/**
 * Quote unsafe node labels, drop unsupported constructs, and strip author
 * styling so diagrams inherit the app theme.
 *
 * Shape rewrites are applied ONLY to flowchart-family diagrams: `(`, `[` and
 * `{` mean different things in sequence/class/ER grammars, and rewriting them
 * there corrupts valid source.
 */
export function sanitizeMermaidCode(code) {
  let result = String(code || '')

  // Title/description are rendered as a caption, not as diagram source.
  result = result.replace(/^%%title:.*$/gm, '')
  result = result.replace(/^%%desc:.*$/gm, '')

  const firstDiagramLine = result
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  const isFlowchartLike = /^(flowchart|graph)\b/i.test(firstDiagramLine || '')
  const isClassDiagram = /^classDiagram\b/i.test(firstDiagramLine || '')

  if (isFlowchartLike) {
    // Each rule: an unquoted label containing a character that would otherwise
    // terminate the shape, rewritten into a quoted label of the same shape.
    // Ordered most-specific shape first so `[[..]]` is not eaten by `[..]`.

    // Subroutine [[Label]]
    result = result.replace(/(\w+)\[\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]\]/g,
      (m, id, label) => `${id}[["${formatLabel(label)}"]]`)

    // Cylinder [(Label)]
    result = result.replace(/(\w+)\[\(([^)"]*[()&<>#@!, \s][^)"]*)\)\]/g,
      (m, id, label) => `${id}[("${formatLabel(label)}")]`)

    // Stadium ([Label])
    result = result.replace(/(\w+)\(\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]\)/g,
      (m, id, label) => `${id}(["${formatLabel(label)}"])`)

    // Trapezoid [/Label\]
    result = result.replace(/(\w+)\[\/([^\/\\\]"]*[()&<>#@!, \s][^\/\\\]"]*)\\]/g,
      (m, id, label) => `${id}[/"${formatLabel(label)}"\\]`)

    // Inverted trapezoid [\Label/]
    result = result.replace(/(\w+)\[\\([^\\\]"]*[()&<>#@!, \s][^\\\]"]*)\/\]/g,
      (m, id, label) => `${id}[\\"${formatLabel(label)}"/]`)

    // Parallelogram [/Label/]
    result = result.replace(/(\w+)\[\/([^\/\]"]*[()&<>#@!, \s][^\/\]"]*)\/\]/g,
      (m, id, label) => `${id}[/"${formatLabel(label)}"/]`)

    // Parallelogram alt [\Label\]
    result = result.replace(/(\w+)\[\\([^\\\]"]*[()&<>#@!, \s][^\\\]"]*)\\]/g,
      (m, id, label) => `${id}[\\"${formatLabel(label)}"\\]`)

    // Triple circle (((Label)))
    result = result.replace(/(\w+)\(\(\(([^)"]*[()&<>#@!, \s][^)"]*)\)\)\)/g,
      (m, id, label) => `${id}((("${formatLabel(label)}")))`)

    // Hexagon {{Label}}
    result = result.replace(/(\w+)\{\{([^}"]*[()&<>#@!, \s][^}"]*)\}\}/g,
      (m, id, label) => `${id}{{"${formatLabel(label)}"}}`)

    // Circle ((Label))
    result = result.replace(/(\w+)\(\(([^)"]*[()&<>#@!, \s][^)"]*)\)\)/g,
      (m, id, label) => `${id}(("${formatLabel(label)}"))`)

    // Stadium with nested parens — no faithful shape, degrade to a rectangle.
    result = result.replace(/(\w+)\(([^)(]*\([^)]*\)[^)(]*)\)/g,
      (m, id, label) => `${id}["${formatLabel(label)}"]`)

    // Rectangle [Label]
    result = result.replace(/(\w+)\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]/g,
      (m, id, label) => `${id}["${formatLabel(label)}"]`)

    // Rhombus {Label}
    result = result.replace(/(\w+)\{([^}"]*[()&<>#@!, \s][^}"]*)\}/g,
      (m, id, label) => `${id}{"${formatLabel(label)}"}`)

    // Asymmetric >Label]
    result = result.replace(/(\w+)>([^\]"]*[()&<>#@!, \s][^\]"]*)\]/g,
      (m, id, label) => `${id}>"${formatLabel(label)}"]`)

    // Simple stadium (Label)
    result = result.replace(/(\w+)\(([^)()"]*[&<>#@!, \s][^)()"]*)\)/g,
      (m, id, label) => `${id}("${formatLabel(label)}")`)

    // Subgraph titles
    result = result.replace(/^(\s*subgraph\s+)(\w+)\s*\(([^)]+)\)\s*$/gm,
      (m, prefix, id, label) => `${prefix}${id}["${formatLabel(label)}"]`)
    result = result.replace(/^(\s*subgraph\s+)([A-Za-z_][A-Za-z0-9_]*)\s+([^"\[\n][^\n]*[^\s])\s*$/gm,
      (m, prefix, id, label) => `${prefix}${id}["${formatLabel(label)}"]`)

    // Edge labels
    result = result.replace(/(\-\->|\-\-|\.\.>|==>)\|([^|]*[()&<> \s][^|]*)\|/g,
      (m, arrow, label) => `${arrow}|"${formatLabel(label)}"|`)
  }

  if (isClassDiagram) {
    // Class diagrams require an explicit `class` keyword for a standalone
    // labeled declaration.
    result = result.replace(
      /^(\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*(\[(?:"[^"]*"|`[^`]*`)\])\s*$/gm,
      (m, indent, id, label) => `${indent}class ${id}${label}`
    )
  }

  // Comments.
  result = result.replace(/;\s*%[^%\n].*$/gm, ';')
  result = result.replace(/;\s*%%.*$/gm, ';')
  result = result.replace(/(\-\->|\-\-|==>|\.\.>)\s*%[^%\n].*$/gm, '$1')
  result = result.replace(/^\s*%[^%].*$/gm, '')

  if (isFlowchartLike) {
    // Malformed arrows.
    result = result.replace(/\-\-\s*\-\->/g, '-->')
    result = result.replace(/\-\s+\->/g, '-->')
    result = result.replace(/=\s+=>/g, '==>')
  }

  // Constructs mermaid has no grammar for.
  result = result.replace(/^\s*enum\s+\w+\s*\{[^}]*\}/gm, '')

  // Author styling — diagrams follow the app theme, so these are dropped
  // rather than honored.
  result = result.replace(/^\s*style\s+.*$/gm, '')
  result = result.replace(/^\s*classDef\s+.*$/gm, '')
  result = result.replace(/:::\s*[a-zA-Z0-9_-]+/g, '')
  result = result.replace(/^\s*linkStyle\s+.*$/gm, '')

  result = result.replace(/\n\s*\n\s*\n/g, '\n\n')

  return result.trim()
}

/**
 * Fix the constructs that survive `sanitizeMermaidCode` and still break
 * `mermaid.render()`:
 *   - HTML formatting tags in labels (only <br> is safe)
 *   - literal newlines inside a quoted label
 *   - nested double quotes inside a [..] / {..} label
 */
export function fixMermaidRenderBreakers(code) {
  let out = String(code || '')

  // 1. Strip HTML formatting tags, keep <br>/<br/>.
  out = out.replace(/<\/?(?:b|strong|i|em|u|span|div|p|code|small|mark)\b[^>]*>/gi, '')

  // 2. Literal newlines inside a simple double-quoted span -> <br>.
  //    [^"] matches newlines, so this spans multi-line labels.
  out = out.replace(/"([^"]*)"/g, (m, inner) =>
    inner.includes('\n') ? '"' + inner.replace(/\r/g, '').replace(/\n+/g, '<br>') + '"' : m
  )

  // 3. Nested double quotes inside a single [..] or {..} label -> single quotes.
  //    Scoped to one bracket group (no nested brackets), so the structural
  //    quotes of other nodes are never touched. Parens are left alone —
  //    stadium/circle shapes use them as delimiters.
  const demoteInner = (open, close) => {
    const re = new RegExp(`\\${open}([^\\${open}\\${close}]*)\\${close}`, 'g')
    out = out.replace(re, (m, inner) => {
      const t = inner.trim()
      if (t.startsWith('"') && t.endsWith('"') && t.length > 1) {
        const body = inner.slice(inner.indexOf('"') + 1, inner.lastIndexOf('"'))
        if (body.includes('"')) return `${open}"${body.replace(/"/g, "'")}"${close}`
      }
      return m
    })
  }
  demoteInner('[', ']')
  demoteInner('{', '}')

  return out
}

/**
 * THE canonical "diagram source -> renderable source" transform.
 *
 * The server validates this exact output with mermaid.parse(); the client hands
 * this exact output to mermaid.render(). Call it on both sides — the two must
 * never drift apart again.
 */
export function prepareMermaidCode(code) {
  return fixMermaidRenderBreakers(sanitizeMermaidCode(code))
}
