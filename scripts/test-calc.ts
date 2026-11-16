import { existsSync, readFileSync } from 'node:fs'
import { avgL100, costPerKm, currentOdo, fuelSegments, schedState, totals } from '../src/calc'
import { addFuellyRows, lumpOverlaps, parseCsv, parseFuelly } from '../src/fuelly'
import { emptyDB } from '../src/store'
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
// Fuelly parser on a small sample in Fuelly's own layout
const sample = `car_name, model, l/100km,  odometer, km, litres, price, city_percentage, fuelup_date, date_added, tags, notes, missed_fuelup, partial_fuelup, latitude, longitude, brand
"My Bike","Honda NC750X DCT",4.13,1300.0,300,12,2.0,50,2026-11-06,2026-11-06 15:18:32,"","a ""quoted"" note",0,0,,,"Shell"
"My Bike","Honda NC750X DCT",0,1000.0,0,9,1.5,90,2026-10-01,2026-10-01 12:34:18,"","",0,1,,,""
"Car","Toyota Verso",8,5000.0,500,40,1.7,50,2026-10-02,2026-10-02 12:00:00,"","",1,0,,,""
`
eq('csv quotes', parseCsv('a,"b ""c"", d"\n')[0], ['a', 'b "c", d'])
const cars = parseFuelly(sample)
eq('two cars', cars.map((c) => [c.name, c.rows.length]), [['My Bike', 2], ['Car', 1]])
eq('sorted by odometer, total = litres x price', cars[0].rows.map((r) => [r.odometer, r.total, r.full]), [[1000, 13.5, false], [1300, 24, true]])
eq('station from brand and notes', cars[0].rows[1].station, 'Shell · a "quoted" note')
eq('missed flag', cars[1].rows[0].missed, true)
const miles = parseFuelly('car_name,model,mpg,odometer,miles,gallons,price,fuelup_date,missed_fuelup,partial_fuelup\n"X","Y",30,100,0,1,4,2026-01-01,0,0\n')
eq('miles and gallons converted', [miles[0].rows[0].odometer, miles[0].rows[0].liters, miles[0].converted], [161, 3.785, true])
const d0 = emptyDB()
d0.vehicles.push({ id: 'v', name: 'NC', type: 'moto', color: '#000', currency: '€', odometer: 0 })
d0.expenses.push({ id: 'lump', vehicleId: 'v', date: '2026-01-01', kind: 'fuel', amount: 37.5, note: '' })
eq('first import adds', addFuellyRows(d0, 'v', cars[0]), { added: 2, replaced: 0 })
eq('second import replaces', addFuellyRows(d0, 'v', cars[0]), { added: 0, replaced: 2 })
eq('lump-sum overlap found', lumpOverlaps(d0, 'v').map((o) => [o.year, o.fuellySum]), [['2026', 37.5]])

// the real Fuelly exports (kept out of the public repository)
for (const [file, want] of [['fuelly-nc750x.csv', [75, 4.08, 1106.1]], ['fuelly-verso.csv', [53, 8.14, 2620.22]]] as const) {
  const u = new URL('../data/' + file, import.meta.url)
  if (!existsSync(u)) { console.log('skip ', file, 'not present'); continue }
  const c = parseFuelly(readFileSync(u, 'utf8'))[0]
  const segs = fuelSegments(c.rows.map((r, i) => ({ ...r, id: String(i), vehicleId: 'v' })))
  const y2026 = Math.round(c.rows.filter((r) => r.date.startsWith('2026')).reduce((s, r) => s + r.total, 0) * 100) / 100
  eq(file, [c.rows.length, +(avgL100(segs) ?? 0).toFixed(2), y2026], want)
}
process.exit(failed ? 1 : 0)
