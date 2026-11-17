/*
 * How the spreadsheet looks: column headings and values in the app's language, real dates,
 * money formats, checkboxes, clickable links, and a "Summary" tab built from formulas.
 * Only the data tabs are read back; everything here is presentation.
 */
import type { Category, ExpenseKind, Lang, VType } from './store'
import type { Cell } from './google'

export type Coll = 'vehicles' | 'service' | 'fuel' | 'schedule' | 'expenses'

export const TABS: Record<Coll, { title: string; cols: string[] }> = {
  vehicles: { title: 'Garage', cols: ['name', 'type', 'currency', 'odometer', 'color', 'id'] },
  service: { title: 'Service log', cols: ['date', 'vehicle', 'odometer', 'category', 'description', 'tags', 'parts', 'labour', 'total', 'notes', 'media', 'id'] },
  fuel: { title: 'Fuel', cols: ['date', 'vehicle', 'odometer', 'liters', 'total', 'price_per_liter', 'full_tank', 'missed_previous', 'station', 'id'] },
  schedule: { title: 'Schedule', cols: ['vehicle', 'name', 'tag', 'interval_km', 'interval_days', 'hint', 'id'] },
  expenses: { title: 'Other expenses', cols: ['date', 'vehicle', 'kind', 'amount', 'note', 'media', 'id'] },
}
export const COLLS = Object.keys(TABS) as Coll[]
export const SUMMARY = 'Summary'

/** Russian column headings; the English keys stay valid for reading. */
const HEAD_RU: Record<Coll, Record<string, string>> = {
  vehicles: { name: 'Название', type: 'Тип', currency: 'Валюта', odometer: 'Пробег (введён вручную)', color: 'Цвет', id: 'id' },
  service: { date: 'Дата', vehicle: 'Транспорт', odometer: 'Пробег, км', category: 'Категория', description: 'Описание работ / запчасти', tags: 'Теги', parts: 'Запчасти', labour: 'Работа', total: 'Итого', notes: 'Заметки', media: 'Фото и чеки', id: 'id' },
  fuel: { date: 'Дата', vehicle: 'Транспорт', odometer: 'Пробег, км', liters: 'Литры', total: 'Сумма', price_per_liter: 'Цена за литр', full_tank: 'Полный бак', missed_previous: 'Пропущена прошлая заправка', station: 'АЗС / заметка', id: 'id' },
  schedule: { vehicle: 'Транспорт', name: 'Узел', tag: 'Тег', interval_km: 'Интервал, км', interval_days: 'Интервал, дни', hint: 'Шпаргалка из мануала', id: 'id' },
  expenses: { date: 'Дата', vehicle: 'Транспорт', kind: 'Вид', amount: 'Сумма', note: 'Заметка', media: 'Фото и чеки', id: 'id' },
}
const HEAD_EN: Record<Coll, Record<string, string>> = {
  vehicles: { name: 'Name', type: 'Type', currency: 'Currency', odometer: 'Odometer (entered by hand)', color: 'Colour', id: 'id' },
  service: { date: 'Date', vehicle: 'Vehicle', odometer: 'Odometer, km', category: 'Category', description: 'Work done / parts', tags: 'Tags', parts: 'Parts', labour: 'Labour', total: 'Total', notes: 'Notes', media: 'Photos and receipts', id: 'id' },
  fuel: { date: 'Date', vehicle: 'Vehicle', odometer: 'Odometer, km', liters: 'Litres', total: 'Total', price_per_liter: 'Price per litre', full_tank: 'Full tank', missed_previous: 'Missed previous fill-up', station: 'Station / note', id: 'id' },
  schedule: { vehicle: 'Vehicle', name: 'Item', tag: 'Tag', interval_km: 'Interval, km', interval_days: 'Interval, days', hint: 'Notes from the manual', id: 'id' },
  expenses: { date: 'Date', vehicle: 'Vehicle', kind: 'Type', amount: 'Amount', note: 'Note', media: 'Photos and receipts', id: 'id' },
}
export const heading = (c: Coll, key: string, lang: Lang) => (lang === 'en' ? HEAD_EN : HEAD_RU)[c][key] ?? key

