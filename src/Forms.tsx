import { useRef, useState } from 'react'
import { activeId, today, uid, update, useDB, storageMode, type Category, type ExpenseKind, type Lang, type VType } from './store'
import { LANGS, PRESETS, defaultCurrency, locale, presetName, useT, type K } from './i18n'
import { currentOdo, fuelSegments } from './calc'
import { Chips, DateInput, DeleteBtn, Field, IconFuel, IconWrench, IconX, Sheet, Toggle, VehicleChips, parseNum, useNav } from './ui'
import { backupNow, buildCsvZip, buildJson, importJson, saveFile, stamp } from './exportImport'
import { backToStorageChoice, guideUrl, platform } from './Onboarding'

const APP_VERSION = '0.6.2'
import { addFuellyRows, guessType, lumpOverlaps, parseFuelFiles, type FuellyCar, type FuelOverlap } from './fuelly'
import { dropToken, folderUrl, getToken, googleConfigured, sheetUrl, signIn, uploadFile } from './google'
import { shrink } from './photos'
import { connect, disconnect, syncNow, useSync } from './sync'

export const COLORS = ['#4C9AFF', '#FF8A3D', '#3DDC84', '#C77DFF', '#FF5A8A', '#FFD23F']
const CATS: Category[] = ['service', 'consumables', 'repair', 'accessories']
const KINDS: ExpenseKind[] = ['insurance', 'inspection', 'tax', 'fuel', 'other']
const cleanTag = (s: string) => s.toLowerCase().replace(/^#+/, '').replace(/[^a-z0-9а-яё_-]/gi, '')

/* ---------- first run ---------- */

export function LangPick() {
  const pick = (lang: Lang) => update((d) => { d.settings.lang = lang })
  return (
    <div className="center-screen">
      <h1>Tolimoto Log</h1>
      <p className="muted">Выберите язык · Choose language</p>
      {LANGS.map((o) => <button type="button" key={o.v} className="btn" onClick={() => pick(o.v)}>{o.l}</button>)}
    </div>
  )
}

/* ---------- vehicle ---------- */

export function VehicleForm({ id, first }: { id?: string; first?: boolean }) {
  const db = useDB()
  const { t, lang } = useT()
  const nav = useNav()
  const ed = id ? db.vehicles.find((v) => v.id === id) : undefined
  const [name, setName] = useState(ed?.name ?? '')
  const [type, setType] = useState<VType>(ed?.type ?? 'moto')
  const [color, setColor] = useState(ed?.color ?? COLORS.find((c) => !db.vehicles.some((x) => x.color.toLowerCase() === c.toLowerCase())) ?? COLORS[0])
  const [currency, setCurrency] = useState(ed?.currency ?? defaultCurrency(lang))
  const [odo, setOdo] = useState(ed ? String(ed.odometer) : '')
  const [preset, setPreset] = useState<'typical' | 'empty'>('typical')
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState(false)
  const fuellyFile = useRef<HTMLInputElement>(null)
  const valid = name.trim().length > 0
  const save = () => {
    const vid = ed?.id ?? uid()
    update((d) => {
      const rec = { id: vid, name: name.trim(), type, color, currency: currency.trim() || defaultCurrency(lang), odometer: parseNum(odo) ?? 0 }
      const i = d.vehicles.findIndex((v) => v.id === vid)
      if (i >= 0) d.vehicles[i] = rec
      else {
        d.vehicles.push(rec)
        d.settings.activeVehicleId = vid
        if (preset === 'typical')
          for (const p of PRESETS[type])
            d.schedule.push({ id: uid(), vehicleId: vid, name: presetName(p, lang), tag: p.tag, intervalKm: p.km, intervalDays: p.days, hint: '' })
      }
    })
    nav.close()
  }
  const remove = () => {
    update((d) => {
      d.vehicles = d.vehicles.filter((v) => v.id !== id)
      d.service = d.service.filter((x) => x.vehicleId !== id)
      d.fuel = d.fuel.filter((x) => x.vehicleId !== id)
      d.expenses = d.expenses.filter((x) => x.vehicleId !== id)
      d.schedule = d.schedule.filter((x) => x.vehicleId !== id)
      if (d.settings.activeVehicleId === id) d.settings.activeVehicleId = d.vehicles[0]?.id ?? null
    })
    nav.close()
  }
  return (
    <Sheet title={first ? t('firstVehicle') : ed ? t('editVehicle') : t('newVehicle')} color={color} noClose={first} onBack={first && !db.vehicles.length ? backToStorageChoice : undefined}>
      <Field label={t('name')}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Honda NC750X" autoFocus={!ed} />
      </Field>
      <div className="field">
        <span className="label">{t('type')}</span>
        <Chips label={t('type')} value={type} onChange={setType} options={[{ v: 'moto', l: t('moto') }, { v: 'car', l: t('car') }]} />
      </div>
      <div className="field">
        <span className="label">{t('color')}</span>
        <div className="chips" role="group" aria-label={t('color')}>
          {COLORS.map((c) => (
            <button type="button" key={c} className={'swatch' + (c === color ? ' on' : '')} aria-pressed={c === color} aria-label={c} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <div className="grid2">
        <Field label={t('curOdo')}>
          <input className="input num" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} />
        </Field>
        <Field label={t('currency')}>
          <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={4} />
        </Field>
      </div>
      {!ed && (
        <div className="field">
          <span className="label">{t('preset')}</span>
          <Chips label={t('preset')} value={preset} onChange={setPreset} options={[{ v: 'typical', l: t('presetTypical') }, { v: 'empty', l: t('presetEmpty') }]} />
          <span className="hint">{t('presetNote')}</span>
        </div>
      )}
      <div className="spacer" />
      {ed && db.vehicles.length > 0 && <DeleteBtn onDelete={remove} />}
      {first && (
        <>
          <button type="button" className="btn link" onClick={() => file.current?.click()}>{t('importJson')}</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { importJson(await f.text()) } catch { setErr(true) } }} />
          <button type="button" className="btn link" onClick={() => fuellyFile.current?.click()}>{t('importFuelly')}</button>
          <input ref={fuellyFile} type="file" multiple accept=".csv,text/csv,text/plain" hidden onChange={async (e) => { const fs = [...(e.target.files ?? [])]; if (!fs.length) return; try { nav.open({ k: 'fuelly', cars: parseFuelFiles(await Promise.all(fs.map((f) => f.text()))) }) } catch { setErr(true) } e.target.value = '' }} />
          {err && <div className="notice warn" role="status">{t('importErr')}</div>}
        </>
      )}
      <button type="button" className="btn primary big" disabled={!valid} onClick={save}>{t('save')}</button>
    </Sheet>
  )
}

/* ---------- fuel ---------- */

export function FuelForm({ id }: { id?: string }) {
  const db = useDB()
  const { t, n, inp } = useT()
  const nav = useNav()
  const ed = id ? db.fuel.find((f) => f.id === id) : undefined
  const [vid, setVid] = useState(ed?.vehicleId ?? activeId(db) ?? '')
  const [date, setDate] = useState(ed?.date ?? today())
  const [odo, setOdo] = useState(ed ? String(ed.odometer) : '')
  const [lit, setLit] = useState(ed ? inp(ed.liters, 2) : '')
  const [sum, setSum] = useState(ed ? inp(ed.total, 2) : '')
  const [ppl, setPpl] = useState(ed && ed.liters ? inp(ed.total / ed.liters, 3) : '')
  const last = useRef<'sum' | 'ppl'>('sum')
  const [full, setFull] = useState(ed?.full ?? true)
  const [missed, setMissed] = useState(ed?.missed ?? false)
  const [station, setStation] = useState(ed?.station ?? '')
  const [more, setMore] = useState(!!ed && (!!ed.station || ed.missed))
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  const o = parseNum(odo)
  const l = parseNum(lit)
  const s = parseNum(sum)
  const others = db.fuel.filter((f) => f.vehicleId === vid && f.id !== id)
  const cur = currentOdo(db, vid, id)
  const below = others.filter((f) => o == null || f.odometer < o).map((f) => f.odometer)
  const prevFuel = below.length ? Math.max(...below) : null
  const prev = prevFuel ?? cur
  const trip = o != null && o > prev ? o - prev : null

  const onLit = (x: string) => {
    setLit(x)
    const li = parseNum(x)
    if (!li) return
    const p = parseNum(ppl)
    const su = parseNum(sum)
    if (last.current === 'ppl' && p != null) setSum(inp(p * li, 2))
    else if (su != null) setPpl(inp(su / li, 3))
  }
  const onSum = (x: string) => {
    last.current = 'sum'
    setSum(x)
    const su = parseNum(x)
    if (su != null && l) setPpl(inp(su / l, 3))
  }
  const onPpl = (x: string) => {
    last.current = 'ppl'
    setPpl(x)
    const p = parseNum(x)
    if (p != null && l) setSum(inp(p * l, 2))
  }

  let seg = null
  if (full && o != null && l != null && l > 0)
    seg = fuelSegments([...others, { id: '__draft', vehicleId: vid, date, odometer: o, liters: l, total: s ?? 0, full, missed, station }]).find((x) => x.id === '__draft') ?? null

  const guess = !ed && o != null && o < cur
    ? db.vehicles.find((x) => { if (x.id === vid) return false; const c = currentOdo(db, x.id); return o >= c && o - c <= 3000 })
    : undefined

  const valid = o != null && o > 0 && l != null && l > 0 && s != null && s >= 0
  const save = () => {
    if (!valid) return
    update((d) => {
      const rec = { id: id ?? uid(), vehicleId: vid, date, odometer: o!, liters: l!, total: s!, full, missed, station: station.trim() }
      const i = d.fuel.findIndex((f) => f.id === rec.id)
      if (i >= 0) d.fuel[i] = rec
      else d.fuel.push(rec)
      d.settings.activeVehicleId = vid
    })
    nav.close()
  }
  return (
    <Sheet title={t('fuel')} color={v.color}>
      <VehicleChips vid={vid} onChange={setVid} />
      <Field label={t('odoKm')} hint={<span className="split"><span>{t('prev')}: {n(prev)}</span>{trip != null && <b>Trip +{n(trip)} {t('km')}</b>}</span>}>
        <input className="input num huge" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} autoFocus={!ed} placeholder={String(prev)} />
      </Field>
      {guess && (
        <div className="notice">
          <span>{t('looksLike')} <b>{guess.name}</b></span>
          <button type="button" className="btn small" onClick={() => setVid(guess.id)}>{t('switchTo')}</button>
        </div>
      )}
      {!guess && !ed && o != null && o < cur && <div className="notice warn">{t('odoLower')}</div>}
      <Field label={t('liters')}>
        <input className="input num big" inputMode="decimal" value={lit} onChange={(e) => onLit(e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label={`${t('total')}, ${v.currency}`}>
          <input className="input num big" inputMode="decimal" value={sum} onChange={(e) => onSum(e.target.value)} />
        </Field>
        <Field label={t('ppl')}>
          <input className="input num big" inputMode="decimal" value={ppl} onChange={(e) => onPpl(e.target.value)} />
        </Field>
      </div>
      <span className="hint">{t('sumOrPrice')}</span>
      <Toggle label={t('fullTank')} checked={full} onChange={setFull} />
      {seg && (
        <div className="card tiles2">
          <div><span className="label">{t('segCons')}</span><b className="num">{n(seg.l100, 1)} <small>{t('l100')}</small></b></div>
          <div><span className="label">{t('fuelPerKm')}</span><b className="num">{n(seg.cost / seg.dist, 2)} <small>{v.currency}</small></b></div>
        </div>
      )}
      <Field label={t('date')}>
        <DateInput value={date} onChange={setDate} fallback={today()} />
      </Field>
      {more ? (
        <>
          <Field label={t('station')}>
            <input className="input" value={station} onChange={(e) => setStation(e.target.value)} />
          </Field>
          <Toggle label={t('missedFill')} checked={missed} onChange={setMissed} />
        </>
      ) : (
        <button type="button" className="btn link" onClick={() => setMore(true)}>{t('more')}</button>
      )}
      <div className="spacer" />
      {ed && <DeleteBtn onDelete={() => { update((d) => { d.fuel = d.fuel.filter((f) => f.id !== id) }); nav.close() }} />}
      <button type="button" className="btn primary big" disabled={!valid} onClick={save}>{t('save')} · {v.name}</button>
    </Sheet>
  )
}


/* ---------- photos and receipts of a record ---------- */

const mediaList = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean)

/** Links one per line. New photos go straight to the Receipts folder on the user's Drive. */
function MediaField({ value, onChange, nameHint }: { value: string; onChange: (v: string) => void; nameHint: string }) {
  const db = useDB()
  const { t } = useT()
  const g = db.settings.google
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [msg, setMsg] = useState('')
  const [link, setLink] = useState('')
  const list = mediaList(value)
  const latest = useRef(value)
  latest.current = value
  const add = (url: string) => {
    const next = [...mediaList(latest.current), url].join('\n')
    latest.current = next
    onChange(next)
  }
  const pick = async (files: FileList | null) => {
    if (!files?.length || !g) return
    setMsg('')
    if (!navigator.onLine) return setMsg(t('photoOffline'))
    if (!getToken()) return setMsg(t('photoNeedsSignin'))
    for (const f of Array.from(files)) {
      setBusy((x) => x + 1)
      try {
        const blob = await shrink(f)
        const ext = blob.type === 'image/jpeg' ? 'jpg' : (f.name.split('.').pop() || 'bin')
        add(await uploadFile(blob, `${nameHint}.${ext}`.replace(/[\\/:*?"<>|]+/g, ' '), g.receiptsId))
      } catch (e) {
        setMsg(`${t('photoError')} ${f.name} — ${(e as Error).message}`)
      } finally {
        setBusy((x) => x - 1)
      }
    }
    if (input.current) input.current.value = ''
  }
  return (
    <div className="field">
      <span className="label">{t('photos')}</span>
      {list.map((u, i) => (
        <span className="media-row" key={u + i}>
          <a href={u} target="_blank" rel="noopener noreferrer">{/^https:\/\/(drive|docs)\.google\.com/.test(u) ? `${t('photoN')} ${i + 1}` : u}</a>
          <button type="button" className="icon-btn ghost" aria-label={t('delete')} onClick={() => onChange(list.filter((_, j) => j !== i).join('\n'))}><IconX /></button>
        </span>
      ))}
      {busy > 0 && <span className="muted small">{t('uploading')}</span>}
      {googleConfigured() && g ? (
        <>
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy > 0}>{t('addPhoto')}</button>
          <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void pick(e.target.files)} />
        </>
      ) : googleConfigured() ? <span className="hint">{t('photoNeedsGoogle')}</span> : null}
      {msg && <div className="notice warn" role="status">{msg}</div>}
      <span className="inline">
        <input className="input" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" aria-label={t('addLink')} autoCapitalize="none" />
        <button type="button" className="btn small" disabled={!/^https?:\/\/\S+$/.test(link.trim())} onClick={() => { add(link.trim()); setLink('') }}>+</button>
      </span>
    </div>
  )
}

/* ---------- service work ---------- */

export function ServiceForm({ id, tag }: { id?: string; tag?: string }) {
  const db = useDB()
  const { t, n, inp } = useT()
  const nav = useNav()
  const ed = id ? db.service.find((x) => x.id === id) : undefined
  const startVid = ed?.vehicleId ?? activeId(db) ?? ''
  const preItem = tag ? db.schedule.find((x) => x.vehicleId === startVid && x.tag === tag) : undefined
  const [vid, setVid] = useState(startVid)
  const [date, setDate] = useState(ed?.date ?? today())
  const [odo, setOdo] = useState(ed ? (ed.odometer != null ? String(ed.odometer) : '') : String(currentOdo(db, startVid) || ''))
  const [cat, setCat] = useState<Category>(ed?.category ?? (tag ? 'consumables' : 'service'))
  const [tags, setTags] = useState<string[]>(ed?.tags ?? (tag ? [tag] : []))
  const [desc, setDesc] = useState(ed?.description ?? preItem?.name ?? '')
  const [parts, setParts] = useState(ed?.parts != null ? inp(ed.parts, 2) : '')
  const [labour, setLabour] = useState(ed?.labour != null ? inp(ed.labour, 2) : '')
  const [notes, setNotes] = useState(ed?.notes ?? '')
  const [media, setMedia] = useState(ed?.media ?? '')
  const [custom, setCustom] = useState('')
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  const items = db.schedule.filter((x) => x.vehicleId === vid)
  const known = new Map<string, string>()
  items.forEach((i) => known.set(i.tag, i.name))
  db.service.forEach((x) => x.vehicleId === vid && x.tags.forEach((g) => known.has(g) || known.set(g, '')))
  tags.forEach((g) => known.has(g) || known.set(g, ''))
  const toggle = (g: string) => setTags((a) => (a.includes(g) ? a.filter((x) => x !== g) : [...a, g]))
  const addCustom = () => {
    const g = cleanTag(custom)
    if (g && !tags.includes(g)) setTags((a) => [...a, g])
    setCustom('')
  }
  const p = parseNum(parts)
  const l = parseNum(labour)
  const valid = desc.trim().length > 0 || tags.length > 0
  const save = () => {
    update((d) => {
      const rec = { id: id ?? uid(), vehicleId: vid, date, odometer: parseNum(odo), category: cat, description: desc.trim(), tags, parts: p, labour: l, notes: notes.trim(), media: media.trim() }
      const i = d.service.findIndex((x) => x.id === rec.id)
      if (i >= 0) d.service[i] = rec
      else d.service.push(rec)
      d.settings.activeVehicleId = vid
    })
    nav.close()
  }
  return (
    <Sheet title={t('work')} color={v.color}>
      <VehicleChips vid={vid} onChange={setVid} />
      <div className="grid2">
        <Field label={t('date')}>
          <DateInput value={date} onChange={setDate} fallback={today()} />
        </Field>
        <Field label={t('odoOptional')}>
          <input className="input num" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} />
        </Field>
      </div>
      <div className="field">
        <span className="label">{t('category')}</span>
        <Chips label={t('category')} value={cat} onChange={setCat} options={CATS.map((c) => ({ v: c, l: t(('cat_' + c) as K) }))} />
      </div>
      <div className="field">
        <span className="label">{t('tags')}</span>
        <div className="chips" role="group" aria-label={t('tags')}>
          {[...known.entries()].map(([g, nm]) => (
            <button type="button" key={g} className={'chip' + (tags.includes(g) ? ' on' : '')} aria-pressed={tags.includes(g)} onClick={() => toggle(g)}>
              {nm || '#' + g}
            </button>
          ))}
        </div>
        <div className="inline">
          <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={'#' + t('newTag').toLowerCase()} aria-label={t('newTag')} autoCapitalize="none" />
          <button type="button" className="btn small" onClick={addCustom} disabled={!cleanTag(custom)}>+</button>
        </div>
      </div>
      <Field label={t('description')}>
        <textarea className="input area" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
      </Field>
      <div className="grid2">
        <Field label={`${t('parts')}, ${v.currency}`}>
          <input className="input num" inputMode="decimal" value={parts} onChange={(e) => setParts(e.target.value)} />
        </Field>
        <Field label={`${t('labour')}, ${v.currency}`}>
          <input className="input num" inputMode="decimal" value={labour} onChange={(e) => setLabour(e.target.value)} />
        </Field>
      </div>
      {(p != null || l != null) && <div className="total-row"><span>{t('sum')}</span><b className="num">{n((p ?? 0) + (l ?? 0), 2)} {v.currency}</b></div>}
      <Field label={t('notes')}>
        <textarea className="input area" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('notesPh')} />
      </Field>
      <MediaField value={media} onChange={setMedia} nameHint={`${date} ${v.name} ${desc.trim().slice(0, 40) || t('work')}`} />
      <div className="spacer" />
      {ed && <DeleteBtn onDelete={() => { update((d) => { d.service = d.service.filter((x) => x.id !== id) }); nav.close() }} />}
      <button type="button" className="btn primary big" disabled={!valid} onClick={save}>{t('save')} · {v.name}</button>
    </Sheet>
  )
}

/* ---------- other expense ---------- */

export function ExpenseForm({ id }: { id?: string }) {
  const db = useDB()
  const { t, inp } = useT()
  const nav = useNav()
  const ed = id ? db.expenses.find((x) => x.id === id) : undefined
  const [vid, setVid] = useState(ed?.vehicleId ?? activeId(db) ?? '')
  const [date, setDate] = useState(ed?.date ?? today())
  const [kind, setKind] = useState<ExpenseKind>(ed?.kind ?? 'insurance')
  const [amount, setAmount] = useState(ed ? inp(ed.amount, 2) : '')
  const [note, setNote] = useState(ed?.note ?? '')
  const [media, setMedia] = useState(ed?.media ?? '')
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  const a = parseNum(amount)
  const valid = a != null && a > 0
  const save = () => {
    update((d) => {
      const rec = { id: id ?? uid(), vehicleId: vid, date, kind, amount: a!, note: note.trim(), media: media.trim() }
      const i = d.expenses.findIndex((x) => x.id === rec.id)
      if (i >= 0) d.expenses[i] = rec
      else d.expenses.push(rec)
      d.settings.activeVehicleId = vid
    })
    nav.close()
  }
  return (
    <Sheet title={t('expense')} color={v.color}>
      <VehicleChips vid={vid} onChange={setVid} />
      <div className="field">
        <span className="label">{t('kind')}</span>
        <Chips label={t('kind')} value={kind} onChange={setKind} options={KINDS.map((k) => ({ v: k, l: t(('kind_' + k) as K) }))} />
      </div>
      <Field label={`${t('amount')}, ${v.currency}`}>
        <input className="input num big" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!ed} />
      </Field>
      <Field label={t('date')}>
        <DateInput value={date} onChange={setDate} fallback={today()} />
      </Field>
      <Field label={t('note')}>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <MediaField value={media} onChange={setMedia} nameHint={`${date} ${v.name} ${t(('kind_' + kind) as K)}`} />
      <div className="spacer" />
      {ed && <DeleteBtn onDelete={() => { update((d) => { d.expenses = d.expenses.filter((x) => x.id !== id) }); nav.close() }} />}
      <button type="button" className="btn primary big" disabled={!valid} onClick={save}>{t('save')} · {v.name}</button>
    </Sheet>
  )
}

