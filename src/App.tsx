import { useEffect, useMemo, useRef, useState } from 'react'
import { useDB, useLoaded } from './store'
import { useT } from './i18n'
import { IconPlus, NavCtx, type Modal } from './ui'
import { Home, Journal, Schedule, SpendList, Stats } from './Screens'
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

  useEffect(() => {
    if (!loaded || started.current) return
    started.current = true
    if (db.settings.startOnFuel && db.vehicles.length) setStack([{ k: 'fuel' }])
  }, [loaded, db.settings.startOnFuel, db.vehicles.length])

  if (!loaded) return <div className="center-screen"><h1>Tolimoto Log</h1></div>
  if (!db.settings.lang) return <LangPick />
  if (!db.vehicles.length)
    return (<NavCtx.Provider value={nav}>{modal?.k === 'fuelly' ? <FuellyImport cars={modal.cars} /> : <VehicleForm first />}</NavCtx.Provider>)

  const tabBtn = (k: Tab, label: string) => (
    <button type="button" className={'tab' + (tab === k ? ' on' : '')} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{label}</button>
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
          {tabBtn('home', t('tabHome'))}
          {tabBtn('journal', t('tabJournal'))}
          <button type="button" className="fab" aria-label={t('add')} onClick={() => setStack([{ k: 'add' }])}><IconPlus /></button>
          {tabBtn('sched', t('tabSched'))}
          {tabBtn('stats', t('tabStats'))}
        </nav>
        {modal && <ModalHost key={stack.length + (modal.k === 'fuelly' ? 'fuelly' : JSON.stringify(modal))} m={modal} />}
      </div>
    </NavCtx.Provider>
  )
}
