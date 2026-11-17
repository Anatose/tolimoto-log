import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDB } from './store'
import { useT } from './i18n'
import type { Status } from './calc'

export type Modal =
  | { k: 'add' }
  | { k: 'fuel'; id?: string }
  | { k: 'service'; id?: string; tag?: string }
  | { k: 'expense'; id?: string }
  | { k: 'odo' }
  | { k: 'vehicle'; id?: string }
  | { k: 'sched'; id?: string }
  | { k: 'history'; tag: string; vid: string }
  | { k: 'settings' }
  | { k: 'spend'; vid: string; year: number | null; bucket: Bucket }
  | { k: 'fuelly'; cars: import('./fuelly').FuellyCar[] }
  | null

export type Bucket = 'all' | 'service' | 'accessories' | 'fuel' | 'other'
/** open replaces the top screen, push opens on top of it, close goes back one level. */
export const NavCtx = createContext<{ open: (m: Modal) => void; push: (m: Modal) => void; close: () => void }>({ open() {}, push() {}, close() {} })
export const useNav = () => useContext(NavCtx)

export const parseNum = (s: string): number | null => {
  const x = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(x) ? x : null
}

const svg = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
export const IconX = () => (<svg {...svg}><path d="M6 6l12 12M18 6L6 18" /></svg>)
export const IconPlus = () => (<svg {...svg} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>)
export const IconGear = () => (<svg {...svg}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>)
export const IconFuel = () => (<svg {...svg}><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" /><path d="M3 21h13" /><path d="M7 7h5v4H7z" /><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3" /></svg>)
export const IconMoto = () => (<svg {...svg}><circle cx="5.5" cy="16.5" r="3.5" /><circle cx="18.5" cy="16.5" r="3.5" /><path d="M5.5 16.5l4-6h5l4 6M14.5 10.5l-1.5-3h-2M9.5 10.5l3 6" /></svg>)
export const IconCar = () => (<svg {...svg}><path d="M3 16v-3l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v3" /><path d="M3 13h18M3 16h18v2H3z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></svg>)
export const IconWrench = () => (<svg {...svg}><path d="M14.5 6a4 4 0 0 0 5.2 5.2L21 12.5l-8.5 8.5a2.1 2.1 0 0 1-3-3L18 9.5" transform="rotate(90 12 12)" /></svg>)

export function Sheet(p: { title: string; color?: string; children: ReactNode; noClose?: boolean }) {
  const nav = useNav()
  const { t } = useT()
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={p.title}>
      <div className="sheet-head" style={p.color ? { borderTopColor: p.color } : undefined}>
        {p.noClose ? (
          <span className="icon-btn ghost" />
        ) : (
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={nav.close}>
            <IconX />
          </button>
        )}
        <h2>{p.title}</h2>
        <span className="icon-btn ghost" />
      </div>
      <div className="sheet-body">{p.children}</div>
    </div>
  )
}

export function Field(p: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{p.label}</span>
      {p.children}
      {p.hint ? <span className="hint">{p.hint}</span> : null}
    </label>
  )
}

export function Chips<T extends string>(p: { options: { v: T; l: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="chips" role="group" aria-label={p.label}>
      {p.options.map((o) => (
        <button type="button" key={o.v} className={'chip' + (o.v === p.value ? ' on' : '')} aria-pressed={o.v === p.value} onClick={() => p.onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

export function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <span>{p.label}</span>
      <button type="button" role="switch" aria-checked={p.checked} aria-label={p.label} className={'switch' + (p.checked ? ' on' : '')} onClick={() => p.onChange(!p.checked)}>
        <span />
      </button>
    </div>
  )
}

export function VehicleChips(p: { vid: string; onChange: (v: string) => void }) {
  const db = useDB()
  const { t } = useT()
  if (db.vehicles.length < 2) return null
  return (
    <div className="chips vchips" role="group" aria-label={t('move')}>
      {db.vehicles.map((v) => (
        <button type="button" key={v.id} className={'chip vchip' + (v.id === p.vid ? ' on' : '')} aria-pressed={v.id === p.vid} style={v.id === p.vid ? { borderColor: v.color, boxShadow: `inset 0 0 0 1px ${v.color}` } : undefined} onClick={() => p.onChange(v.id)}>
          <span className="dot" style={{ background: v.color }} />
          {v.name}
        </button>
      ))}
    </div>
  )
}

export function Badge(p: { status: Status }) {
  const { t } = useT()
  return <span className={'badge ' + p.status}>{t(p.status)}</span>
}

export function Bar(p: { used: number; status: Status }) {
  return (
    <div className="bar">
      <div className={p.status} style={{ width: Math.round(p.used * 100) + '%' }} />
    </div>
  )
}

/** Two-step delete: the first tap asks, the second deletes. No browser dialogs. */
export function DeleteBtn(p: { onDelete: () => void }) {
  const { t } = useT()
  const [ask, setAsk] = useState(false)
  return (
    <button type="button" className={'btn danger' + (ask ? ' armed' : '')} onClick={() => (ask ? p.onDelete() : setAsk(true))}>
      {ask ? t('confirmDelete') : t('delete')}
    </button>
  )
}

/**
 * Date field. iOS Safari's own "Reset" button empties the field without firing the event React
 * listens to, so the value is also read on the native input/change events and when focus leaves.
 * With `clearable`, a cross clears it; without it, an emptied field falls back to `fallback`.
 */
export function DateInput(p: { value: string; onChange: (v: string) => void; clearable?: boolean; fallback?: string; min?: string; max?: string; label?: string }) {
  const { t } = useT()
  const ref = useRef<HTMLInputElement>(null)
  const cb = useRef(p.onChange)
  cb.current = p.onChange
  const fb = useRef(p.fallback)
  fb.current = p.fallback
  const push = (raw: string) => cb.current(raw || (fb.current ?? ''))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const on = () => {
      // a required date that was emptied shows the fallback again even when the state did not change
      if (!el.value && fb.current) el.value = fb.current
      push(el.value)
    }
    el.addEventListener('input', on)
    el.addEventListener('change', on)
    el.addEventListener('blur', on)
    return () => {
      el.removeEventListener('input', on)
      el.removeEventListener('change', on)
      el.removeEventListener('blur', on)
    }
  }, [])
  return (
    <span className="date-wrap">
      <input ref={ref} className="input" type="date" value={p.value} min={p.min} max={p.max} aria-label={p.label} onChange={(e) => push(e.target.value)} />
      {p.clearable && p.value && (
        <button type="button" className="date-clear" aria-label={t('clearDate')} onClick={() => cb.current('')}><IconX /></button>
      )}
    </span>
  )
}