/* ---------- odometer ---------- */

export function OdoForm() {
  const db = useDB()
  const { t, n } = useT()
  const nav = useNav()
  const vid = activeId(db) ?? ''
  const v = db.vehicles.find((x) => x.id === vid)
  const cur = currentOdo(db, vid)
  const [odo, setOdo] = useState('')
  if (!v) return null
  const o = parseNum(odo)
  const valid = o != null && o >= cur
  return (
    <Sheet title={`${t('odoUpdate')} · ${v.name}`} color={v.color}>
      <Field label={t('curOdo')} hint={`${t('prev')}: ${n(cur)}`}>
        <input className="input num huge" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} autoFocus placeholder={String(cur)} />
      </Field>
      {o != null && o < cur && <div className="notice warn">{t('odoLower')}</div>}
      <div className="spacer" />
      <button type="button" className="btn primary big" disabled={!valid} onClick={() => { update((d) => { const x = d.vehicles.find((q) => q.id === vid); if (x) x.odometer = o! }); nav.close() }}>{t('save')}</button>
    </Sheet>
  )
}

/* ---------- schedule item ---------- */

export function SchedForm({ id }: { id?: string }) {
  const db = useDB()
  const { t } = useT()
  const nav = useNav()
  const ed = id ? db.schedule.find((x) => x.id === id) : undefined
  const vid = ed?.vehicleId ?? activeId(db) ?? ''
  const v = db.vehicles.find((x) => x.id === vid)
  const [name, setName] = useState(ed?.name ?? '')
  const [tag, setTag] = useState(ed?.tag ?? '')
  const [km, setKm] = useState(ed?.intervalKm != null ? String(ed.intervalKm) : '')
  const [days, setDays] = useState(ed?.intervalDays != null ? String(ed.intervalDays) : '')
  const [hint, setHint] = useState(ed?.hint ?? '')
  if (!v) return null
  const g = cleanTag(tag)
  const taken = db.schedule.some((x) => x.vehicleId === vid && x.tag === g && x.id !== id)
  const valid = name.trim().length > 0 && g.length > 0 && !taken && (parseNum(km) != null || parseNum(days) != null)
  const save = () => {
    update((d) => {
      const rec = { id: id ?? uid(), vehicleId: vid, name: name.trim(), tag: g, intervalKm: parseNum(km), intervalDays: parseNum(days), hint: hint.trim() }
      const i = d.schedule.findIndex((x) => x.id === rec.id)
      if (i >= 0) {
        const old = d.schedule[i].tag
        // Renaming a tag renames it in this vehicle's records too, so history stays attached.
        if (old !== g) d.service.forEach((s) => { if (s.vehicleId === vid) s.tags = s.tags.map((x) => (x === old ? g : x)) })
        d.schedule[i] = rec
      } else d.schedule.push(rec)
    })
    nav.close()
  }
  return (
    <Sheet title={`${t('editItem')} · ${v.name}`} color={v.color}>
      <Field label={t('itemName')}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!ed} />
      </Field>
      <Field label={t('tag')} hint={g ? '#' + g : undefined}>
        <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="#engineoil" autoCapitalize="none" />
      </Field>
      <div className="grid2">
        <Field label={t('intKm')}>
          <input className="input num" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
        </Field>
        <Field label={t('intDays')}>
          <input className="input num" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      <Field label={t('hint')}>
        <textarea className="input area" value={hint} onChange={(e) => setHint(e.target.value)} rows={3} placeholder={t('hintPh')} />
      </Field>
      <div className="spacer" />
      {ed && <DeleteBtn onDelete={() => { update((d) => { d.schedule = d.schedule.filter((x) => x.id !== id) }); nav.close() }} />}
      <button type="button" className="btn primary big" disabled={!valid} onClick={save}>{t('save')}</button>
    </Sheet>
  )
}

