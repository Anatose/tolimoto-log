/*
 * The buyer's service history as a real PDF file (A4), built on the device with jsPDF.
 * jsPDF and the font are loaded only when a PDF is made, so they do not slow down the app.
 * Everything shown is passed in already formatted (texts in the app language, numbers, dates).
 */
import type { jsPDF as JsPdf } from 'jspdf'

export interface PdfPhoto { src: string; w: number; h: number; caption: string }
export interface PdfRow { date: string; odo: string; work: string; sub: string; receipt: string; sum?: string }
export interface PdfInput {
  name: string
  made: string
  kicker: string
  tiles: { label: string; value: string }[]
  lines: { label: string; items: { b: string; t: string }[] }[]
  cols: { date: string; odo: string; work: string; receipt: string; sum?: string }
  rows: PdfRow[]
  photosTitle: string
  photos: PdfPhoto[]
  footer: string
  pageWord: string
}
/** The two font files as base64 (regular and bold); they must cover Cyrillic and Latin Extended. */
export interface PdfFonts { regular: string; bold: string }

const PAGE_W = 210
const PAGE_H = 297
const L = 13
const R = PAGE_W - 13
const TOP = 14
const BOTTOM = PAGE_H - 18
const W = R - L
const GREY = 85
const LIGHT = 200

/** Noto Sans has no arrows or ≈: swap them for signs it has, everywhere in the input. */
const clean = <T,>(v: T): T =>
  typeof v === 'string' ? (v.replace(/→/g, '–').replace(/≈/g, '~') as T)
  : Array.isArray(v) ? (v.map(clean) as T)
  : v && typeof v === 'object' ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'src' ? x : clean(x)])) as T)
  : v

