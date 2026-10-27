// Fetches Bing's "Image of the day" archive (Bing only serves the last ~15 days: idx 0..7, n<=8)
// and merges it into bing.json (keeps the newest 30 days). Used by the demo repo's GitHub Actions
// workflow, because Bing's HPImageArchive endpoint has no CORS headers and can't be read from a browser.
// Usage: node scripts/fetch-bing.mjs [path/to/bing.json]
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'bing.json'
const KEEP = 30
const api = (idx) => `https://www.bing.com/HPImageArchive.aspx?format=js&idx=${idx}&n=8&mkt=en-US`

let old = []
try { old = JSON.parse(readFileSync(FILE, 'utf8')).images || [] } catch { /* first run */ }

const fresh = []
for (const idx of [0, 7]) {
  const res = await fetch(api(idx), { headers: { 'user-agent': 'Mozilla/5.0 (potd-widget)' } })
  if (!res.ok) throw new Error(`Bing HTTP ${res.status}`)
  for (const im of (await res.json()).images || []) {
    const d = im.startdate
    fresh.push({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      title: im.title || '',
      copyright: im.copyright || '',
      urlbase: im.urlbase,
      link: im.copyrightlink || '',
    })
  }
}
if (!fresh.length) throw new Error('Bing returned no images')

const byDate = new Map(old.map((x) => [x.date, x]))
for (const x of fresh) if (x.urlbase) byDate.set(x.date, x)
const images = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, KEEP)
const prev = JSON.stringify(old)
if (JSON.stringify(images) === prev) { console.log('bing.json unchanged'); process.exit(0) }
writeFileSync(FILE, JSON.stringify({ updated: new Date().toISOString(), images }, null, 1) + '\n')
console.log(`bing.json: ${images.length} images, newest ${images[0].date}`)
