import { existsSync, readFileSync } from 'node:fs'
import { avgL100, costPerKm, currentOdo, fuelSegments, schedState, totals } from '../src/calc'
import type { DB, FuelEntry } from '../src/store'

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
const f = (odometer: number, liters: number, total: number, full = true, missed = false): FuelEntry =>
  ({ id: 'f' + odometer, vehicleId: 'v', date: '2026-06-01', odometer, liters, total, full, missed, station: '' })

// full-to-full: 4.2 L over 112 km = 3.75 L/100
let s = fuelSegments([f(45800, 10, 16), f(45912, 4.2, 6.89)])
eq('one segment', [s.length, +s[0].l100.toFixed(2), s[0].dist], [1, 3.75, 112])
// partial fill in between is added to the next full one
s = fuelSegments([f(1000, 10, 16), f(1100, 2, 3, false), f(1300, 10, 16)])
eq('partial fill joins the leg', [s.length, +s[0].l100.toFixed(2)], [1, 4])
// a missed fill-up cancels that leg only
s = fuelSegments([f(1000, 10, 16), f(1300, 10, 16, true, true), f(1500, 8, 13)])
eq('missed leg skipped', [s.length, s[0].dist, +s[0].l100.toFixed(1)], [1, 200, 4])
eq('average', +(avgL100(fuelSegments([f(0, 5, 8), f(100, 4, 6), f(300, 10, 16)])) ?? 0).toFixed(2), 4.67)
eq('no segments -> null', avgL100([]), null)

// the real NC750X data taken from "Таблица ТО" (kept out of the public repository)
const backup = new URL('../data/nc750x-backup.json', import.meta.url)
if (existsSync(backup)) {
const db = JSON.parse(readFileSync(backup, 'utf8')) as DB
const vid = db.vehicles[0].id
eq('current odometer', currentOdo(db, vid), 45800)
const st = (tag: string) => { const x = schedState(db, db.schedule.find((i) => i.tag === tag)!, '2026-11-16'); return [x.remKm, x.remDays, x.status] }
eq('engine oil', st('engineoil'), [2200, 289, 'ok'])
eq('air filter', st('airfilter'), [1200, 623, 'soon'])
eq('dct filter', st('dct'), [4200, 472, 'ok'])
eq('valves', st('valves'), [10200, null, 'ok'])
eq('brake fluid', st('brakefluid'), [null, 654, 'ok'])
eq('coolant', st('coolant'), [null, 988, 'ok'])
eq('total 2026', +totals(db, vid, 2026).total.toFixed(2), 2279.35)
eq('total 2025', +totals(db, vid, 2025).total.toFixed(2), 605)
eq('total all', +totals(db, vid, null).total.toFixed(2), 2884.35)
eq('cost per km defined', costPerKm(db, vid) != null, true)
} else console.log('skip  NC750X data checks: data/nc750x-backup.json not present')
process.exit(failed ? 1 : 0)
