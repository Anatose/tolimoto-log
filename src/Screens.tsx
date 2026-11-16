import { useEffect, useMemo, useRef, useState } from 'react'
import { activeId, storageMode, today, update, useDB } from './store'
import { useT, type K } from './i18n'
import { avgL100, costPerKm, currentOdo, fuelSegments, schedState, totals, years, type SchedState } from './calc'
import { Badge, Bar, Chips, IconCar, IconFuel, IconGear, IconMoto, useNav } from './ui'

function useRem() {
  const { t, n } = useT()
  return (s: SchedState): string => {
    if (s.status === 'none') return t('none')
    const over = s.status === 'over'
    const parts: string[] = []
    if (s.remKm != null && (!over || s.remKm < 0)) parts.push(`${n(Math.abs(s.remKm))} ${t('km')}`)
    if (s.remDays != null && (!over || s.remDays < 0)) parts.push(`${n(Math.abs(s.remDays))} ${t('days')}`)
    return `${over ? t('overdueBy') : t('left')} ${parts.join(' · ')}`
  }
}
const urgency = (s: SchedState) => (s.status === 'over' ? 2 : s.status === 'none' ? -1 : s.used)

/* ---------- garage carousel ---------- */

function Carousel() {
  const db = useDB()
  const { t, n } = useT()
  const nav = useNav()
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number>()
  const active = activeId(db)
  const idx = Math.max(0, db.vehicles.findIndex((v) => v.id === active))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = idx * el.clientWidth
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target })
  }, [idx, db.vehicles.length])
  const onScroll = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el || !el.clientWidth) return
      const v = db.vehicles[Math.round(el.scrollLeft / el.clientWidth)]
      if (v && v.id !== active) update((d) => { d.settings.activeVehicleId = v.id })
    }, 120)
  }
  return (
    <>
      <div className="carousel" ref={ref} onScroll={onScroll}>
        {db.vehicles.map((v) => (
          <section className="vcard" key={v.id} style={{ borderTopColor: v.color }} aria-label={v.name}>
            <div className="split">
              <span className="vname"><span style={{ color: v.color }}>{v.type === 'moto' ? <IconMoto /> : <IconCar />}</span> {v.name}</span>
            </div>
            <div className="split end">
              <div>
                <span className="label">{t('odometer')}</span>
                <div className="odo num">{n(currentOdo(db, v.id))} <small>{t('km')}</small></div>
              </div>
              <button type="button" className="btn outline" onClick={() => { update((d) => { d.settings.activeVehicleId = v.id }); nav.open({ k: 'odo' }) }}>{t('update')}</button>
            </div>
          </section>
        ))}
        <section className="vcard add" aria-label={t('addVehicle')}>
          <button type="button" className="btn big" onClick={() => nav.open({ k: 'vehicle' })}>+ {t('addVehicle')}</button>
        </section>
      </div>
      {db.vehicles.length > 1 && (
        <div className="dots" aria-hidden="true">
          {db.vehicles.map((v) => (<span key={v.id} className={v.id === active ? 'on' : ''} style={v.id === active ? { background: v.color } : undefined} />))}
          <span />
        </div>
      )}
    </>
  )
}

/* ---------- home ---------- */

