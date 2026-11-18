/*
 * Full cost of ownership (purchase, value now or sale), the archive of vehicles,
 * comparing vehicles, and deleting a vehicle for good.
 */
import { useState } from 'react'
import { liveVehicles, normOwnership, today, update, useDB, type DB, type Ownership } from './store'
import { useT, type K } from './i18n'
import { OWN_PARTS, avgL100, costPerKm, currentOdo, distanceKnown, fuelSegments, ownershipCost, recordSpan, valueDue, type OwnPart } from './calc'
import { Chips, DateInput, Field, Sheet, parseNum, useNav } from './ui'
import { backupNow } from './exportImport'
import { rememberDeleted } from './sync'
import { Journal, Stats } from './Screens'

const DAY = 86400000

/* ---------- actions ---------- */

export function archiveVehicle(vid: string): void {
  update((d) => {
    const v = d.vehicles.find((x) => x.id === vid)
    if (!v) return
    v.archived = today()
    if (d.settings.activeVehicleId === vid) d.settings.activeVehicleId = liveVehicles(d)[0]?.id ?? null
  })
}

export function restoreVehicle(vid: string): void {
  update((d) => {
    const v = d.vehicles.find((x) => x.id === vid)
    if (v) v.archived = null
  })
}

/** Removes the vehicle with all its records; the sync then removes them from the sheet too. */
export function deleteVehicle(vid: string): void {
  void rememberDeleted(vid)
  update((d) => {
    d.vehicles = d.vehicles.filter((v) => v.id !== vid)
    d.service = d.service.filter((x) => x.vehicleId !== vid)
    d.fuel = d.fuel.filter((x) => x.vehicleId !== vid)
    d.expenses = d.expenses.filter((x) => x.vehicleId !== vid)
    d.schedule = d.schedule.filter((x) => x.vehicleId !== vid)
    if (d.settings.activeVehicleId === vid) d.settings.activeVehicleId = liveVehicles(d)[0]?.id ?? null
  })
}

/* ---------- the "cost per km" tile on Stats ---------- */

export function OwnTileLine({ vid }: { vid: string }) {
  const db = useDB()
  const { t, n } = useT()
  const nav = useNav()
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  const c = ownershipCost(db, vid, today())
  if (!v.ownership) return <button type="button" className="quiet-link" onClick={() => nav.push({ k: 'own', vid })}>{t('ownAdd')}</button>
  return (
    <button type="button" className="row-btn bare own-line" onClick={() => nav.push({ k: c ? 'cost' : 'own', vid })}>
      <b className="num">{c?.perKm != null ? `${n(c.perKm, 2)} ${v.currency}` : '—'}</b> <span className="muted small">{t('ownWith')} ›</span>
    </button>
  )
}

/** Once a year: "Update the estimated value of …", like the backup reminder; Later = 30 days. */
export function ValueReminder() {
  const db = useDB()
  const { t } = useT()
  const nav = useNav()
  const vid = valueDue(db, today())
  const v = db.vehicles.find((x) => x.id === vid)
  if (!vid || !v) return null
  return (
    <div className="notice warn" role="status">
      <span>{t('vrTitle')} {v.name}</span>
      <span className="row-btns">
        <button type="button" className="btn small primary" onClick={() => nav.push({ k: 'own', vid })}>{t('update')}</button>
        <button type="button" className="btn small" onClick={() => update((d) => { d.settings.valueSnooze = new Date(Date.now() + 30 * DAY).toISOString() })}>{t('brLater')}</button>
      </span>
    </div>
  )
}

/* ---------- setting up the full cost ---------- */

