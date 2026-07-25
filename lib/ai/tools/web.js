// Keyless web search + extract (Plan P6.1), ported from the owner's namma_agent
// (tools/web.py). No API key, no vendor — DuckDuckGo's HTML endpoint for search
// and jsdom for HTML→text — which fits the free-platform budget cap. Every
// returned payload is run through screenWebText first (web pages are untrusted).

import { JSDOM } from 'jsdom'
import { screenWebText } from './web-screen.js'
import { guardedFetch, screenUrlShape } from './url-guard.js'

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const FETCH_CAP = 512 * 1024 // bytes off the wire
const SKIP_TAGS = [
  'script', 'style', 'noscript', 'head', 'nav', 'footer',
  'header', 'aside', 'form', 'button', 'svg', 'iframe', 'template'
]
const DDG_REDIRECT = /^https?:\/\/(?:www\.)?duckduckgo\.com\/l\/?\?/i

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
}

// DDG HTML wraps result links in a `/l/?uddg=<encoded real URL>` tracker that
// often 400s — hand back the decoded destination. Pure.
export function unwrapDdgRedirect(url) {
  if (!url || !DDG_REDIRECT.test(url)) return url
  try {
    const u = new URL(url.replace(/&amp;/g, '&'))
    const real = u.searchParams.get('uddg')
    if (real) return decodeURIComponent(real)
  } catch {
    /* fall through */
  }
  return url
}

// Parse the DDG HTML results page into [{ title, url, snippet }]. Pure/testable.
export function parseDdgHtml(rawHtml, limit = 5) {
  const results = []
  const re = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)/g
  let m
  while ((m = re.exec(String(rawHtml || ''))) && results.length < limit) {
    let url = m[1].replace(/&amp;/g, '&')
    const title = decodeEntities(m[2]).trim()
    if (url.startsWith('//')) url = `https:${url}`
    url = unwrapDdgRedirect(url)
    // Drop anything that is not a plain public http(s) URL here, so a poisoned
    // result can never reach the extractor at all. Pure — no DNS at parse time.
    if (screenUrlShape(url).ok) results.push({ title, url, snippet: '' })
  }
  return results
}

// Strip HTML chrome and return readable text, capped. Pure (jsdom, no network).
export function htmlToText(rawHtml, maxChars = 4000) {
  let text = ''
  try {
    const dom = new JSDOM(String(rawHtml || ''))
    const { document } = dom.window
    for (const tag of SKIP_TAGS) {
      document.querySelectorAll(tag).forEach((el) => el.remove())
    }
    text = (document.body?.textContent || '')
      .replace(/[ \t]{3,}/g, '  ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim()
  } catch {
    text = ''
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`
  return text
}

// Read at most FETCH_CAP bytes off the wire and stop, instead of buffering a
// whole response before slicing it — a hostile or merely enormous page should
// not be able to spend our memory.
async function readCapped(res) {
  if (!res.body) return (await res.text()).slice(0, FETCH_CAP)
  const decoder = new TextDecoder('utf-8')
  let out = ''
  for await (const chunk of res.body) {
    out += decoder.decode(chunk, { stream: true })
    if (out.length >= FETCH_CAP) return out.slice(0, FETCH_CAP)
  }
  return out + decoder.decode()
}

async function fetchText(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // guardedFetch re-checks the SSRF rules on every redirect hop.
    const res = await guardedFetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await readCapped(res)
  } finally {
    clearTimeout(timer)
  }
}

// DuckDuckGo's lite endpoint renders the same results with different markup.
// It is a separate rate-limit bucket, which is the entire point of having it.
export function parseDdgLiteHtml(rawHtml, limit = 5) {
  const results = []
  const html = String(rawHtml || '')
  const patterns = [
    /href="([^"]+)"[^>]*class=["']result-link["'][^>]*>([\s\S]*?)<\/a>/g,
    /class=["']result-link["'][^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(html)) && results.length < limit) {
      let url = m[1].replace(/&amp;/g, '&')
      if (url.startsWith('//')) url = `https:${url}`
      url = unwrapDdgRedirect(url)
      const title = decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim()
      if (screenUrlShape(url).ok && !results.some((r) => r.url === url)) {
        results.push({ title, url, snippet: '' })
      }
    }
    if (results.length) break
  }
  return results
}

// Wikipedia's opensearch API as a last resort. It is keyless, it is never
// rate-limited the way the scraped endpoints are, and for an educational topic
// it returns exactly the kind of reference we want to cite anyway. Pure parser
// split out so it can be tested without the network.
export function parseWikipediaOpenSearch(json, limit = 5) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json
    const titles = Array.isArray(data?.[1]) ? data[1] : []
    const urls = Array.isArray(data?.[3]) ? data[3] : []
    const out = []
    for (let i = 0; i < urls.length && out.length < limit; i += 1) {
      if (screenUrlShape(urls[i]).ok) {
        out.push({ title: titles[i] || urls[i], url: urls[i], snippet: '' })
      }
    }
    return out
  } catch {
    return []
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Each source is tried in turn; within a source we retry once with a short
// backoff. An empty result is treated as a failure, because that is exactly how
// a DuckDuckGo rate-limit presents itself — HTTP 200 with no results — and
// silently generating an ungrounded lesson is the outcome we are trying to stop.
const SEARCH_SOURCES = [
  {
    name: 'ddg-html',
    url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    parse: parseDdgHtml
  },
  {
    name: 'ddg-lite',
    url: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    parse: parseDdgLiteHtml
  },
  {
    name: 'wikipedia',
    url: (q) =>
      `https://en.wikipedia.org/w/api.php?action=opensearch&limit=10&format=json&search=${encodeURIComponent(q)}`,
    parse: parseWikipediaOpenSearch
  }
]

// Search the web (keyless). Returns { ok, results, content, source } where
// `content` is the screened, model-ready result list.
export async function webSearch(query, { limit = 5, attemptsPerSource = 2 } = {}) {
  const q = String(query || '').trim()
  if (!q) return { ok: false, results: [], error: 'no query given' }
  const capped = Math.max(1, Math.min(limit, 10))
  const failures = []

  for (const source of SEARCH_SOURCES) {
    for (let attempt = 0; attempt < attemptsPerSource; attempt += 1) {
      if (attempt > 0) await sleep(400 * 2 ** (attempt - 1))
      try {
        const raw = await fetchText(source.url(q), { timeoutMs: 8000 })
        const results = source.parse(raw, capped)
        if (results.length > 0) {
          const list = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join('\n')
          const { content } = screenWebText(
            `Search results for "${q}":\n${list}`,
            'the search results'
          )
          return { ok: true, results, content, source: source.name }
        }
        failures.push(`${source.name}: no results`)
      } catch (err) {
        failures.push(`${source.name}: ${err.message}`)
      }
    }
  }

  return { ok: false, results: [], error: `search failed (${failures.join('; ')})` }
}

// Fetch a page and return its screened readable text.
export async function webExtract(url, { maxChars = 4000 } = {}) {
  const u = String(url || '').trim()
  const shape = screenUrlShape(u)
  if (!shape.ok) return { ok: false, content: '', error: `refusing to fetch ${u}: ${shape.reason}` }
  const cap = Math.max(500, Math.min(maxChars, 8000))
  try {
    const text = htmlToText(await fetchText(u), cap)
    if (!text) return { ok: true, content: '(page had no readable text)', url: u }
    const { content, report } = screenWebText(text, u)
    return { ok: true, content, url: u, flagged: report.flagged }
  } catch (err) {
    return { ok: false, content: '', error: `couldn't fetch ${u}: ${err.message}` }
  }
}
