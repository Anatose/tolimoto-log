/*
 * "History for the buyer": the service history of one vehicle as a PDF file (A4), made on the device.
 * The document is drawn by historyPdf.ts (jsPDF, loaded only here); the file is saved or shared with saveFile.
 * Receipt photos are downloaded from the user's Drive (drive.file) when signed in and online.
 */
import { useState } from 'react'
import { today, useDB, type ServiceEntry } from './store'
import { PRESETS, presetName, useT, type K } from './i18n'
import { avgL100, fuelSegments } from './calc'
import { Sheet, Toggle } from './ui'
import { downloadFile, driveId, getToken } from './google'
import { saveFile } from './exportImport'
import type { PdfInput, PdfPhoto } from './historyPdf'

const mediaLinks = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean)
const LAST_TAGS: { tag: string; moto?: boolean }[] = [{ tag: 'engineoil' }, { tag: 'chain', moto: true }, { tag: 'brakefluid' }]
/** Longest side of a photo in the PDF: sharp on A4, small file. */
const PHOTO_PX = 1600

interface Opts { photos: boolean; sums: boolean; fuel: boolean; notes: boolean }
type Pic = { src: string; w: number; h: number }
/** Loaded pictures by link; a link that is missing here is shown as just "photo". */
type Pics = Map<string, Pic>

