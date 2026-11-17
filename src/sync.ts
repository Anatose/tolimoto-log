import { useSyncExternalStore } from 'react'
import { getDB, kvGet, kvSet, onDataChange, uid, update, type Category, type DB, type ExpenseKind, type VType } from './store'
import { AuthError, ensureLayout, getToken, googleConfigured, readRanges, sheetBatchUpdate, sheetTabs, signIn, userEmail, writeRanges, type Cell } from './google'

/* ---------- sheet layout ---------- */

type Coll = 'vehicles' | 'service' | 'fuel' | 'schedule' | 'expenses'
export const TABS: Record<Coll, { title: string; cols: string[] }> = {
  vehicles: { title: 'Garage', cols: ['name', 'type', 'currency', 'odometer', 'color', 'id'] },
  service: { title: 'Service log', cols: ['date', 'vehicle', 'odometer', 'category', 'description', 'tags', 'parts', 'labour', 'total', 'notes', 'media', 'id'] },
  fuel: { title: 'Fuel', cols: ['date', 'vehicle', 'odometer', 'liters', 'total', 'price_per_liter', 'full_tank', 'missed_previous', 'station', 'id'] },
  schedule: { title: 'Schedule', cols: ['vehicle', 'name', 'tag', 'interval_km', 'interval_days', 'hint', 'id'] },
  expenses: { title: 'Other expenses', cols: ['date', 'vehicle', 'kind', 'amount', 'note', 'media', 'id'] },
}
const COLLS = Object.keys(TABS) as Coll[]
const colLetter = (n: number) => String.fromCharCode(64 + n)
const rangeOf = (c: Coll) => `'${TABS[c].title}'!A1:${colLetter(TABS[c].cols.length)}`

export type Data = Pick<DB, Coll>
const pick = (d: Data): Data => ({ vehicles: d.vehicles, service: d.service, fuel: d.fuel, schedule: d.schedule, expenses: d.expenses })

/* ---------- writing ---------- */

const r2 = (x: number) => Math.round(x * 100) / 100
const byDate = <T extends { date: string }>(a: T[]) => [...a].sort((x, y) => x.date.localeCompare(y.date))

export function toSheet(d: Data): Record<Coll, Cell[][]> {
  const vname = (id: string) => d.vehicles.find((v) => v.id === id)?.name ?? ''
  const vorder = (id: string) => d.vehicles.findIndex((v) => v.id === id)
  const e = (x: number | null | undefined): Cell => (x == null ? '' : x)
  return {
    vehicles: [TABS.vehicles.cols, ...d.vehicles.map((v) => [v.name, v.type, v.currency, v.odometer, v.color, v.id])],
    service: [TABS.service.cols, ...byDate(d.service).map((s) => [s.date, vname(s.vehicleId), e(s.odometer), s.category, s.description, s.tags.map((t) => '#' + t).join(' '), e(s.parts), e(s.labour), s.parts == null && s.labour == null ? '' : r2((s.parts ?? 0) + (s.labour ?? 0)), s.notes, s.media, s.id])],
    fuel: [TABS.fuel.cols, ...byDate(d.fuel).map((f) => [f.date, vname(f.vehicleId), f.odometer, f.liters, f.total, f.liters ? Math.round((f.total / f.liters) * 1000) / 1000 : '', f.full, f.missed, f.station, f.id])],
    schedule: [TABS.schedule.cols, ...[...d.schedule].sort((a, b) => vorder(a.vehicleId) - vorder(b.vehicleId)).map((s) => [vname(s.vehicleId), s.name, '#' + s.tag, e(s.intervalKm), e(s.intervalDays), s.hint, s.id])],
    expenses: [TABS.expenses.cols, ...byDate(d.expenses).map((x) => [x.date, vname(x.vehicleId), x.kind, x.amount, x.note, x.media, x.id])],
  }
}

/* ---------- reading (tolerates hand edits: Russian labels, decimal commas, real dates) ---------- */

