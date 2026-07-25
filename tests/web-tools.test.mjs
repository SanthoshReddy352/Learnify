import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  unwrapDdgRedirect,
  parseDdgHtml,
  htmlToText,
  parseDdgLiteHtml,
  parseWikipediaOpenSearch
} from '../lib/ai/tools/web.js'

describe('unwrapDdgRedirect', () => {
  test('decodes a /l/?uddg= tracker link to the real destination', () => {
    const wrapped = 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FTree'
    assert.equal(unwrapDdgRedirect(wrapped), 'https://en.wikipedia.org/wiki/Tree')
  })

  test('leaves a normal URL untouched', () => {
    assert.equal(unwrapDdgRedirect('https://geeksforgeeks.org/x'), 'https://geeksforgeeks.org/x')
  })
})

describe('parseDdgHtml', () => {
  const fixture = `
    <div class="result">
      <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FBinary_tree">Binary tree - Wikipedia</a>
    </div>
    <div class="result">
      <a class="result__a" href="https://www.geeksforgeeks.org/binary-tree/">Binary Tree &amp; Traversals</a>
    </div>`

  test('extracts titles + unwrapped urls, honoring the limit', () => {
    const results = parseDdgHtml(fixture, 5)
    assert.equal(results.length, 2)
    assert.equal(results[0].url, 'https://en.wikipedia.org/wiki/Binary_tree')
    assert.equal(results[1].title, 'Binary Tree & Traversals')
  })

  test('respects the limit', () => {
    assert.equal(parseDdgHtml(fixture, 1).length, 1)
  })
})

describe('htmlToText', () => {
  test('strips script/nav/footer chrome and returns readable body text', () => {
    const html = `<html><head><title>t</title></head><body>
      <nav>Home About</nav>
      <script>var x = 1;</script>
      <p>Gradient descent minimizes a loss function.</p>
      <footer>copyright</footer>
    </body></html>`
    const text = htmlToText(html, 4000)
    assert.match(text, /Gradient descent minimizes a loss function\./)
    assert.doesNotMatch(text, /var x = 1/)
    assert.doesNotMatch(text, /copyright/)
  })

  test('caps output length', () => {
    const html = `<body><p>${'a'.repeat(6000)}</p></body>`
    const text = htmlToText(html, 500)
    assert.ok(text.length <= 501) // 500 chars + ellipsis
    assert.ok(text.endsWith('…'))
  })
})

describe('parseDdgLiteHtml', () => {
  test('parses the lite endpoint markup with either attribute order', () => {
    const hrefFirst = `<a href="https://en.wikipedia.org/wiki/Graph" class="result-link">Graph theory</a>`
    assert.deepEqual(parseDdgLiteHtml(hrefFirst, 5), [
      { title: 'Graph theory', url: 'https://en.wikipedia.org/wiki/Graph', snippet: '' }
    ])

    const classFirst = `<a class='result-link' href="https://geeksforgeeks.org/dfs">DFS <b>guide</b></a>`
    assert.deepEqual(parseDdgLiteHtml(classFirst, 5), [
      { title: 'DFS guide', url: 'https://geeksforgeeks.org/dfs', snippet: '' }
    ])
  })

  test('drops non-public URLs and duplicates', () => {
    const html = `
      <a href="http://169.254.169.254/latest" class="result-link">metadata</a>
      <a href="https://example.org/a" class="result-link">A</a>
      <a href="https://example.org/a" class="result-link">A again</a>`
    const out = parseDdgLiteHtml(html, 5)
    assert.equal(out.length, 1)
    assert.equal(out[0].url, 'https://example.org/a')
  })

  test('returns nothing for an unrelated page', () => {
    assert.deepEqual(parseDdgLiteHtml('<html><body>rate limited</body></html>', 5), [])
  })
})

describe('parseWikipediaOpenSearch', () => {
  const payload = JSON.stringify([
    'binary tree',
    ['Binary tree', 'Binary search tree'],
    ['', ''],
    ['https://en.wikipedia.org/wiki/Binary_tree', 'https://en.wikipedia.org/wiki/Binary_search_tree']
  ])

  test('pairs titles with urls', () => {
    assert.deepEqual(parseWikipediaOpenSearch(payload, 5), [
      { title: 'Binary tree', url: 'https://en.wikipedia.org/wiki/Binary_tree', snippet: '' },
      { title: 'Binary search tree', url: 'https://en.wikipedia.org/wiki/Binary_search_tree', snippet: '' }
    ])
  })

  test('honors the limit', () => {
    assert.equal(parseWikipediaOpenSearch(payload, 1).length, 1)
  })

  test('returns [] for malformed json rather than throwing', () => {
    assert.deepEqual(parseWikipediaOpenSearch('{not json', 5), [])
    assert.deepEqual(parseWikipediaOpenSearch(null, 5), [])
  })
})
