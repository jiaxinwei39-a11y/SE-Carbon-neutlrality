/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  /** 数据来源：mock | api。桌面演示默认 mock，接后端时改成 api */
  readonly VITE_DATA_SOURCE: 'mock' | 'api'
  /** 后端接口基地址，接后端时填写，例如 http://localhost:8080 */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
