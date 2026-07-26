import { generateTextWithFallback } from './generate.js'
import { mapWithConcurrency } from './concurrency.js'
import {
  prepareMermaidCode,
  fixMermaidRenderBreakers,
  repairMarkdownFences
} from './mermaid-sanitize.js'

/**
 * Server-side mermaid validation + AI self-repair (Phase 3.3).
 *
 * Diagrams are validated at GENERATION time, before content is saved. Invalid
 * diagrams get up to MAX_REPAIR_ATTEMPTS fix passes where the model sees the
 * exact parser error; anything still broken is dropped from the content.
 *
 * TWO CORRECTNESS RULES THIS FILE EXISTS TO HOLD:
 *
 * 1. Validate what the client will actually render. The client rewrites diagram
 *    source (quoting labels, stripping styles) before calling mermaid.render().
 *    Validating the RAW model output instead meant the server was approving a
 *    different string than the one that had to draw — so lessons shipped with
 *    "Diagram unavailable" despite passing validation. Both sides now go
 *    through prepareMermaidCode() from ./mermaid-sanitize.js.
 *
 * 2. An unterminated fence must be repaired BEFORE extraction. The extractor
 *    needs a closing fence to find a block at all, so a fence the model forgot
 *    to close used to bypass validation, repair and dropping in one go — and
 *    then swallow the rest of the lesson into the diagram. repairMarkdownFences
 *    runs first, unconditionally.
 *
 * mermaid needs a DOM even for parse(); a shared jsdom instance provides it.
 */

const MAX_REPAIR_ATTEMPTS = 2
// Diagrams are validated/repaired concurrently; bounded for the same
// rate-limit reason as section writing (see lib/ai/concurrency.js).
const DIAGRAM_CONCURRENCY = 3
// The closing fence is optional so a block running to EOF is still extractable;
// repairMarkdownFences normally terminates those first, but extraction must not
// depend on that having succeeded.
const MERMAID_BLOCK_REGEX = /```mermaid[^\S\n]*\n([\s\S]*?)(?:```|$)/g

let mermaidPromise = null

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      const { JSDOM } = await import('jsdom')
      const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        pretendToBeVisual: true,
        url: 'https://localhost/'
      })
      const { window } = dom

      const assignGlobal = (key, value) => {
        if (globalThis[key]) return
        try {
          globalThis[key] = value
        } catch {
          try {
            Object.defineProperty(globalThis, key, { value, configurable: true })
          } catch {
            // best effort; mermaid may still work without it
          }
        }
      }

      assignGlobal('window', window)
      assignGlobal('document', window.document)
      assignGlobal('DOMParser', window.DOMParser)
      assignGlobal('navigator', window.navigator)
      assignGlobal('SVGElement', window.SVGElement)

      const mermaid = (await import('mermaid')).default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true
      })
      return mermaid
    })()
  }
  return mermaidPromise
}

/**
 * Validate a diagram the way the client will render it.
 *
 * @returns {Promise<{valid: boolean, error?: string, skipped?: boolean}>}
 * If the validator infrastructure itself fails to load, we fail OPEN
 * (skipped: true) — a broken validator must not block content generation.
 */
export async function validateMermaid(code) {
  let mermaid
  try {
    mermaid = await loadMermaid()
  } catch (error) {
    console.error('[Mermaid] Validator unavailable, skipping validation:', error?.message)
    return { valid: true, skipped: true }
  }

  try {
    // prepareMermaidCode, not the raw code: see rule 1 in the file header.
    await mermaid.parse(prepareMermaidCode(code))
    return { valid: true }
  } catch (error) {
    return { valid: false, error: String(error?.message || error).slice(0, 600) }
  }
}

/** Extract all ```mermaid fenced blocks from markdown. */
export function extractMermaidBlocks(markdown) {
  const blocks = []
  for (const match of String(markdown || '').matchAll(MERMAID_BLOCK_REGEX)) {
    blocks.push({ full: match[0], code: match[1].trim() })
  }
  return blocks
}

/**
 * Normalize a diagram for STORAGE.
 *
 * Distinct from prepareMermaidCode: this preserves the `%%title:` / `%%desc:`
 * lines, because the stored diagram carries its own caption and a11y label.
 * prepareMermaidCode strips them — they are not diagram source.
 */
export function normalizeMermaidCode(code) {
  const lines = String(code || '').split('\n')
  const isMeta = (l) => /^%%(title|desc):/.test(l.trim())
  const titleLines = lines.filter(isMeta)
  const body = fixMermaidRenderBreakers(lines.filter((l) => !isMeta(l)).join('\n'))
  return [...titleLines, body].join('\n').trim()
}

