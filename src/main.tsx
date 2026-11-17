import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadDB } from './store'
import { handleAuthReturn } from './google'
import { afterAuth, initSync } from './sync'
import './styles.css'

const auth = handleAuthReturn()
void loadDB().then(() => {
  initSync()
  afterAuth(auth)
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
