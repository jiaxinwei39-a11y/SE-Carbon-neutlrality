// 用 CDP 登录后逐页截图，产出可看的效果图
import { writeFileSync } from 'node:fs'

const PORT = Number(process.argv[2] || 9226)
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const mid = ++id
    pending.set(mid, r)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
await new Promise((r) => ws.addEventListener('open', r))
await send('Page.enable')
await send('Runtime.enable')
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.result?.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function login(account) {
  await ev(`sessionStorage.clear(); localStorage.clear();`)
  await ev('location.reload()')
  await wait(2200)
  await ev(`location.hash = '#/login'`)
  await wait(600)
  await ev(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(inputs[0], ${JSON.stringify(account)});
    set(inputs[1], '123456');
  })()`)
  await wait(300)
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '登录')?.click()`)
  await wait(2200)
}

async function shot(hash, file, prepare) {
  await ev(`location.hash = '${hash}'`)
  await wait(1800)
  if (prepare) await prepare()
  await wait(1200)
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(r.result.data, 'base64'))
  console.log('saved', file)
}

await login('13800138000')
await shot('#/app', 'shot-home.png')
await shot('#/app/trips', 'shot-trips.png')
await shot('#/app/points', 'shot-points.png')
await shot('#/app/mall', 'shot-mall.png')
// 用户端订单：只读（无取消入口，#23）
await shot('#/app/orders', 'shot-orders.png')

await login('admin')
await shot('#/admin/dashboard', 'shot-admin-dashboard.png')
await shot('#/admin/reconciliation', 'shot-admin-recon.png', async () => {
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('有差异'))?.click()`)
})

// 管理端写操作（履约 / 商品维护）
await shot('#/admin/orders', 'shot-admin-orders.png', async () => {
  await ev(`(() => {
    const tr = [...document.querySelectorAll('tbody tr')].find((t) => t.innerText.includes('待发放'));
    tr?.click();
  })()`)
})
await shot('#/admin/products', 'shot-admin-product-edit.png', async () => {
  await ev(`[...document.querySelectorAll('tbody button')].find((b) => b.textContent.trim() === '编辑')?.click()`)
})
ws.close()
process.exit(0)