/* ---------- history of one schedule item ---------- */

export function History({ tag, vid }: { tag: string; vid: string }) {
  const db = useDB()
  const { t, n, date } = useT()
  const nav = useNav()
  const v = db.vehicles.find((x) => x.id === vid)
  const item = db.schedule.find((x) => x.vehicleId === vid && x.tag === tag)
  const list = db.service.filter((x) => x.vehicleId === vid && x.tags.includes(tag)).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Sheet title={`${t('history')} · ${item?.name ?? '#' + tag}`} color={v?.color}>
      {list.length === 0 && <p className="muted">{t('none')}</p>}
      {list.map((e) => (
        <button type="button" key={e.id} className="card row-btn" onClick={() => nav.push({ k: 'service', id: e.id })}>
          <span className="split"><b>{date(e.date)}</b><span className="num">{e.odometer != null ? `${n(e.odometer)} ${t('km')}` : ''}</span></span>
          <span>{e.description}</span>
          {e.notes && <span className="muted">{e.notes}</span>}
          {(e.parts != null || e.labour != null) && <span className="num">{n((e.parts ?? 0) + (e.labour ?? 0), 2)} {v?.currency}</span>}
        </button>
      ))}
    </Sheet>
  )
}

/* ---------- add menu ---------- */

export function AddMenu() {
  const { t } = useT()
  const nav = useNav()
  return (
    <div className="menu-backdrop" onClick={nav.close}>
      <div className="menu" role="dialog" aria-modal="true" aria-label={t('add')} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn primary big" onClick={() => nav.open({ k: 'fuel' })}><IconFuel /> {t('fuel')}<kbd className="desk">F</kbd></button>
        <button type="button" className="btn big" onClick={() => nav.open({ k: 'service' })}><IconWrench /> {t('work')}<kbd className="desk">S</kbd></button>
        <button type="button" className="btn big" onClick={() => nav.open({ k: 'expense' })}>{t('expense')}<kbd className="desk">E</kbd></button>
        <button type="button" className="btn big" onClick={() => nav.open({ k: 'odo' })}>{t('odoUpdate')}<kbd className="desk">O</kbd></button>
        <button type="button" className="btn link" onClick={nav.close}>{t('close')}</button>
      </div>
    </div>
  )
}