export async function buildHistoryPdf(input: PdfInput, fonts: PdfFonts): Promise<Blob> {
  const d = clean(input)
  const { jsPDF } = await import('jspdf')
  const doc: JsPdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular)
  doc.addFont('NotoSans-Regular.ttf', 'Noto', 'normal')
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold)
  doc.addFont('NotoSans-Bold.ttf', 'Noto', 'bold')
  doc.setProperties({ title: `${d.name} — ${d.kicker}`, creator: 'Tolimoto Log' })
  doc.setLineHeightFactor(1.25)

  const pt = (size: number) => (size * 25.4) / 72 // font size in mm
  const font = (size: number, bold = false, grey = 17) => { doc.setFont('Noto', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(grey) }
  const line = (y: number, width: number, grey: number) => { doc.setDrawColor(grey); doc.setLineWidth(width); doc.line(L, y, R, y) }
  let y = TOP

  /* header */
  font(8.5, true)
  doc.text('TOLIMOTO LOG', L, y + 3, { charSpace: 0.9 })
  font(8.5, false, GREY)
  doc.text(d.made, R, y + 3, { align: 'right' })
  y += 5
  line(y, 0.4, 17)
  y += 8
  font(9, false, GREY)
  doc.text(d.kicker.toUpperCase(), L, y, { charSpace: 0.3 })
  y += 2
  font(20, true)
  const title = doc.splitTextToSize(d.name, W) as string[]
  doc.text(title, L, y + pt(20) * 0.85)
  y += title.length * pt(20) * 1.15 + 3

  /* three tiles */
  const gap = 3
  const tw = (W - gap * (d.tiles.length - 1)) / d.tiles.length
  d.tiles.forEach((tile, i) => {
    const x = L + i * (tw + gap)
    doc.setFillColor(246, 246, 246); doc.setDrawColor(LIGHT); doc.setLineWidth(0.3)
    doc.roundedRect(x, y, tw, 15, 2, 2, 'FD')
    font(8, false, GREY)
    doc.text(tile.label, x + 3, y + 5)
    let size = 11.5
    font(size, true)
    while (size > 7 && doc.getTextWidth(tile.value) > tw - 6) font((size -= 0.5), true)
    doc.text(tile.value, x + 3, y + 11.3)
  })
  y += 15 + 5

  /* "last done" and fuel lines: label, then bold name + text runs that wrap */
  for (const ln of d.lines) {
    const lh = 4.6
    let x = L
    font(9, false, GREY)
    doc.text(ln.label, x, y)
    x += doc.getTextWidth(ln.label) + 3
    for (const it of ln.items) {
      font(9, true); const wb = doc.getTextWidth(it.b)
      font(9); const wt = it.t ? doc.getTextWidth(' ' + it.t) : 0
      if (x > L && x + wb + wt > R) { x = L; y += lh }
      font(9, true); doc.text(it.b, x, y)
      if (it.t) { font(9); doc.text(' ' + it.t, x + wb, y) }
      x += wb + wt + 5
    }
    y += lh + 0.8
  }
  y += 2

  /* the table, newest first */
  const sums = d.cols.sum != null
  const cDate = { x: L + 2, w: 21 }
  const cOdo = { x: L + 2 + 21, w: 19 } // right-aligned at x + w
  const cSum = { w: sums ? 25 : 0 }
  const cRec = { w: 18 }
  const workX = cOdo.x + cOdo.w + 4
  const recX = R - 2 - cSum.w - (sums ? 3 : 0) - cRec.w
  const workW = recX - 3 - workX
  const head = () => {
    font(8, true, 68)
    doc.text(d.cols.date, cDate.x, y + 3.5)
    doc.text(d.cols.odo, cOdo.x + cOdo.w, y + 3.5, { align: 'right' })
    doc.text(d.cols.work, workX, y + 3.5)
    doc.text(d.cols.receipt, recX, y + 3.5)
    if (sums) doc.text(d.cols.sum!, R - 2, y + 3.5, { align: 'right' })
    y += 5.2
    line(y, 0.4, 17)
  }
  const newPage = () => {
    doc.addPage()
    y = TOP + 6
  }
  head()
  for (const r of d.rows) {
    font(9.5)
    const work = doc.splitTextToSize(r.work || '—', workW) as string[]
    font(8)
    const sub = r.sub ? (doc.splitTextToSize(r.sub, workW) as string[]) : []
    const h = 1.8 + work.length * 4.2 + sub.length * 3.6 + 1.8
    if (y + h > BOTTOM) { newPage(); head() }
    const base = y + 1.8 + 3.2
    font(9.5)
    doc.text(r.date, cDate.x, base)
    doc.text(r.odo, cOdo.x + cOdo.w, base, { align: 'right' })
    doc.text(work, workX, base)
    if (sub.length) { font(8, false, 95); doc.text(sub, workX, base + work.length * 4.2 - 0.6) }
    font(9)
    if (r.receipt) doc.text(r.receipt, recX, base)
    if (sums && r.sum) doc.text(r.sum, R - 2, base, { align: 'right' })
    y += h
    line(y, 0.2, 214)
  }

  /* photos: two to a row, on their own pages */
  if (d.photos.length) {
    newPage()
    font(13, true)
    doc.text(d.photosTitle, L, y)
    y += 5
    const colW = (W - 5) / 2
    const maxH = 100
    for (let i = 0; i < d.photos.length; i += 2) {
      const pair = d.photos.slice(i, i + 2).map((p) => {
        const k = Math.min(colW / p.w, maxH / p.h)
        font(8)
        const cap = doc.splitTextToSize(p.caption, colW) as string[]
        return { p, iw: p.w * k, ih: p.h * k, cap }
      })
      const rowH = Math.max(...pair.map((x) => x.ih + 2 + x.cap.length * 3.5)) + 5
      if (y + rowH > BOTTOM) newPage()
      pair.forEach((x, j) => {
        const cx = L + j * (colW + 5)
        const fmt = x.p.src.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        doc.addImage(x.p.src, fmt, cx, y, x.iw, x.ih, undefined, 'FAST')
        doc.setDrawColor(214); doc.setLineWidth(0.2); doc.rect(cx, y, x.iw, x.ih)
        font(8, false, 51)
        doc.text(x.cap, cx, y + x.ih + 4)
      })
      y += rowH
    }
  }

  /* closing line */
  if (y + 10 > BOTTOM) newPage()
  y += 4
  line(y, 0.2, LIGHT)
  font(8, false, GREY)
  doc.text(d.footer, L, y + 4)

  /* on every page: page number; from page 2 also a short running header */
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    font(8, false, 110)
    doc.text(`${d.pageWord} ${i} / ${n}`, R, PAGE_H - 9, { align: 'right' })
    if (i > 1) {
      doc.text(`TOLIMOTO LOG · ${d.name}`, L, TOP - 4)
      doc.text(d.made, R, TOP - 4, { align: 'right' })
    }
  }
  return doc.output('blob')
}

/** base64 of a font file served next to the app (cached by the service worker for offline use). */
export async function loadFonts(base = './fonts/'): Promise<PdfFonts> {
  const b64 = async (file: string) => {
    const r = await fetch(base + file)
    if (!r.ok) throw new Error('font ' + r.status)
    const bytes = new Uint8Array(await r.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }
  const [regular, bold] = await Promise.all([b64('NotoSans-Regular.ttf'), b64('NotoSans-Bold.ttf')])
  return { regular, bold }
}