/** Maps a heading cell, in any language or as the plain key, to its key. */
export function keyOfHeading(c: Coll, h: string): string | null {
  const s = h.trim().toLowerCase()
  for (const k of TABS[c].cols) if (k === s || HEAD_RU[c][k]?.toLowerCase() === s || HEAD_EN[c][k]?.toLowerCase() === s) return k
  return null
}

const CAT_L: Record<Category, [string, string]> = { service: ['ТО', 'Service'], consumables: ['Расходники', 'Consumables'], repair: ['Ремонт', 'Repair'], accessories: ['Аксессуары', 'Accessories'] }
const KIND_L: Record<ExpenseKind, [string, string]> = { insurance: ['Страховка', 'Insurance'], inspection: ['Техосмотр', 'Inspection'], tax: ['Налог', 'Tax'], fuel: ['Топливо', 'Fuel'], other: ['Прочее', 'Other'] }
const TYPE_L: Record<VType, [string, string]> = { moto: ['Мотоцикл', 'Motorcycle'], car: ['Автомобиль', 'Car'] }
const pickL = (l: [string, string], lang: Lang) => l[lang === 'en' ? 1 : 0]
export const catLabel = (c: Category, lang: Lang) => pickL(CAT_L[c], lang)
export const kindLabel = (k: ExpenseKind, lang: Lang) => pickL(KIND_L[k], lang)
export const typeLabel = (t: VType, lang: Lang) => pickL(TYPE_L[t], lang)

const lower = (o: Record<string, [string, string]>) => Object.fromEntries(Object.entries(o).flatMap(([k, [ru, en]]) => [[k, k], [ru.toLowerCase(), k], [en.toLowerCase(), k]]))
export const CAT_READ = lower(CAT_L) as Record<string, Category>
export const KIND_READ = { ...lower(KIND_L), 'топливо суммой': 'fuel' } as Record<string, ExpenseKind>
export const TYPE_READ = lower(TYPE_L) as Record<string, VType>

/** Sheets keeps dates as days since 30.12.1899. */
export const isoToSerial = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

/* ---------- formatting of the data tabs ---------- */

type Fmt = 'date' | 'money' | 'int' | 'dec2' | 'dec3'
interface ColLook { w: number; fmt?: Fmt; wrap?: boolean; check?: boolean; hidden?: boolean; link?: boolean }
const LOOK: Record<Coll, Record<string, ColLook>> = {
  vehicles: { name: { w: 180 }, type: { w: 110 }, currency: { w: 80 }, odometer: { w: 150, fmt: 'int' }, color: { w: 90 }, id: { w: 80, hidden: true } },
  service: { date: { w: 95, fmt: 'date' }, vehicle: { w: 130 }, odometer: { w: 90, fmt: 'int' }, category: { w: 105 }, description: { w: 340, wrap: true }, tags: { w: 150, wrap: true }, parts: { w: 85, fmt: 'money' }, labour: { w: 85, fmt: 'money' }, total: { w: 85, fmt: 'money' }, notes: { w: 260, wrap: true }, media: { w: 220, wrap: true, link: true }, id: { w: 80, hidden: true } },
  fuel: { date: { w: 95, fmt: 'date' }, vehicle: { w: 130 }, odometer: { w: 90, fmt: 'int' }, liters: { w: 70, fmt: 'dec2' }, total: { w: 80, fmt: 'money' }, price_per_liter: { w: 90, fmt: 'dec3' }, full_tank: { w: 85, check: true }, missed_previous: { w: 110, check: true, wrap: true }, station: { w: 180, wrap: true }, id: { w: 80, hidden: true } },
  schedule: { vehicle: { w: 130 }, name: { w: 190 }, tag: { w: 120 }, interval_km: { w: 95, fmt: 'int' }, interval_days: { w: 95, fmt: 'int' }, hint: { w: 380, wrap: true }, id: { w: 80, hidden: true } },
  expenses: { date: { w: 95, fmt: 'date' }, vehicle: { w: 130 }, kind: { w: 110 }, amount: { w: 90, fmt: 'money' }, note: { w: 260, wrap: true }, media: { w: 220, wrap: true, link: true }, id: { w: 80, hidden: true } },
}
const NUM: Record<Fmt, unknown> = {
  date: { type: 'DATE', pattern: 'dd.mm.yyyy' },
  money: { type: 'NUMBER', pattern: '#,##0.00' },
  int: { type: 'NUMBER', pattern: '#,##0' },
  dec2: { type: 'NUMBER', pattern: '0.00' },
  dec3: { type: 'NUMBER', pattern: '0.000' },
}
const HEAD_BG = { red: 0.91, green: 0.92, blue: 0.93 }

