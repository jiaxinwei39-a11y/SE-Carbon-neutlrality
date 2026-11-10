// 预加载脚本：故意保持"空"。
// 它证明 we 没有把 Node 能力暴露给页面——页面想拿数据，只能走 HTTP 接口，
// 接后端时不需要动这里。
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  version: process.versions.electron,
})