/* ---------- settings ---------- */

export function SettingsSheet() {
  const db = useDB()
  const { t } = useT()
  const nav = useNav()
  const [msg, setMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const doExport = async (kind: 'csv' | 'json') => {
    try {
      if (kind === 'csv') await saveFile(`tolimoto-log-${stamp()}.zip`, buildCsvZip(db))
      else await saveFile(`tolimoto-log-${stamp()}.json`, buildJson(db))
    } catch {
      setMsg(t('exportErr'))
    }
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      setMsg(`${t('imported')} ${importJson(await f.text())}`)
    } catch {
      setMsg(t('importErr'))
    }
    if (file.current) file.current.value = ''
  }
  const fuellyFile = useRef<HTMLInputElement>(null)
  const onFuelly = async (files: FileList | null) => {
    const fs = [...(files ?? [])]
    if (!fs.length) return
    try {
      nav.open({ k: 'fuelly', cars: parseFuelFiles(await Promise.all(fs.map((f) => f.text()))) })
    } catch {
      setMsg(t('fuellyBad'))
    }
    if (fuellyFile.current) fuellyFile.current.value = ''
  }
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return (
    <Sheet title={t('settings')}>
      <div className="field">
        <span className="label">{t('language')}</span>
        <select className="input" aria-label={t('language')} value={db.settings.lang ?? 'ru'} onChange={(e) => { const v = e.target.value as Lang; update((d) => { d.settings.lang = v }) }}>
          {LANGS.map((o) => (<option key={o.v} value={o.v}>{o.l}</option>))}
        </select>
      </div>
      <div className="field">
        <span className="label">{t('theme')}</span>
        <Chips label={t('theme')} value={db.settings.theme} onChange={(v) => update((d) => { d.settings.theme = v })} options={[{ v: 'auto', l: t('thAuto') }, { v: 'dark', l: t('thDark') }, { v: 'light', l: t('thLight') }]} />
      </div>
      <Toggle label={t('startOnFuel')} checked={db.settings.startOnFuel} onChange={(v) => update((d) => { d.settings.startOnFuel = v })} />
      <h3>{t('vehicles')}</h3>
      {db.vehicles.map((v) => (
        <button type="button" key={v.id} className="card row-btn inline-row" onClick={() => nav.push({ k: 'vehicle', id: v.id })}>
          <span className="dot" style={{ background: v.color }} /> <b>{v.name}</b> <span className="muted">{t(v.type)}</span>
        </button>
      ))}
      <button type="button" className="btn" onClick={() => nav.push({ k: 'vehicle' })}>+ {t('addVehicle')}</button>
      {googleConfigured() && <GoogleSection />}
      <h3>{t('data')}</h3>
      <button type="button" className="btn" onClick={() => doExport('csv')}>{t('exportCsv')}</button>
      <button type="button" className="btn primary" onClick={() => nav.push({ k: 'safety' })}>{t('dsTitle')}</button>
      <button type="button" className="btn" onClick={async () => { if (await backupNow()) setMsg(t('backupSaved')) }}>{t('exportJson')}</button>
      <span className="hint">{t('dsLast')}: {db.settings.lastBackup ? new Date(db.settings.lastBackup).toLocaleDateString(locale(db.settings.lang)) : t('dsNever')}</span>
      <button type="button" className="btn" onClick={() => file.current?.click()}>{t('importJson')}</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <button type="button" className="btn" onClick={() => fuellyFile.current?.click()}>{t('importFuelly')}</button>
      <input ref={fuellyFile} type="file" multiple accept=".csv,text/csv,text/plain" hidden onChange={(e) => onFuelly(e.target.files)} />
      {msg && <div className="notice" role="status">{msg}</div>}
      {storageMode() === 'memory' && <div className="notice warn">{t('storageTemp')}</div>}
      {!standalone && platform() !== 'desktop' && <div className="notice"><span><b>{t('installTitle')}</b><br />{t('installText')}</span></div>}
      <a className="btn link" href={guideUrl(db.settings.lang ?? 'ru')} target="_blank" rel="noopener">{t('help')}</a>
      <a className="btn link" href={`mailto:contact@tolimoto.com?subject=${encodeURIComponent(`Tolimoto Log ${APP_VERSION}`)}`}>{t('contactDev')} · contact@tolimoto.com</a>
      {!googleConfigured() && <p className="muted">{t('gNotConfigured')}</p>}
      <div className="notice desk"><span><b>{t('keysTitle')}</b><br />{t('keysHelp')}</span></div>
      <p className="muted">Tolimoto Log · {t('version')} {APP_VERSION}</p>
    </Sheet>
  )
}