/** A cell whose web addresses are clickable links (a cell may hold several, one per line). */
export function linkCell(text: string): unknown {
  const runs: { startIndex: number; format: unknown }[] = []
  const re = /https?:\/\/\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (!runs.length && m.index > 0) runs.push({ startIndex: 0, format: {} })
    runs.push({ startIndex: m.index, format: { link: { uri: m[0] } } })
    const end = m.index + m[0].length
    if (end < text.length) runs.push({ startIndex: end, format: {} })
  }
  return runs.length ? { userEnteredValue: { stringValue: text }, textFormatRuns: runs } : { userEnteredValue: { stringValue: text } }
}

/** Formatting requests for one data tab; idempotent, so they can be sent after every write. */
export function dataTabRequests(c: Coll, sheetId: number, rows: Cell[][]): unknown[] {
  const cols = TABS[c].cols
  const n = rows.length // including the heading row
  const req: unknown[] = [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: HEAD_BG, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)' } },
  ]
  cols.forEach((k, i) => {
    const l = LOOK[c][k]
    if (!l) return
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: l.w, hiddenByUser: !!l.hidden }, fields: 'pixelSize,hiddenByUser' } })
    const fmt: Record<string, unknown> = { wrapStrategy: l.wrap ? 'WRAP' : 'CLIP', verticalAlignment: 'TOP' }
    let fields = 'userEnteredFormat(wrapStrategy,verticalAlignment'
    if (l.fmt) { fmt.numberFormat = NUM[l.fmt]; fields += ',numberFormat' }
    req.push({ repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 }, cell: { userEnteredFormat: fmt }, fields: fields + ')' } })
    if (l.check) {
      req.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 } } })
      if (n > 1) req.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, endRowIndex: n, startColumnIndex: i, endColumnIndex: i + 1 }, rule: { condition: { type: 'BOOLEAN' }, strict: false } } })
    }
    if (l.link && n > 1) {
      req.push({ updateCells: { range: { sheetId, startRowIndex: 1, endRowIndex: n, startColumnIndex: i, endColumnIndex: i + 1 }, rows: rows.slice(1).map((r) => ({ values: [linkCell(String(r[i] ?? ''))] })), fields: 'userEnteredValue,textFormatRuns' } })
    }
  })
  return req
}

/* ---------- the Summary tab ---------- */

export interface SummaryInput {
  lang: Lang
  vehicles: { id: string; name: string; currency: string }[]
  schedule: { vehicleId: string; name: string; tag: string; intervalKm: number | null; intervalDays: number | null; hint: string }[]
  years: Record<string, number[]>
}

const T = {
  note: ['Эту вкладку собирает приложение Tolimoto Log. Правки здесь не сохраняются: меняйте данные на других вкладках.', 'This tab is built by the Tolimoto Log app. Edits here are not kept: change the data on the other tabs.'],
  odo: ['Текущий пробег, км', 'Current odometer, km'],
  sched: ['Регламент', 'Schedule'],
  item: ['Узел', 'Item'], tag: ['Тег', 'Tag'], ikm: ['Интервал, км', 'Interval, km'], idays: ['Интервал, дни', 'Interval, days'],
  lkm: ['Последняя замена, км', 'Last done, km'], ldate: ['Последняя замена, дата', 'Last done, date'],
  rkm: ['Осталось, км', 'Left, km'], rdays: ['Осталось, дней', 'Left, days'], status: ['Статус', 'Status'], hint: ['Шпаргалка', 'Notes'],
  spend: ['Траты по годам', 'Spending by year'],
  year: ['Год', 'Year'], svc: ['ТО и ремонт', 'Service and repair'], acc: ['Аксессуары', 'Accessories'], fuel: ['Топливо', 'Fuel'], other: ['Страховка и прочее', 'Insurance and other'], total: ['Итого', 'Total'], all: ['Всего', 'All years'],
  none: ['Нет записей', 'No records'], over: ['Просрочено', 'Overdue'], soon: ['Скоро', 'Soon'], ok: ['Норма', 'OK'],
} as const
type TK = keyof typeof T

