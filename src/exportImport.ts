import { strToU8, zipSync } from 'fflate'
import { getDB, normalize, update, type DB } from './store'
import { forgetDeleted } from './sync'
import { repairScheduleTypes } from './i18n'

const cell = (v: string | number | boolean | null | undefined): string => {
  if (v == null) return ''
  if (typeof v === 'number') return String(v).replace('.', ',')
  if (typeof v === 'boolean') return v ? '1' : '0'
  return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}
/** Semicolon-separated, decimal comma, UTF-8 with BOM: opens correctly in Excel with European settings. */
const csv = (head: string[], rows: (string | number | boolean | null | undefined)[][]): Uint8Array =>
  strToU8('﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n')

export function buildCsvZip(db: DB): Blob {
  const name = (id: string) => db.vehicles.find((v) => v.id === id)?.name ?? ''
  const cur = (id: string) => db.vehicles.find((v) => v.id === id)?.currency ?? ''
  const files = {
    'garage.csv': csv(
      ['name', 'type', 'currency', 'odometer', 'purchase_date', 'purchase_odometer', 'purchase_price', 'value_now', 'value_date', 'sold_date', 'sold_price', 'archived'],
      db.vehicles.map((v) => [v.name, v.type, v.currency, v.odometer, v.ownership?.purchaseDate, v.ownership?.purchaseOdometer, v.ownership?.purchasePrice, v.ownership?.valueNow, v.ownership?.valueDate, v.ownership?.soldDate, v.ownership?.soldPrice, v.archived]),
    ),
    'service-log.csv': csv(
      ['vehicle', 'date', 'odometer', 'category', 'description', 'tags', 'parts', 'labour', 'total', 'currency', 'notes', 'media'],
      db.service.map((s) => [
        name(s.vehicleId), s.date, s.odometer, s.category, s.description,
        s.tags.map((t) => '#' + t).join(' '), s.parts, s.labour, (s.parts ?? 0) + (s.labour ?? 0), cur(s.vehicleId), s.notes, s.media,
      ]),
    ),
    'fuel.csv': csv(
      ['vehicle', 'date', 'odometer', 'liters', 'total', 'price_per_liter', 'currency', 'full_tank', 'missed_previous', 'station'],
      db.fuel.map((f) => [
        name(f.vehicleId), f.date, f.odometer, f.liters, f.total,
        f.liters ? Number((f.total / f.liters).toFixed(3)) : null, cur(f.vehicleId), f.full, f.missed, f.station,
      ]),
    ),
    'schedule.csv': csv(
      ['vehicle', 'name', 'tag', 'interval_km', 'interval_days', 'hint'],
      db.schedule.map((s) => [name(s.vehicleId), s.name, '#' + s.tag, s.intervalKm, s.intervalDays, s.hint]),
    ),
    'other-expenses.csv': csv(
      ['vehicle', 'date', 'kind', 'amount', 'currency', 'note'],
      db.expenses.map((e) => [name(e.vehicleId), e.date, e.kind, e.amount, cur(e.vehicleId), e.note]),
    ),
  }
  return new Blob([zipSync(files)], { type: 'application/zip' })
}

export const buildJson = (db: DB): Blob =>
  new Blob([JSON.stringify({ app: 'tolimoto-log', exportedAt: new Date().toISOString(), ...db }, null, 2)], {
    type: 'application/json',
  })

/** On iPhone the share sheet is the reliable way to save a file from an installed web app. */
export async function saveFile(name: string, blob: Blob): Promise<boolean> {
  const file = new File([blob], name, { type: blob.type })
  const nv = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && nv.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false
      // the share sheet needs a fresh tap (e.g. after a long build): the caller offers the button again
      if ((e as Error).name === 'NotAllowedError') return false
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  return true
}

/** Saves a JSON backup and remembers when, for the backup reminder. */
export async function backupNow(): Promise<boolean> {
  const db = getDB()
  const ok = await saveFile(`tolimoto-log-${stamp()}.json`, buildJson({ ...db, settings: { ...db.settings, google: null } }))
  if (ok) update((d) => { d.settings.lastBackup = new Date().toISOString(); d.settings.backupSnooze = null })
  return ok
}

/** Merge a JSON backup into the current data: records are added or replaced by id, nothing else is removed. */
export function importJson(text: string): number {
  const raw = JSON.parse(text) as Partial<DB>
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.vehicles)) throw new Error('format')
  const inc = normalize(raw)
  let count = 0
  update((d) => {
    const merge = <T extends { id: string }>(into: T[], from: T[]) => {
      for (const r of from) {
        if (!r || typeof r.id !== 'string') continue
        const i = into.findIndex((x) => x.id === r.id)
        if (i >= 0) into[i] = r
        else into.push(r)
        count++
      }
    }
    merge(d.vehicles, inc.vehicles)
    merge(d.service, inc.service)
    merge(d.fuel, inc.fuel)
    merge(d.expenses, inc.expenses)
    merge(d.schedule, inc.schedule)
    if (!d.settings.activeVehicleId && d.vehicles[0]) d.settings.activeVehicleId = d.vehicles[0].id
    // an old backup may carry motorcycle items in a car's schedule (made before the fix)
    repairScheduleTypes(d, d.settings.lang ?? 'en')
  })
  // a vehicle deleted here and now restored from a backup must not be dropped by the next sync
  void forgetDeleted(inc.vehicles.map((v) => v.id))
  return count
}

export const stamp = (): string => new Date().toISOString().slice(0, 10)
export const currentData = (): DB => getDB()
