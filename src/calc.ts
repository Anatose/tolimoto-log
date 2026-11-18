import type { DB, FuelEntry, ScheduleItem } from './store'

/** Current odometer: the largest value among the manual entry and all records. */
export function currentOdo(db: DB, vid: string, exceptId?: string): number {
  let m = db.vehicles.find((v) => v.id === vid)?.odometer ?? 0
  for (const s of db.service)
    if (s.vehicleId === vid && s.id !== exceptId && s.odometer != null && s.odometer > m) m = s.odometer
  for (const f of db.fuel) if (f.vehicleId === vid && f.id !== exceptId && f.odometer > m) m = f.odometer
  return m
}

export type Status = 'ok' | 'soon' | 'over' | 'none'
export interface SchedState {
  item: ScheduleItem
  lastOdo: number | null
  lastDate: string | null
  remKm: number | null
  remDays: number | null
  status: Status
  /** 0..1 share of the interval already used (the worse of km and days). */
  used: number
}

export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

export function schedState(db: DB, item: ScheduleItem, todayStr: string): SchedState {
  let lastOdo: number | null = null
  let lastDate: string | null = null
  for (const e of db.service) {
    if (e.vehicleId !== item.vehicleId || !e.tags.includes(item.tag)) continue
    if (e.odometer != null && (lastOdo == null || e.odometer > lastOdo)) lastOdo = e.odometer
    if (lastDate == null || e.date > lastDate) lastDate = e.date
  }
  const cur = currentOdo(db, item.vehicleId)
  const remKm = item.intervalKm && lastOdo != null ? lastOdo + item.intervalKm - cur : null
  const remDays = item.intervalDays && lastDate ? item.intervalDays - daysBetween(lastDate, todayStr) : null
  let status: Status = 'none'
  let used = 0
  if (remKm != null || remDays != null) {
    status = 'ok'
    const ik = item.intervalKm ?? 0
    const id = item.intervalDays ?? 0
    const soonKm = remKm != null && remKm <= Math.max(ik * 0.1, Math.min(1000, ik * 0.25))
    const soonDays = remDays != null && remDays <= Math.max(id * 0.1, Math.min(30, id * 0.25))
    if (soonKm || soonDays) status = 'soon'
    if ((remKm != null && remKm < 0) || (remDays != null && remDays < 0)) status = 'over'
    const uk = remKm != null ? 1 - remKm / ik : 0
    const ud = remDays != null ? 1 - remDays / id : 0
    used = Math.min(1, Math.max(0, uk, ud))
  }
  return { item, lastOdo, lastDate, remKm, remDays, status, used }
}

export interface FuelSeg {
  id: string
  date: string
  odometer: number
  dist: number
  liters: number
  l100: number
  cost: number
}

/** Consumption between consecutive full tanks; a segment with a missed fill-up is skipped. */
export function fuelSegments(list: FuelEntry[]): FuelSeg[] {
  const a = [...list].sort((x, y) => x.odometer - y.odometer || x.date.localeCompare(y.date))
  const out: FuelSeg[] = []
  let start = -1
  let liters = 0
  let cost = 0
  let bad = false
  for (let i = 0; i < a.length; i++) {
    const e = a[i]
    if (start >= 0) {
      liters += e.liters
      cost += e.total
      if (e.missed) bad = true
    }
    if (e.full) {
      if (start >= 0 && !bad) {
        const dist = e.odometer - a[start].odometer
        if (dist > 0)
          out.push({ id: e.id, date: e.date, odometer: e.odometer, dist, liters, l100: (liters / dist) * 100, cost })
      }
      start = i
      liters = 0
      cost = 0
      bad = false
    }
  }
  return out
}

export function avgL100(segs: FuelSeg[]): number | null {
  const dist = segs.reduce((s, x) => s + x.dist, 0)
  if (dist <= 0) return null
  return (segs.reduce((s, x) => s + x.liters, 0) / dist) * 100
}

export interface Totals {
  service: number
  accessories: number
  fuel: number
  other: number
  total: number
}

export function totals(db: DB, vid: string, year: number | null): Totals {
  const inYear = (d: string) => year == null || d.startsWith(String(year))
  const t: Totals = { service: 0, accessories: 0, fuel: 0, other: 0, total: 0 }
  for (const s of db.service) {
    if (s.vehicleId !== vid || !inYear(s.date)) continue
    const sum = (s.parts ?? 0) + (s.labour ?? 0)
    if (s.category === 'accessories') t.accessories += sum
    else t.service += sum
  }
  for (const f of db.fuel) if (f.vehicleId === vid && inYear(f.date)) t.fuel += f.total
  for (const e of db.expenses) {
    if (e.vehicleId !== vid || !inYear(e.date)) continue
    if (e.kind === 'fuel') t.fuel += e.amount
    else t.other += e.amount
  }
  t.total = t.service + t.accessories + t.fuel + t.other
  return t
}

export function years(db: DB, vid: string, thisYear: number): number[] {
  const set = new Set<number>([thisYear])
  const add = (d: string) => set.add(Number(d.slice(0, 4)))
  db.service.forEach((s) => s.vehicleId === vid && add(s.date))
  db.fuel.forEach((f) => f.vehicleId === vid && add(f.date))
  db.expenses.forEach((e) => e.vehicleId === vid && add(e.date))
  return [...set].filter((y) => y > 1900).sort((a, b) => b - a)
}