/* ---------- Fuelly import ---------- */

export function FuellyImport({ cars }: { cars: FuellyCar[] }) {
  const db = useDB()
  const { t, n, date } = useT()
  const nav = useNav()
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9а-яё]/g, '')
  const match = (c: FuellyCar) =>
    db.vehicles.find((v) => { const a = norm(v.name); const b = norm(c.name + ' ' + c.model); return a.length > 2 && (b.includes(a) || a.includes(norm(c.name))) })?.id ?? 'new'
  const [target, setTarget] = useState<string[]>(() => cars.map(match))
  const [types, setTypes] = useState<VType[]>(() => cars.map(guessType))
  const [result, setResult] = useState<{ added: number; replaced: number; overlaps: FuelOverlap[]; vids: string[] } | null>(null)
  const run = () => {
    let added = 0
    let replaced = 0
    const vids: string[] = []
    update((d) => {
      cars.forEach((c, i) => {
        if (target[i] === 'skip') return
        let vid = target[i]
        if (vid === 'new') {
          vid = uid()
          const used = new Set(d.vehicles.map((v) => v.color.toLowerCase()))
          d.vehicles.push({ id: vid, name: c.model || c.name, type: types[i], color: COLORS.find((x) => !used.has(x.toLowerCase())) ?? COLORS[0], currency: defaultCurrency(db.settings.lang), odometer: c.rows[c.rows.length - 1]?.odometer ?? 0 })
        }
        const r = addFuellyRows(d, vid, c)
        added += r.added
        replaced += r.replaced
        vids.push(vid)
        d.settings.activeVehicleId = vid
      })
    })
    setResult({ added, replaced, vids, overlaps: [] })
  }
  const overlaps = result ? result.vids.flatMap((v) => lumpOverlaps(db, v)) : []
  if (result) {
    return (
      <Sheet title={t('fuellyTitle')}>
        <div className="notice" role="status"><span>{t('fuellyDone')} <b>{result.added}</b>{result.replaced ? `, ${t('fuellyUpdated')}: ${result.replaced}` : ''}</span></div>
        {overlaps.map((o) => {
          const v = db.vehicles.find((x) => db.expenses.some((e) => e.id === o.expenseId && e.vehicleId === x.id))
          return (
            <div className="card" key={o.expenseId}>
              <span>{t('fuellyLump')}</span>
              <span className="num"><b>{v?.name} · {o.year}</b>: {n(o.amount, 2)} {v?.currency} · {t('fromFuelly')}: {n(o.fuellySum, 2)} {v?.currency}</span>
              <button type="button" className="btn outline" onClick={() => update((d) => { d.expenses = d.expenses.filter((e) => e.id !== o.expenseId) })}>{t('fuellyLumpDel')}</button>
            </div>
          )
        })}
        <div className="spacer" />
        <button type="button" className="btn primary big" onClick={nav.close}>{t('gotIt')}</button>
      </Sheet>
    )
  }
  return (
    <Sheet title={t('fuellyTitle')}>
      {cars.map((c, i) => (
        <div className="card" key={c.name}>
          <b>{c.model || c.name}</b>
          <span className="muted small num">{c.source ?? 'Fuelly'} · {c.rows.length} {t('fuellyRows')}{c.rows.length ? ` · ${date(c.rows[0].date)} – ${date(c.rows[c.rows.length - 1].date)} · ${n(c.rows[0].odometer)}–${n(c.rows[c.rows.length - 1].odometer)} ${t('km')}` : ''}{c.costs?.length ? ` · ${c.costs.length} ${t('fuelioCosts')}` : ''}</span>
          {c.converted && <span className="small">{t('fuellyMiles')}</span>}
          <label className="field">
            <span className="label">{t('fuellyTo')}</span>
            <select className="input" value={target[i]} onChange={(e) => setTarget((a) => a.map((x, j) => (j === i ? e.target.value : x)))}>
              {db.vehicles.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
              <option value="new">{t('fuellyNew')}: {c.model || c.name}</option>
              <option value="skip">{t('fuellySkip')}</option>
            </select>
          </label>
          {target[i] === 'new' && (
            <Chips label={t('type')} value={types[i]} onChange={(v) => setTypes((a) => a.map((x, j) => (j === i ? v : x)))} options={[{ v: 'moto', l: t('moto') }, { v: 'car', l: t('car') }]} />
          )}
        </div>
      ))}
      <div className="spacer" />
      <button type="button" className="btn primary big" disabled={target.every((x) => x === 'skip')} onClick={run}>{t('fuellyGo')}</button>
    </Sheet>
  )
}

