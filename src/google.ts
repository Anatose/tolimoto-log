import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from './config'

/*
 * Sign-in by redirect (OAuth 2.0 implicit flow for browser apps). A redirect, not a popup,
 * because popups do not return reliably to an app installed on the iPhone home screen.
 * The access token lives about an hour; after that the user taps "Sign in again".
 */

const TOKEN_KEY = 'tl-google-token'
const STATE_KEY = 'tl-google-state'

interface Token {
  token: string
  exp: number
}

export const googleConfigured = (): boolean => GOOGLE_CLIENT_ID.length > 0
export const redirectUri = (): string => location.origin + location.pathname

export function getToken(): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null
    if (t && t.exp > Date.now() + 60_000) return t.token
  } catch {
    /* no storage */
  }
  return null
}
export function dropToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* no storage */
  }
}

/** Leaves the app for Google's sign-in page; it comes back to the same address. */
export function signIn(opts: { email?: string; silent?: boolean } = {}): void {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36)
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ state, silent: !!opts.silent, email: opts.email ?? '' }))
  } catch {
    /* no storage */
  }
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: GOOGLE_SCOPES,
    include_granted_scopes: 'true',
    state,
  })
  if (opts.email) q.set('login_hint', opts.email)
  if (opts.silent) q.set('prompt', 'none')
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString())
}

export type AuthReturn = { kind: 'none' } | { kind: 'ok' } | { kind: 'error'; error: string }

/** Reads Google's answer from the address after the redirect and removes it from the address bar. */
export function handleAuthReturn(): AuthReturn {
  const h = location.hash.startsWith('#') ? location.hash.slice(1) : ''
  if (!h.includes('access_token=') && !h.includes('error=')) return { kind: 'none' }
  const p = new URLSearchParams(h)
  history.replaceState(null, '', location.pathname + location.search)
  let saved: { state: string; silent: boolean; email: string } | null = null
  try {
    saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null')
    localStorage.removeItem(STATE_KEY)
  } catch {
    /* no storage */
  }
  if (!saved || p.get('state') !== saved.state) return { kind: 'error', error: 'state' }
  const err = p.get('error')
  if (err) {
    // A silent attempt that needs the user: go again with the normal screen.
    if (saved.silent && (err === 'interaction_required' || err === 'login_required' || err === 'consent_required')) {
      signIn({ email: saved.email })
      return { kind: 'none' }
    }
    return { kind: 'error', error: err }
  }
  const token = p.get('access_token')
  const scopes = (p.get('scope') ?? '').split(' ')
  if (!token) return { kind: 'error', error: 'no_token' }
  if (!scopes.includes('https://www.googleapis.com/auth/drive.file')) return { kind: 'error', error: 'scope' }
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + Number(p.get('expires_in') ?? 3599) * 1000 }))
  } catch {
    return { kind: 'error', error: 'storage' }
  }
  return { kind: 'ok' }
}

export class AuthError extends Error {}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  if (!token) throw new AuthError('signed out')
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: 'Bearer ' + token } })
  if (r.status === 401) {
    dropToken()
    throw new AuthError('expired')
  }
  if (!r.ok) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return (r.status === 204 ? undefined : await r.json()) as T
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const userEmail = async (): Promise<string> =>
  (await api<{ email?: string }>('https://www.googleapis.com/oauth2/v3/userinfo')).email ?? ''

/* ---------- Drive ---------- */

const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'
const SHEET = 'application/vnd.google-apps.spreadsheet'

interface DFile {
  id: string
  name: string
  webViewLink?: string
}

/** With drive.file the app only sees what it created itself, so a search finds only our files. */
async function findByRole(role: string, parent?: string): Promise<DFile | null> {
  const q = [`appProperties has { key='tolimotoLog' and value='${role}' }`, 'trashed=false']
  if (parent) q.push(`'${parent}' in parents`)
  const r = await api<{ files: DFile[] }>(`${DRIVE}?q=${encodeURIComponent(q.join(' and '))}&fields=files(id,name,webViewLink)&orderBy=createdTime`)
  return r.files[0] ?? null
}
async function createFile(name: string, mimeType: string, role: string, parent?: string): Promise<DFile> {
  return api<DFile>(`${DRIVE}?fields=id,name,webViewLink`, json({ name, mimeType, parents: parent ? [parent] : undefined, appProperties: { tolimotoLog: role } }))
}

export interface DriveLayout {
  folderId: string
  receiptsId: string
  sheetId: string
  createdSheet: boolean
}

/** Finds the app's folder, receipts folder and spreadsheet, creating what is missing. */
export async function ensureLayout(): Promise<DriveLayout> {
  const folder = (await findByRole('folder')) ?? (await createFile('Tolimoto Log', FOLDER, 'folder'))
  const receipts = (await findByRole('receipts', folder.id)) ?? (await createFile('Receipts', FOLDER, 'receipts', folder.id))
  let sheet = await findByRole('sheet')
  let createdSheet = false
  if (!sheet) {
    sheet = await createFile('Tolimoto Log', SHEET, 'sheet', folder.id)
    createdSheet = true
  }
  return { folderId: folder.id, receiptsId: receipts.id, sheetId: sheet.id, createdSheet }
}

/** Uploads a receipt or photo and returns its link. */
export async function uploadFile(blob: Blob, name: string, parent: string): Promise<string> {
  const boundary = 'tl' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ name, parents: [parent], appProperties: { tolimotoLog: 'receipt' } })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ])
  const f = await api<DFile>('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`
}

/* ---------- Sheets ---------- */

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

export async function sheetTabs(id: string): Promise<{ title: string; sheetId: number }[]> {
  const r = await api<{ sheets: { properties: { title: string; sheetId: number } }[] }>(`${SHEETS}/${id}?fields=sheets.properties(title,sheetId)`)
  return r.sheets.map((s) => s.properties)
}
export const sheetBatchUpdate = (id: string, requests: unknown[]) => api(`${SHEETS}/${id}:batchUpdate`, json({ requests }))

export type Cell = string | number | boolean
export async function readRanges(id: string, ranges: string[]): Promise<Cell[][][]> {
  const q = ranges.map((r) => 'ranges=' + encodeURIComponent(r)).join('&')
  const r = await api<{ valueRanges: { values?: Cell[][] }[] }>(`${SHEETS}/${id}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`)
  return r.valueRanges.map((v) => v.values ?? [])
}
export async function writeRanges(id: string, data: { range: string; values: Cell[][] }[], clear: string[]): Promise<void> {
  await api(`${SHEETS}/${id}/values:batchClear`, json({ ranges: clear }))
  await api(`${SHEETS}/${id}/values:batchUpdate`, json({ valueInputOption: 'RAW', data }))
}

export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`
export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`
