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
