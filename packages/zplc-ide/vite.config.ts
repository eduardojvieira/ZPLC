import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getRepoVersion(): string {
  try {
    const repoRoot = path.resolve(__dirname, '../..')
    return execSync('git describe --tags --always --dirty', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'dev'
  }
}

const repoVersion = getRepoVersion()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __ZPLC_REPO_VERSION__: JSON.stringify(repoVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Use relative paths for Electron production build
  base: './',
  server: {
    port: 3000,
    open: false, // Don't auto-open browser, Electron will handle it
    watch: {
      // Ignore project files to prevent HMR when saving zplc.json or user code
      // This is critical: editing files inside projects/ would trigger a page reload
      ignored: ['**/projects/**', '**/node_modules/**'],
    },
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
