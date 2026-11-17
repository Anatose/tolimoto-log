/**
 * OAuth client ID of the Google Cloud project "Tolimoto Log" (type: Web application).
 * It is public by design: it identifies the app, it does not grant access to anything.
 * Empty = Google features are hidden. A build can override it with VITE_GOOGLE_CLIENT_ID.
 */
const BUILT_IN = ''
export const GOOGLE_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || BUILT_IN

/** Only files this app creates or the user opens with it — not the rest of the Drive. */
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file email'