const str = (c: Cell | undefined) => (c == null ? '' : String(c)).trim()
const numOrNull = (c: Cell | undefined): number | null => {
  if (c === '' || c == null) return null
  if (typeof c === 'number') return c
  const x = parseFloat(String(c).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(x) ? x : null
}
const bool = (c: Cell | undefined, dflt: boolean) => {
  if (typeof c === 'boolean') return c
  const s = str(c).toLowerCase()
  if (!s) return dflt
  return ['true', '1', 'yes', 'да', 'jah', 'x', '✓'].includes(s)
}
/** Sheets serial day (from 30.12.1899), ISO text or DD.MM.YYYY. */
export function toIso(c: Cell | undefined): string | null {
  if (typeof c === 'number' && c > 1000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = str(c)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
const CAT: Record<string, Category> = { service: 'service', 'то': 'service', consumables: 'consumables', 'расходники': 'consumables', repair: 'repair', 'ремонт': 'repair', accessories: 'accessories', 'аксессуары': 'accessories' }
const KIND: Record<string, ExpenseKind> = { insurance: 'insurance', 'страховка': 'insurance', inspection: 'inspection', 'техосмотр': 'inspection', tax: 'tax', 'налог': 'tax', fuel: 'fuel', 'топливо': 'fuel', other: 'other', 'прочее': 'other' }
const VT: Record<string, VType> = { moto: 'moto', 'мотоцикл': 'moto', car: 'car', 'автомобиль': 'car' }
const tagsOf = (c: Cell | undefined) => str(c).split(/[\s,]+/).map((t) => t.replace(/^#+/, '').toLowerCase()).filter(Boolean)

export interface ReadResult {
  data: Data
  /** Rows that could not be read (no vehicle, no date…), as "tab row N". */
  skipped: string[]
}

export function fromSheet(tabs: Record<Coll, Cell[][]>): ReadResult {
  const skipped: string[] = []
  const rows = (c: Coll) => {
    const [head, ...body] = tabs[c]
    const idx = (head ?? []).map((h) => str(h).toLowerCase())
    return body
      .map((r, i) => ({ n: i + 2, get: (k: string) => r[idx.indexOf(k)] as Cell | undefined, empty: r.every((x) => str(x) === '') }))
      .filter((r) => !r.empty)
  }
  const data: Data = { vehicles: [], service: [], fuel: [], schedule: [], expenses: [] }
  for (const r of rows('vehicles')) {
    const name = str(r.get('name'))
    if (!name) { skipped.push(`Garage ${r.n}`); continue }
    data.vehicles.push({ id: str(r.get('id')) || uid(), name, type: VT[str(r.get('type')).toLowerCase()] ?? 'car', color: str(r.get('color')) || '#4C9AFF', currency: str(r.get('currency')) || '€', odometer: numOrNull(r.get('odometer')) ?? 0 })
  }
  const vid = (c: Cell | undefined) => {
    const s = str(c).toLowerCase()
    return data.vehicles.find((v) => v.name.toLowerCase() === s || v.id === str(c))?.id ?? null
  }
  for (const r of rows('service')) {
    const v = vid(r.get('vehicle'))
    const date = toIso(r.get('date'))
    if (!v || !date) { skipped.push(`Service log ${r.n}`); continue }
    let parts = numOrNull(r.get('parts'))
    const labour = numOrNull(r.get('labour'))
    const total = numOrNull(r.get('total'))
    if (parts == null && labour == null && total != null) parts = total
    data.service.push({ id: str(r.get('id')) || uid(), vehicleId: v, date, odometer: numOrNull(r.get('odometer')), category: CAT[str(r.get('category')).toLowerCase()] ?? 'service', description: str(r.get('description')), tags: tagsOf(r.get('tags')), parts, labour, notes: str(r.get('notes')), media: str(r.get('media')) })
  }
  for (const r of rows('fuel')) {
    const v = vid(r.get('vehicle'))
    const date = toIso(r.get('date'))
    const odometer = numOrNull(r.get('odometer'))
    const liters = numOrNull(r.get('liters'))
    let total = numOrNull(r.get('total'))
    const ppl = numOrNull(r.get('price_per_liter'))
    if (total == null && ppl != null && liters != null) total = r2(ppl * liters)
    if (!v || !date || odometer == null || liters == null || total == null) { skipped.push(`Fuel ${r.n}`); continue }
    data.fuel.push({ id: str(r.get('id')) || uid(), vehicleId: v, date, odometer, liters, total, full: bool(r.get('full_tank'), true), missed: bool(r.get('missed_previous'), false), station: str(r.get('station')) })
  }
  for (const r of rows('schedule')) {
    const v = vid(r.get('vehicle'))
    const tag = tagsOf(r.get('tag'))[0]
    if (!v || !tag) { skipped.push(`Schedule ${r.n}`); continue }
    data.schedule.push({ id: str(r.get('id')) || uid(), vehicleId: v, name: str(r.get('name')) || tag, tag, intervalKm: numOrNull(r.get('interval_km')), intervalDays: numOrNull(r.get('interval_days')), hint: str(r.get('hint')) })
  }
  for (const r of rows('expenses')) {
    const v = vid(r.get('vehicle'))
    const date = toIso(r.get('date'))
    const amount = numOrNull(r.get('amount'))
    if (!v || !date || amount == null) { skipped.push(`Other expenses ${r.n}`); continue }
    data.expenses.push({ id: str(r.get('id')) || uid(), vehicleId: v, date, kind: KIND[str(r.get('kind')).toLowerCase()] ?? 'other', amount, note: str(r.get('note')), media: str(r.get('media')) })
  }
  return { data, skipped }
}

/* ---------- three-way merge ---------- */

/** Comparable form: same rounding and key order on both sides. */
function canon(o: unknown): string {
  return JSON.stringify(o, (_k, v) => {
    if (typeof v === 'number') return Math.round(v * 1000) / 1000
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
    return v
  })
}

export interface MergeStats {
  fromSheet: number
  conflicts: number
}

/**
 * base = what both sides had after the last sync. A record changed on one side takes that side;
 * changed on both, the app wins. Deleted on one side and untouched on the other: deleted.
 */
export function merge3(base: Data, local: Data, remote: Data): { data: Data; stats: MergeStats } {
  const stats: MergeStats = { fromSheet: 0, conflicts: 0 }
  const out = {} as Data
  for (const c of COLLS) {
    type R = { id: string }
    const B = new Map((base[c] as R[]).map((x) => [x.id, x]))
    const L = new Map((local[c] as R[]).map((x) => [x.id, x]))
    const Rm = new Map((remote[c] as R[]).map((x) => [x.id, x]))
    const ids = [...new Set([...L.keys(), ...Rm.keys()])]
    const res: R[] = []
    for (const id of ids) {
      const b = B.get(id)
      const l = L.get(id)
      const r = Rm.get(id)
      const same = (x?: R, y?: R) => (x && y ? canon(x) === canon(y) : x === y)
      if (l && r) {
        if (same(l, r) || !b || same(l, b) === same(r, b)) {
          res.push(l)
          if (b && !same(l, r) && !same(l, b)) stats.conflicts++
        } else if (same(l, b)) {
          res.push(r)
          stats.fromSheet++
        } else res.push(l)
      } else if (l && !r) {
        if (b && same(l, b)) continue // deleted in the sheet
        res.push(l)
      } else if (r && !l) {
        if (b && same(r, b)) continue // deleted in the app
        res.push(r)
        stats.fromSheet++
      }
    }
    // keep the app's order, new sheet rows at the end
    const order = new Map((local[c] as R[]).map((x, i) => [x.id, i]))
    res.sort((x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9))
    ;(out as Record<Coll, R[]>)[c] = res
  }
  // records that point at a vehicle that is gone
  const vids = new Set(out.vehicles.map((v) => v.id))
  out.service = out.service.filter((x) => vids.has(x.vehicleId))
  out.fuel = out.fuel.filter((x) => vids.has(x.vehicleId))
  out.schedule = out.schedule.filter((x) => vids.has(x.vehicleId))
  out.expenses = out.expenses.filter((x) => vids.has(x.vehicleId))
  return { data: out, stats }
}

/* ---------- status ---------- */

export type SyncState =
  | { s: 'off' }
  | { s: 'signin' }
  | { s: 'syncing' }
  | { s: 'synced'; at: string; fromSheet: number; skipped: string[] }
  | { s: 'offline' }
  | { s: 'error'; msg: string }

let status: SyncState = { s: 'off' }
const subs = new Set<() => void>()
const setStatus = (x: SyncState) => {
  status = x
  subs.forEach((f) => f())
}
export const useSync = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => status)

/* ---------- running a sync ---------- */

const BASE_KEY = 'sync-base'
let running: Promise<void> | null = null
let again = false

async function ensureTabs(id: string): Promise<void> {
  const tabs = await sheetTabs(id)
  const have = new Set(tabs.map((t) => t.title))
  const req: unknown[] = []
  const want = COLLS.map((c) => TABS[c].title)
  // a new spreadsheet has one empty "Sheet1"/"Лист1": rename it rather than leave it
  const spare = tabs.find((t) => !want.includes(t.title))
  for (const title of want) {
    if (have.has(title)) continue
    if (spare && tabs.length === 1 && !req.some((r) => (r as { updateSheetProperties?: unknown }).updateSheetProperties)) {
      req.push({ updateSheetProperties: { properties: { sheetId: spare.sheetId, title, gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } })
    } else req.push({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })
  }
  if (req.length) await sheetBatchUpdate(id, req)
}

async function runSync(): Promise<void> {
  const g = getDB().settings.google
  if (!googleConfigured() || !g) return setStatus({ s: 'off' })
  if (!getToken()) return setStatus({ s: 'signin' })
  if (!navigator.onLine) return setStatus({ s: 'offline' })
  setStatus({ s: 'syncing' })
  try {
    await ensureTabs(g.sheetId)
    const vals = await readRanges(g.sheetId, COLLS.map(rangeOf))
    const tabs = Object.fromEntries(COLLS.map((c, i) => [c, vals[i]])) as Record<Coll, Cell[][]>
    const remote = fromSheet(tabs)
    const base = (await kvGet<Data>(BASE_KEY)) ?? { vehicles: [], service: [], fuel: [], schedule: [], expenses: [] }
    const local = pick(getDB())
    const { data, stats } = merge3(base, local, remote.data)
    if (canon(data) !== canon(local)) update((d) => Object.assign(d, data))
    const out = toSheet(data)
    // write only when the sheet differs, so a hand edit made meanwhile is not overwritten for nothing
    const trim = (rows: Cell[][]) => rows.map((r) => { const x = [...r]; while (x.length && (x[x.length - 1] === '' || x[x.length - 1] == null)) x.pop(); return x })
    if (COLLS.some((c) => canon(trim(out[c])) !== canon(trim(tabs[c]))))
      await writeRanges(g.sheetId, COLLS.map((c) => ({ range: `'${TABS[c].title}'!A1`, values: out[c] })), COLLS.map((c) => `'${TABS[c].title}'`))
    await kvSet(BASE_KEY, data)
    const at = new Date().toISOString()
    update((d) => { if (d.settings.google) d.settings.google.lastSync = at })
    setStatus({ s: 'synced', at, fromSheet: stats.fromSheet, skipped: remote.skipped })
  } catch (e) {
    if (e instanceof AuthError) setStatus({ s: 'signin' })
    else if (!navigator.onLine) setStatus({ s: 'offline' })
    else setStatus({ s: 'error', msg: (e as Error).message })
  }
}

/** Starts a sync, or queues one more if one is already running. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = runSync().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

/** First connection after sign-in: find or create the folder and the spreadsheet, then sync. */
export async function connect(): Promise<void> {
  setStatus({ s: 'syncing' })
  try {
    const [layout, email] = await Promise.all([ensureLayout(), userEmail().catch(() => '')])
    const prev = getDB().settings.google
    // another spreadsheet than before: the old base says nothing about it
    if (!prev || prev.sheetId !== layout.sheetId) await kvSet(BASE_KEY, undefined)
    update((d) => { d.settings.google = { email: email || prev?.email || '', folderId: layout.folderId, receiptsId: layout.receiptsId, sheetId: layout.sheetId, lastSync: prev?.sheetId === layout.sheetId ? prev.lastSync : null } })
    await syncNow()
  } catch (e) {
    if (e instanceof AuthError) setStatus({ s: 'signin' })
    else setStatus({ s: 'error', msg: (e as Error).message })
  }
}

/** Forgets the connection on this device. Data stays here and in the spreadsheet. */
export async function disconnect(): Promise<void> {
  update((d) => { d.settings.google = null })
  await kvSet(BASE_KEY, undefined)
  setStatus({ s: 'off' })
}

/* ---------- renewing the Google session without the user ---------- */

let uiBusy = false
/** The app tells sync when a form or another screen is open: never leave the app then. */
export const setUiBusy = (b: boolean) => { uiBusy = b }
const AUTO_KEY = 'tl-auto-auth-at'

/**
 * The Google session lasts about an hour. When it has run out, the app goes to Google and back
 * by itself (prompt=none: no screen as long as the user is still signed in to Google there).
 * Only when nothing is being typed, with a network, and at most once in 10 minutes, so a refusal
 * can never turn into a loop. If Google wants the user, the top bar shows "Sign in again".
 */
export function renewSession(): boolean {
  const g = getDB().settings.google
  if (!googleConfigured() || !g || getToken() || !navigator.onLine || uiBusy) return false
  let last = 0
  try { last = Number(localStorage.getItem(AUTO_KEY) ?? 0) } catch { return false }
  if (Date.now() - last < 10 * 60_000) return false
  try { localStorage.setItem(AUTO_KEY, String(Date.now())) } catch { return false }
  setStatus({ s: 'syncing' })
  signIn({ email: g.email, auto: true })
  return true
}

let timer: number | undefined
export function initSync(): void {
  if (!googleConfigured()) return
  onDataChange(() => {
    if (!getDB().settings.google) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void syncNow(), 4000)
  })
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !renewSession()) void syncNow() })
  if (!renewSession()) void syncNow()
}

/** Called once at start with what the sign-in redirect brought back. */
export function afterAuth(r: import('./google').AuthReturn): void {
  if (r.kind === 'ok') void connect()
  else if (r.kind === 'error' && r.auto) setStatus({ s: 'signin' })
  else if (r.kind === 'error') setStatus({ s: 'error', msg: 'Google: ' + r.error })
}
