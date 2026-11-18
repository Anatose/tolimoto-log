import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const stub = fileURLToPath(new URL('./src/jspdfStub.ts', import.meta.url))

export default defineConfig({
  base: './',
  resolve: { alias: { html2canvas: stub, dompurify: stub, canvg: stub } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      // fonts for the PDF export, so it also works offline
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf}'] },
      manifest: {
        name: 'Tolimoto Log',
        short_name: 'Tolimoto Log',
        description: 'Vehicle maintenance and fuel log',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        background_color: '#0F1215',
        theme_color: '#0F1215',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