export function Home({ goSched }: { goSched: () => void }) {
  const db = useDB()
  const { t, n } = useT()
  const nav = useNav()
  const rem = useRem()
  const vid = activeId(db)
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v || !vid) return null
  const td = today()
  const year = Number(td.slice(0, 4))
  const up = db.schedule.filter((s) => s.vehicleId === vid).map((s) => schedState(db, s, td)).filter((s) => s.status !== 'none').sort((a, b) => urgency(b) - urgency(a)).slice(0, 3)
  const tot = totals(db, vid, year)
  const avg = avgL100(fuelSegments(db.fuel.filter((f) => f.vehicleId === vid)))
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return (
    <>
      <header className="topbar">
        <span className={'pill' + (storageMode() === 'memory' ? ' warn' : '')}><span className="dot" /> {storageMode() === 'memory' ? t('storageTemp') : t('savedLocal')}</span>
        <button type="button" className="icon-btn" aria-label={t('settings')} onClick={() => nav.open({ k: 'settings' })}><IconGear /></button>
      </header>
      <Carousel />
      <button type="button" className="btn primary fuel-btn" onClick={() => nav.open({ k: 'fuel' })}><IconFuel /> {t('fuel')} · {v.name}</button>
      {!standalone && !db.settings.installHintDismissed && (
        <div className="notice">
          <span><b>{t('installTitle')}</b><br />{t('installText')}</span>
          <button type="button" className="btn small" onClick={() => update((d) => { d.settings.installHintDismissed = true })}>{t('gotIt')}</button>
        </div>
      )}
      <div className="split head">
        <h3>{t('upcoming')}</h3>
        <button type="button" className="btn link" onClick={goSched}>{t('allSched')}</button>
      </div>
      {up.length === 0 && <p className="muted">{t('noUpcoming')}</p>}
      {up.map((s) => (
        <button type="button" className="card row-btn" key={s.item.id} onClick={goSched}>
          <span className="split"><b>{s.item.name}</b><Badge status={s.status} /></span>
          <Bar used={s.used} status={s.status} />
          <span className="muted num">{rem(s)}</span>
        </button>
      ))}
      <div className="grid2">
        <div className="card tile"><span className="label">{t('spent')} {year}</span><b className="num">{n(tot.total, 0)} {v.currency}</b></div>
        <div className="card tile"><span className="label">{t('avgCons')}</span>{avg != null ? <b className="num">{n(avg, 1)} <small>{t('l100')}</small></b> : <span className="small">{t('avgConsEmpty')}</span>}</div>
      </div>
    </>
  )
}

/* ---------- journal ---------- */

type Row = { id: string; kind: 'service' | 'fuel' | 'expense'; date: string; odo: number | null; title: string; sub: string; amount: number | null; tags: string[]; text: string }