export function OwnershipForm({ vid }: { vid: string }) {
  const db = useDB()
  const { t, inp } = useT()
  const nav = useNav()
  const v = db.vehicles.find((x) => x.id === vid)
  const o = v?.ownership
  const s = (x: number | null | undefined) => (x == null ? '' : inp(x, 2))
  const [pDate, setPDate] = useState(o?.purchaseDate ?? '')
  const [pOdo, setPOdo] = useState(o?.purchaseOdometer == null ? '' : String(o.purchaseOdometer))
  const [pPrice, setPPrice] = useState(s(o?.purchasePrice))
  const [status, setStatus] = useState<Ownership['status']>(o?.status ?? 'own')
  const [value, setValue] = useState(s(o?.valueNow))
  const [valueTouched, setValueTouched] = useState(false)
  const [soldDate, setSoldDate] = useState(o?.soldDate ?? today())
  const [soldPrice, setSoldPrice] = useState(s(o?.soldPrice))
  if (!v) return null
  const price = parseNum(pPrice)
  const odo = parseNum(pOdo)
  const valid = !!pDate && price != null && odo != null && (status === 'own' || (!!soldDate && parseNum(soldPrice) != null))
  const save = () => {
    const valueNow = parseNum(value)
    const fresh = valueNow != null && (valueTouched || valueNow !== o?.valueNow || !o?.valueDate)
    const next = normOwnership({
      purchaseDate: pDate, purchaseOdometer: odo, purchasePrice: price,
      valueNow: status === 'own' ? valueNow : null,
      valueDate: status === 'own' && valueNow != null ? (fresh ? today() : o?.valueDate ?? today()) : null,
      soldDate: status === 'sold' ? soldDate : null,
      soldPrice: status === 'sold' ? parseNum(soldPrice) : null,
    })
    const justSold = status === 'sold' && o?.status !== 'sold'
    update((d) => {
      const x = d.vehicles.find((q) => q.id === vid)
      if (x) x.ownership = next
      if (status === 'own' && valueNow != null) d.settings.valueSnooze = null
    })
    if (justSold && !v.archived) nav.open({ k: 'sold', vid })
    else nav.close()
  }
  const remove = () => {
    update((d) => { const x = d.vehicles.find((q) => q.id === vid); if (x) x.ownership = null })
    nav.close()
  }
  return (
    <Sheet title={`${t('ownTitle')} · ${v.name}`} color={v.color}>
      <p>{t('ownLead')} <span className="muted">{t('ownOptional')}.</span></p>
      <h3>{t('ownPurchase')}</h3>
      <div className="field"><span className="label">{t('ownPDate')}</span><DateInput label={t('ownPDate')} value={pDate} max={today()} onChange={setPDate} /></div>
      <div className="grid2">
        <Field label={t('ownPOdo')}><input className="input num" inputMode="numeric" value={pOdo} onChange={(e) => setPOdo(e.target.value)} /></Field>
        <Field label={`${t('ownPPrice')}, ${v.currency}`}><input className="input num" inputMode="decimal" value={pPrice} onChange={(e) => setPPrice(e.target.value)} /></Field>
      </div>
      <Chips label={t('ownTitle')} value={status} onChange={setStatus} options={[{ v: 'own', l: t('ownStill') }, { v: 'sold', l: t('ownSold') }]} />
      {status === 'own' ? (
        <Field label={`${t('ownValueNow')}, ${v.currency}`} hint={t('ownValueHint')}>
          <input className="input num" inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setValueTouched(true) }} />
        </Field>
      ) : (
        <div className="grid2">
          <div className="field"><span className="label">{t('ownSoldDate')}</span><DateInput label={t('ownSoldDate')} value={soldDate} min={pDate || undefined} max={today()} onChange={setSoldDate} fallback={today()} /></div>
          <Field label={`${t('ownSoldPrice')}, ${v.currency}`}><input className="input num" inputMode="decimal" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} /></Field>
        </div>
      )}
      <div className="spacer" />
      <button type="button" className="btn primary big" disabled={!valid} onClick={save}>{t('save')}</button>
      {o && <button type="button" className="btn link danger-link" onClick={remove}>{t('ownRemove')}</button>}
    </Sheet>
  )
}

/* ---------- the full cost in detail ---------- */

const PART_LABEL: Record<OwnPart, K> = { loss: 'part_loss', fuel: 'part_fuel', service: 'part_service', fixed: 'part_fixed', accessories: 'part_accessories', other: 'part_other' }

