import { generateTextWithFallback } from './generate.js'

/**
 * Server-side mermaid validation + AI self-repair (Phase 3.3).
 *
 * Diagrams are validated at GENERATION time, before content is saved.
 * Invalid diagrams get up to MAX_REPAIR_ATTEMPTS fix passes where the model
 * sees the exact parser error; anything still broken is dropped from the
 * content. The client never receives a diagram that failed to parse, so no
 * error state can leak into lessons.
 *
 * mermaid needs a DOM even for parse(); a shared jsdom instance provides it.
 */

const MAX_REPAIR_ATTEMPTS = 2
const MERMAID_BLOCK_REGEX = /```mermaid[^\S\n]*\n([\s\S]*?)```/g

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
    await mermaid.parse(code)
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
 * Deterministically fix the constructs that pass mermaid.parse() but break
 * client-side mermaid.render() — the source of "Diagram unavailable" fallbacks.
 *
 * Server-side render()-based validation is impossible here (jsdom lacks
 * SVGElement.getBBox), so parse() alone can't catch these. We normalize them
 * before validating/storing so what reaches the client is render-safe:
 *   - literal newlines inside quoted labels  -> <br>
 *   - HTML formatting tags (except <br>)     -> stripped (keeps inner text)
 *   - nested double quotes inside a label     -> inner quotes become single
 */
export function normalizeMermaidCode(code) {
  const lines = code.split('\n')
  const titleLines = lines.filter((l) => /^%%(title|desc):/.test(l.trim()))
  let body = lines.filter((l) => !/^%%(title|desc):/.test(l.trim())).join('\n')

  // 1. Strip HTML formatting tags but keep <br>/<br/> (keeps inner text).
  body = body.replace(/<\/?(?:b|strong|i|em|u|span|div|p|code|small|mark)\b[^>]*>/gi, '')

  // 2. Inside simple double-quoted label spans (no nested quotes), convert real
  //    newlines to <br>. [^"] matches newlines, so this spans multi-line labels.
  //    Spans with nested quotes are intentionally left untouched — auto-fixing
  //    them risks corrupting structure, so they degrade to the graceful client
  //    fallback instead (prevention handled in the generation prompt).
  body = body.replace(/"([^"]*)"/g, (m, inner) =>
    inner.includes('\n') ? '"' + inner.replace(/\r/g, '').replace(/\n+/g, '<br>') + '"' : m
  )

  return [...titleLines, body].join('\n').trim()
}

async function repairDiagram(code, parseError, { userSecrets }) {
  const fixed = await generateTextWithFallback({
    system:
      'You fix Mermaid diagram syntax errors. Reply with ONLY the corrected mermaid code — no markdown fences, no commentary. Preserve the diagram\'s meaning, %%title: and %%desc: comment lines, and diagram type. Quote node labels that contain parentheses or special characters, e.g. A["Label (text)"].',
    prompt: `This mermaid diagram fails to parse.\n\nPARSER ERROR:\n${parseError}\n\nDIAGRAM:\n${code}\n\nReturn only the fixed mermaid code.`,
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
 * Validate every mermaid block in `markdown`; self-repair invalid ones via
 * the model, and drop any block that still fails so broken diagrams never
 * reach the client.
 *
 * @returns {Promise<{content: string, stats: {total: number, valid: number, repaired: number, dropped: number}}>}
 */
export async function ensureValidMermaid(markdown, { userSecrets = null } = {}) {
  const blocks = extractMermaidBlocks(markdown)
  const stats = { total: blocks.length, valid: 0, repaired: 0, dropped: 0 }
  let content = markdown

  for (const block of blocks) {
    // Normalize render-breakers first, then re-anchor the block to the
    // normalized code so the stored/rendered version matches what we validate.
    const normalized = normalizeMermaidCode(block.code)
    if (normalized !== block.code) {
      content = content.replace(block.full, '```mermaid\n' + normalized + '\n```')
      block.full = '```mermaid\n' + normalized + '\n```'
      block.code = normalized
    }

    const initial = await validateMermaid(block.code)
    if (initial.valid) {
      stats.valid += 1
      continue
    }

    let repairedCode = null
    let lastError = initial.error

    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
      try {
        const candidate = await repairDiagram(
          repairedCode ?? block.code,
          lastError,
          { userSecrets }
        )
        const check = await validateMermaid(candidate)
        if (check.valid) {
          repairedCode = candidate
          break
        }
        repairedCode = candidate
        lastError = check.error
        if (attempt === MAX_REPAIR_ATTEMPTS) {
          repairedCode = null
        }
      } catch (error) {
        console.warn(`[Mermaid] Repair attempt ${attempt} failed:`, error?.message)
        repairedCode = null
        break
      }
    }

    if (repairedCode) {
      stats.repaired += 1
      content = content.replace(block.full, '```mermaid\n' + repairedCode + '\n```')
      console.log('[Mermaid] Repaired invalid diagram')
    } else {
      stats.dropped += 1
      content = content.replace(block.full, '')
      console.warn(`[Mermaid] Dropped unrepairable diagram (${String(lastError).slice(0, 120)})`)
    }
  }

  return { content: content.replace(/\n{3,}/g, '\n\n'), stats }
}
