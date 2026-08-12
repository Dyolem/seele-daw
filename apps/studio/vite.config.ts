import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import Icons from 'unplugin-icons/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  build: {
    // Soundbanks in public are developer-local validation inputs and must not ship.
    copyPublicDir: false,
  },
  plugins: [
    vue(),
    vueJsx(),
    Icons({
      compiler: 'vue3',
      scale: 1,
    }),
    vueDevTools(),
  ],
  resolve: {
    // Resolve aliases against the tsconfig selected for each importer, including workspace packages.
    tsconfigPaths: true,
  },
})