export function CostDetail({ vid }: { vid: string }) {
  const db = useDB()
  const { t, n, date } = useT()
  const nav = useNav()
  const v = db.vehicles.find((x) => x.id === vid)
  const c = ownershipCost(db, vid, today())
  const o = v?.ownership
  if (!v || !o || !c) return null
  const cur = v.currency
  const money = (x: number) => `${n(x, 0)} ${cur}`
  const shown = OWN_PARTS.filter((p) => c.parts[p] !== 0 || p === 'loss')
  const barTotal = OWN_PARTS.reduce((s, p) => s + Math.max(0, c.parts[p]), 0)
  return (
    <Sheet title={t('ownTitle')} color={v.color}>
      <p className="muted num">{v.name} · {t('ownSince')} {date(c.from)}{c.dist != null ? ` · ${n(c.dist)} ${t('km')}` : ''}</p>
      <div className="own-big">
        <b className="num">{c.perKm != null ? `${n(c.perKm, 2)} ${cur}` : '—'}</b> <span>{t('ownPerKmBig')}</span>
      </div>
      <p className="own-month num">≈ {c.perMonth != null ? `${n(c.perMonth, 0)} ${cur}` : '—'} {t('ownPerMonth')}</p>
      {c.loss == null && <div className="notice warn"><span>{t('ownNoValue')}</span></div>}
      {c.dist == null && <div className="notice warn"><span>{t('ownNoOdo')}</span></div>}
      {barTotal > 0 && (
        <div className="own-bar" role="img" aria-label={shown.map((p) => `${t(PART_LABEL[p])} ${money(c.parts[p])}`).join(', ')}>
          {OWN_PARTS.filter((p) => c.parts[p] > 0).map((p) => <div key={p} className={'p-' + p} style={{ width: (c.parts[p] / barTotal) * 100 + '%' }} />)}
        </div>
      )}
      <div className="card own-legend">
        {shown.map((p) => (
          <div className="split" key={p}>
            <span><i className={'sw p-' + p} aria-hidden="true" /> {t(PART_LABEL[p])}</span>
            <span className="num">
              <span className="muted">{c.dist && c.dist > 0 && !(p === 'loss' && c.loss == null) ? `${n(c.parts[p] / c.dist, 3)} ${cur}/${t('km')} · ` : ''}</span>
              <b>{p === 'loss' && c.loss == null ? '—' : money(c.parts[p])}</b>
            </span>
          </div>
        ))}
      </div>
      <h3>{t('ownMonth')}</h3>
      <div className="grid2">
        <div className="card tile"><span className="label">{t('ownFixed')}</span><b className="num">{c.fixedMonth != null ? `≈ ${money(c.fixedMonth)}` : '—'}</b><span className="muted small">{t('part_loss')} · {t('part_fixed')}</span></div>
        <div className="card tile"><span className="label">{t('ownVariable')}</span><b className="num">{c.variableMonth != null ? `≈ ${money(c.variableMonth)}` : '—'}</b><span className="muted small">{t('part_fuel')} · {t('part_service')} · …</span></div>
      </div>
      <p className="muted small">{t('ownMonthNote')}</p>
      <p className="small num">
        {t('ownBought')} {o.purchasePrice != null ? money(o.purchasePrice) : '—'}
        {o.status === 'sold'
          ? ` · ${t('ownSoldFor')} ${o.soldPrice != null ? money(o.soldPrice) : '—'}${o.soldDate ? ` (${date(o.soldDate)})` : ''}`
          : o.valueNow != null ? ` · ${t('ownNow')} ${money(o.valueNow)}${o.valueDate ? ` · ${t('ownEstFrom')} ${date(o.valueDate)}` : ''}` : ''}
      </p>
      <button type="button" className="btn" onClick={() => nav.push({ k: 'own', vid })}>{t('edit')}</button>
    </Sheet>
  )
}

/* ---------- after "Sold" was saved ---------- */

