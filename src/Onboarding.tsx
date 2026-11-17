/*
 * First run (install the app → short tour → where data lives) and keeping data safe
 * (the data-safety sheet and the monthly backup reminder).
 */
import { useEffect, useRef, useState } from 'react'
import { getDB, update, useDB, type DB } from './store'
import { useT } from './i18n'
import { googleConfigured, signIn } from './google'
import { backupNow, importJson } from './exportImport'
import { IconFuel, IconWrench, Sheet, useNav } from './ui'

/* ---------- environment ---------- */

export const isStandalone = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches

type Platform = 'ios-safari' | 'ios-other' | 'android' | 'desktop'
export function platform(): Platform {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? 'ios-other' : 'ios-safari'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** Chrome on Android offers its own install dialog; keep the event until the person asks for it. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let installEvent: InstallEvent | null = null
const installSubs = new Set<() => void>()
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallEvent
    installSubs.forEach((f) => f())
  })
}

/** Link to the guide on tolimoto.com in the app's language. */
export const guideUrl = (lang: string, anchor = ''): string =>
  `https://tolimoto.com/${lang === 'ru' ? 'ru/' : ''}guide.html${anchor ? '#' + anchor : ''}`

/* ---------- install ---------- */

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: '-4px' }}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-4px' }}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M7 10H5.5v11h13V10H17" />
  </svg>
)

export function InstallIntro() {
  const { t, lang } = useT()
  const p = platform()
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((x) => x + 1)
    installSubs.add(f)
    return () => { installSubs.delete(f) }
  }, [])
  const done = () => update((d) => { d.settings.installSeen = true })
  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    installEvent = null
    force((x) => x + 1)
  }
  const steps =
    p === 'android' ? (installEvent ? [] : [t('inAnd1'), t('inAnd2'), t('inAnd3')])
    : p === 'desktop' ? []
    : [t('inIos1'), t('inIos2'), t('inIos3')]
  return (
    <div className="center-screen onboard">
      <img src="./pwa-192.png" alt="" width="88" height="88" className="ob-icon" />
      <h1>{t('inTitle')}</h1>
      <p className="muted">{p === 'desktop' ? t('inDesk') : t('inLead')}</p>
      {p === 'ios-other' && <div className="notice warn"><span>{t('inIosOther')}</span></div>}
      {steps.length > 0 && (
        <ol className="ob-steps">
          {steps.map((s, i) => (
            <li key={i}><b>{i + 1}</b><span>{s}{p.startsWith('ios') && i === 0 ? <> <MenuIcon /></> : p.startsWith('ios') && i === 1 ? <> <ShareIcon /></> : null}</span></li>
          ))}
        </ol>
      )}
      {p !== 'desktop' && <div className="notice warn"><span>{t('inWhy')}</span></div>}
      {installEvent && <button type="button" className="btn primary big" onClick={() => void install()}>{t('inInstall')}</button>}
      <a className="btn" href={guideUrl(lang, 'install')} target="_blank" rel="noopener">{t('inGuide')}</a>
      <button type="button" className="btn link" onClick={done}>{t('inSkip')}</button>
    </div>
  )
}

/* ---------- tour + storage choice ---------- */

const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16M8 16l4-5 3 3 5-7" /></svg>
)

export function Tour() {
  const { t } = useT()
  const [i, setI] = useState(0)
  const slides = [
    { icon: <IconFuel />, title: t('tour1T'), text: t('tour1D') },
    { icon: <IconWrench />, title: t('tour2T'), text: t('tour2D') },
    { icon: <IconChart />, title: t('tour3T'), text: t('tour3D') },
  ]
  if (i >= slides.length) return <StorageChoice />
  const s = slides[i]
  return (
    <div className="center-screen onboard">
      <div className="ob-art" aria-hidden="true">{s.icon}</div>
      <h1>{s.title}</h1>
      <p className="muted">{s.text}</p>
      <div className="ob-dots" aria-hidden="true">{[...slides, null].map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
      <button type="button" className="btn primary big" onClick={() => setI(i + 1)}>{t('next')}</button>
      <button type="button" className="btn link" onClick={() => setI(slides.length)}>{t('skipTour')}</button>
    </div>
  )
}

function RestoreButton({ onDone }: { onDone?: (n: number) => void }) {
  const { t } = useT()
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState(false)
  return (
    <>
      <button type="button" className="btn" onClick={() => file.current?.click()}>{t('stRestore')}</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        try { const n = importJson(await f.text()); setErr(false); onDone?.(n) } catch { setErr(true) }
        e.target.value = ''
      }} />
      {err && <div className="notice warn" role="status">{t('importErr')}</div>}
    </>
  )
}

