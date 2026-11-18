import { existsSync, readFileSync } from 'node:fs'
import { avgL100, costPerKm, currentOdo, fuelSegments, schedState, totals } from '../src/calc'
import { addFuellyRows, lumpOverlaps, parseCsv, parseFuelly } from '../src/fuelly'
import { emptyDB, type DB as DBT } from '../src/store'
import { fromSheet, merge3, toIso, toSheet, type Data } from '../src/sync'
import { buildSummary, linkCell, localize } from '../src/sheetLook'
import { CAT_L, HEAD, KIND_L, TYPE_L } from '../src/sheetLang'
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
eq('engine oil', st('engineoil'), [1500, 289, 'ok'])
eq('air filter', st('airfilter'), [4800, 623, 'ok'])
eq('dct filter', st('dct'), [9250, 472, 'ok'])
eq('valves', st('valves'), [13440, null, 'ok'])
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
// ---- sheet round trip and three-way merge
const sd: Data = {
  vehicles: [{ id: 'v1', name: 'NC750X', type: 'moto', color: '#FF8A3D', currency: '€', odometer: 45800, ownership: null, archived: null }],
  service: [{ id: 's1', vehicleId: 'v1', date: '2026-09-01', odometer: 37300, category: 'service', description: 'Oil', tags: ['engineoil', 'oilfilter'], parts: 36, labour: null, notes: 'Liqui Moly; "x"', media: 'https://drive.google.com/file/d/a/view' }],
  fuel: [{ id: 'f1', vehicleId: 'v1', date: '2026-11-06', odometer: 45687, liters: 12.14, total: 22.45, full: true, missed: false, station: 'Shell' }],
  schedule: [{ id: 'i1', vehicleId: 'v1', name: 'Oil', tag: 'engineoil', intervalKm: 10000, intervalDays: 365, hint: '' }],
  expenses: [{ id: 'e1', vehicleId: 'v1', date: '2026-01-01', kind: 'insurance', amount: 128.13, note: '', media: '' }],
}
const tabs = toSheet(sd)
eq('round trip', fromSheet(tabs).data, sd)
// hand edits: Russian labels, a decimal comma, a real date cell, a row without id, a row without vehicle
const edited = JSON.parse(JSON.stringify(tabs))
edited.fuel[1][3] = '12,5'
edited.service.push([46000, 'nc750x', '', 'Ремонт', 'Hand row', '#chain', '', '', 80, '', '', ''])
edited.expenses.push(['2026-02-01', 'Unknown car', 'tax', 10, '', '', ''])
const rd = fromSheet(edited)
eq('decimal comma read', rd.data.fuel[0].liters, 12.5)
const hand = rd.data.service.find((x) => x.description === 'Hand row')!
eq('hand row read', [hand.date, hand.category, hand.tags, hand.parts, hand.id.length > 5], ['2025-12-09', 'repair', ['chain'], 80, true])
eq('row without known vehicle skipped', rd.skipped, ['Other expenses 3'])
eq('dd.mm.yyyy date', toIso('05.09.2026'), '2026-09-05')