export const summarySignature = (s: SummaryInput) => 'tl-summary-v1:' + JSON.stringify(s)

const letter = (c: Coll, key: string) => String.fromCharCode(65 + TABS[c].cols.indexOf(key))
const ref = (c: Coll, key: string) => {
  const t = TABS[c].title
  const q = /\s/.test(t) ? `'${t}'` : t
  const L = letter(c, key)
  return `${q}!$${L}:$${L}`
}

/** Values (formulas) and formatting requests of the Summary tab. Formulas use commas; see localize(). */
export function buildSummary(s: SummaryInput, sheetId: number): { values: Cell[][]; requests: unknown[] } {
  const tr = (k: TK) => T[k][s.lang === 'en' ? 1 : 0]
  const acc = catLabel('accessories', s.lang)
  const fuelKind = kindLabel('fuel', s.lang)
  const S = (k: string) => ref('service', k)
  const F = (k: string) => ref('fuel', k)
  const E = (k: string) => ref('expenses', k)
  const G = (k: string) => ref('vehicles', k)
  const rows: Cell[][] = [[tr('note')], []]
  const req: unknown[] = []
  const bold = (r: number, size?: number) => req.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, ...(size ? { fontSize: size } : {}) } } }, fields: 'userEnteredFormat.textFormat' } })
  const head = (r: number, cols: number) => req.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: cols }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: HEAD_BG, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)' } })
  const fmt = (r0: number, r1: number, c0: number, c1: number, f: Fmt) => req.push({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: { numberFormat: NUM[f] } }, fields: 'userEnteredFormat.numberFormat' } })
  req.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } } } }, fields: 'userEnteredFormat.textFormat' } })

  for (const v of s.vehicles) {
    const r0 = rows.length // vehicle title row (0-based)
    const V = `$A$${r0 + 1}`
    rows.push([v.name])
    bold(r0, 14)
    const odoRow = rows.length + 1
    rows.push([tr('odo'), `=MAX(IFERROR(MAXIFS(${S('odometer')},${S('vehicle')},${V}),0),IFERROR(MAXIFS(${F('odometer')},${F('vehicle')},${V}),0),IFERROR(SUMIFS(${G('odometer')},${G('name')},${V}),0))`])
    bold(odoRow - 1)
    fmt(odoRow - 1, odoRow, 1, 2, 'int')
    rows.push([])

    const items = s.schedule.filter((x) => x.vehicleId === v.id)
    if (items.length) {
      rows.push([tr('sched')]); bold(rows.length - 1, 11)
      head(rows.length, 10)
      rows.push([tr('item'), tr('tag'), tr('ikm'), tr('idays'), tr('lkm'), tr('ldate'), tr('rkm'), tr('rdays'), tr('status'), tr('hint')])
      const first = rows.length
      for (const it of items) {
        const k = rows.length + 1
        const match = `REGEXMATCH(${S('tags')},"(^|\\s)#${it.tag.replace(/[^a-z0-9а-яё_-]/gi, '')}(\\s|$)")`
        rows.push([
          it.name,
          '#' + it.tag,
          it.intervalKm ?? '',
          it.intervalDays ?? '',
          `=IFERROR(LET(v,MAX(FILTER(${S('odometer')},${S('vehicle')}=${V},${match})),IF(v=0,"",v)),"")`,
          `=IFERROR(LET(v,MAX(FILTER(${S('date')},${S('vehicle')}=${V},${match})),IF(v=0,"",v)),"")`,
          `=IF(OR(C${k}="",E${k}=""),"",E${k}+C${k}-$B$${odoRow})`,
          `=IF(OR(D${k}="",F${k}=""),"",F${k}+D${k}-TODAY())`,
          `=IF(AND(G${k}="",H${k}=""),"${tr('none')}",IF(OR(AND(G${k}<>"",G${k}<0),AND(H${k}<>"",H${k}<0)),"${tr('over')}",IF(OR(AND(G${k}<>"",G${k}<=MAX(C${k}/10,MIN(1000,C${k}/4))),AND(H${k}<>"",H${k}<=MAX(D${k}/10,MIN(30,D${k}/4)))),"${tr('soon')}","${tr('ok')}")))`,
          it.hint,
        ])
      }
      const last = rows.length
      fmt(first, last, 2, 5, 'int'); fmt(first, last, 5, 6, 'date'); fmt(first, last, 6, 8, 'int')
      req.push({ repeatCell: { range: { sheetId, startRowIndex: first, endRowIndex: last, startColumnIndex: 9, endColumnIndex: 10 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } })
      for (const [text, color] of [[tr('over'), { red: 0.97, green: 0.84, blue: 0.85 }], [tr('soon'), { red: 1, green: 0.95, blue: 0.8 }], [tr('ok'), { red: 0.83, green: 0.93, blue: 0.85 }]] as const)
        req.push({ addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: first, endRowIndex: last, startColumnIndex: 8, endColumnIndex: 9 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: text }] }, format: { backgroundColor: color, textFormat: { bold: true } } } }, index: 0 } })
      rows.push([])
    }

    rows.push([`${tr('spend')}, ${v.currency}`]); bold(rows.length - 1, 11)
    head(rows.length, 6)
    rows.push([tr('year'), tr('svc'), tr('acc'), tr('fuel'), tr('other'), tr('total')])
    const first = rows.length
    for (const y of s.years[v.id] ?? []) {
      const k = rows.length + 1
      const inY = (col: string) => `${col},">="&DATE($A${k},1,1),${col},"<="&DATE($A${k},12,31)`
      const svc = (amount: string, cond: string) => `SUMIFS(${S(amount)},${S('vehicle')},${V},${S('category')},${cond},${inY(S('date'))})`
      rows.push([
        y,
        `=${svc('parts', `"<>${acc}"`)}+${svc('labour', `"<>${acc}"`)}`,
        `=${svc('parts', `"${acc}"`)}+${svc('labour', `"${acc}"`)}`,
        `=SUMIFS(${F('total')},${F('vehicle')},${V},${inY(F('date'))})+SUMIFS(${E('amount')},${E('vehicle')},${V},${E('kind')},"${fuelKind}",${inY(E('date'))})`,
        `=SUMIFS(${E('amount')},${E('vehicle')},${V},${E('kind')},"<>${fuelKind}",${inY(E('date'))})`,
        `=SUM(B${k}:E${k})`,
      ])
    }
    const last = rows.length
    if (last > first) {
      rows.push([tr('all'), ...['B', 'C', 'D', 'E', 'F'].map((L) => `=SUM(${L}${first + 1}:${L}${last})`)])
      bold(rows.length - 1)
    }
    fmt(first, rows.length, 1, 6, 'money')
    rows.push([], [])
  }

  const widths = [200, 110, 110, 110, 150, 150, 110, 110, 110, 380]
  widths.forEach((w, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: 'pixelSize' } }))
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 25, endIndex: 26 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } })
  return { values: rows, requests: req }
}

/** Spreadsheets in locales with a decimal comma (ru, et…) separate formula arguments with ';'. */
export function localize(values: Cell[][], locale: string): Cell[][] {
  let comma = false
  try {
    comma = new Intl.NumberFormat(locale.replace('_', '-')).format(1.5).includes(',')
  } catch {
    comma = false
  }
  if (!comma) return values
  const conv = (f: string) => {
    // replace commas outside "string literals"
    let out = ''
    let q = false
    for (const ch of f) {
      if (ch === '"') q = !q
      out += !q && ch === ',' ? ';' : ch
    }
    return out
  }
  return values.map((r) => r.map((c) => (typeof c === 'string' && c.startsWith('=') ? conv(c) : c)))
}
