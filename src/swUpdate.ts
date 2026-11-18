/*
 * A new version of the app is installed by the service worker in the background (skipWaiting +
 * clientsClaim). The page that is open keeps running the old code until it reloads, so it showed
 * the previous version on the first visit after a release. Here the page reloads by itself once the
 * new version has taken over, but only at a safe moment: no form or sheet open, no field focused,
 * nothing being saved or synced. Nothing typed can be lost.
 */
import { isSaving } from './store'
import { isSyncing, isUiBusy } from './sync'

const safe = () => {
  const a = document.activeElement
  const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement
  return !isUiBusy() && !typing && !isSaving() && !isSyncing()
}

export function reloadOnUpdate(): void {
  if (!('serviceWorker' in navigator)) return
  // the first install also fires controllerchange (clientsClaim); the page is already current then
  const hadController = !!navigator.serviceWorker.controller
  let pending = false
  const tryReload = () => {
    if (!pending) return
    if (safe()) location.reload()
    else setTimeout(tryReload, 2000)
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pending) return
    pending = true
    tryReload()
  })
  // an app on the home screen can stay open for days: look for a new version when it comes back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
  })
}