/* ---------- Google section of Settings ---------- */

function GoogleSection() {
  const db = useDB()
  const { t } = useT()
  const st = useSync()
  const g = db.settings.google
  const signedIn = !!getToken()
  return (
    <>
      <h3>{t('gTitle')}</h3>
      {!g ? (
        <>
          <p className="small muted">{t('gIntro')}</p>
          {signedIn ? (
            <button type="button" className="btn primary" disabled={st.s === 'syncing'} onClick={() => void connect()}>{st.s === 'syncing' ? t('sSyncing') : t('gSignIn')}</button>
          ) : (
            <button type="button" className="btn primary" onClick={() => signIn()}>{t('gSignIn')}</button>
          )}
          {st.s === 'error' && <div className="notice warn" role="status">{t('sError')}: {st.msg}</div>}
        </>
      ) : (
        <>
          <div className="card">
            <span className="split"><span className="muted small">{t('gAccount')}</span><b className="small">{g.email || '—'}</b></span>
            <SyncLine />
            <a className="btn" href={sheetUrl(g.sheetId)} target="_blank" rel="noopener noreferrer">{t('gOpenSheet')}</a>
            <a className="btn" href={folderUrl(g.receiptsId)} target="_blank" rel="noopener noreferrer">{t('gOpenFolder')}</a>
            {signedIn ? (
              <button type="button" className="btn primary" disabled={st.s === 'syncing'} onClick={() => void syncNow()}>{st.s === 'syncing' ? t('sSyncing') : t('gSyncNow')}</button>
            ) : (
              <button type="button" className="btn primary" onClick={() => signIn({ email: g.email, silent: true })}>{t('gSignInAgain')}</button>
            )}
          </div>
          {st.s === 'synced' && st.skipped.length > 0 && <div className="notice warn"><span>{t('sSkipped')} {st.skipped.join(', ')}</span></div>}
          {st.s === 'error' && <div className="notice warn" role="status">{t('sError')}: {st.msg}</div>}
          <button type="button" className="btn link" onClick={() => { dropToken(); void disconnect() }}>{t('gDisconnect')}</button>
          <span className="hint">{t('gDisconnectNote')}</span>
        </>
      )}
    </>
  )
}

/** One line of sync status, used in Settings. */
export function SyncLine() {
  const db = useDB()
  const { t } = useT()
  const st = useSync()
  const last = db.settings.google?.lastSync
  const time = (iso: string) => new Date(iso).toLocaleString(locale(db.settings.lang), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const text =
    st.s === 'syncing' ? t('sSyncing')
    : st.s === 'offline' ? t('sOffline')
    : st.s === 'signin' ? t('sSignin')
    : st.s === 'error' ? t('sError')
    : st.s === 'synced' ? `${t('sSynced')} ${time(st.at)}${st.fromSheet ? ` · ${t('sFromSheet')}: ${st.fromSheet}` : ''}`
    : last ? `${t('sSynced')} ${time(last)}` : t('sOff')
  return <span className="small muted" role="status">{text}</span>
}