/** Distance covered by the records: current odometer minus the smallest odometer known. */
export function distanceKnown(db: DB, vid: string): number {
  const cur = currentOdo(db, vid)
  let min = db.vehicles.find((v) => v.id === vid)?.odometer ?? cur
  for (const s of db.service) if (s.vehicleId === vid && s.odometer != null && s.odometer < min) min = s.odometer
  for (const f of db.fuel) if (f.vehicleId === vid && f.odometer < min) min = f.odometer
  return cur - min
}

export function costPerKm(db: DB, vid: string): number | null {
  const dist = distanceKnown(db, vid)
  if (dist <= 0) return null
  return totals(db, vid, null).total / dist
}

/* ---------- full cost of ownership ---------- */

export type OwnPart = 'loss' | 'fuel' | 'service' | 'fixed' | 'accessories' | 'other'
export const OWN_PARTS: OwnPart[] = ['loss', 'fuel', 'service', 'fixed', 'accessories', 'other']

export interface OwnCost {
  /** Purchase date (start of the period) and its end: the sale date or today. */
  from: string
  to: string
  /** Distance since purchase; null when the odometer at purchase is unknown. */
  dist: number | null
  months: number
  /** Purchase price minus the sale price or the current estimate; null when that value is unknown. */
  loss: number | null
  /** Money per part over the period; loss is 0 when unknown. */
  parts: Record<OwnPart, number>
  /** Recorded spending since purchase (as in totals). */
  spend: number
  /** Spending plus loss of value; null when the loss is unknown. */
  total: number | null
  perKm: number | null
  perMonth: number | null
  /** Per month: loss of value + insurance, inspection and tax (paid whether you ride or not) … */
  fixedMonth: number | null
  /** … and everything else (fuel, service, accessories, other). */
  variableMonth: number | null
}

const DAYS_PER_MONTH = 365.25 / 12

/** Full cost of ownership of one vehicle; null when no purchase date or price was entered. */
export function ownershipCost(db: DB, vid: string, todayStr: string): OwnCost | null {
  const v = db.vehicles.find((x) => x.id === vid)
  const o = v?.ownership
  if (!o || !o.purchaseDate || o.purchasePrice == null) return null
  const from = o.purchaseDate
  const to = o.status === 'sold' && o.soldDate ? o.soldDate : todayStr
  const inPeriod = (d: string) => d >= from && d <= to
  const parts: Record<OwnPart, number> = { loss: 0, fuel: 0, service: 0, fixed: 0, accessories: 0, other: 0 }
  for (const s of db.service) {
    if (s.vehicleId !== vid || !inPeriod(s.date)) continue
    parts[s.category === 'accessories' ? 'accessories' : 'service'] += (s.parts ?? 0) + (s.labour ?? 0)
  }
  for (const f of db.fuel) if (f.vehicleId === vid && inPeriod(f.date)) parts.fuel += f.total
  for (const e of db.expenses) {
    if (e.vehicleId !== vid || !inPeriod(e.date)) continue
    if (e.kind === 'fuel') parts.fuel += e.amount
    else if (e.kind === 'other') parts.other += e.amount
    else parts.fixed += e.amount
  }
  const spend = parts.fuel + parts.service + parts.fixed + parts.accessories + parts.other
  const end = o.status === 'sold' ? o.soldPrice : o.valueNow
  const loss = end == null ? null : o.purchasePrice - end
  parts.loss = loss ?? 0
  const total = loss == null ? null : spend + loss
  const dist = o.purchaseOdometer == null ? null : currentOdo(db, vid) - o.purchaseOdometer
  const months = Math.max(0, daysBetween(from, to)) / DAYS_PER_MONTH
  const perKm = total != null && dist != null && dist > 0 ? total / dist : null
  const perMonth = total != null && months >= 1 ? total / months : null
  const fixedMonth = loss != null && months >= 1 ? (loss + parts.fixed) / months : null
  const variableMonth = months >= 1 ? (parts.fuel + parts.service + parts.accessories + parts.other) / months : null
  return { from, to, dist, months, loss, parts, spend, total, perKm, perMonth, fixedMonth, variableMonth }
}

/** Yearly reminder: a vehicle still owned whose estimate is older than a year (archived ones are left alone). */
export function valueDue(db: DB, todayStr: string, now = Date.now()): string | null {
  if (db.settings.valueSnooze && Date.parse(db.settings.valueSnooze) > now) return null
  for (const v of db.vehicles) {
    const o = v.ownership
    if (v.archived || !o || o.status !== 'own' || !o.purchaseDate) continue
    if (o.valueDate && daysBetween(o.valueDate, todayStr) > 365) return v.id
  }
  return null
}

/** First and last day with any record, and the odometer range; for the archive cards and comparison. */
export function recordSpan(db: DB, vid: string): { first: string | null; last: string | null; minOdo: number | null; maxOdo: number | null } {
  let first: string | null = null
  let last: string | null = null
  let minOdo: number | null = null
  let maxOdo: number | null = null
  const see = (d: string, odo: number | null) => {
    if (!first || d < first) first = d
    if (!last || d > last) last = d
    if (odo != null) {
      if (minOdo == null || odo < minOdo) minOdo = odo
      if (maxOdo == null || odo > maxOdo) maxOdo = odo
    }
  }
  for (const s of db.service) if (s.vehicleId === vid) see(s.date, s.odometer)
  for (const f of db.fuel) if (f.vehicleId === vid) see(f.date, f.odometer)
  for (const e of db.expenses) if (e.vehicleId === vid) see(e.date, null)
  return { first, last, minOdo, maxOdo }
}