const clone = (x: Data): Data => JSON.parse(JSON.stringify(x))
// sheet edited, app untouched -> sheet wins
let L = clone(sd), R = clone(sd); R.fuel[0].liters = 13
let m = merge3(sd, L, R)
eq('sheet edit taken', [m.data.fuel[0].liters, m.stats.fromSheet], [13, 1])
// app edited, sheet untouched -> app wins
L = clone(sd); L.fuel[0].liters = 11; m = merge3(sd, L, clone(sd))
eq('app edit kept', m.data.fuel[0].liters, 11)
// both edited -> app wins, counted as conflict
L = clone(sd); L.fuel[0].liters = 11; R = clone(sd); R.fuel[0].liters = 13; m = merge3(sd, L, R)
eq('conflict: app wins', [m.data.fuel[0].liters, m.stats.conflicts], [11, 1])
// deleted in the sheet, untouched in the app -> deleted
R = clone(sd); R.expenses = []; m = merge3(sd, clone(sd), R)
eq('sheet delete', m.data.expenses.length, 0)
// deleted in the sheet but edited in the app -> kept
L = clone(sd); L.expenses[0].amount = 130; R = clone(sd); R.expenses = []; m = merge3(sd, L, R)
eq('edited survives sheet delete', m.data.expenses[0]?.amount, 130)
// deleted in the app -> deleted
L = clone(sd); L.fuel = []; m = merge3(sd, L, clone(sd))
eq('app delete', m.data.fuel.length, 0)
// first connection (empty base): union, nothing deleted
const other: Data = { vehicles: [{ ...sd.vehicles[0] }], service: [], fuel: [{ ...sd.fuel[0], id: 'f2', odometer: 46000 }], schedule: [], expenses: [] }
m = merge3({ vehicles: [], service: [], fuel: [], schedule: [], expenses: [] }, clone(sd), other)
eq('first sync is a union', [m.data.fuel.map((f) => f.id), m.data.expenses.length], [['f1', 'f2'], 1])
// a vehicle deleted in the app takes its records along even if the sheet still has them
L = clone(sd); L.vehicles = []; L.service = []; L.fuel = []; L.schedule = []; L.expenses = []
m = merge3(sd, L, clone(sd))
eq('vehicle delete cascades', [m.data.vehicles.length, m.data.fuel.length, m.data.service.length], [0, 0, 0])
// Russian sheet: headings, labels, real dates, and reading it back
const ru = toSheet(sd, 'ru')
eq('ru headings', [ru.service[0][0], ru.fuel[0][6], ru.expenses[0][2]], ['Дата', 'Полный бак', 'Вид'])
eq('ru labels and serial dates', [ru.service[1][3], ru.expenses[1][2], ru.vehicles[1][1], ru.service[1][0]], ['ТО', 'Страховка', 'Мотоцикл', 46266])
eq('ru round trip', fromSheet(ru).data, sd)
eq('english sheet still read', fromSheet(toSheet(sd, 'en')).data, sd)
// every app language writes its own words and reads back; a sheet left in another language is still read
const LANGS7 = ['ru', 'en', 'uk', 'et', 'lv', 'lt', 'pl'] as const
for (const l of LANGS7) eq(`${l} round trip`, fromSheet(toSheet(sd, l)).data, sd)
eq('pl headings and labels', [toSheet(sd, 'pl').service[0][6], toSheet(sd, 'pl').vehicles[1][1]], ['Koszt części', 'Motocykl'])
// no heading or label may mean two different things across languages
{
  const clash: string[] = []
  for (const c of ['vehicles', 'service', 'fuel', 'schedule', 'expenses'] as const) {
    const seen = new Map<string, string>()
    for (const l of LANGS7) for (const [k, h] of Object.entries(HEAD[l][c])) { const x = h.toLowerCase(); if (seen.has(x) && seen.get(x) !== k) clash.push(`${c}:${h}`); seen.set(x, k) }
  }
  for (const o of [CAT_L, KIND_L, TYPE_L] as Record<string, Record<string, string>>[]) {
    const seen = new Map<string, string>()
    for (const [k, ls] of Object.entries(o)) for (const v of Object.values(ls)) { const x = v.toLowerCase(); if (seen.has(x) && seen.get(x) !== k) clash.push(v); seen.set(x, k) }
  }
  eq('no ambiguous sheet words', clash, [])
}
// clickable links, several in one cell
const lc = linkCell('https://a.example/x\nhttps://b.example/y') as { textFormatRuns: { startIndex: number; format: { link?: { uri: string } } }[] }
eq('links', lc.textFormatRuns.map((r) => [r.startIndex, r.format.link?.uri ?? '']), [[0, 'https://a.example/x'], [19, ''], [20, 'https://b.example/y']])
// summary: formulas, and ';' for comma locales without touching text in quotes
const sm = buildSummary({ lang: 'ru', vehicles: [{ id: 'v1', name: 'NC750X', currency: '€' }], schedule: [{ vehicleId: 'v1', name: 'Масло', tag: 'engineoil', intervalKm: 10000, intervalDays: 365, hint: '' }], years: { v1: [2026, 2025] } }, 7)
const flat = sm.values.flat().map(String)
eq('summary has odometer, schedule and year formulas', [flat.filter((x) => x.startsWith('=MAX(IFERROR(MAXIFS')).length, flat.filter((x) => x.includes('REGEXMATCH')).length, flat.filter((x) => x.startsWith('=SUM(B')).length], [1, 2, 3])
const loc = localize([['=IF(A1="a,b",1,2)', 'x,y']], 'ru_RU')
eq('localize', loc, [['=IF(A1="a,b";1;2)', 'x,y']])
eq('localize en untouched', localize([['=IF(A1,1,2)']], 'en_US'), [['=IF(A1,1,2)']])
void (null as unknown as DBT)
// Fuelio backup: fill-ups, costs sorted into service log and expenses
{
  const { parseFuelly: pf, addFuellyRows: add } = await import('../src/fuelly')
  const fuelio = `"## Vehicle"
"Name","Description","DistUnit","FuelUnit","ConsumptionUnit","ImportCSVDateFormat","VIN","Insurance","Plate","Make","Model","Year","TankCount","Tank1Type","Tank2Type","Active","Tank1Capacity","Tank2Capacity"
"Toyota Auris","","0","0","0","yyyy-MM-dd","","","","toyota","auris","2018","1","100","0","1","50.0","0.0"
"## Log"
"Data","Odo (km)","Fuel (litres)","Full","Price (optional)","l/100km (optional)","latitude (optional)","longitude (optional)","City (optional)","Notes (optional)","Missed","TankNumber","FuelType","VolumePrice","StationID (optional)","ExcludeDistance","UniqueId","TankCalc"
"2018-10-07","424","33.04","1","1172.92","0.0","50.0436","14.4406","Praha, Olbrachtova - Mol","","0","1","0","35.5","329285","0","105","0.0"
"2018-09-17","5","48.02","0","1675.9","0.0","50.0165","14.4026","Praha - OMV","","0","1","0","34.9","107548","0","103","0.0"
"## CostCategories"
"CostTypeID","Name","priority","color"
"1","Service","0","#ff0000"
"2","Insurance","0","#00ff00"
"## Costs"
"CostTitle","Date","Odo","CostTypeID","Notes","Cost","flag","idR","read","RemindOdo","RemindDate","isTemplate","RepeatOdo","RepeatMonths","isIncome","UniqueId"
"Oil change","2018-11-01","900","1","5W-30","120.5","0","0","1","0","2011-01-01","0","0","0","0","1"
"OC","2018-12-01","0","2","","300","0","0","1","0","2011-01-01","0","0","0","0","2"
`
  const cars = pf(fuelio)
  eq('fuelio car', [cars.length, cars[0].model, cars[0].source, cars[0].rows.length], [1, 'Toyota Auris', 'Fuelio', 2])
  eq('fuelio rows', cars[0].rows.map((r) => [r.date, r.odometer, r.liters, r.total, r.full]), [['2018-09-17', 5, 48.02, 1675.9, false], ['2018-10-07', 424, 33.04, 1172.92, true]])
  eq('fuelio costs', cars[0].costs!.map((c) => [c.title, c.category, c.kind, c.odometer]), [['Oil change', 'service', null, 900], ['OC', null, 'insurance', null]])
  const d0 = { v: 1, vehicles: [], service: [], fuel: [], expenses: [], schedule: [] } as unknown as Parameters<typeof add>[0]
  const r1 = add(d0, 'v', cars[0]); const r2 = add(d0, 'v', cars[0])
  eq('fuelio import twice', [r1.added, r2.added, r2.replaced, d0.fuel.length, d0.service.length, d0.expenses.length], [4, 0, 4, 2, 1, 1])
}

