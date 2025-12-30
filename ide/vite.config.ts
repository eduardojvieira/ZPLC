import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Use relative paths for Electron production build
  base: './',
  server: {
    port: 3000,
    open: false, // Don't auto-open browser, Electron will handle it
  },
  build: {
    // Generate source maps for debugging
    sourcemap: true,
    // Optimize chunk size
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          'react-vendor': ['react', 'react-dom'],
          'monaco': ['@monaco-editor/react'],
          'xyflow': ['@xyflow/react'],
        },
      },
    },
  },
})
