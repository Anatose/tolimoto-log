/*
 * "History for the buyer": a printable service history (A4, light) made without a server.
 * The page is laid out for print and handed to window.print(); the print window saves it as PDF.
 * If a print window cannot open (some installed web apps), the same page can be saved as an HTML file.
 */
import { forwardRef, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { today, useDB, type ServiceEntry, type Vehicle } from './store'
import { PRESETS, presetName, useT, type K } from './i18n'
import { avgL100, fuelSegments } from './calc'
import { Sheet, Toggle } from './ui'
import { downloadFile, driveId, getToken } from './google'
import { saveFile } from './exportImport'

const mediaLinks = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean)
const LAST_TAGS: { tag: string; moto?: boolean }[] = [{ tag: 'engineoil' }, { tag: 'chain', moto: true }, { tag: 'brakefluid' }]

interface Opts { photos: boolean; sums: boolean; fuel: boolean; notes: boolean }
/** Loaded pictures by link; a link that is missing here is shown as just "photo". */
type Pics = Map<string, string>

/** Downloads the receipt photos the app put on the user's Drive, three at a time, as data URLs. */
async function loadPhotos(links: string[], onStep: (done: number) => void): Promise<{ pics: Pics; failed: number }> {
  const pics: Pics = new Map()
  let failed = 0
  let done = 0
  const queue = [...new Set(links)]
  const toData = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b) })
  const worker = async () => {
    for (let link = queue.shift(); link; link = queue.shift()) {
      const id = driveId(link)
      try {
        if (!id || !getToken() || !navigator.onLine) throw new Error('unavailable')
        const blob = await downloadFile(id)
        if (blob.type.startsWith('image/')) pics.set(link, await toData(blob))
      } catch {
        failed++
      }
      onStep(++done)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { pics, failed }
}

export function HistoryExport({ vid }: { vid: string }) {
  const db = useDB()
  const { t, n, date, lang } = useT()
  const [o, setO] = useState<Opts>({ photos: true, sums: false, fuel: false, notes: false })
  const [busy, setBusy] = useState<string | null>(null)
  const [photosOff, setPhotosOff] = useState(false)
  const [doc, setDoc] = useState<{ pics: Pics; opts: Opts; print: boolean } | null>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const v = db.vehicles.find((x) => x.id === vid)
  const list = db.service.filter((s) => s.vehicleId === vid).sort((a, b) => b.date.localeCompare(a.date) || (b.odometer ?? 0) - (a.odometer ?? 0))
  const odos = list.map((s) => s.odometer).filter((x): x is number => x != null)

  // print once the page is in the document; hide the app while the print window is open
  useEffect(() => {
    if (!doc?.print) return
    document.body.classList.add('printing')
    const off = () => document.body.classList.remove('printing')
    window.addEventListener('afterprint', off)
    const timer = window.setTimeout(() => { window.print(); if (!('onafterprint' in window)) off() }, 60)
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', off); off() }
  }, [doc])

  if (!v) return null
  const prepare = async (print: boolean) => {
    let pics: Pics = doc?.pics ?? new Map()
    const links = o.photos ? list.flatMap((s) => mediaLinks(s.media)) : []
    if (o.photos && links.some((l) => !pics.has(l))) {
      setBusy(t('xLoading'))
      const r = await loadPhotos(links, (k) => setBusy(`${t('xLoading')} ${k}/${new Set(links).size}`))
      pics = r.pics
      setPhotosOff(r.failed > 0)
      setBusy(null)
    }
    setDoc({ pics, opts: { ...o }, print })
    return pics
  }
  const saveHtml = async () => {
    await prepare(false)
    // the page is rendered by the next frame
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))
    const el = docRef.current
    if (!el) return
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(v.name)} — ${esc(t('dHistory'))}</title><style>${printCss(t('dPage'))}</style></head><body>${el.outerHTML}</body></html>`
    await saveFile(`${fileName(v.name)}-history-${today()}.html`, new Blob([html], { type: 'text/html' }))
  }
  const set = (k: keyof Opts) => (x: boolean) => { setO((p) => ({ ...p, [k]: x })); setDoc(null) }
  return (
    <Sheet title={t('xTitle')} color={v.color}>
      <p>{t('xLead1')} {v.name} {t('xLead2')}</p>
      <div className="toggle-row"><span>{t('stService')}</span><span className="muted small">{t('xAlways')}</span></div>
      <Toggle label={t('xPhotos')} checked={o.photos} onChange={set('photos')} />
      <Toggle label={t('xSums')} checked={o.sums} onChange={set('sums')} />
      <span className="hint">{t('xSumsHint')}</span>
      <Toggle label={t('xFuel')} checked={o.fuel} onChange={set('fuel')} />
      <Toggle label={t('notes')} checked={o.notes} onChange={set('notes')} />
      <span className="hint">{t('xNotesHint')}</span>
      <div className="card small num">
        <span>{t('xCount')}: <b>{list.length}</b></span>
        {list.length > 0 && <span>{t('xPeriod')}: {date(list[list.length - 1].date)} – {date(list[0].date)}</span>}
        {odos.length > 0 && <span>{t('odometer')}: {n(Math.min(...odos))} – {n(Math.max(...odos))} {t('km')}</span>}
      </div>
      {photosOff && <div className="notice warn" role="status"><span>{t('xPhotosOff')}</span></div>}
      <div className="spacer" />
      <button type="button" className="btn primary big" disabled={!!busy || list.length === 0} onClick={() => void prepare(true)}>{busy ?? t('xCreate')}</button>
      <span className="hint">{t('xPrintHint')}</span>
      <button type="button" className="btn link small-link" disabled={!!busy || list.length === 0} onClick={() => void saveHtml()}>{t('xFallback')}</button>
      {doc && createPortal(<PrintDoc ref={docRef} v={v} list={list} opts={doc.opts} pics={doc.pics} />, document.body)}
    </Sheet>
  )
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fileName = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'vehicle'

/* ---------- the printed page ---------- */


const PrintDoc = forwardRef<HTMLDivElement, { v: Vehicle; list: ServiceEntry[]; opts: Opts; pics: Pics }>(function PrintDoc({ v, list, opts, pics }, ref) {
  const db = useDB()
  const { t, n, date, lang } = useT()
  const odos = list.map((s) => s.odometer).filter((x): x is number => x != null)
  const withMedia = list.filter((s) => mediaLinks(s.media).length > 0).length
  // photos are numbered in the order of the table
  const photos: { n: number; src: string; s: ServiceEntry }[] = []
  const photoNums = new Map<string, number[]>()
  if (opts.photos)
    for (const s of list)
      for (const l of mediaLinks(s.media)) {
        const src = pics.get(l)
        if (!src) continue
        photos.push({ n: photos.length + 1, src, s })
        photoNums.set(s.id, [...(photoNums.get(s.id) ?? []), photos.length])
      }
  const last = LAST_TAGS.filter((x) => !x.moto || v.type === 'moto').map(({ tag }) => {
    const e = list.find((s) => s.tags.includes(tag))
    const item = db.schedule.find((x) => x.vehicleId === v.id && x.tag === tag)
    const preset = [...PRESETS.moto, ...PRESETS.car].find((p) => p.tag === tag)!
    return { label: item?.name ?? presetName(preset, lang), e }
  })
  const fuel = db.fuel.filter((f) => f.vehicleId === v.id)
  const avg = avgL100(fuelSegments(fuel))
  const work = (s: ServiceEntry) => s.description || s.tags.map((g) => '#' + g).join(' ')
  const receipt = (s: ServiceEntry) => {
    const nums = photoNums.get(s.id)
    if (nums?.length) return `${t('dPhoto')} ${nums.join(', ')}`
    return mediaLinks(s.media).length ? t('dPhoto') : ''
  }
  return (
    <div className="print-doc" ref={ref}>
      <style>{printCss(t('dPage'))}</style>
      <header className="pd-head">
        <div className="pd-top"><span className="pd-brand">TOLIMOTO LOG</span><span>{t('dMade')} {date(today())}</span></div>
        <div className="pd-kicker">{t('dHistory')}</div>
        <h1>{v.name}</h1>
      </header>
      <div className="pd-tiles">
        <div className="pd-tile"><span>{t('xPeriod')}</span><b className="num">{list.length ? `${date(list[list.length - 1].date)} – ${date(list[0].date)}` : '—'}</b></div>
        <div className="pd-tile"><span>{t('odoKm')}</span><b className="num">{odos.length ? `${n(Math.min(...odos))} → ${n(Math.max(...odos))}` : '—'}</b></div>
        <div className="pd-tile"><span>{t('dRecords')}</span><b className="num">{list.length}{withMedia ? ` · ${withMedia} ${t('dWithPhoto')}` : ''}</b></div>
      </div>
      <div className="pd-last">
        <span className="pd-label">{t('dLast')}:</span>
        {last.map((x) => (
          <span key={x.label}><b>{x.label}</b> {x.e ? `${date(x.e.date)}${x.e.odometer != null ? `, ${n(x.e.odometer)} ${t('km')}` : ''}` : '—'}</span>
        ))}
      </div>
      {opts.fuel && fuel.length > 0 && (
        <div className="pd-last">
          <span className="pd-label">{t('xFuel')}:</span>
          <span>{t('dFills')}: <b>{fuel.length}</b></span>
          {avg != null && <span>{t('avgCons')}: <b>{n(avg, 1)} {t('l100')}</b></span>}
          {opts.sums && <span>{t('sum')}: <b>{n(fuel.reduce((s, f) => s + f.total, 0), 0)} {v.currency}</b></span>}
        </div>
      )}
      <table className="pd-table">
        <thead>
          <tr><th>{t('date')}</th><th className="r">{t('odoKm')}</th><th>{t('dWork')}</th><th>{t('dReceipt')}</th>{opts.sums && <th className="r">{t('amount')}</th>}</tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id}>
              <td className="num nw">{date(s.date)}</td>
              <td className="num r nw">{s.odometer != null ? n(s.odometer) : ''}</td>
              <td>
                <span className="pd-cat">{t(('cat_' + s.category) as K)}</span> {work(s)}
                {opts.notes && s.notes && <div className="pd-note">{s.notes}</div>}
              </td>
              <td className="nw">{receipt(s)}</td>
              {opts.sums && <td className="num r nw">{s.parts != null || s.labour != null ? `${n((s.parts ?? 0) + (s.labour ?? 0), 2)} ${v.currency}` : ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {photos.length > 0 && (
        <section className="pd-photos">
          <h2>{t('xPhotos')}</h2>
          <div className="pd-grid">
            {photos.map((p) => (
              <figure key={p.n}>
                <img src={p.src} alt="" />
                <figcaption><b>{p.n}.</b> {date(p.s.date)}{p.s.odometer != null ? ` · ${n(p.s.odometer)} ${t('km')}` : ''} · {work(p.s)}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      <footer className="pd-foot">{t('dFooter')}</footer>
    </div>
  )
})

/** Styles of the printed page; also put into the saved HTML file. */
export function printCss(pageWord: string): string {
  return `