// first run and backup reminder
{
  const { backupDue } = await import('../src/Onboarding')
  const { normalize } = await import('../src/store')
  const old = normalize({ vehicles: [{ id: 'a', name: 'x', type: 'moto', color: '#fff', currency: '€', odometer: 0 }], settings: { lang: 'ru' } as never })
  eq('existing users skip first run', [old.settings.onboarded, old.settings.installSeen], [true, true])
  eq('new users see first run', [normalize({}).settings.onboarded, normalize({}).settings.installSeen], [false, false])
  const d = normalize({ fuel: Array.from({ length: 11 }, (_, i) => ({ id: 'f' + i, vehicleId: 'a', date: '2026-01-01', odometer: i, liters: 1, total: 1, full: true, missed: false, station: '' })) })
  const now = Date.parse('2026-11-17T12:00:00Z')
  eq('backup due: never backed up', backupDue(d, now), true)
  d.settings.lastBackup = '2026-11-01T00:00:00Z'
  eq('backup not due within 30 days', backupDue(d, now), false)
  d.settings.lastBackup = '2026-10-01T00:00:00Z'
  eq('backup due after 30 days', backupDue(d, now), true)
  d.settings.backupSnooze = '2026-11-19T00:00:00Z'
  eq('snoozed', backupDue(d, now), false)
  d.settings.backupSnooze = null
  d.settings.google = { email: '', folderId: '', receiptsId: '', sheetId: 's', lastSync: null }
  eq('no reminder with Google', backupDue(d, now), false)
  const few = normalize({ fuel: d.fuel.slice(0, 5) })
  eq('no reminder for a few records', backupDue(few, now), false)
}
// preset schedule names follow the app language; renamed items stay
{
  const { relabelPresets } = await import('../src/i18n')
  const items = [{ tag: 'engineoil', name: 'Масло двигателя' }, { tag: 'chain', name: 'Моя цепь DID' }, { tag: 'mytag', name: 'Свой узел' }]
  eq('relabel to pl', [relabelPresets(items, 'pl'), items.map((x) => x.name)], [true, ['Olej silnikowy', 'Моя цепь DID', 'Свой узел']])
  eq('relabel back to ru', [relabelPresets(items, 'ru'), items[0].name], [true, 'Масло двигателя'])
  eq('relabel no-op', relabelPresets(items, 'ru'), false)
}

