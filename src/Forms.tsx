import { useRef, useState } from 'react'
import { activeId, today, uid, update, useDB, storageMode, type Category, type ExpenseKind, type Lang, type VType } from './store'
import { PRESETS, useT, type K } from './i18n'
import { currentOdo, fuelSegments } from './calc'
import { Chips, DeleteBtn, Field, IconFuel, IconWrench, Sheet, Toggle, VehicleChips, parseNum, useNav } from './ui'
import { buildCsvZip, buildJson, importJson, saveFile, stamp } from './exportImport'

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
      <button type="button" className="btn primary big" onClick={() => pick('ru')}>Русский</button>
      <button type="button" className="btn primary big" onClick={() => pick('en')}>English</button>
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
  const [currency, setCurrency] = useState(ed?.currency ?? '€')
  const [odo, setOdo] = useState(ed ? String(ed.odometer) : '')
  const [preset, setPreset] = useState<'typical' | 'empty'>('typical')
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState(false)
  const valid = name.trim().length > 0
  const save = () => {
    const vid = ed?.id ?? uid()
    update((d) => {
      const rec = { id: vid, name: name.trim(), type, color, currency: currency.trim() || '€', odometer: parseNum(odo) ?? 0 }
      const i = d.vehicles.findIndex((v) => v.id === vid)
      if (i >= 0) d.vehicles[i] = rec
      else {
        d.vehicles.push(rec)
        d.settings.activeVehicleId = vid
        if (preset === 'typical')
          for (const p of PRESETS[type])
            d.schedule.push({ id: uid(), vehicleId: vid, name: p.name[lang === 'en' ? 1 : 0], tag: p.tag, intervalKm: p.km, intervalDays: p.days, hint: '' })
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
    <Sheet title={first ? t('firstVehicle') : ed ? t('editVehicle') : t('newVehicle')} color={color} noClose={first}>
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
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
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
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
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
      <Field label={t('media')}>
        <input className="input" type="url" inputMode="url" value={media} onChange={(e) => setMedia(e.target.value)} placeholder="https://" autoCapitalize="none" />
      </Field>
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
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  const a = parseNum(amount)
  const valid = a != null && a > 0
  const save = () => {
    update((d) => {
      const rec = { id: id ?? uid(), vehicleId: vid, date, kind, amount: a!, note: note.trim() }
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
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
      </Field>
      <Field label={t('note')}>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
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
        <button type="button" key={e.id} className="card row-btn" onClick={() => nav.open({ k: 'service', id: e.id })}>
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
        <button type="button" className="btn primary big" onClick={() => nav.open({ k: 'fuel' })}><IconFuel /> {t('fuel')}</button>
        <button type="button" className="btn big" onClick={() => nav.open({ k: 'service' })}><IconWrench /> {t('work')}</button>
        <button type="button" className="btn big" onClick={() => nav.open({ k: 'expense' })}>{t('expense')}</button>
        <button type="button" className="btn big" onClick={() => nav.open({ k: 'odo' })}>{t('odoUpdate')}</button>
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
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return (
    <Sheet title={t('settings')}>
      <div className="field">
        <span className="label">{t('language')}</span>
        <Chips label={t('language')} value={db.settings.lang ?? 'ru'} onChange={(v) => update((d) => { d.settings.lang = v })} options={[{ v: 'ru', l: 'Русский' }, { v: 'en', l: 'English' }]} />
      </div>
      <div className="field">
        <span className="label">{t('theme')}</span>
        <Chips label={t('theme')} value={db.settings.theme} onChange={(v) => update((d) => { d.settings.theme = v })} options={[{ v: 'auto', l: t('thAuto') }, { v: 'dark', l: t('thDark') }, { v: 'light', l: t('thLight') }]} />
      </div>
      <Toggle label={t('startOnFuel')} checked={db.settings.startOnFuel} onChange={(v) => update((d) => { d.settings.startOnFuel = v })} />
      <h3>{t('vehicles')}</h3>
      {db.vehicles.map((v) => (
        <button type="button" key={v.id} className="card row-btn inline-row" onClick={() => nav.open({ k: 'vehicle', id: v.id })}>
          <span className="dot" style={{ background: v.color }} /> <b>{v.name}</b> <span className="muted">{t(v.type)}</span>
        </button>
      ))}
      <button type="button" className="btn" onClick={() => nav.open({ k: 'vehicle' })}>+ {t('addVehicle')}</button>
      <h3>{t('data')}</h3>
      <button type="button" className="btn" onClick={() => doExport('csv')}>{t('exportCsv')}</button>
      <button type="button" className="btn" onClick={() => doExport('json')}>{t('exportJson')}</button>
      <button type="button" className="btn" onClick={() => file.current?.click()}>{t('importJson')}</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {msg && <div className="notice" role="status">{msg}</div>}
      {storageMode() === 'memory' && <div className="notice warn">{t('storageTemp')}</div>}
      {!standalone && <div className="notice"><span><b>{t('installTitle')}</b><br />{t('installText')}</span></div>}
      <p className="muted">{t('googleLater')}</p>
      <p className="muted">Tolimoto Log · {t('version')} 0.1.0</p>
    </Sheet>
  )
}