export function SoldChoice({ vid }: { vid: string }) {
  const db = useDB()
  const { t } = useT()
  const nav = useNav()
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  return (
    <Sheet title={`${t('soldTitle')} · ${v.name}`} color={v.color}>
      <p>{t('soldLead')}</p>
      <button type="button" className="btn primary big" onClick={() => { archiveVehicle(vid); nav.reset() }}>{t('toArchive')}</button>
      <button type="button" className="btn big" onClick={() => nav.open({ k: 'vdelete', vid })}>{t('deleteForever')}</button>
      <button type="button" className="btn big" onClick={nav.close}>{t('keepInGarage')}</button>
      <button type="button" className="btn link" onClick={() => nav.push({ k: 'export', vid })}>{t('exportFirst')}</button>
    </Sheet>
  )
}

/* ---------- archive, comparison ---------- */

/** Figures used on the archive cards and in the comparison. */
function summary(db: DB, vid: string) {
  const v = db.vehicles.find((x) => x.id === vid)!
  const td = today()
  const own = ownershipCost(db, vid, td)
  const span = recordSpan(db, vid)
  const from = v.ownership?.purchaseDate ?? span.first
  const to = v.ownership?.soldDate ?? v.archived ?? (from ? td : null)
  const km = own?.dist ?? distanceKnown(db, vid)
  return { v, from, to, km, perKm: costPerKm(db, vid), ownPerKm: own?.perKm ?? null, perMonth: own?.perMonth ?? null, l100: avgL100(fuelSegments(db.fuel.filter((f) => f.vehicleId === vid))), hasOwn: !!v.ownership }
}

export function ArchiveScreen() {
  const db = useDB()
  const { t, n, date } = useT()
  const nav = useNav()
  const list = db.vehicles.filter((v) => v.archived)
  return (
    <Sheet title={`${t('archive')} (${list.length})`}>
      {db.vehicles.length > 1 && <button type="button" className="btn" onClick={() => nav.push({ k: 'compare' })}>{t('compare')}</button>}
      {list.map((v) => {
        const s = summary(db, v.id)
        return (
          <div className="card arch-card" key={v.id} style={{ borderLeftColor: v.color }}>
            <b>{v.name}</b>
            {s.from && <span className="small num">{t('archOwned')}: {date(s.from)} – {s.to ? date(s.to) : '…'}</span>}
            <span className="small num">{t('archKm')}: {n(s.km)} {t('km')}{s.l100 != null ? ` · ${n(s.l100, 1)} ${t('l100')}` : ''}</span>
            <span className="small num">{t('perKm')}: {s.perKm != null ? `${n(s.perKm, 2)} ${v.currency}` : '—'}{s.hasOwn ? ` · ${t('ownWith')}: ${s.ownPerKm != null ? `${n(s.ownPerKm, 2)} ${v.currency}` : '—'}` : ''}</span>
            <div className="row-btns">
              <button type="button" className="btn small primary" onClick={() => nav.push({ k: 'vview', vid: v.id })}>{t('archOpen')}</button>
              <button type="button" className="btn small outline" onClick={() => restoreVehicle(v.id)}>{t('archRestore')}</button>
              <button type="button" className="btn small danger" onClick={() => nav.push({ k: 'vdelete', vid: v.id })}>{t('delete')}</button>
            </div>
          </div>
        )
      })}
    </Sheet>
  )
}