/**
 * Ask the model to fix one diagram, given the exact error it produced.
 *
 * Exported because this is also what powers the learner-facing Retry button
 * (app/api/repair-diagram/route.js): when a diagram fails in the browser, the
 * render error is strictly better repair input than anything the server saw,
 * so the same repair path is reused with that error instead.
 */
export async function repairDiagram(code, parseError, { userSecrets } = {}) {
  const fixed = await generateTextWithFallback({
    system:
      'You fix Mermaid diagram syntax errors. Reply with ONLY the corrected mermaid code — no markdown fences, no commentary. Preserve the diagram\'s meaning, %%title: and %%desc: comment lines, and diagram type. Quote node labels that contain parentheses or special characters, e.g. A["Label (text)"]. Use <br> for line breaks inside labels, never a literal newline. Never nest double quotes inside a quoted label.',
    prompt: `This mermaid diagram fails to render.\n\nERROR:\n${parseError}\n\nDIAGRAM:\n${code}\n\nReturn only the fixed mermaid code.`,
    temperature: 0.2,
    maxOutputTokens: 2000,
    userSecrets
  })

  return fixed
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

/**
 * Repair a diagram and confirm the result actually parses, retrying with the
 * new error each round. Returns null when it cannot be salvaged.
 *
 * Shared by generation-time validation and the on-demand Retry endpoint so both
 * apply the same attempt budget and the same "must validate before accepting"
 * rule.
 */
export async function repairUntilValid(code, initialError, { userSecrets = null, attempts = MAX_REPAIR_ATTEMPTS } = {}) {
  let candidate = code
  let lastError = initialError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      candidate = await repairDiagram(candidate, lastError, { userSecrets })
      const check = await validateMermaid(candidate)
      if (check.valid) return { code: candidate, attempts: attempt }
      lastError = check.error
    } catch (error) {
      console.warn(`[Mermaid] Repair attempt ${attempt} failed:`, error?.message)
      return { code: null, attempts: attempt, error: String(error?.message || error) }
    }
  }

  return { code: null, attempts, error: lastError }
}

/**
 * Validate every mermaid block in `markdown`; self-repair invalid ones via the
 * model, and drop any block that still fails so broken diagrams never reach the
 * client.
 *
 * @returns {Promise<{content: string, stats: {total: number, valid: number, repaired: number, dropped: number, fencesRepaired: boolean}}>}
 */
export async function ensureValidMermaid(markdown, { userSecrets = null } = {}) {
  // Rule 2: close unterminated fences before anything tries to find a block.
  const source = String(markdown || '')
  let content = repairMarkdownFences(source)
  const fencesRepaired = content !== source
  if (fencesRepaired) {
    console.warn('[Mermaid] Repaired an unterminated code fence in generated content')
  }

  const blocks = extractMermaidBlocks(content)
  const stats = { total: blocks.length, valid: 0, repaired: 0, dropped: 0, fencesRepaired }

  // Normalize every block first and re-anchor each to its normalized form, so
  // what gets stored and rendered is exactly what gets validated.
  for (const block of blocks) {
    const normalized = normalizeMermaidCode(block.code)
    if (normalized !== block.code) {
      const replacement = '```mermaid\n' + normalized + '\n```'
      content = content.replace(block.full, replacement)
      block.full = replacement
      block.code = normalized
    }
  }

  // Diagrams are independent, and a broken one costs up to two model
  // round-trips to repair. Serially that put several AI calls on the critical
  // path of every generation containing a bad diagram; concurrently it costs
  // roughly one diagram's worth of latency no matter how many are broken.
  const outcomes = await mapWithConcurrency(blocks, DIAGRAM_CONCURRENCY, async (block) => {
    const initial = await validateMermaid(block.code)
    if (initial.valid) return { block, status: 'valid' }

    const { code } = await repairUntilValid(block.code, initial.error, { userSecrets })
    return code
      ? { block, status: 'repaired', code }
      : { block, status: 'dropped' }
  })

  // Content rewriting stays sequential: it is a string replace over shared
  // state, so it must not interleave with the concurrent work above.
  for (const outcome of outcomes) {
    if (outcome.status === 'valid') {
      stats.valid += 1
    } else if (outcome.status === 'repaired') {
      stats.repaired += 1
      content = content.replace(outcome.block.full, '```mermaid\n' + outcome.code + '\n```')
      console.log('[Mermaid] Repaired invalid diagram')
    } else {
      stats.dropped += 1
      content = content.replace(outcome.block.full, '')
      console.warn('[Mermaid] Dropped unrepairable diagram')
    }
  }

  return { content: content.replace(/\n{3,}/g, '\n\n'), stats }
}
