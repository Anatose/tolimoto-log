import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadDB } from './store'
import './styles.css'

void loadDB()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
