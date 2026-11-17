import type { Category, DB, ExpenseKind, FuelEntry, VType } from './store'

/** One vehicle's fill-ups read from a Fuelly CSV export, already in km and litres. */
export interface FuellyCar {
  name: string
  model: string
  rows: Omit<FuelEntry, 'id' | 'vehicleId'>[]
  /** The file was in miles and gallons and has been converted. */
  converted: boolean
  /** Which app the file came from. */
  source?: 'Fuelly' | 'Fuelio'
  /** Fuelio "costs": other expenses, and work that belongs in the service log. */
  costs?: { date: string; odometer: number | null; title: string; amount: number; notes: string; kind: ExpenseKind | null; category: Category | null }[]
}

const MILE = 1.609344
const US_GALLON = 3.785411784

/** Minimal CSV reader: commas, double-quoted fields, "" inside quotes. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim() !== '')) out.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) out.push(row)
  return out
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null
  const x = parseFloat(s.trim().replace(',', '.'))
  return Number.isFinite(x) ? x : null
}
const flag = (s: string | undefined) => (s ?? '').trim() === '1'

/** Fuelly writes YYYY-MM-DD; older exports may use M/D/YY or M/D/YYYY. */
function isoDate(s: string): string | null {
  const t = s.trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

export function parseFuelly(text: string): FuellyCar[] {
  const rows = parseCsv(text)
  if (rows[0]?.[0]?.trim().startsWith('##')) return parseFuelio(rows)
  if (rows.length < 2) throw new Error('empty')
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const iOdo = col('odometer')
  const iDate = col('fuelup_date')
  const iLit = col('litres', 'liters')
  const iGal = col('gallons')
  const iPrice = col('price')
  if (iOdo < 0 || iDate < 0 || (iLit < 0 && iGal < 0)) throw new Error('format')
  const miles = iLit < 0 || head.includes('miles') || head.includes('mpg')
  const iName = col('car_name')
  const iModel = col('model')
  const iMissed = col('missed_fuelup')
  const iPartial = col('partial_fuelup')
  const iBrand = col('brand')
  const iNotes = col('notes')
  const cars = new Map<string, FuellyCar>()
  for (const r of rows.slice(1)) {
    const odoRaw = num(r[iOdo])
    const date = isoDate(r[iDate] ?? '')
    const volRaw = num(iLit >= 0 ? r[iLit] : r[iGal])
    if (odoRaw == null || !date || volRaw == null || volRaw <= 0) continue
    const odometer = Math.round(miles ? odoRaw * MILE : odoRaw)
    const liters = Math.round((iLit >= 0 ? volRaw : volRaw * US_GALLON) * 1000) / 1000
    const unitPrice = num(r[iPrice]) ?? 0
    // Fuelly's price is per litre (or per gallon): the receipt total is volume × price.
    const total = Math.round(volRaw * unitPrice * 100) / 100
    const name = (iName >= 0 ? r[iName] : '').trim() || 'Fuelly'
    const station = [iBrand >= 0 ? r[iBrand] : '', iNotes >= 0 ? r[iNotes] : ''].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ')
    let car = cars.get(name)
    if (!car) {
      car = { name, model: (iModel >= 0 ? r[iModel] : '').trim(), rows: [], converted: miles }
      cars.set(name, car)
    }
    car.rows.push({ date, odometer, liters, total, full: !flag(iPartial >= 0 ? r[iPartial] : '0'), missed: flag(iMissed >= 0 ? r[iMissed] : '0'), station })
  }
  if (!cars.size) throw new Error('empty')
  for (const c of cars.values()) c.rows.sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date))
  return [...cars.values()]
}

/* ---------- Fuelio ---------- */

