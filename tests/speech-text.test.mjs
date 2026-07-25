import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { stripMarkdownForSpeech, chunkForSpeech } from '../lib/tts/speech-text.js'

describe('stripMarkdownForSpeech', () => {
  test('drops fenced code and mermaid blocks', () => {
    const md = 'Intro text.\n\n```mermaid\nflowchart TD\n A-->B\n```\n\nMore text.'
    const out = stripMarkdownForSpeech(md)
    assert.doesNotMatch(out, /flowchart|mermaid|```/)
    assert.match(out, /Intro text/)
    assert.match(out, /More text/)
  })

  test('reads link text, not URLs, and drops images', () => {
    const out = stripMarkdownForSpeech('See [the docs](https://x.test/y) and ![alt](http://img/a.png) here.')
    assert.match(out, /the docs/)
    assert.doesNotMatch(out, /https?:\/\//)
    assert.doesNotMatch(out, /alt/)
  })

  test('strips heading hashes and emphasis markers', () => {
    const out = stripMarkdownForSpeech('## Big Heading\n\nThis is **bold** and *italic* text.')
    assert.doesNotMatch(out, /##|\*\*|\*/)
    assert.match(out, /Big Heading/)
    assert.match(out, /bold/)
    assert.match(out, /italic/)
  })

  test('removes inline code backticks and list markers', () => {
    const out = stripMarkdownForSpeech('- item one\n- use `map()` here')
    assert.doesNotMatch(out, /`|^- /m)
    assert.match(out, /item one/)
    assert.match(out, /map\(\)/)
  })
})

describe('chunkForSpeech', () => {
  test('empty input yields no chunks', () => {
    assert.deepEqual(chunkForSpeech(''), [])
    assert.deepEqual(chunkForSpeech('   '), [])
  })

  test('groups sentences and keeps each chunk within the budget', () => {
    const text = 'One sentence. Two sentence. ' + 'Three '.repeat(60) + 'end.'
    const chunks = chunkForSpeech(text, 120)
    assert.ok(chunks.length >= 2)
    for (const c of chunks) assert.ok(c.length <= 180, `chunk too long: ${c.length}`)
  })

  test('reassembles to cover all the words', () => {
    const text = 'Alpha beta. Gamma delta. Epsilon zeta.'
    const joined = chunkForSpeech(text, 20).join(' ')
    for (const w of ['Alpha', 'beta', 'Gamma', 'delta', 'Epsilon', 'zeta']) {
      assert.match(joined, new RegExp(w))
    }
  })
})
