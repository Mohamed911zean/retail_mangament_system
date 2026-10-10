import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Tailwind v4 is a Vite plugin, not a PostCSS chain: it compiles
  // `@import 'tailwindcss'` in `src/renderer/styles/app.css` and needs no config
  // file of its own (tokens live in CSS variables, design system §2).
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    target: 'chrome134',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