export function Compare() {
  const db = useDB()
  const { t, n } = useT()
  const live = liveVehicles(db)
  const arch = db.vehicles.filter((v) => v.archived)
  // by default the vehicle in use and the last archived one (or the first two of whatever there is)
  const [pick, setPick] = useState<string[]>(() => [...new Set([...live.slice(0, 1), ...arch.slice(-1), ...live, ...arch])].slice(0, 2).map((v) => v.id))
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]))
  const cols = pick.map((id) => summary(db, id)).filter((s) => s.v)
  const ym = (s: string | null) => (s ? `${s.slice(5, 7)}.${s.slice(0, 4)}` : '…')
  const money = (x: number | null, cur: string, d: number) => (x == null ? '—' : `${n(x, d)} ${cur}`)
  const rows: [string, (s: ReturnType<typeof summary>) => string][] = [
    [t('cmpPeriod'), (s) => (s.from ? `${ym(s.from)}–${ym(s.to)}` : '—')],
    [t('cmpKm'), (s) => n(s.km)],
    [t('perKm'), (s) => money(s.perKm, s.v.currency, 2)],
    [t('cmpPerKmOwn'), (s) => money(s.ownPerKm, s.v.currency, 2)],
    [t('cmpPerMonth'), (s) => money(s.perMonth, s.v.currency, 0)],
    [t('l100'), (s) => (s.l100 != null ? n(s.l100, 1) : '—')],
  ]
  return (
    <Sheet title={t('compare')}>
      <span className="label">{t('cmpPick')}</span>
      <div className="chips" role="group" aria-label={t('cmpPick')}>
        {db.vehicles.map((v) => (
          <button type="button" key={v.id} className={'chip' + (pick.includes(v.id) ? ' on' : '')} aria-pressed={pick.includes(v.id)} onClick={() => toggle(v.id)}>
            <span className="dot" style={{ background: v.color }} /> {v.name}{v.archived ? ` · ${t('inArchive').toLowerCase()}` : ''}
          </button>
        ))}
      </div>
      {cols.length > 0 && (
        <div className="cmp-wrap">
          <table className="cmp">
            <thead><tr><th />{cols.map((s) => <th key={s.v.id} style={{ borderTopColor: s.v.color }}>{s.v.name}</th>)}</tr></thead>
            <tbody>{rows.map(([label, f]) => <tr key={label}><th scope="row">{label}</th>{cols.map((s) => <td key={s.v.id} className="num">{f(s)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </Sheet>
  )
}

/* ---------- deleting a vehicle: two steps ---------- */

export function VehicleDelete({ vid }: { vid: string }) {
  const db = useDB()
  const { t } = useT()
  const nav = useNav()
  const [step, setStep] = useState(1)
  const [typed, setTyped] = useState('')
  const [saved, setSaved] = useState(false)
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  const match = typed.trim().toLowerCase() === v.name.trim().toLowerCase()
  return (
    <Sheet title={`${t('delTitle')} · ${v.name}`} color={v.color}>
      <div className="notice warn"><span>{t('delWarn')}</span></div>
      {step === 1 ? (
        <>
          <button type="button" className="btn" onClick={async () => { if (await backupNow()) setSaved(true) }}>{t('delBackup')}</button>
          {saved && <div className="notice" role="status">{t('backupSaved')}</div>}
          {!v.archived && (
            <>
              <p className="muted small">{t('delArchiveHint')}</p>
              <button type="button" className="btn" onClick={() => { archiveVehicle(vid); nav.reset() }}>{t('toArchive')}</button>
            </>
          )}
          <div className="spacer" />
          <button type="button" className="btn danger" onClick={() => setStep(2)}>{t('delNext')}</button>
        </>
      ) : (
        <>
          <Field label={t('delType')}>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={v.name} autoFocus autoComplete="off" />
          </Field>
          <div className="spacer" />
          <button type="button" className="btn danger armed" disabled={!match} onClick={() => { deleteVehicle(vid); nav.reset() }}>{t('delFinal')}</button>
        </>
      )}
      <button type="button" className="btn link" onClick={nav.close}>{t('close')}</button>
    </Sheet>
  )
}

/* ---------- looking at an archived vehicle ---------- */

export function VehicleView({ vid }: { vid: string }) {
  const db = useDB()
  const { t, n } = useT()
  const nav = useNav()
  const [tab, setTab] = useState<'journal' | 'stats'>('journal')
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  return (
    <Sheet title={v.name} color={v.color}>
      <p className="muted num">{v.archived ? `${t('inArchive')} · ` : ''}{n(currentOdo(db, vid))} {t('km')}</p>
      <div className="row-btns">
        <button type="button" className="btn small" onClick={() => nav.push({ k: 'export', vid })}>{t('exportPdf')}</button>
        {v.archived && <button type="button" className="btn small" onClick={() => { restoreVehicle(vid); nav.close() }}>{t('archRestore')}</button>}
      </div>
      <Chips value={tab} onChange={setTab} options={[{ v: 'journal', l: t('tabJournal') }, { v: 'stats', l: t('tabStats') }]} />
      {tab === 'journal' ? <Journal vid={vid} embedded /> : <Stats vid={vid} embedded />}
    </Sheet>
  )
}