export function Journal() {
  const db = useDB()
  const { t, n, date } = useT()
  const nav = useNav()
  const vid = activeId(db)
  const v = db.vehicles.find((x) => x.id === vid)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'service' | 'fuel' | 'expense'>('all')
  const [year, setYear] = useState('')
  const [tag, setTag] = useState('')
  const rows = useMemo<Row[]>(() => {
    if (!vid) return []
    const r: Row[] = []
    for (const s of db.service) if (s.vehicleId === vid)
      r.push({ id: s.id, kind: 'service', date: s.date, odo: s.odometer, title: s.description || s.tags.map((g) => '#' + g).join(' '), sub: [t(('cat_' + s.category) as K), s.notes].filter(Boolean).join(' · '), amount: s.parts != null || s.labour != null ? (s.parts ?? 0) + (s.labour ?? 0) : null, tags: s.tags, text: [s.description, s.notes, s.tags.join(' '), s.media].join(' ').toLowerCase() })
    for (const f of db.fuel) if (f.vehicleId === vid)
      r.push({ id: f.id, kind: 'fuel', date: f.date, odo: f.odometer, title: `${t('fuel')} · ${n(f.liters, 2)} ${t('liters').toLowerCase()}`, sub: [f.full ? t('fullTank') : '', f.station].filter(Boolean).join(' · '), amount: f.total, tags: [], text: (t('fuel') + ' ' + f.station).toLowerCase() })
    for (const e of db.expenses) if (e.vehicleId === vid)
      r.push({ id: e.id, kind: 'expense', date: e.date, odo: null, title: t(('kind_' + e.kind) as K), sub: e.note, amount: e.amount, tags: [], text: (t(('kind_' + e.kind) as K) + ' ' + e.note).toLowerCase() })
    return r.sort((a, b) => b.date.localeCompare(a.date) || (b.odo ?? 0) - (a.odo ?? 0))
  }, [db, vid, t, n])
  if (!v || !vid) return null
  const allYears = [...new Set(rows.map((r) => r.date.slice(0, 4)))].sort().reverse()
  const allTags = [...new Set(rows.flatMap((r) => r.tags))].sort()
  const qq = q.trim().toLowerCase()
  const shown = rows.filter((r) => (kind === 'all' || r.kind === kind) && (!year || r.date.startsWith(year)) && (!tag || r.tags.includes(tag)) && (!qq || r.text.includes(qq)))
  return (
    <>
      <h1>{t('tabJournal')} <small className="muted">· {v.name}</small></h1>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
      <Chips value={kind} onChange={setKind} options={[{ v: 'all', l: t('all') }, { v: 'service', l: t('fWork') }, { v: 'fuel', l: t('fFuel') }, { v: 'expense', l: t('fExp') }]} />
      <div className="grid2">
        <select className="input" value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('allYears')}>
          <option value="">{t('allYears')}</option>
          {allYears.map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
        <select className="input" value={tag} onChange={(e) => setTag(e.target.value)} aria-label={t('allTags')}>
          <option value="">{t('allTags')}</option>
          {allTags.map((g) => (<option key={g} value={g}>#{g}</option>))}
        </select>
      </div>
      {shown.length === 0 && <p className="muted">{t('emptyJournal')}</p>}
      {shown.map((r) => (
        <button type="button" key={r.kind + r.id} className="card row-btn" onClick={() => nav.open({ k: r.kind, id: r.id })}>
          <span className="split"><span className="muted num">{date(r.date)}{r.odo != null ? ` · ${n(r.odo)} ${t('km')}` : ''}</span>{r.amount != null && <b className="num">{n(r.amount, 2)} {v.currency}</b>}</span>
          <span>{r.title}</span>
          {r.tags.length > 0 && <span className="tagline">{r.tags.map((g) => '#' + g).join(' ')}</span>}
          {r.sub && <span className="muted small">{r.sub}</span>}
        </button>
      ))}
    </>
  )
}

/* ---------- schedule ---------- */

export function Schedule() {
  const db = useDB()
  const { t, n, date } = useT()
  const nav = useNav()
  const rem = useRem()
  const vid = activeId(db)
  const v = db.vehicles.find((x) => x.id === vid)
  const [openId, setOpenId] = useState<string | null>(null)
  if (!v || !vid) return null
  const td = today()
  const list = db.schedule.filter((s) => s.vehicleId === vid).map((s) => schedState(db, s, td)).sort((a, b) => urgency(b) - urgency(a))
  return (
    <>
      <div className="split head">
        <h1>{t('tabSched')}</h1>
        <button type="button" className="btn" onClick={() => nav.open({ k: 'sched' })}>{t('addItem')}</button>
      </div>
      <p className="muted num">{v.name} · {n(currentOdo(db, vid))} {t('km')}</p>
      {list.length === 0 && <p className="muted">{t('emptySched')}</p>}
      {list.map((s) => {
        const open = openId === s.item.id
        const every = [s.item.intervalKm ? `${n(s.item.intervalKm)} ${t('km')}` : '', s.item.intervalDays ? `${n(s.item.intervalDays)} ${t('days')}` : ''].filter(Boolean).join(` ${t('or')} `)
        return (
          <div className={'card sched ' + s.status} key={s.item.id}>
            <button type="button" className="row-btn bare" aria-expanded={open} onClick={() => setOpenId(open ? null : s.item.id)}>
              <span className="split"><b>{s.item.name}</b><Badge status={s.status} /></span>
              <Bar used={s.used} status={s.status} />
              <span className="num">{rem(s)}</span>
            </button>
            {open && (
              <div className="sched-more">
                <span className="muted small">{t('every')} {every} · #{s.item.tag}</span>
                {s.item.hint && <span className="small">{s.item.hint}</span>}
                {s.lastDate && <span className="muted small">{t('lastDone')}: {date(s.lastDate)}{s.lastOdo != null ? `, ${n(s.lastOdo)} ${t('km')}` : ''}</span>}
                <div className="grid2">
                  <button type="button" className="btn primary" onClick={() => nav.open({ k: 'service', tag: s.item.tag })}>{t('doneToday')}</button>
                  <button type="button" className="btn outline" onClick={() => nav.open({ k: 'history', tag: s.item.tag, vid })}>{t('history')}</button>
                </div>
                <button type="button" className="btn link" onClick={() => nav.open({ k: 'sched', id: s.item.id })}>{t('edit')}</button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ---------- stats ---------- */

function LineChart({ points, label, unit, digits }: { points: number[]; label: string; unit: string; digits: number }) {
  const { n } = useT()
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const W = 320
  const H = 90
  const xy = points.map((p, i) => `${((i / (points.length - 1)) * (W - 8) + 4).toFixed(1)},${(H - 6 - ((p - min) / span) * (H - 12)).toFixed(1)}`)
  return (
    <div className="card">
      <span className="split"><b>{label}</b><span className="muted num small">{n(min, digits)} – {n(max, digits)} {unit}</span></span>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${label}: ${n(min, digits)} – ${n(max, digits)} ${unit}`}>
        <polyline points={xy.join(' ')} fill="none" stroke="var(--ac)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => { const [x, y] = p.split(','); return <circle key={i} cx={x} cy={y} r="3" fill="var(--ac)" /> })}
      </svg>
    </div>
  )
}

export function Stats() {
  const db = useDB()
  const { t, n } = useT()
  const vid = activeId(db)
  const v = db.vehicles.find((x) => x.id === vid)
  const thisYear = Number(today().slice(0, 4))
  const [year, setYear] = useState<string>(String(thisYear))
  if (!v || !vid) return null
  const ys = years(db, vid, thisYear)
  const tot = totals(db, vid, year === 'all' ? null : Number(year))
  const fuel = db.fuel.filter((f) => f.vehicleId === vid)
  const segs = fuelSegments(fuel)
  const avg = avgL100(segs)
  const perKm = costPerKm(db, vid)
  const prices = [...fuel].sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer).filter((f) => f.liters > 0).map((f) => f.total / f.liters)
  const rows: [K, number][] = [['stService', tot.service], ['stAcc', tot.accessories], ['stFuel', tot.fuel], ['stOther', tot.other]]
  return (
    <>
      <h1>{t('tabStats')} <small className="muted">· {v.name}</small></h1>
      <Chips value={year} onChange={setYear} options={[...ys.map((y) => ({ v: String(y), l: String(y) })), { v: 'all', l: t('all') }]} />
      <div className="card">
        {rows.map(([k, x]) => (
          <div className="stat-row" key={k}>
            <span className="split"><span>{t(k)}</span><b className="num">{n(x, 2)} {v.currency}</b></span>
            <div className="bar"><div className="ac" style={{ width: (tot.total ? Math.round((x / tot.total) * 100) : 0) + '%' }} /></div>
          </div>
        ))}
        <span className="split total-row"><b>{t('statsTotal')}</b><b className="num">{n(tot.total, 2)} {v.currency}</b></span>
      </div>
      <div className="grid2">
        <div className="card tile"><span className="label">{t('perKm')}</span><b className="num">{perKm != null ? `${n(perKm, 2)} ${v.currency}` : '—'}</b><span className="muted small">{t('perKmNote')}</span></div>
        <div className="card tile"><span className="label">{t('avgCons')}</span>{avg != null ? <b className="num">{n(avg, 1)} <small>{t('l100')}</small></b> : <span className="small">{t('avgConsEmpty')}</span>}</div>
      </div>
      {segs.length < 2 && prices.length < 2 && <p className="muted">{t('noFuelStats')}</p>}
      <LineChart points={segs.map((s) => s.l100)} label={t('consChart')} unit={t('l100')} digits={1} />
      <LineChart points={prices} label={t('priceChart')} unit={v.currency} digits={3} />
    </>
  )
}