@page { size: A4; margin: 14mm 13mm 16mm; @bottom-right { content: "${pageWord} " counter(page) " / " counter(pages); font: 8pt system-ui, sans-serif; color: #666; } }
.print-doc { font: 10pt/1.4 -apple-system, system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #111; background: #fff; max-width: 190mm; margin: 0 auto; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.print-doc * { box-sizing: border-box; }
.print-doc .num { font-variant-numeric: tabular-nums; }
.print-doc .r { text-align: right; }
.print-doc .nw { white-space: nowrap; }
.pd-top { display: flex; justify-content: space-between; font-size: 8.5pt; color: #555; border-bottom: 0.4mm solid #111; padding-bottom: 1.5mm; }
.pd-brand { font-weight: 800; letter-spacing: 0.2em; color: #111; }
.pd-kicker { margin-top: 5mm; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
.pd-head h1 { font-size: 21pt; margin: 0.5mm 0 0; line-height: 1.15; }
.pd-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 5mm 0 3mm; }
.pd-tile { border: 0.3mm solid #c8c8c8; border-radius: 2mm; padding: 2.5mm 3mm; background: #f6f6f6; }
.pd-tile span { display: block; font-size: 8pt; color: #555; }
.pd-tile b { font-size: 11.5pt; }
.pd-last { display: flex; flex-wrap: wrap; gap: 1mm 5mm; font-size: 9pt; margin: 2mm 0; }
.pd-label { color: #555; }
.pd-table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
.pd-table thead { display: table-header-group; }
.pd-table th { text-align: left; font-size: 8pt; font-weight: 600; color: #444; border-bottom: 0.4mm solid #111; padding: 1.5mm 2mm; }
.pd-table td { border-bottom: 0.2mm solid #d6d6d6; padding: 1.8mm 2mm; vertical-align: top; }
.pd-table tr { break-inside: avoid; page-break-inside: avoid; }
.pd-table th.r, .pd-table td.r { text-align: right; }
.pd-cat { font-size: 8pt; color: #666; }
.pd-note { font-size: 8.5pt; color: #444; margin-top: 0.8mm; }
.pd-photos { break-before: page; page-break-before: always; }
.pd-photos h2 { font-size: 13pt; margin: 0 0 3mm; }
.pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.pd-grid figure { margin: 0; break-inside: avoid; page-break-inside: avoid; }
.pd-grid img { display: block; width: 100%; max-height: 105mm; object-fit: contain; border: 0.2mm solid #d6d6d6; background: #fafafa; }
.pd-grid figcaption { font-size: 8pt; color: #333; margin-top: 1mm; }
.pd-foot { margin-top: 6mm; padding-top: 2mm; border-top: 0.2mm solid #c8c8c8; font-size: 8pt; color: #555; }
@media screen { .print-doc { padding: 16px; } }
`
}