export function StorageChoice() {
  const { t } = useT()
  const [ack, setAck] = useState(false)
  const finish = (patch: (d: DB) => void) => update((d) => { d.settings.onboarded = true; patch(d) })
  return (
    <div className="center-screen onboard">
      <h1>{t('stTitle')}</h1>
      {googleConfigured() && (
        <div className="card ob-card rec">
          <span className="ob-tag">{t('stRecommended')}</span>
          <b>{t('stGoogleT')}</b>
          <span className="small muted">{t('stGoogleD')}</span>
          <button type="button" className="btn primary" onClick={() => { finish(() => {}); signIn() }}>{t('stGoogleBtn')}</button>
        </div>
      )}
      <div className="card ob-card">
        <b>{t('stLocalT')}</b>
        <span className="small muted">{t('stLocalD')}</span>
        <label className="ob-ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> <span className="small">{t('stLocalAck')}</span></label>
        <button type="button" className="btn" disabled={!ack} onClick={() => finish((d) => { d.settings.localAck = true })}>{t('stLocalBtn')}</button>
        <span className="hint">{t('stLater')}</span>
      </div>
      <RestoreButton onDone={() => finish(() => {})} />
    </div>
  )
}

/* ---------- keeping data safe ---------- */

const DAY = 86400000
const recordCount = (d: DB) => d.fuel.length + d.service.length + d.expenses.length
/** Backup reminder: no Google, more than ten records, no backup for 30 days, not snoozed. */
export function backupDue(d: DB, now = Date.now()): boolean {
  if (d.settings.google) return false
  if (recordCount(d) <= 10) return false
  if (d.settings.backupSnooze && Date.parse(d.settings.backupSnooze) > now) return false
  return !d.settings.lastBackup || now - Date.parse(d.settings.lastBackup) > 30 * DAY
}

export function BackupReminder() {
  const db = useDB()
  const { t } = useT()
  if (!backupDue(db)) return null
  return (
    <div className="notice warn backup-due" role="status">
      <span><b>{t('brTitle')}</b><br />{t('brText')}</span>
      <span className="row-btns">
        <button type="button" className="btn small primary" onClick={() => void backupNow()}>{t('brSave')}</button>
        <button type="button" className="btn small" onClick={() => update((d) => { d.settings.backupSnooze = new Date(Date.now() + 3 * DAY).toISOString() })}>{t('brLater')}</button>
      </span>
    </div>
  )
}

export function DataSafety() {
  const db = useDB()
  const { t, lang } = useT()
  const nav = useNav()
  const [msg, setMsg] = useState('')
  const g = db.settings.google
  const last = db.settings.lastBackup
  const when = last ? new Date(last).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU') : t('dsNever')
  return (
    <Sheet title={t('dsTitle')}>
      <div className={'notice' + (g ? '' : ' warn')}><span>{g ? t('dsGoogleOn') : t('dsLocal')}</span></div>
      <h3>{t('dsHow')}</h3>
      <ol className="ob-steps small">
        <li><b>1</b><span>{t('dsTip1')}</span></li>
        <li><b>2</b><span>{t('dsTip2')}</span></li>
        <li><b>3</b><span>{t('dsTip3')}</span></li>
      </ol>
      {!g && googleConfigured() && <button type="button" className="btn primary" onClick={() => signIn()}>{t('stGoogleBtn')}</button>}
      <span className="split"><span className="muted small">{t('dsLast')}</span><b className="small">{when}</b></span>
      <button type="button" className="btn" onClick={async () => { if (await backupNow()) setMsg(t('backupSaved')) }}>{t('dsBackup')}</button>
      <RestoreButton onDone={(n) => setMsg(`${t('stRestored')} ${n}`)} />
      {msg && <div className="notice" role="status">{msg}</div>}
      <a className="btn link" href={guideUrl(lang, 'data')} target="_blank" rel="noopener">{t('dsMore')}</a>
      <button type="button" className="btn link" onClick={nav.close}>{t('close')}</button>
    </Sheet>
  )
}

/** Ask the browser not to clear our storage when space runs low. */
export function keepStorage(): void {
  try { void navigator.storage?.persist?.() } catch { /* not supported */ }
}

export const _test = { backupDue, recordCount, getDB }
