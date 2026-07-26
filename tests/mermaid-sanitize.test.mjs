import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  repairMarkdownFences,
  mapOutsideFences,
  sanitizeMermaidCode,
  fixMermaidRenderBreakers,
  prepareMermaidCode,
  parseMermaidTitle,
  parseMermaidDescription
} from '../lib/ai/mermaid-sanitize.js'

const fence = '```'

describe('repairMarkdownFences', () => {
  // The production failure this module was written for: the model omitted the
  // closing fence, so the next section heading was parsed as diagram source and
  // the block became invisible to the server-side validator entirely.
  test('closes an unterminated mermaid fence at the next markdown heading', () => {
    const broken = [
      'Intro.',
      '',
      `${fence}mermaid`,
      '%%title: Core Intent',
      'flowchart TD',
      '    A[Start] --> B[Improve Defenses]',
      '## Key Roles in the Hacking Landscape',
      '',
      'Body text.'
    ].join('\n')

    const fixed = repairMarkdownFences(broken)
    const lines = fixed.split('\n')
    const headingIndex = lines.findIndex((l) => l.startsWith('## Key Roles'))
    const closeIndex = lines.findIndex((l, i) => i > 2 && l.trim() === fence)

    assert.ok(closeIndex > 0, 'a closing fence was inserted')
    assert.ok(closeIndex < headingIndex, 'the fence closes before the heading')
  })

  test('leaves a correctly fenced document byte-identical', () => {
    const good = [
      'Intro.',
      '',
      `${fence}mermaid`,
      'flowchart TD',
      '    A --> B',
      fence,
      '',
      '## Next'
    ].join('\n')

    assert.equal(repairMarkdownFences(good), good)
  })

  test('terminates a fence still open at end of input', () => {
    const truncated = [`${fence}mermaid`, 'flowchart TD', '    A --> B'].join('\n')
    assert.ok(repairMarkdownFences(truncated).endsWith(fence))
  })

  // A markdown or shell sample may legitimately begin a line with `#`, so the
  // heading heuristic must stay scoped to mermaid.
  test('does not early-close a non-mermaid fence on a heading-like line', () => {
    const doc = [`${fence}bash`, '# install deps', 'npm ci', fence].join('\n')
    assert.equal(repairMarkdownFences(doc), doc)
  })

  test('handles a fence opened with more than three backticks', () => {
    const doc = ['````mermaid', 'flowchart TD', '  A --> B', '## Heading'].join('\n')
    const fixed = repairMarkdownFences(doc)
    assert.ok(fixed.includes('````\n'), 'closes with a matching-length fence')
  })
})

describe('mapOutsideFences', () => {
  // The prompt instructs the model to use <br> inside mermaid labels, so a
  // document-wide <br> -> newline rewrite was destroying the diagrams it asked
  // for. Prose cleanups must stop at the fence.
  test('applies the callback to prose but not to fenced content', () => {
    const doc = ['a<br>b', `${fence}mermaid`, 'X["one<br>two"]', fence, 'c<br>d'].join('\n')
    const out = mapOutsideFences(doc, (line) => line.replace(/<br\s*\/?>/gi, '|'))

    assert.ok(out.includes('a|b'), 'prose before the fence is transformed')
    assert.ok(out.includes('c|d'), 'prose after the fence is transformed')
    assert.ok(out.includes('one<br>two'), 'diagram source is untouched')
  })
})

describe('sanitizeMermaidCode', () => {
  test('quotes a rectangle label containing parentheses', () => {
    const out = sanitizeMermaidCode('flowchart TD\n  A[Scan (active)] --> B[Done]')
    assert.ok(out.includes('A["Scan (active)"]'))
  })

  test('leaves non-flowchart grammars alone', () => {
    // Parens are message syntax in a sequence diagram, not a node shape.
    const src = 'sequenceDiagram\n  Alice->>Bob: call(x)'
    assert.ok(sanitizeMermaidCode(src).includes('call(x)'))
  })

  test('strips author styling so diagrams follow the app theme', () => {
    const out = sanitizeMermaidCode('flowchart TD\n  A --> B\n  style A fill:#f9f\n  classDef big font-size:20px')
    assert.ok(!out.includes('style A'))
    assert.ok(!out.includes('classDef'))
  })

  test('removes the title/description metadata lines', () => {
    const out = sanitizeMermaidCode('%%title: T\n%%desc: D\nflowchart TD\n  A --> B')
    assert.ok(!out.includes('%%title'))
    assert.ok(!out.includes('%%desc'))
  })

  test('does not eat a subroutine shape as a rectangle', () => {
    const out = sanitizeMermaidCode('flowchart TD\n  A[[Sub Task]] --> B')
    assert.ok(out.includes('A[["Sub Task"]]'), out)
  })
})

describe('fixMermaidRenderBreakers', () => {
  test('converts a literal newline inside a quoted label to <br>', () => {
    const out = fixMermaidRenderBreakers('flowchart TD\n  A["one\ntwo"] --> B')
    assert.ok(out.includes('"one<br>two"'))
  })

  test('demotes nested double quotes inside a bracket label', () => {
    const out = fixMermaidRenderBreakers('flowchart TD\n  A["say "hi" now"] --> B')
    assert.ok(out.includes(`"say 'hi' now"`), out)
  })

  test('strips HTML formatting tags but keeps <br>', () => {
    const out = fixMermaidRenderBreakers('flowchart TD\n  A["<b>bold</b><br>next"]')
    assert.ok(!out.includes('<b>'))
    assert.ok(out.includes('<br>'))
  })
})

describe('prepareMermaidCode', () => {
  // The contract that keeps the server validator honest: whatever the client
  // renders, the server must have parsed the identical string.
  test('is the composition of sanitize then render-breaker fixes', () => {
    const src = '%%title: T\nflowchart TD\n  A[Scan (active)] --> B[Done]'
    assert.equal(prepareMermaidCode(src), fixMermaidRenderBreakers(sanitizeMermaidCode(src)))
  })

  test('is idempotent', () => {
    const src = 'flowchart TD\n  A[Scan (active)] --> B[Report, Fix]'
    const once = prepareMermaidCode(src)
    assert.equal(prepareMermaidCode(once), once)
  })
})

describe('metadata parsing', () => {
  test('reads title and description', () => {
    const code = '%%title: Auth Flow\n%%desc: How a login works\nflowchart TD\n  A --> B'
    assert.equal(parseMermaidTitle(code), 'Auth Flow')
    assert.equal(parseMermaidDescription(code), 'How a login works')
  })

  test('returns null when absent', () => {
    assert.equal(parseMermaidTitle('flowchart TD\n A --> B'), null)
    assert.equal(parseMermaidDescription(''), null)
  })
})
