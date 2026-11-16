import type { DB, FuelEntry, VType } from './store'

/** One vehicle's fill-ups read from a Fuelly CSV export, already in km and litres. */
export interface FuellyCar {
  name: string
  model: string
  rows: Omit<FuelEntry, 'id' | 'vehicleId'>[]
  /** The file was in miles and gallons and has been converted. */
  converted: boolean
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
