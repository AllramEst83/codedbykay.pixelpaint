import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

// Read version from package.json
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        '__APP_VERSION__': JSON.stringify(packageJson.version)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              // Separate PixiJS into its own chunk (large library)
              'pixi': ['pixi.js'],
              // Separate lightbox into its own chunk
              'lightbox': ['yet-another-react-lightbox'],
              // Separate confetti into its own chunk
              'confetti': ['canvas-confetti'],
              // Group React vendor libraries
              'react-vendor': ['react', 'react-dom'],
            }
          }
        },
        chunkSizeWarningLimit: 1000, // Increase limit to 1MB for large libraries
      }
    };
});
