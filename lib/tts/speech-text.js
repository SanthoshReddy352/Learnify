// Text preparation for TTS narration (Plan P7.1).
//
// Lesson content is markdown with code fences, mermaid diagrams, links and
// heading syntax — reading it verbatim would speak "hash hash", URLs, and code.
// These pure helpers turn markdown into clean speakable text and chunk it, so
// the Web Speech API (which mis-handles very long utterances) narrates smoothly.

// Strip markdown to plain, speakable text.
export function stripMarkdownForSpeech(markdown) {
  let t = String(markdown || '')

  // Fenced code / mermaid blocks — don't read code or diagram source aloud.
  t = t.replace(/```[\s\S]*?```/g, ' ')
  // Inline code → its text.
  t = t.replace(/`([^`]+)`/g, '$1')
  // Images → drop; links → their text.
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Headings → text with a sentence stop so the voice pauses.
  t = t.replace(/^#{1,6}\s+(.*)$/gm, '$1.')
  // Bold / italic markers.
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2')
  t = t.replace(/(\*|_)(.*?)\1/g, '$2')
  // Blockquote + list markers.
  t = t.replace(/^\s*>\s?/gm, '')
  t = t.replace(/^\s*[-*+]\s+/gm, '')
  t = t.replace(/^\s*\d+\.\s+/gm, '')
  // Horizontal rules and table pipes.
  t = t.replace(/^\s*[-=*_]{3,}\s*$/gm, ' ')
  t = t.replace(/\|/g, ', ')

  // Collapse whitespace; turn paragraph breaks into sentence stops.
  t = t.replace(/\n{2,}/g, '. ').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ')
  // Tidy doubled punctuation created above.
  t = t.replace(/\s*\.\s*\.(\s*\.)*/g, '. ').replace(/\s+([.,!?;:])/g, '$1')
  return t.trim()
}

// Split speakable text into chunks at sentence boundaries. Web Speech
// implementations can truncate or stall on very long utterances, so we keep each
// piece modest and hard-split any runaway sentence.
export function chunkForSpeech(text, maxLen = 220) {
  const clean = String(text || '').trim()
  if (!clean) return []

  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean]
  const chunks = []
  let current = ''

  for (const raw of sentences) {
    let piece = raw.trim()
    if (!piece) continue

    // Hard-split a single sentence that is longer than the budget.
    while (piece.length > maxLen * 1.5) {
      const cut = piece.slice(0, maxLen)
      const at = cut.lastIndexOf(' ')
      const head = at > 40 ? cut.slice(0, at) : cut
      chunks.push(head.trim())
      piece = piece.slice(head.length).trim()
    }

    if (current && `${current} ${piece}`.length > maxLen) {
      chunks.push(current.trim())
      current = piece
    } else {
      current = current ? `${current} ${piece}` : piece
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}
