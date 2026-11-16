import { useSyncExternalStore } from 'react'

export type Lang = 'ru' | 'en'
export type VType = 'moto' | 'car'
export type Category = 'service' | 'consumables' | 'repair' | 'accessories'
export type ExpenseKind = 'insurance' | 'inspection' | 'tax' | 'fuel' | 'other'

export interface Vehicle {
  id: string
  name: string
  type: VType
  color: string
  currency: string
  /** Odometer entered by hand; the shown value is the max of this and all records. */
  odometer: number
}
export interface ServiceEntry {
  id: string
  vehicleId: string
  date: string
  odometer: number | null
  category: Category
  description: string
  tags: string[]
  parts: number | null
  labour: number | null
  notes: string
  media: string
}
export interface FuelEntry {
  id: string
  vehicleId: string
  date: string
  odometer: number
  liters: number
  total: number
  full: boolean
  /** A fill-up before this one was not recorded. */
  missed: boolean
  station: string
}
export interface Expense {
  id: string
  vehicleId: string
  date: string
  kind: ExpenseKind
  amount: number
  note: string
}
export interface ScheduleItem {
  id: string
  vehicleId: string
  name: string
  tag: string
  intervalKm: number | null
  intervalDays: number | null
  hint: string
}
export interface Settings {
  lang: Lang | null
  theme: 'auto' | 'dark' | 'light'
  startOnFuel: boolean
  activeVehicleId: string | null
  installHintDismissed: boolean
}
export interface DB {
  v: 1
  vehicles: Vehicle[]
  service: ServiceEntry[]
  fuel: FuelEntry[]
  expenses: Expense[]
  schedule: ScheduleItem[]
  settings: Settings
}

export const emptyDB = (): DB => ({
  v: 1,
  vehicles: [],
  service: [],
  fuel: [],
  expenses: [],
  schedule: [],
  settings: { lang: null, theme: 'auto', startOnFuel: false, activeVehicleId: null, installHintDismissed: false },
})

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

export const today = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const activeId = (db: DB): string | null => {
  const a = db.settings.activeVehicleId
  if (a && db.vehicles.some((v) => v.id === a)) return a
  return db.vehicles[0]?.id ?? null
}

/* ---------- persistence: one document in IndexedDB, localStorage as fallback ---------- */

const KEY = 'tolimoto-log-db'
let state: DB = emptyDB()
let loaded = false
let mode: 'idb' | 'local' | 'memory' = 'idb'
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const sub = (f: () => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('idb timeout')), 3000)
    const r = indexedDB.open('tolimoto-log', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => {
      clearTimeout(timer)
      res(r.result)
    }
    r.onerror = () => {
      clearTimeout(timer)
      rej(r.error)
    }
  })
}
async function idbGet(): Promise<DB | undefined> {
  const d = await openIdb()
  return new Promise((res, rej) => {
    const q = d.transaction('kv').objectStore('kv').get(KEY)
    q.onsuccess = () => res(q.result as DB | undefined)
    q.onerror = () => rej(q.error)
  })
}
async function idbSet(v: DB): Promise<void> {
  const d = await openIdb()
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(v, KEY)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

export function normalize(d: Partial<DB>): DB {
  const e = emptyDB()
  return {
    v: 1,
    vehicles: d.vehicles ?? [],
    service: d.service ?? [],
    fuel: d.fuel ?? [],
    expenses: d.expenses ?? [],
    schedule: d.schedule ?? [],
    settings: { ...e.settings, ...(d.settings ?? {}) },
  }
}

export async function loadDB(): Promise<void> {
  let d: DB | undefined
  try {
    d = await idbGet()
  } catch {
    mode = 'local'
    try {
      const s = localStorage.getItem(KEY)
      if (s) d = JSON.parse(s) as DB
    } catch {
      mode = 'memory'
    }
  }
  if (d && d.v === 1) state = normalize(d)
  loaded = true
  emit()
  try {
    void navigator.storage?.persist?.()
  } catch {
    /* not supported */
  }
}

function save(): void {
  if (mode === 'idb') {
    idbSet(state).catch(() => {
      mode = 'local'
      save()
    })
  } else if (mode === 'local') {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      mode = 'memory'
    }
  }
}

export function update(fn: (d: DB) => void): void {
  const d = JSON.parse(JSON.stringify(state)) as DB
  fn(d)
  state = d
  save()
  emit()
}

export const getDB = (): DB => state
export const storageMode = () => mode
export const useDB = (): DB => useSyncExternalStore(sub, () => state)
export const useLoaded = (): boolean => useSyncExternalStore(sub, () => loaded)
