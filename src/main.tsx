import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadDB } from './store'
import { handleAuthReturn } from './google'
import { afterAuth, initSync } from './sync'
import { keepStorage, listenForInstall } from './Onboarding'
import './styles.css'

listenForInstall()
keepStorage()
const auth = handleAuthReturn()
void loadDB().then(() => {
  afterAuth(auth)
  initSync()
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
