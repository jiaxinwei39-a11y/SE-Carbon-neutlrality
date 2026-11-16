/**
 * 真实网络路径回归：401 必须走 axios 拦截器，而不是 mock 里直接 throw。
 *
 * 前提：
 *   1) 用 api 模式打一份单文件包，指向本机 stub 服务：
 *        $env:VITE_DATA_SOURCE='api'; $env:VITE_API_BASE_URL='http://127.0.0.1:8899/api'
 *        npx vite build --mode single --outDir dist-api
 *   2) 起一个无头 Chrome 打开 dist-api/index.html
 *   3) node e2e-api401.mjs <调试端口>
 *
 * 验证两件事（各跑 http / biz 两条路径）：
 *   A. 当前会话收到 401 → 清 token、回登录页，并带 redirect
 *   B. 旧会话的迟到 401 → **不能**踢掉重新登录后的新会话
 */
import { startStub } from './tools/stub-api.mjs'

const port = process.argv[2]
if (!port) {
  console.error('用法：node e2e-api401.mjs <chrome 调试端口>')
  process.exit(2)
}

const STUB_PORT = 8899
let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}${detail ? '  → ' + detail : ''}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`)
  }
}

/* ---------- CDP 连接（和 e2e.mjs 同一套写法） ---------- */
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const exceptions = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') {
    exceptions.push(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text)
  }
  if (pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
await new Promise((r) => (ws.onopen = r))
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
await send('Runtime.enable')
await send('Page.enable')

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) return 'EXC:' + (r.result.exceptionDetails.text ?? 'error')
  return r.result?.result?.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- 起 stub 服务 ---------- */
const stub = await startStub(STUB_PORT)
console.log(`stub api on ${STUB_PORT}`)

const dataSource = await ev('__carbonDebug?.dataSource')
check('页面以 api 模式启动（不是 mock）', dataSource === 'api', String(dataSource))

async function loginByUI() {
  await ev(`location.hash = '#/login'`)
  await wait(1000)
  await ev(`(() => {
    const i = [...document.querySelectorAll('input')]
    i[0].value = '13800138000'; i[0].dispatchEvent(new Event('input', { bubbles: true }))
    i[1].value = '123456';      i[1].dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await wait(300)
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '登录')?.click()`)
  await wait(1800)
}

/* ---------- A. 当前会话的 401：必须退出登录 ---------- */
console.log('\n=== A. 当前会话收到 401（真实 HTTP）===')
await loginByUI()
check('登录成功进入首页', (await ev('location.hash')) === '#/app', await ev('location.hash'))
await ev(`location.hash = '#/app/points'`)
await wait(1500)

await ev(`__carbonDebug.slow401(200, 'http').catch(() => 'expected-401')`)
await wait(2500)
const hashAfter401 = await ev('location.hash')
check('HTTP 401 后回到登录页', /^#\/login/.test(hashAfter401), hashAfter401)
check('HTTP 401 后 token 已清空', !(await ev(`sessionStorage.getItem('carbon_token')`)), 'token 已清')

/* ---------- B. 旧会话的迟到 401：不能踢掉新会话 ---------- */
for (const mode of ['http', 'biz']) {
  console.log(`\n=== B. 迟到 401 不踢新会话（${mode}）===`)
  await loginByUI()
  await ev(`location.hash = '#/app/points'`)
  await wait(1500)

  // 先发出慢请求（不 await），200ms 后重新登录换新 token
  await ev(`(window.__late = __carbonDebug.slow401(1500, '${mode}').catch(e => 'caught:' + e.code), 'fired')`)
  await wait(200)
  const relogin = await ev(
    `__carbonDebug.loginVia('13800138000', '123456').then(u => u.nickname).catch(e => 'ERR:' + e.code)`
  )
  check(`[${mode}] 重新登录成功`, relogin === '张生阳', String(relogin))
  const tokenAfterRelogin = await ev(`sessionStorage.getItem('carbon_token')`)

  await wait(2200) // 等慢请求的 401 回来
  const hashLate = await ev('location.hash')
  check(`[${mode}] 迟到 401 没有把人踢回登录页`, /^#\/app/.test(hashLate), hashLate)
  check(`[${mode}] 新 token 没被清掉`, (await ev(`sessionStorage.getItem('carbon_token')`)) === tokenAfterRelogin)
  check(`[${mode}] 没有弹「登录已过期」`, !/登录已过期/.test(String(await ev(`document.body.textContent`))))
}

console.log('\n=== 运行时报错 ===')
check('全程无未捕获异常', exceptions.length === 0, exceptions.join(' | '))

stub.close()
ws.close()
console.log(`\n结果：${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
