/*
 * The system Back button / gesture (Android, browser) inside the app.
 *
 * The app keeps two entries of its own in the browser history: "base" and "top" above it. Back moves from
 * top to base inside the same page, so the app sees it (popstate), does one step back in its own state —
 * closes the open window, goes to the previous tab — and puts "top" back. Nothing else in the app has to
 * write to the history. Only on the main tab with nothing open does Back leave the app: in the installed
 * app after a "press again" hint, in a browser tab at once.
 *
 * After an interactive Google sign-in the Google pages stay in the history behind the app (a page cannot
 * remove them), so there Back never leaves: it would open Google's account chooser. The hint then says to
 * close the app from the system instead.
 */
const EXIT_KEY = 'tl-back-exit'
const GOOGLE_KEY = 'tl-google-behind'

/** Called when a Google sign-in page was shown in this tab: from now on Back must not leave the app. */
export function markGoogleBehind(): void {
  try { sessionStorage.setItem(GOOGLE_KEY, '1') } catch { /* no storage */ }
}
const googleBehind = () => { try { return sessionStorage.getItem(GOOGLE_KEY) === '1' } catch { return false } }
const leaving = () => { try { return Date.now() - Number(sessionStorage.getItem(EXIT_KEY) ?? 0) < 3000 } catch { return false } }

export type ExitHint = 'again' | 'closeApp'

/**
 * Starts listening. `onBack` does one step back in the app and returns true, or returns false when there
 * is nothing left to go back to. Returns a function that stops listening.
 */
export function installBack(onBack: () => boolean, onHint: (h: ExitHint) => void, standalone: boolean): () => void {
  const tl = (history.state as { tl?: string } | null)?.tl
  // on the way out through older entries of this app (e.g. from before a reload): keep going
  if (leaving() && tl) { history.back(); return () => {} }
  if (tl !== 'top') {
    if (tl !== 'base') history.replaceState({ ...(history.state ?? {}), tl: 'base' }, '')
    history.pushState({ tl: 'top' }, '')
  }
  let armed = 0
  const stay = () => history.pushState({ tl: 'top' }, '')
  const onPop = () => {
    if ((history.state as { tl?: string } | null)?.tl !== 'base') return
    if (onBack()) { armed = 0; stay(); return }
    if (googleBehind()) { onHint('closeApp'); stay(); return }
    if (!standalone || Date.now() - armed < 2500) {
      try { sessionStorage.setItem(EXIT_KEY, String(Date.now())) } catch { /* no storage */ }
      history.back()
      return
    }
    armed = Date.now()
    onHint('again')
    stay()
  }
  window.addEventListener('popstate', onPop)
  return () => window.removeEventListener('popstate', onPop)
}
