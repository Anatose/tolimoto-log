import { BackupReminder } from './Onboarding'
import { useEffect, useMemo, useRef, useState } from 'react'
import { activeId, liveVehicles, storageMode, today, update, useDB } from './store'
import { OwnTileLine, ValueReminder } from './Owner'
import { locale, useT, type K } from './i18n'
import { avgL100, costPerKm, currentOdo, fuelSegments, schedState, totals, years, type SchedState } from './calc'
import { Badge, Bar, Chips, DateInput, IconCar, IconFuel, IconGear, IconMoto, Sheet, useNav, type Bucket } from './ui'
import { googleConfigured, signIn } from './google'
import { syncNow, useSync } from './sync'

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
  const vehicles = liveVehicles(db)
  const idx = Math.max(0, vehicles.findIndex((v) => v.id === active))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = idx * el.clientWidth
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target })
  }, [idx, vehicles.length])
  const onScroll = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el || !el.clientWidth) return
      const v = vehicles[Math.round(el.scrollLeft / el.clientWidth)]
      if (v && v.id !== active) update((d) => { d.settings.activeVehicleId = v.id })
    }, 120)
  }
  return (
    <>
      <div className="carousel" ref={ref} onScroll={onScroll}>
        {vehicles.map((v) => (
          <section className="vcard" key={v.id} style={{ borderTopColor: v.color }} aria-label={v.name}>
            <div className="split">
              <button type="button" className="vname row-btn bare" onClick={() => nav.open({ k: 'vehicle', id: v.id })}><span style={{ color: v.color }}>{v.type === 'moto' ? <IconMoto /> : <IconCar />}</span> {v.name} <span className="muted" aria-hidden="true">›</span></button>
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
      {vehicles.length > 1 && (
        <div className="dots">
          {vehicles.map((v) => (<button type="button" key={v.id} aria-label={v.name} aria-current={v.id === active ? 'true' : undefined} className={v.id === active ? 'on' : ''} style={v.id === active ? { background: v.color } : undefined} onClick={() => update((d) => { d.settings.activeVehicleId = v.id })} />))}
          <button type="button" aria-label={t('addVehicle')} onClick={() => ref.current?.scrollTo({ left: ref.current.scrollWidth, behavior: 'smooth' })} />
        </div>
      )}
    </>
  )
}

/* ---------- sync status in the top bar ---------- */

function SyncPill() {
  const db = useDB()
  const { t } = useT()
  const nav = useNav()
  const st = useSync()
  const g = db.settings.google
  if (!googleConfigured() || !g || st.s === 'off') {
    const mem = storageMode() === 'memory'
    return <button type="button" className={'pill' + (mem ? ' warn' : '')} onClick={() => nav.open({ k: 'safety' })}><span className="dot" /> {mem ? t('storageTemp') : t('savedLocal')} <span aria-hidden="true">›</span></button>
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale(db.settings.lang), { hour: '2-digit', minute: '2-digit' })
  const [cls, text, act] =
    st.s === 'syncing' ? ['busy', t('sSyncing'), undefined]
    : st.s === 'synced' ? ['ok', `${t('sSynced')} ${time(st.at)}`, () => void syncNow()]
    : st.s === 'offline' ? ['', t('sOffline'), () => void syncNow()]
    : st.s === 'signin' ? ['warn', t('gSignInAgain'), () => signIn({ email: g.email, silent: true })]
    : ['warn', t('sError'), () => nav.open({ k: 'settings' })]
  return (
    <button type="button" className={'pill ' + cls} onClick={act} disabled={!act}>
      <span className="dot" /> {text}
    </button>
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
  return (
    <>
      <header className="topbar">
        <SyncPill />
        <button type="button" className="icon-btn" aria-label={t('settings')} onClick={() => nav.open({ k: 'settings' })}><IconGear /></button>
      </header>
      <div className="home">
      <div className="home-col">
      <Carousel />
      <button type="button" className="btn primary fuel-btn" onClick={() => nav.open({ k: 'fuel' })}><IconFuel /> {t('fuel')} · {v.name}</button>
      <BackupReminder />
      <ArchiveLink />
      </div>
      <div className="home-col">
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
        <button type="button" className="card tile row-btn" onClick={() => nav.push({ k: 'spend', vid, year, bucket: 'all' })}><span className="label">{t('spent')} {year} ›</span><b className="num">{n(tot.total, 0)} {v.currency}</b></button>
        <div className="card tile"><span className="label">{t('avgCons')}</span>{avg != null ? <b className="num">{n(avg, 1)} <small>{t('l100')}</small></b> : <span className="small">{t('avgConsEmpty')}</span>}</div>
      </div>
      </div>
      </div>
    </>
  )
}

/** "Archive (N) ›", only when something is in the archive. */
export function ArchiveLink() {
  const db = useDB()
  const { t } = useT()
  const nav = useNav()
  const count = db.vehicles.filter((v) => v.archived).length
  if (!count) return null
  return <button type="button" className="btn link" onClick={() => nav.push({ k: 'archive' })}>{t('archive')} ({count}) ›</button>
}

/* ---------- journal ---------- */

type Row = { id: string; kind: 'service' | 'fuel' | 'expense'; bucket: Exclude<Bucket, 'all'>; date: string; odo: number | null; title: string; sub: string; type: string; note: string; amount: number | null; tags: string[]; text: string; l100: number | null }

/** All records of one vehicle as list rows, newest first. */
function useRows(vid: string | null): { rows: Row[]; avg: number | null } {
  const db = useDB()
  const { t, n } = useT()
  return useMemo(() => {
    if (!vid) return { rows: [], avg: null }
    const segs = fuelSegments(db.fuel.filter((f) => f.vehicleId === vid))
    const seg = new Map(segs.map((x) => [x.id, x.l100]))
    const r: Row[] = []
    for (const s of db.service) if (s.vehicleId === vid)
      r.push({ id: s.id, kind: 'service', bucket: s.category === 'accessories' ? 'accessories' : 'service', date: s.date, odo: s.odometer, title: s.description || s.tags.map((g) => '#' + g).join(' '), sub: [t(('cat_' + s.category) as K), s.notes].filter(Boolean).join(' · '), type: t(('cat_' + s.category) as K), note: s.notes, amount: s.parts != null || s.labour != null ? (s.parts ?? 0) + (s.labour ?? 0) : null, tags: s.tags, text: [s.description, s.notes, s.tags.join(' '), s.media].join(' ').toLowerCase(), l100: null })
    for (const f of db.fuel) if (f.vehicleId === vid)
      r.push({ id: f.id, kind: 'fuel', bucket: 'fuel', date: f.date, odo: f.odometer, title: `${t('fuel')} · ${n(f.liters, 2)} ${t('liters').toLowerCase()}`, sub: [f.full ? t('fullTank') : '', f.station].filter(Boolean).join(' · '), type: t('fuel'), note: [f.full ? t('fullTank') : '', f.station].filter(Boolean).join(' · '), amount: f.total, tags: [], text: (t('fuel') + ' ' + f.station).toLowerCase(), l100: seg.get(f.id) ?? null })
    for (const e of db.expenses) if (e.vehicleId === vid)
      r.push({ id: e.id, kind: 'expense', bucket: e.kind === 'fuel' ? 'fuel' : 'other', date: e.date, odo: null, title: t(('kind_' + e.kind) as K), sub: e.note, type: t('expense'), note: e.note, amount: e.amount, tags: [], text: (t(('kind_' + e.kind) as K) + ' ' + e.note).toLowerCase(), l100: null })
    r.sort((a, b) => b.date.localeCompare(a.date) || (b.odo ?? 0) - (a.odo ?? 0))
    return { rows: r, avg: avgL100(segs) }
  }, [db, vid, t, n])
}

/** Consumption of the leg ending at this fill-up; green when 10 % or more below the average, red when 10 % or more above. */
function Cons({ l100, avg }: { l100: number; avg: number | null }) {
  const { t, n } = useT()
  const cls = avg == null ? '' : l100 <= avg * 0.9 ? 'low' : l100 >= avg * 1.1 ? 'high' : ''
  return (
    <span className={'cons num ' + cls}>
      {cls === 'low' && <span aria-hidden="true">▼ </span>}
      {cls === 'high' && <span aria-hidden="true">▲ </span>}
      {n(l100, 1)} {t('l100')}
      {cls && <span className="sr-only"> ({t(cls === 'low' ? 'consLow' : 'consHigh')})</span>}
    </span>
  )
}

function RowCard({ r, avg, currency }: { r: Row; avg: number | null; currency: string }) {
  const { t, n, date } = useT()
  const nav = useNav()
  return (
    <button type="button" className="card row-btn" onClick={() => nav.push({ k: r.kind, id: r.id })}>
      <span className="split"><span className="muted num">{date(r.date)}{r.odo != null ? ` · ${n(r.odo)} ${t('km')}` : ''}</span>{r.amount != null && <b className="num">{n(r.amount, 2)} {currency}</b>}</span>
      <span className="split"><span>{r.title}</span>{r.l100 != null && <Cons l100={r.l100} avg={avg} />}</span>
      {r.tags.length > 0 && <span className="tagline">{r.tags.map((g) => '#' + g).join(' ')}</span>}
      {r.sub && <span className="muted small">{r.sub}</span>}
    </button>
  )
}

type SortKey = 'date' | 'odo' | 'amount'

/** The log as a table with columns (wide screens only). */
function JournalTable({ rows, avg, currency }: { rows: Row[]; avg: number | null; currency: string }) {
  const { t, n, date } = useT()
  const nav = useNav()
  const [sort, setSort] = useState<{ k: SortKey; up: boolean }>({ k: 'date', up: false })
  const val = (r: Row) => (sort.k === 'date' ? r.date : sort.k === 'odo' ? r.odo ?? -1 : r.amount ?? -1)
  const list = sort.k === 'date' && !sort.up ? rows : [...rows].sort((a, b) => {
    const x = val(a), y = val(b)
    const c = typeof x === 'string' ? x.localeCompare(y as string) || (a.odo ?? 0) - (b.odo ?? 0) : x - (y as number)
    return sort.up ? c : -c
  })
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={cls} aria-sort={sort.k === k ? (sort.up ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="th-btn" onClick={() => setSort((s) => ({ k, up: s.k === k ? !s.up : false }))}>{label}{sort.k === k ? (sort.up ? ' ↑' : ' ↓') : ''}</button>
    </th>
  )
  const open = (r: Row) => nav.push({ k: r.kind, id: r.id })
  return (
    <div className="jtable-wrap desk">
      <table className="jtable">
        <thead>
          <tr>{th('date', t('date'))}{th('odo', t('odometer'), 'r')}<th>{t('type')}</th><th className="wide">{t('colRecord')}</th><th className="r">{t('l100')}</th>{th('amount', t('amount'), 'r')}</tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.kind + r.id} tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r) } }}>
              <td className="num nowrap">{date(r.date)}</td>
              <td className="num r nowrap">{r.odo != null ? n(r.odo) : ''}</td>
              <td className="muted nowrap">{r.type}</td>
              <td className="wide">
                <span className="jt-title">{r.kind === 'fuel' ? r.title.split(' · ').slice(1).join(' · ') : r.title}</span>
                {r.tags.length > 0 && <span className="tagline"> {r.tags.map((g) => '#' + g).join(' ')}</span>}
                {r.note && <span className="muted small jt-note">{r.note}</span>}
              </td>
              <td className="r nowrap">{r.l100 != null ? <Cons l100={r.l100} avg={avg} /> : ''}</td>
              <td className="num r nowrap"><b>{r.amount != null ? `${n(r.amount, 2)} ${currency}` : ''}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Journal({ vid: forVid, embedded }: { vid?: string; embedded?: boolean } = {}) {
  const db = useDB()
  const { t, n, date } = useT()
  const vid = forVid ?? activeId(db)
  const v = db.vehicles.find((x) => x.id === vid)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'service' | 'fuel' | 'expense'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tag, setTag] = useState('')
  const { rows, avg } = useRows(vid)
  if (!v || !vid) return null
  const allTags = [...new Set(rows.flatMap((r) => r.tags))].sort()
  const qq = q.trim().toLowerCase()
  const shown = rows.filter((r) => (kind === 'all' || r.kind === kind) && (!from || r.date >= from) && (!to || r.date <= to) && (!tag || r.tags.includes(tag)) && (!qq || r.text.includes(qq)))
  const sum = shown.reduce((s, r) => s + (r.amount ?? 0), 0)
  const byBucket = (['service', 'accessories', 'fuel', 'other'] as Bucket[])
    .map((b) => ({ b, amount: shown.reduce((s, r) => s + (r.bucket === b ? r.amount ?? 0 : 0), 0) }))
    .filter((x) => x.amount !== 0)
  return (
    <>
      {!embedded && <h1>{t('tabJournal')} <small className="muted">· {v.name}</small></h1>}
      <div className="jfilters">
      <input id={embedded ? undefined : 'journal-search'} className="input jf-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
      <Chips value={kind} onChange={setKind} options={[{ v: 'all', l: t('all') }, { v: 'service', l: t('fWork') }, { v: 'fuel', l: t('fFuel') }, { v: 'expense', l: t('fExp') }]} />
      <div className="grid2 jf-dates">
        <div className="field"><span className="label">{t('dateFrom')}</span><DateInput label={t('dateFrom')} value={from} max={to || undefined} onChange={setFrom} clearable /></div>
        <div className="field"><span className="label">{t('dateTo')}</span><DateInput label={t('dateTo')} value={to} min={from || undefined} onChange={setTo} clearable /></div>
      </div>
      {(from || to) && <button type="button" className="btn link" onClick={() => { setFrom(''); setTo('') }}>{t('resetDates')}</button>}
      {allTags.length > 0 && (
        <select className="input jf-tag" value={tag} onChange={(e) => setTag(e.target.value)} aria-label={t('allTags')}>
          <option value="">{t('allTags')}</option>
          {allTags.map((g) => (<option key={g} value={g}>#{g}</option>))}
        </select>
      )}
      </div>
      {(from || to) && (
        <div className="card period-total">
          <div className="total-row"><span>{t('periodSpent')}<br /><small className="muted num">{from ? date(from) : '…'} – {to ? date(to) : '…'}</small></span><b className="num">{n(sum, 2)} {v.currency}</b></div>
          {byBucket.length > 1 && byBucket.map((x) => (
            <div className="split small" key={x.b}><span className="muted">{t(BUCKET_LABEL[x.b])}</span><span className="num">{n(x.amount, 2)} {v.currency}</span></div>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <p className="muted small num split">
          <span>{shown.length}{from || to ? '' : ` · ${n(sum, 2)} ${v.currency}`}</span>
          {kind === 'fuel' && avg != null && <span>{t('avgFor')}: {n(avg, 1)} {t('l100')}</span>}
        </p>
      )}
      {shown.length === 0 && <p className="muted">{t('emptyJournal')}</p>}
      {shown.length > 0 && <JournalTable rows={shown} avg={avg} currency={v.currency} />}
      <div className="phone-only">
      {shown.map((r) => (<RowCard key={r.kind + r.id} r={r} avg={avg} currency={v.currency} />))}
      </div>
    </>
  )
}

/* ---------- spending list (from Garage and Stats) ---------- */

const BUCKET_LABEL: Record<Bucket, K> = { all: 'allBuckets', service: 'stService', accessories: 'stAcc', fuel: 'stFuel', other: 'stOther' }

export function SpendList({ vid, year, bucket }: { vid: string; year: number | null; bucket: Bucket }) {
  const db = useDB()
  const { t, n } = useT()
  const [b, setB] = useState<Bucket>(bucket)
  const { rows, avg } = useRows(vid)
  const v = db.vehicles.find((x) => x.id === vid)
  if (!v) return null
  const inPeriod = rows.filter((r) => r.amount != null && r.amount !== 0 && (year == null || r.date.startsWith(String(year))))
  const shown = inPeriod.filter((r) => b === 'all' || r.bucket === b)
  const sum = shown.reduce((s, r) => s + (r.amount ?? 0), 0)
  return (
    <Sheet title={`${t('spentList')} ${year ?? t('all').toLowerCase()} · ${v.name}`} color={v.color}>
      <Chips value={b} onChange={setB} options={(['all', 'service', 'accessories', 'fuel', 'other'] as Bucket[]).map((x) => ({ v: x, l: t(BUCKET_LABEL[x]) }))} />
      <div className="total-row"><b>{t('statsTotal')}</b><b className="num">{n(sum, 2)} {v.currency}</b></div>
      {shown.length === 0 && <p className="muted">{t('noSpend')}</p>}
      {shown.map((r) => (<RowCard key={r.kind + r.id} r={r} avg={avg} currency={v.currency} />))}
    </Sheet>
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
      <div className="cols">
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
      </div>
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

export function Stats({ vid: forVid, embedded }: { vid?: string; embedded?: boolean } = {}) {
  const db = useDB()
  const { t, n } = useT()
  const nav = useNav()
  const vid = forVid ?? activeId(db)
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
  const rows: [Exclude<Bucket, 'all'>, number][] = [['service', tot.service], ['accessories', tot.accessories], ['fuel', tot.fuel], ['other', tot.other]]
  const y = year === 'all' ? null : Number(year)
  return (
    <>
      {!embedded && <h1>{t('tabStats')} <small className="muted">· {v.name}</small></h1>}
      {!embedded && <ValueReminder />}
      <Chips value={year} onChange={setYear} options={[...ys.map((y) => ({ v: String(y), l: String(y) })), { v: 'all', l: t('all') }]} />
      <div className="cols">
      <div className="card">
        {rows.map(([k, x]) => (
          <button type="button" className="stat-row row-btn bare" key={k} onClick={() => nav.push({ k: 'spend', vid, year: y, bucket: k })}>
            <span className="split"><span>{t(BUCKET_LABEL[k])} ›</span><b className="num">{n(x, 2)} {v.currency}</b></span>
            <div className="bar"><div className="ac" style={{ width: (tot.total ? Math.round((x / tot.total) * 100) : 0) + '%' }} /></div>
          </button>
        ))}
        <button type="button" className="row-btn bare total-row" onClick={() => nav.push({ k: 'spend', vid, year: y, bucket: 'all' })}><b>{t('statsTotal')} ›</b><b className="num">{n(tot.total, 2)} {v.currency}</b></button>
      </div>
      <div className="grid2">
        <div className="card tile"><span className="label">{t('perKm')}</span><b className="num">{perKm != null ? `${n(perKm, 2)} ${v.currency}` : '—'}</b><span className="muted small">{t('perKmNote')}</span><OwnTileLine vid={vid} /></div>
        <div className="card tile"><span className="label">{t('avgCons')}</span>{avg != null ? <b className="num">{n(avg, 1)} <small>{t('l100')}</small></b> : <span className="small">{t('avgConsEmpty')}</span>}</div>
      </div>
      </div>
      {segs.length < 2 && prices.length < 2 && <p className="muted">{t('noFuelStats')}</p>}
      <div className="cols">
      <LineChart points={segs.map((s) => s.l100)} label={t('consChart')} unit={t('l100')} digits={1} />
      <LineChart points={prices} label={t('priceChart')} unit={v.currency} digits={3} />
      </div>
    </>
  )
}