// full cost of ownership
{
  const { ownershipCost, valueDue } = await import('../src/calc')
  const { normalize, normOwnership, activeId, liveVehicles } = await import('../src/store')
  const own = (o: object) => normOwnership({ purchaseDate: '2023-03-01', purchaseOdometer: 10000, purchasePrice: 7200, ...o })
  const base = () => normalize({
    vehicles: [{ id: 'm', name: 'Moto', type: 'moto', color: '#fff', currency: '€', odometer: 28400, ownership: own({ valueNow: 5400, valueDate: '2026-10-01' }), archived: null }],
    fuel: [{ id: 'f1', vehicleId: 'm', date: '2024-05-01', odometer: 20000, liters: 900, total: 1656, full: true, missed: false, station: '' }],
    service: [
      { id: 's1', vehicleId: 'm', date: '2024-04-01', odometer: 15000, category: 'service', description: 'TO', tags: [], parts: 800, labour: 304, notes: '', media: '' },
      { id: 's2', vehicleId: 'm', date: '2024-06-01', odometer: null, category: 'accessories', description: 'Bags', tags: [], parts: 368, labour: null, notes: '', media: '' },
      { id: 's0', vehicleId: 'm', date: '2022-12-01', odometer: 9000, category: 'repair', description: 'before purchase', tags: [], parts: 999, labour: null, notes: '', media: '' },
    ],
    expenses: [{ id: 'e1', vehicleId: 'm', date: '2025-01-10', kind: 'insurance', amount: 736, note: '', media: '' }],
  })
  const d = base()
  const c = ownershipCost(d, 'm', '2026-11-01')!
  eq('own: spend since purchase', c.spend, 3864)
  eq('own: loss', c.loss, 1800)
  eq('own: distance', c.dist, 18400)
  eq('own: per km 0.31', +c.perKm!.toFixed(2), 0.31)
  eq('own: about 129 a month', Math.round(c.perMonth!), 129)
  eq('own: fixed ~58, by distance ~71', [Math.round(c.fixedMonth!), Math.round(c.variableMonth!)], [58, 71])
  eq('own: parts', c.parts, { loss: 1800, fuel: 1656, service: 1104, fixed: 736, accessories: 368, other: 0 })
  // sold: the sale price replaces the estimate and the period ends on the sale date
  const ds = base()
  ds.vehicles[0].ownership = own({ soldDate: '2026-07-01', soldPrice: 5000, valueNow: 5400 })
  const cs = ownershipCost(ds, 'm', '2026-11-01')!
  eq('sold: status and cleared estimate', [ds.vehicles[0].ownership!.status, ds.vehicles[0].ownership!.valueNow], ['sold', null])
  eq('sold: loss from sale price', cs.loss, 2200)
  eq('sold: period ends at sale', [cs.to, Math.round(cs.months)], ['2026-07-01', 40])
  // no estimate: no per-km figure with the purchase, nothing divided
  const dn = base()
  dn.vehicles[0].ownership = own({})
  const cn = ownershipCost(dn, 'm', '2026-11-01')!
  eq('no estimate: dashes', [cn.loss, cn.perKm, cn.perMonth, cn.fixedMonth], [null, null, null, null])
  // distance 0: no division by zero
  const dz = base()
  dz.vehicles[0].ownership = own({ purchaseOdometer: 28400, valueNow: 5400 })
  eq('distance 0: dash', ownershipCost(dz, 'm', '2026-11-01')!.perKm, null)
  eq('not set: null', ownershipCost(normalize({ vehicles: [{ id: 'x', name: 'x', type: 'car', color: '', currency: '€', odometer: 0 } as never] }), 'x', '2026-11-01'), null)
  // yearly reminder
  eq('value fresh: no reminder', valueDue(d, '2026-11-01'), null)
  d.vehicles[0].ownership!.valueDate = '2025-10-01'
  eq('value older than a year: reminder', valueDue(d, '2026-11-01'), 'm')
  d.settings.valueSnooze = '2026-11-20T00:00:00Z'
  eq('value reminder snoozed', valueDue(d, '2026-11-01', Date.parse('2026-11-01T00:00:00Z')), null)
  d.settings.valueSnooze = null
  d.vehicles[0].archived = '2026-10-01'
  eq('no value reminder for an archived vehicle', valueDue(d, '2026-11-01'), null)
  // archive and the active vehicle
  const g = normalize({ vehicles: [
    { id: 'a', name: 'A', type: 'moto', color: '', currency: '€', odometer: 0 },
    { id: 'b', name: 'B', type: 'car', color: '', currency: '€', odometer: 0 },
  ] as never, settings: { activeVehicleId: 'a' } as never })
  eq('old data: not archived, no ownership', g.vehicles.map((v) => [v.archived, v.ownership]), [[null, null], [null, null]])
  g.vehicles[0].archived = '2026-11-01'
  eq('archived active -> first live one', activeId(g), 'b')
  g.vehicles[1].archived = '2026-11-01'
  eq('all archived -> empty garage', [activeId(g), liveVehicles(g).length], [null, 0])
  g.vehicles[0].archived = null
  eq('back to the garage', activeId(g), 'a')
}
// ownership and archive through the sheet; deletion does not come back from the sheet
{
  const { normalize, normVehicle } = await import('../src/store')
  const v1 = normVehicle({ id: 'v1', name: 'NC', type: 'moto', color: '#fff', currency: '€', odometer: 100, ownership: { purchaseDate: '2023-03-01', purchaseOdometer: 10000, purchasePrice: 7200, status: 'own', valueNow: 5400, valueDate: '2026-10-01', soldDate: null, soldPrice: null }, archived: '2026-11-02' })
  const v2 = normVehicle({ id: 'v2', name: 'Car', type: 'car', color: '#000', currency: '€', odometer: 5, ownership: null, archived: null })
  const data: Data = { vehicles: [v1, v2], service: [{ id: 's', vehicleId: 'v2', date: '2026-01-01', odometer: 1, category: 'service', description: 'x', tags: [], parts: 1, labour: null, notes: '', media: '' }], fuel: [], schedule: [], expenses: [] }
  for (const lang of ['ru', 'et'] as const) {
    const back = fromSheet(toSheet(data, lang)).data
    eq('garage round trip ' + lang, back.vehicles, data.vehicles)
  }
  // an old sheet without the new columns: everything reads, new fields are empty
  const old = toSheet(data, 'ru').vehicles.map((r) => [...r.slice(0, 5), r[r.length - 1]])
  const oldBack = fromSheet({ ...toSheet(data, 'ru'), vehicles: old }).data.vehicles
  eq('old sheet without columns', oldBack.map((v) => [v.id, v.ownership, v.archived]), [['v1', null, null], ['v2', null, null]])
  // a base saved by an older version (no new fields) is not a change on either side
  const legacy = (d: Data): Data => ({ ...d, vehicles: d.vehicles.map(({ ownership: _o, archived: _a, ...x }) => x as never) })
  const plain: Data = { ...data, vehicles: [{ ...v1, ownership: null, archived: null }, v2] }
  const del: Data = { ...plain, vehicles: [plain.vehicles[0]], service: [] }
  eq('delete after upgrade: vehicle and records stay deleted', merge3(legacy(plain), del, plain).data.vehicles.map((v) => v.id), ['v1'])
  // deleted here while the sheet row was edited by hand: still deleted, and its records too
  const edited: Data = { ...plain, vehicles: [plain.vehicles[0], { ...v2, odometer: 999 }] }
  const m = merge3(plain, del, edited, ['v2']).data
  eq('deleted vehicle edited in sheet stays deleted', [m.vehicles.map((v) => v.id), m.service.length], [['v1'], 0])
  eq('without the device list it would come back', merge3(plain, del, edited).data.vehicles.map((v) => v.id), ['v1', 'v2'])
  // backup without the new fields restores as not archived
  eq('old backup', normalize(JSON.parse(JSON.stringify({ vehicles: [{ id: 'q', name: 'q', type: 'car', color: '', currency: '€', odometer: 0 }] }))).vehicles[0].archived, null)
}

process.exit(failed ? 1 : 0)

