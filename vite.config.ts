import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Wedding Planner',
        short_name: 'Wedding',
        description: 'Ruang perencanaan pernikahan pribadi untuk berdua.',
        lang: 'id',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        theme_color: '#C93B72',
        background_color: '#FFF7FA',
        icons: [
          { src: './icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: false }
    })
  ]
});