/** Dates as written by Fuelio: its own ImportCSVDateFormat (yyyy-MM-dd by default), or dd.MM.yyyy / MM/dd/yyyy. */
function fuelioDate(s: string, fmt: string): string | null {
  const t = s.trim()
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (!m) return null
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const monthFirst = /^M/.test(fmt) || (!/^d/.test(fmt) && t.includes('/'))
  const [mo, d] = monthFirst ? [m[1], m[2]] : [m[2], m[1]]
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

const COST_KIND: [RegExp, ExpenseKind | Category][] = [
  [/insur|страх|kindlust|ubezp|apdro|draud/i, 'insurance'],
  [/regist|tax|налог|maks|podat|nodok|mokes|road ?toll|vignet/i, 'tax'],
  [/inspect|техосмотр|ülevaatus|przegl|tehn|apžiūr|mot\b/i, 'inspection'],
  [/accessor|аксесс|tarvik|akcesor/i, 'accessories'],
  [/tyre|tire|шин|rehv|opon|riep|padang/i, 'consumables'],
  [/repair|ремонт|remont|parand|labo|taisym/i, 'repair'],
  [/service|maint|oil|обслуж|масл|hooldus|serwis|servis|apkop|techninė/i, 'service'],
  [/park|wash|мойк|toll|platn|pesu|myjn/i, 'other'],
]

/** A Fuelio backup (one vehicle per file): sections "## Vehicle", "## Log", "## CostCategories", "## Costs". */
export function parseFuelio(rows: string[][]): FuellyCar[] {
  const sec: Record<string, string[][]> = {}
  let cur = ''
  for (const r of rows) {
    const c0 = r[0]?.trim() ?? ''
    if (c0.startsWith('##')) { cur = c0.replace(/^#+\s*/, '').toLowerCase(); sec[cur] = []; continue }
    if (cur) sec[cur].push(r)
  }
  const table = (name: string) => {
    const t = sec[name] ?? []
    const head = (t[0] ?? []).map((h) => h.trim().toLowerCase())
    return { head, body: t.slice(1), col: (...pre: string[]) => head.findIndex((h) => pre.some((p) => h === p || h.startsWith(p))) }
  }
  const veh = table('vehicle')
  const vrow = veh.body[0] ?? []
  const vget = (k: string) => (veh.col(k) >= 0 ? (vrow[veh.col(k)] ?? '').trim() : '')
  const name = vget('name') || 'Fuelio'
  // the vehicle's own name in Fuelio is what the user knows it by; make and model only help guess the type
  const model = name
  const makeModel = [vget('make'), vget('model')].filter(Boolean).join(' ')
  const fmt = vget('importcsvdateformat') || 'yyyy-MM-dd'

  const log = table('log')
  if (!log.head.length) throw new Error('format')
  const iDate = log.col('data', 'date')
  const iOdo = log.col('odo')
  const iFuel = log.col('fuel')
  const iFull = log.col('full')
  const iPrice = log.col('price')
  const iCity = log.col('city')
  const iNotes = log.col('notes')
  const iMissed = log.col('missed')
  if (iDate < 0 || iOdo < 0 || iFuel < 0) throw new Error('format')
  const miles = /\bmi/.test(log.head[iOdo]) || vget('distunit') === '1'
  const fuelHead = log.head[iFuel]
  const gallon = /imp/.test(fuelHead) ? 4.54609 : /gal/.test(fuelHead) ? US_GALLON : 1
  const out: FuellyCar = { name: makeModel ? `${name} (${makeModel})` : name, model, rows: [], converted: miles || gallon !== 1, source: 'Fuelio', costs: [] }
  for (const r of log.body) {
    const date = fuelioDate(r[iDate] ?? '', fmt)
    const odoRaw = num(r[iOdo])
    const vol = num(r[iFuel])
    if (!date || odoRaw == null || vol == null || vol <= 0) continue
    out.rows.push({
      date,
      odometer: Math.round(miles ? odoRaw * MILE : odoRaw),
      liters: Math.round(vol * gallon * 1000) / 1000,
      total: Math.round((num(r[iPrice]) ?? 0) * 100) / 100,
      full: iFull < 0 ? true : flag(r[iFull]),
      missed: iMissed >= 0 && flag(r[iMissed]),
      station: [iCity >= 0 ? r[iCity] : '', iNotes >= 0 ? r[iNotes] : ''].map((x) => (x ?? '').trim()).filter(Boolean).join(' · '),
    })
  }

  const cats = table('costcategories')
  const catName = new Map<string, string>()
  const cId = cats.col('costtypeid', 'id')
  const cName = cats.col('name')
  if (cId >= 0 && cName >= 0) for (const r of cats.body) catName.set((r[cId] ?? '').trim(), (r[cName] ?? '').trim())
  const costs = table('costs')
  const kTitle = costs.col('costtitle', 'title')
  const kDate = costs.col('date', 'data')
  const kOdo = costs.col('odo')
  const kType = costs.col('costtypeid')
  const kNotes = costs.col('notes')
  const kCost = costs.head.findIndex((h) => h === 'cost')
  const kIncome = costs.col('isincome')
  const kTemplate = costs.col('istemplate')
  if (kDate >= 0 && kCost >= 0) {
    for (const r of costs.body) {
      if ((kIncome >= 0 && flag(r[kIncome])) || (kTemplate >= 0 && flag(r[kTemplate]))) continue
      const date = fuelioDate(r[kDate] ?? '', fmt)
      const amount = num(r[kCost])
      if (!date || amount == null || amount <= 0) continue
      const title = (kTitle >= 0 ? r[kTitle] : '')?.trim() ?? ''
      const cat = catName.get((kType >= 0 ? r[kType] : '')?.trim() ?? '') ?? ''
      const hit = COST_KIND.find(([re]) => re.test(cat) || re.test(title))?.[1] ?? 'other'
      const isService = hit === 'service' || hit === 'repair' || hit === 'consumables' || hit === 'accessories'
      const odoRaw = kOdo >= 0 ? num(r[kOdo]) : null
      out.costs!.push({
        date,
        odometer: odoRaw ? Math.round(miles ? odoRaw * MILE : odoRaw) : null,
        title: title || cat,
        amount: Math.round(amount * 100) / 100,
        notes: [cat && title ? cat : '', (kNotes >= 0 ? r[kNotes] : '')?.trim() ?? ''].filter(Boolean).join(' · '),
        kind: isService ? null : (hit as ExpenseKind),
        category: isService ? (hit as Category) : null,
      })
    }
  }
  if (!out.rows.length && !out.costs!.length) throw new Error('empty')
  out.rows.sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date))
  return [out]
}

/** Several files at once (Fuelio keeps one file per vehicle). */
export const parseFuelFiles = (texts: string[]): FuellyCar[] => texts.flatMap((t) => parseFuelly(t))

export const guessType = (c: FuellyCar): VType =>
  /moto|bike|honda nc|yamaha|kawasaki|suzuki gs|ducati|ktm|triumph|harley|bmw r|bmw f|bmw g|scooter|vespa/i.test(c.name + ' ' + c.model) ? 'moto' : 'car'

/**
 * Adds the fill-ups to a vehicle. Ids are derived from vehicle, date and odometer,
 * so importing the same file twice replaces rather than duplicates.
 */
export function addFuellyRows(d: DB, vehicleId: string, car: FuellyCar): { added: number; replaced: number } {
  let added = 0
  let replaced = 0
  for (const r of car.rows) {
    const id = `fuelly-${vehicleId}-${r.date}-${r.odometer}`
    const rec: FuelEntry = { id, vehicleId, ...r }
    const i = d.fuel.findIndex((f) => f.id === id || (f.vehicleId === vehicleId && f.odometer === r.odometer && f.date === r.date))
    if (i >= 0) { d.fuel[i] = rec; replaced++ }
    else { d.fuel.push(rec); added++ }
  }
  for (const c of car.costs ?? []) {
    const id = `fuelio-${vehicleId}-${c.date}-${c.amount}-${c.title.slice(0, 20)}`
    if (c.category) {
      const rec = { id, vehicleId, date: c.date, odometer: c.odometer, category: c.category, description: c.title, tags: [], parts: c.amount, labour: null, notes: c.notes, media: '' }
      const i = d.service.findIndex((x) => x.id === id)
      if (i >= 0) { d.service[i] = { ...d.service[i], ...rec, tags: d.service[i].tags }; replaced++ } else { d.service.push(rec); added++ }
    } else {
      const rec = { id, vehicleId, date: c.date, kind: c.kind ?? 'other', amount: c.amount, note: [c.title, c.notes].filter(Boolean).join(' · '), media: '' }
      const i = d.expenses.findIndex((x) => x.id === id)
      if (i >= 0) { d.expenses[i] = rec; replaced++ } else { d.expenses.push(rec); added++ }
    }
  }
  return { added, replaced }
}

export interface FuelOverlap {
  expenseId: string
  year: string
  amount: number
  fuellySum: number
}

/** "Fuel (lump sum)" expenses of a year that now also has individual fill-ups would be counted twice. */
export function lumpOverlaps(d: DB, vehicleId: string): FuelOverlap[] {
  const out: FuelOverlap[] = []
  for (const e of d.expenses) {
    if (e.vehicleId !== vehicleId || e.kind !== 'fuel') continue
    const year = e.date.slice(0, 4)
    const sum = d.fuel.filter((f) => f.vehicleId === vehicleId && f.date.startsWith(year)).reduce((s, f) => s + f.total, 0)
    if (sum > 0) out.push({ expenseId: e.id, year, amount: e.amount, fuellySum: Math.round(sum * 100) / 100 })
  }
  return out
}