/** A picture as a JPEG data URL no larger than PHOTO_PX, with its size. */
async function toJpeg(blob: Blob): Promise<Pic> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, PHOTO_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * k))
    const h = Math.max(1, Math.round(img.naturalHeight * k))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, w, h)
    g.drawImage(img, 0, 0, w, h)
    return { src: c.toDataURL('image/jpeg', 0.82), w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Downloads the receipt photos the app put on the user's Drive, three at a time. */
async function loadPhotos(links: string[], onStep: (done: number) => void): Promise<{ pics: Pics; failed: number }> {
  const pics: Pics = new Map()
  let failed = 0
  let done = 0
  const queue = [...new Set(links)]
  const worker = async () => {
    for (let link = queue.shift(); link; link = queue.shift()) {
      const id = driveId(link)
      try {
        if (!id || !getToken() || !navigator.onLine) throw new Error('unavailable')
        const blob = await downloadFile(id)
        if (blob.type.startsWith('image/')) pics.set(link, await toJpeg(blob))
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
  const [failed, setFailed] = useState(false)
  const [pics, setPics] = useState<Pics>(new Map())
  const [ready, setReady] = useState<{ name: string; blob: Blob } | null>(null)
  const v = db.vehicles.find((x) => x.id === vid)
  const list = db.service.filter((s) => s.vehicleId === vid).sort((a, b) => b.date.localeCompare(a.date) || (b.odometer ?? 0) - (a.odometer ?? 0))
  const odos = list.map((s) => s.odometer).filter((x): x is number => x != null)
  if (!v) return null

  /** Everything the PDF shows, already in the app language. */
  const content = (pics: Pics): PdfInput => {
    const withMedia = list.filter((s) => mediaLinks(s.media).length > 0).length
    const work = (s: ServiceEntry) => s.description || s.tags.map((g) => '#' + g).join(' ')
    // photos are numbered in the order of the table
    const photos: PdfPhoto[] = []
    const photoNums = new Map<string, number[]>()
    if (o.photos)
      for (const s of list)
        for (const l of mediaLinks(s.media)) {
          const p = pics.get(l)
          if (!p) continue
          photos.push({ ...p, caption: `${photos.length + 1}. ${date(s.date)}${s.odometer != null ? ` · ${n(s.odometer)} ${t('km')}` : ''} · ${work(s)}` })
          photoNums.set(s.id, [...(photoNums.get(s.id) ?? []), photos.length])
        }
    const last = LAST_TAGS.filter((x) => !x.moto || v.type === 'moto').map(({ tag }) => {
      const e = list.find((s) => s.tags.includes(tag))
      const item = db.schedule.find((x) => x.vehicleId === v.id && x.tag === tag)
      const preset = [...PRESETS.moto, ...PRESETS.car].find((p) => p.tag === tag)!
      return { b: item?.name ?? presetName(preset, lang), t: e ? `${date(e.date)}${e.odometer != null ? `, ${n(e.odometer)} ${t('km')}` : ''}` : '—' }
    })
    const lines: PdfInput['lines'] = [{ label: `${t('dLast')}:`, items: last }]
    const fuel = db.fuel.filter((f) => f.vehicleId === v.id)
    if (o.fuel && fuel.length) {
      const avg = avgL100(fuelSegments(fuel))
      const items = [{ b: '', t: `${t('dFills')}: ${fuel.length}` }]
      if (avg != null) items.push({ b: '', t: `${t('avgCons')}: ${n(avg, 1)} ${t('l100')}` })
      if (o.sums) items.push({ b: '', t: `${t('sum')}: ${n(fuel.reduce((s, f) => s + f.total, 0), 0)} ${v.currency}` })
      lines.push({ label: `${t('xFuel')}:`, items })
    }
    return {
      name: v.name,
      made: `${t('dMade')} ${date(today())}`,
      kicker: t('dHistory'),
      tiles: [
        { label: t('xPeriod'), value: list.length ? `${date(list[list.length - 1].date)} – ${date(list[0].date)}` : '—' },
        { label: t('odoKm'), value: odos.length ? `${n(Math.min(...odos))} – ${n(Math.max(...odos))}` : '—' },
        { label: t('dRecords'), value: `${list.length}${withMedia ? ` · ${withMedia} ${t('dWithPhoto')}` : ''}` },
      ],
      lines,
      cols: { date: t('date'), odo: t('odoKm'), work: t('dWork'), receipt: t('dReceipt'), sum: o.sums ? t('amount') : undefined },
      rows: list.map((s) => {
        const nums = photoNums.get(s.id)
        return {
          date: date(s.date),
          odo: s.odometer != null ? n(s.odometer) : '',
          work: work(s),
          sub: [t(('cat_' + s.category) as K), o.notes ? s.notes.trim() : ''].filter(Boolean).join(' · '),
          receipt: nums?.length ? `${t('dPhoto')} ${nums.join(', ')}` : mediaLinks(s.media).length ? t('dPhoto') : '',
          sum: s.parts != null || s.labour != null ? `${n((s.parts ?? 0) + (s.labour ?? 0), 2)} ${v.currency}` : '',
        }
      }),
      photosTitle: t('xPhotos'),
      photos,
      footer: t('dFooter'),
      pageWord: t('dPage'),
    }
  }

  const create = async () => {
    setFailed(false)
    let have = pics
    const links = o.photos ? list.flatMap((s) => mediaLinks(s.media)) : []
    if (links.some((l) => !have.has(l))) {
      setBusy(t('xLoading'))
      const r = await loadPhotos(links, (k) => setBusy(`${t('xLoading')} ${k}/${new Set(links).size}`))
      have = r.pics
      setPics(have)
      setPhotosOff(r.failed > 0)
    }
    setBusy(t('xMaking'))
    try {
      const { buildHistoryPdf, loadFonts } = await import('./historyPdf')
      const blob = await buildHistoryPdf(content(have), await loadFonts())
      const file = { name: `${fileName(v.name)}-history-${today()}.pdf`, blob }
      setReady(file)
      setBusy(null)
      await saveFile(file.name, file.blob)
    } catch (e) {
      console.error(e)
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }
  const set = (k: keyof Opts) => (x: boolean) => { setO((p) => ({ ...p, [k]: x })); setReady(null) }
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
      {failed && <div className="notice warn" role="alert"><span>{t('xFailed')}</span></div>}
      <div className="spacer" />
      <button type="button" className="btn primary big" disabled={!!busy || list.length === 0} onClick={() => void create()}>{busy ?? t('xCreate')}</button>
      {ready && !busy && <button type="button" className="btn outline" onClick={() => void saveFile(ready.name, ready.blob)}>{t('xSave')}</button>}
      <span className="hint">{t('xPrintHint')}</span>
    </Sheet>
  )
}

const fileName = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'vehicle'
