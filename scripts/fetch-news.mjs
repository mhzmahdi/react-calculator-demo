// Fetches the main/top-stories RSS feed of several Persian news sources into news.json.
// Run by the demo repo's GitHub Actions workflow (most of these feeds have no CORS headers,
// so the browser reads the same-origin news.json instead). No dependencies.
// Usage: node scripts/fetch-news.mjs [path/to/news.json]
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'news.json'
const PER_SOURCE = 15
export const SOURCES = [
  { id: 'bbc', name: 'بی‌بی‌سی فارسی', url: 'https://feeds.bbci.co.uk/persian/rss.xml', home: 'https://www.bbc.com/persian' },
  { id: 'dw', name: 'دویچه‌وله فارسی', url: 'https://rss.dw.com/xml/rss-per-all', home: 'https://www.dw.com/fa-ir' },
  { id: 'euronews', name: 'یورونیوز فارسی', url: 'https://parsi.euronews.com/rss', home: 'https://parsi.euronews.com/' },
  { id: 'irna', name: 'ایرنا', url: 'https://www.irna.ir/rss', home: 'https://www.irna.ir/' },
  { id: 'isna', name: 'ایسنا', url: 'https://www.isna.ir/rss', home: 'https://www.isna.ir/' },
]

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m))
const text = (s) => decode(decode(s || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const tag = (block, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block); return m ? m[1] : '' }
const attr = (block, name, a) => { const m = new RegExp(`<${name}\\s[^>]*${a}="([^"]+)"`, 'i').exec(block); return m ? decode(m[1]) : '' }

function parse(xml, src) {
  const items = []
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0]
    const title = text(tag(b, 'title'))
    const link = text(tag(b, 'link')) || attr(b, 'link', 'href') || text(tag(b, 'guid'))
    if (!title || !/^https?:/.test(link)) continue
    const pub = Date.parse(text(tag(b, 'pubDate')) || text(tag(b, 'dc:date')) || '')
    let img = attr(b, 'media:thumbnail', 'url') || attr(b, 'media:content', 'url')
    const enc = /<enclosure\s[^>]*>/i.exec(b)?.[0] || ''
    if (!img && /type="image/i.test(enc)) img = attr(enc, 'enclosure', 'url')
    // «فوری» only when the source itself flags it (title prefix used by Iranian agencies / BBC "Breaking")
    const urgent = /^\s*(فوری|خبر فوری|Breaking)\s*[:|/\-–—]/i.test(title)
    items.push({
      src, title: title.replace(/^\s*(فوری|خبر فوری)\s*[:|/\-–—]\s*/, ''),
      link, desc: text(tag(b, 'description')).slice(0, 220), img: img || '',
      pub: Number.isFinite(pub) ? new Date(pub).toISOString() : null, urgent,
    })
  }
  return items
}

let old = { items: [], sources: {} }
try { old = JSON.parse(readFileSync(FILE, 'utf8')) } catch { /* first run */ }

const items = [], sources = {}
await Promise.all(SOURCES.map(async (s) => {
  try {
    const res = await fetch(s.url, { headers: { 'user-agent': 'Mozilla/5.0 (news-widget; +https://github.com/mhzmahdi)', accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const got = parse(await res.text(), s.id).slice(0, PER_SOURCE)
    if (!got.length) throw new Error('no items')
    items.push(...got)
    sources[s.id] = { name: s.name, home: s.home, ok: true, at: new Date().toISOString() }
  } catch (e) {
    // keep the last good items of a failing source so the tab isn't empty
    items.push(...(old.items || []).filter((x) => x.src === s.id))
    sources[s.id] = { name: s.name, home: s.home, ok: false, error: String(e.message || e), at: old.sources?.[s.id]?.at || null }
    console.warn(`${s.id}: ${e.message || e}`)
  }
}))
items.sort((a, b) => (b.pub || '').localeCompare(a.pub || ''))
writeFileSync(FILE, JSON.stringify({ updated: new Date().toISOString(), sources, items }) + '\n')
console.log(`news.json: ${items.length} items; ok: ${Object.entries(sources).filter(([, v]) => v.ok).map(([k]) => k).join(', ')}`)
