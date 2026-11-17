import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 两种构建：
 *   npm run build        → 常规多文件 dist（将来部署到 Nginx 用）
 *   npm run build:single → 单文件 dist/index.html（桌面窗口用）
 *
 * 为什么要单文件：窗口直接用 file:// 打开时，浏览器会以「跨域」为由
 * 拒绝加载 <script type="module">，页面就是白屏。把 JS/CSS 全部内联进
 * index.html，就不存在跨域问题了。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * 开发期跨域只有两条路：
   *   A. 走 Vite 代理（推荐，后端零改动）：前端请求 /api/xxx，由 dev server 转发到后端。
   *      在 .env.local 写 VITE_PROXY_TARGET=http://localhost:8080 即可。
   *   B. 后端自己放行 CORS（生产部署到 Nginx 时也是这条路），这时把
   *      VITE_API_BASE_URL 直接写成完整地址 http://<后端>:8080/api。
   */
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8080'

  return {
    base: './',
    plugins: [vue(), ...(mode === 'single' ? [viteSingleFile()] : [])],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: mode === 'single' ? 'dist-app' : 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        // [接后端] 只代理 /api，避免把前端自己的静态资源也转走
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
