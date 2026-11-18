import { useEffect, useMemo, useRef, useState } from 'react'
import { update, useDB, useLoaded } from './store'
import { setUiBusy } from './sync'
import { relabelPresets, useT } from './i18n'
import { IconGear, IconPlus, NavCtx, type Modal } from './ui'
import { Home, Journal, Schedule, SpendList, Stats } from './Screens'
import { DataSafety, InstallIntro, Tour, isStandalone } from './Onboarding'
import { AddMenu, ExpenseForm, FuelForm, FuellyImport, History, LangPick, OdoForm, SchedForm, ServiceForm, SettingsSheet, VehicleForm } from './Forms'

type Tab = 'home' | 'journal' | 'sched' | 'stats'

function ModalHost({ m }: { m: NonNullable<Modal> }) {
  switch (m.k) {
    case 'add': return <AddMenu />
    case 'fuel': return <FuelForm id={m.id} />
    case 'service': return <ServiceForm id={m.id} tag={m.tag} />
    case 'expense': return <ExpenseForm id={m.id} />
    case 'odo': return <OdoForm />
    case 'vehicle': return <VehicleForm id={m.id} />
    case 'sched': return <SchedForm id={m.id} />
    case 'history': return <History tag={m.tag} vid={m.vid} />
    case 'settings': return <SettingsSheet />
    case 'safety': return <DataSafety />
    case 'spend': return <SpendList vid={m.vid} year={m.year} bucket={m.bucket} />
    case 'fuelly': return <FuellyImport cars={m.cars} />
  }
}

export default function App() {
  const loaded = useLoaded()
  const db = useDB()
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<NonNullable<Modal>[]>([])
  const modal = stack.length ? stack[stack.length - 1] : null
  useEffect(() => setUiBusy(stack.length > 0), [stack.length])
  // computer keyboard: Esc closes, Ctrl/⌘+Enter saves, letters open forms, 1–4 switch tabs, / searches the log
  const keyState = useRef({ stack, ready: false })
  keyState.current = { stack, ready: !!(db.settings.lang && db.settings.onboarded && db.vehicles.length) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const { stack: st, ready } = keyState.current
      if (e.key === 'Escape') { setStack((s) => s.slice(0, -1)); return }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const b = [...document.querySelectorAll<HTMLButtonElement>('.sheet .btn.primary.big')].pop()
        if (b && !b.disabled) { e.preventDefault(); b.click() }
        return
      }
      if (!ready || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable="true"]')) return
      const top = st[st.length - 1]
      if (top && top.k !== 'add') return
      const forms: Record<string, NonNullable<Modal>> = { KeyF: { k: 'fuel' }, KeyS: { k: 'service' }, KeyE: { k: 'expense' }, KeyO: { k: 'odo' } }
      const tabs: Record<string, Tab> = { Digit1: 'home', Digit2: 'journal', Digit3: 'sched', Digit4: 'stats' }
      if (forms[e.code]) { e.preventDefault(); setStack([forms[e.code]]) }
      else if (top) return
      else if (e.code === 'KeyN') { e.preventDefault(); setStack([{ k: 'add' }]) }
      else if (tabs[e.code]) { e.preventDefault(); setTab(tabs[e.code]) }
      else if (e.code === 'Slash' && !e.shiftKey) {
        e.preventDefault()
        setTab('journal')
        window.setTimeout(() => document.getElementById('journal-search')?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const started = useRef(false)
  const nav = useMemo(() => ({
    open: (m: Modal) => setStack((s) => (m ? [...s.slice(0, -1), m] : s.slice(0, -1))),
    push: (m: Modal) => setStack((s) => (m ? [...s, m] : s)),
    close: () => setStack((s) => s.slice(0, -1)),
  }), [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const th = db.settings.theme === 'auto' ? (mq.matches ? 'light' : 'dark') : db.settings.theme
      document.documentElement.dataset.theme = th
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th === 'light' ? '#FFFFFF' : '#0F1215')
    }
    apply()
    document.documentElement.lang = db.settings.lang ?? 'ru'
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [db.settings.theme, db.settings.lang])

  // preset schedule items follow the app language (also fixes items made before a language switch)
  useEffect(() => {
    const lang = db.settings.lang
    if (!loaded || !lang) return
    if (relabelPresets(db.schedule.map((x) => ({ ...x })), lang)) update((d) => { relabelPresets(d.schedule, lang) })
  }, [loaded, db.settings.lang, db.schedule])

  useEffect(() => {
    if (!loaded || started.current) return
    started.current = true
    if (db.settings.startOnFuel && db.vehicles.length) setStack([{ k: 'fuel' }])
  }, [loaded, db.settings.startOnFuel, db.vehicles.length])

  if (!loaded) return <div className="center-screen"><h1>Tolimoto Log</h1></div>
  if (!db.settings.lang) return <LangPick />
  if (!db.settings.installSeen && !isStandalone()) return <InstallIntro />
  if (!db.settings.onboarded) return <Tour />
  if (!db.vehicles.length)
    return (<NavCtx.Provider value={nav}>{modal?.k === 'fuelly' ? <FuellyImport cars={modal.cars} /> : <VehicleForm first />}</NavCtx.Provider>)

  const tabBtn = (k: Tab, label: string, key: string) => (
    <button type="button" className={'tab' + (tab === k ? ' on' : '')} aria-current={tab === k ? 'page' : undefined} aria-keyshortcuts={key} onClick={() => setTab(k)}>{label}<kbd className="desk">{key}</kbd></button>
  )
  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <main className="screen">
          {tab === 'home' && <Home goSched={() => setTab('sched')} />}
          {tab === 'journal' && <Journal />}
          {tab === 'sched' && <Schedule />}
          {tab === 'stats' && <Stats />}
        </main>
        <nav className="nav">
          <span className="brand desk"><img src="./pwa-192.png" alt="" width="32" height="32" /> Tolimoto Log</span>
          {tabBtn('home', t('tabHome'), '1')}
          {tabBtn('journal', t('tabJournal'), '2')}
          <button type="button" className="fab" aria-label={t('add')} aria-keyshortcuts="N" onClick={() => setStack([{ k: 'add' }])}><IconPlus /><span className="desk">{t('add')}</span><kbd className="desk">N</kbd></button>
          {tabBtn('sched', t('tabSched'), '3')}
          {tabBtn('stats', t('tabStats'), '4')}
          <a className="tab nav-thanks desk" href="https://ko-fi.com/tolimoto" target="_blank" rel="noopener">⛽ {t('thanksDev')}</a>
          <button type="button" className="tab nav-settings desk" onClick={() => setStack([{ k: 'settings' }])}><IconGear /> {t('settings')}</button>
        </nav>
        {modal && <ModalHost key={stack.length + (modal.k === 'fuelly' ? 'fuelly' : JSON.stringify(modal))} m={modal} />}
      </div>
    </NavCtx.Provider>
  )
}
