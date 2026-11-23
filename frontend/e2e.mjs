// 端到端回归：把「答辩前要人工点一遍」的链路自动化
// 用法：先起无头 Chrome（带 --remote-debugging-port），再 `node e2e.mjs <port>`
// 任一断言失败 → 进程退出码 1，可以直接接进 CI
const PORT = Number(process.argv[2] || 9231)
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
if (!page) {
  console.log('NO PAGE')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const runtimeErrors = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
    return
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    runtimeErrors.push(d.exception?.description?.split('\n')[0] || d.text)
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const mid = ++id
    pending.set(mid, r)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
await new Promise((r) => ws.addEventListener('open', r))
await send('Runtime.enable')

const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.result?.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 常用小工具，都注入到页面里执行 */
const PAGE_HELPERS = `
window.__t = {
  text: () => document.body.innerText,
  click: (label, scope) => {
    const root = scope ? document.querySelector(scope) : document
    const btn = [...(root?.querySelectorAll('button, a') || [])].find(
      (b) => b.textContent.replace(/\\s+/g, '').trim() === label.replace(/\\s+/g, ''),
    )
    if (!btn) return 'NOT_FOUND:' + label
    btn.click()
    return 'OK'
  },
  fill: (selector, value) => {
    const el = document.querySelector(selector)
    if (!el) return 'NOT_FOUND:' + selector
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'OK'
  },
  fillByPlaceholder: (ph, value) => {
    const el = [...document.querySelectorAll('input, textarea')].find((i) => i.placeholder === ph)
    if (!el) return 'NOT_FOUND:' + ph
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'OK'
  },
  rows: () => [...document.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\\s+/g, ' ').trim()),
  points: () => {
    const m = document.body.innerText.match(/可用积分\\s*([\\d,]+)/)
    return m ? Number(m[1].replace(/,/g, '')) : null
  },
  toast: () => document.querySelector('.toast')?.innerText.trim() || '',
}
'ready'
`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  → ' + detail : ''}`)
}

async function login(account, password = '123456', keepData = false) {
  // keepData=true 时只清会话（相当于"退出登录"），保留 localStorage 里的 mock 库，
  // 用来验证"退出重登 / 刷新页面后数据还在"（评审 #38）。
  await ev(
    `sessionStorage.clear(); ${keepData ? '' : 'localStorage.clear();'} location.reload()`,
  )
  await wait(2400)
  await ev(`location.hash = '#/login'`)
  await wait(800)
  await ev(PAGE_HELPERS)
  await ev(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(inputs[0], '${account}'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    s.call(inputs[1], '${password}'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await wait(300)
  await ev(`__t.click('登录')`)
  await wait(2200)
  await ev(PAGE_HELPERS)
}

console.log('\n=== 1. 登录 ===')
await login('13800138000')
check('登录后进入首页', (await ev('location.hash')) === '#/app', await ev('location.hash'))
check('首页渲染出积分余额', (await ev('__t.points()')) !== null, String(await ev('__t.points()')))

const balanceBefore = await ev('__t.points()')

console.log('\n=== 2. 上报行程 ===')
await ev(`__t.click('填入示例')`)
await wait(400)
const previewText = await ev('__t.text()')
check('选了方式后出现预估减排', /预计减排/.test(previewText))
const mileage = await ev(`[...document.querySelectorAll('input')].find(i => i.placeholder === '例如 8.6')?.value || ''`)
check('里程已填入', String(mileage).length > 0, String(mileage))
await ev(`__t.click('提交上报')`)
await wait(2600)
const afterSubmitHash = await ev('location.hash')
check('提交后跳到行程详情', /#\/app\/trips\/T/.test(afterSubmitHash), afterSubmitHash)

// 2.1 行程幂等：同键同输入回放原行程；同键不同输入（含**起终点**）必须拒绝
const tripKey = 'TR-E2E-DUP-' + Date.now()
const mkTripBody = (place) =>
  JSON.stringify({
    clientTripId: tripKey,
    mode: 'BUS',
    distanceKm: 8.8,
    startTime: '2026-11-01T08:00',
    endTime: '2026-11-01T08:40',
    startPlace: place[0],
    endPlace: place[1],
  })
const postTrip = (place) =>
  ev(
    `__carbonDebug.call({url:'/trips', method:'POST', body:${mkTripBody(place)},
      headers:{'Idempotency-Key':'${tripKey}'}})
      .then(t => t.tripId).catch(e => 'ERR:' + e.code)`
  )
const tripFirst = await postTrip(['A 站', 'B 站'])
const tripSecond = await postTrip(['A 站', 'B 站'])
check('行程同键同输入返回同一行程', tripFirst === tripSecond && /^T/.test(tripFirst), `${tripFirst} / ${tripSecond}`)
const tripPlacesChanged = await postTrip(['C 站', 'D 站'])
check('行程同键改起终点被拒（40904）', tripPlacesChanged === 'ERR:40904', tripPlacesChanged)

console.log('\n=== 3. 核算详情 ===')
const detailText = await ev('__t.text()')
check('详情展示了核算过程', /核算|因子/.test(detailText))
check('减排量按 6 位小数展示', /\d+\.\d{6}/.test(detailText), (detailText.match(/\d+\.\d{6}/) || [])[0] || '')
check('标注了核算单位 kgCO₂e', /kgCO₂e/.test(detailText))
check('注明展示值已舍入', /舍入|以服务端/.test(detailText))

console.log('\n=== 4. 积分账户 ===')
await ev(`location.hash = '#/app/points'`)
await wait(1600)
await ev(PAGE_HELPERS)
const balanceAfter = await ev('__t.points()')
check('上报后积分增加', balanceAfter !== null && balanceBefore !== null && balanceAfter > balanceBefore, `${balanceBefore} → ${balanceAfter}`)

console.log('\n=== 5. 商城兑换 ===')
await ev(`location.hash = '#/app/mall'`)
await wait(1600)
await ev(PAGE_HELPERS)
await ev(`(() => {
  const card = [...document.querySelectorAll('.goods')].find(g => !g.classList.contains('disabled'));
  card?.querySelector('a,button')?.click() ?? card?.click();
})()`)
await wait(1500)
await ev(PAGE_HELPERS)
const productHash = await ev('location.hash')
check('进入商品详情', /#\/app\/mall\/G/.test(productHash), productHash)
await ev(`__t.click('立即兑换')`)
await wait(800)
await ev(PAGE_HELPERS)
check('弹出兑换确认', (await ev(`!!document.querySelector('.modal.on')`)) === true)
await ev(`__t.click('确认兑换')`)
await wait(2400)
await ev(PAGE_HELPERS)
const toastAfterRedeem = await ev('__t.toast()')
check('兑换成功有提示', /兑换|成功/.test(toastAfterRedeem), toastAfterRedeem)

// 5.1 幂等：同一 requestId 重复提交，只能扣一次分、只能有一单
// （实测暴露过的问题：mock 收了 Idempotency-Key 却从不查重 → 超时重试就重复扣分）
// 选一件「积分够、还有库存」的最便宜商品，避免上一步 UI 兑换后余额不足导致假失败
const dupTarget = await ev(`(async () => {
  const [page, acc] = await Promise.all([
    __carbonDebug.call({url:'/mall/products', query:{page:1, size:50}}),
    __carbonDebug.call({url:'/points/account'})
  ]);
  const ok = page.items.filter(p => p.status === 'ON' && p.stock > 0 && p.points <= acc.balance)
                      .sort((a, b) => a.points - b.points);
  return ok.length ? { productId: ok[0].productId, points: ok[0].points } : null;
})()`)
check('找到可兑换的便宜商品用于幂等测试', !!dupTarget, dupTarget ? dupTarget.productId + ' / ' + dupTarget.points + ' 分' : '无')
const priceOne = dupTarget.points
const dupProductId = dupTarget.productId
const balanceBeforeDup = await ev(`__carbonDebug.call({url:'/points/account'}).then(a => a.balance)`)
const dupKey = 'RD-E2E-DUP-' + Date.now()
const dupBody = JSON.stringify({ productId: dupProductId, quantity: 1 })
const firstId = await ev(
  `__carbonDebug.call({url:'/mall/orders', method:'POST', body:${dupBody}, headers:{'Idempotency-Key':'${dupKey}'}})
    .then(o => o.orderId).catch(e => 'ERR:' + e.code)`
)
const secondId = await ev(
  `__carbonDebug.call({url:'/mall/orders', method:'POST', body:${dupBody}, headers:{'Idempotency-Key':'${dupKey}'}})
    .then(o => o.orderId).catch(e => 'ERR:' + e.code)`
)
check('同键重复提交返回同一订单（不新建）', firstId === secondId && /^O/.test(firstId), `${firstId} / ${secondId}`)
const balanceAfterDup = await ev(`__carbonDebug.call({url:'/points/account'}).then(a => a.balance)`)
check(
  '同键重复提交只扣一次积分',
  balanceBeforeDup - balanceAfterDup === priceOne,
  `${balanceBeforeDup} → ${balanceAfterDup}（应只扣 ${priceOne}）`
)
const mismatchBody = JSON.stringify({ productId: dupProductId, quantity: 2 })
const mismatch = await ev(
  `__carbonDebug.call({url:'/mall/orders', method:'POST', body:${mismatchBody}, headers:{'Idempotency-Key':'${dupKey}'}})
    .then(() => 'NO_ERROR').catch(e => 'ERR:' + e.code)`
)
check('同键换内容被拒（40904）', mismatch === 'ERR:40904', mismatch)

console.log('\n=== 6. 用户端订单（只读，不能取消） ===')
await ev(`location.hash = '#/app/orders'`)
await wait(1800)
await ev(PAGE_HELPERS)
const rowsBefore = await ev('__t.rows()')
const pendingRow = rowsBefore.findIndex((r) => r.includes('待发放'))
check('订单列表有「待发放」订单', pendingRow >= 0, `第 ${pendingRow + 1} 行`)

const listCancelCount = await ev(
  `[...document.querySelectorAll('tbody button')].filter((b) => b.textContent.trim() === '取消').length`,
)
check('用户端列表没有「取消」按钮', listCancelCount === 0, `找到 ${listCancelCount} 个`)

await ev(`(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find((t) => t.innerText.includes('待发放'));
  [...(tr?.querySelectorAll('button') || [])].find((b) => b.textContent.trim() === '详情')?.click();
})()`)
await wait(1200)
const drawerCancel = await ev(
  `[...document.querySelectorAll('.drawer.on button')].some((b) => b.textContent.trim() === '取消订单')`,
)
check('用户端详情也没有「取消订单」按钮', drawerCancel === false)

// 绕过界面直接打管理员取消接口：用户必须被拒
const userOrderId = await ev(`(document.querySelector('.drawer.on')?.innerText.match(/O\\d{12}/) || [''])[0]`)

await ev(`location.hash = '#/app/points'`)
await wait(1500)
await ev(PAGE_HELPERS)
const pointsBeforeAttempt = await ev('__t.points()')
const userCancelRes = await ev(
  `__carbonDebug.cancelOrder('${userOrderId}', '用户越权取消').then((o) => 'OK:' + o.status).catch((e) => 'ERR:' + (e.code || e.message))`,
)
check('用户直调管理员取消接口被拒（403）', /^ERR:(40301|403)/.test(String(userCancelRes)), String(userCancelRes))
await wait(300)
await ev(PAGE_HELPERS)
const pointsAfterUserCancel = await ev('__t.points()')
check(
  '用户取消失败后积分未变',
  pointsAfterUserCancel === pointsBeforeAttempt,
  `发起前 ${pointsBeforeAttempt} → 之后 ${pointsAfterUserCancel}`,
)

console.log('\n=== 7. 退出与重新登录 ===')
await ev(`document.querySelector('.avatar')?.click()`)
await wait(500)
await ev(`__t.click('退出登录')`)
await wait(1800)
check('退出后回到登录页', (await ev('location.hash')).startsWith('#/login'), await ev('location.hash'))
check('退出后 token 已清空', (await ev(`(sessionStorage.getItem('carbon_token') || '')`)) === '')

await login('13800138000')
check('重新登录成功', (await ev('location.hash')) === '#/app', await ev('location.hash'))

console.log('\n=== 8. 越权与登录过期 ===')
await ev(`location.hash = '#/admin/dashboard'`)
await wait(1600)
check('普通用户访问管理端被拦到 403', (await ev('location.hash')) === '#/403', await ev('location.hash'))

await ev(`location.hash = '#/app/orders'`)
await wait(1200)
await ev(`window.dispatchEvent(new CustomEvent('app:unauthorized'))`)
await wait(1500)
const hash401 = await ev('location.hash')
check('登录过期跳登录并带 redirect', hash401.startsWith('#/login'), hash401)
check('登录过期清空 token', (await ev(`(sessionStorage.getItem('carbon_token') || '')`)) === '')
await ev(`location.hash = '#/app/points'`)
await wait(1300)
check('过期后不能再进业务页', (await ev('location.hash')).startsWith('#/login'), await ev('location.hash'))

console.log('\n=== 8.5 迟到的 401 不能踢掉新会话（两条真实路径 + 真实重新登录） ===')
// 评审要求：不能只靠 setToken 伪造新 token，必须走真实登录接口重新登录；
// 且 HTTP 401 与「HTTP 200 + 业务码 40100」两条路径都要各自验一遍。
for (const mode of ['http', 'biz']) {
  await login('13800138000')
  await ev(`location.hash = '#/app/points'`)
  await wait(1300)
  await ev(PAGE_HELPERS)
  check(`[${mode}] 发起迟到请求前停在积分页`, (await ev('location.hash')) === '#/app/points', await ev('location.hash'))

  // 慢请求带着「旧 token」出发。用逗号表达式返回字符串，避免 awaitPromise 把脚本卡住。
  await ev(`(window.__late401 = __carbonDebug.slow401(1500, '${mode}').catch((e) => 'ERR:' + (e.code || e.message)), 'fired')`)
  await wait(250)

  // 期间用户真的重新登录了一次（POST /auth/login → store 更新 → 换 token）
  const reloginOk = await ev(`__carbonDebug.loginVia('13800138000', '123456').then(() => 'ok').catch((e) => 'ERR:' + (e.message))`)
  check(`[${mode}] 重新登录成功`, reloginOk === 'ok', reloginOk)
  const tokenAfterRelogin = await ev(`sessionStorage.getItem('carbon_token')`)

  await wait(2200)
  const lateHash = await ev('location.hash')
  check(`[${mode}] 旧请求的迟到 401 没有把新会话踢回登录页`, lateHash.startsWith('#/app/'), lateHash)
  check(
    `[${mode}] 重新登录后的 token 没被旧请求清掉`,
    (await ev(`sessionStorage.getItem('carbon_token')`)) === tokenAfterRelogin,
    'token 变化'
  )
  check(`[${mode}] 迟到 401 没有弹"登录已过期"`, (await ev('__t.toast()')).indexOf('登录已过期') < 0, await ev('__t.toast()'))
}

console.log('\n=== 9. 管理端写操作（履约 / 商品维护） ===')
await login('admin')
check('管理员登录进入概览', (await ev('location.hash')) === '#/admin/dashboard', await ev('location.hash'))

// 9.1 订单履约：待发放 → 已完成
await ev(`location.hash = '#/admin/orders'`)
await wait(1800)
await ev(PAGE_HELPERS)
const adminRows = await ev('__t.rows()')
check('管理端有「待履约」订单', adminRows.some((r) => r.includes('待发放')), adminRows[0] || '')
await ev(`(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find((t) => t.innerText.includes('待发放'));
  tr?.click();
})()`)
await wait(1200)
await ev(PAGE_HELPERS)
check('抽屉里出现「确认发放」', (await ev(`[...document.querySelectorAll('.drawer.on button')].some(b => b.textContent.trim() === '确认发放')`)) === true)
await ev(`__t.click('确认发放', '.drawer.on')`)
await wait(600)
await ev(PAGE_HELPERS)
check('发放前有二次确认', (await ev(`!!document.querySelector('.modal.on')`)) === true)
await ev(`__t.click('确认发放', '.modal.on')`)
await wait(2400)
await ev(PAGE_HELPERS)
const fulfillToast = await ev('__t.toast()')
check('发放成功有提示', /已发放/.test(fulfillToast), fulfillToast)
const rowsAfterFulfill = await ev('__t.rows()')
check('发放后不再是待发放', rowsAfterFulfill.filter((r) => r.includes('待发放')).length < adminRows.filter((r) => r.includes('待发放')).length)

// 9.2 商品维护：下架 + 改库存
await ev(`location.hash = '#/admin/products'`)
await wait(1800)
await ev(PAGE_HELPERS)
check(
  '商品表出现编辑/下架按钮',
  (await ev(`[...document.querySelectorAll('tbody button')].filter((b) => b.textContent.trim() === '编辑').length`)) > 0,
)
await ev(`(() => {
  const tr = document.querySelector('tbody tr');
  [...tr.querySelectorAll('button')].find((b) => b.textContent.trim() === '下架')?.click();
})()`)
await wait(2200)
await ev(PAGE_HELPERS)
check('下架后该行显示已下架', (await ev('__t.rows()')).some((r) => r.includes('已下架')))
check('下架成功有提示', /已下架/.test(await ev('__t.toast()')), await ev('__t.toast()'))

await ev(`__t.click('编辑')`)
await wait(700)
await ev(PAGE_HELPERS)
check('编辑弹窗打开', (await ev(`!!document.querySelector('.modal.on')`)) === true)
await ev(`__t.fill('#stock', '99')`)
await wait(300)
await ev(`__t.click('保存')`)
await wait(2400)
await ev(PAGE_HELPERS)
check('改库存后表格显示 99', (await ev('__t.rows()')).some((r) => / 99 /.test(' ' + r + ' ')))

// 9.3 商品 PATCH 原子性：一个字段非法，整条请求不生效
const patchBefore = await ev(
  `__carbonDebug.patchProduct('G02', {}).then((p) => p.points + '/' + p.stock).catch((e) => 'ERR:' + e.message)`,
)
const patchBad = await ev(
  `__carbonDebug.patchProduct('G02', { points: 601, stock: -1 }).then((p) => 'OK:' + p.points).catch((e) => 'ERR:' + (e.code || e.message))`,
)
check('非法商品 PATCH 被拒（40042）', /^ERR:40042/.test(String(patchBad)), String(patchBad))
const patchAfter = await ev(
  `__carbonDebug.patchProduct('G02', {}).then((p) => p.points + '/' + p.stock).catch((e) => 'ERR:' + e.message)`,
)
check('失败的商品 PATCH 没有改动任何字段', patchBefore === patchAfter, `${patchBefore} → ${patchAfter}`)

console.log('\n=== 10. 管理员取消：只返还一次（BR-06 幂等） ===')
// 取消要把积分退给"下单人"，管理员账号本身没有这笔订单，
// 所以操作在管理员端做、验证在下单人账号里做（这就是"退给谁"的语义检查）。
const USER_ACCOUNT = '13800138000'
const walletExpr = (orderId) => `(async () => {
  const a = await __carbonDebug.call({ url: '/points/account' })
  const f = await __carbonDebug.call({ url: '/points/flows', query: { page: 1, size: 50 } })
  const items = (f && f.items) || []
  const linked = items.filter((x) => x.refId === ${JSON.stringify(orderId)} && x.type === 'REVERSE')
  return JSON.stringify({ balance: a.balance, linked: linked.length, amount: linked[0] ? linked[0].amount : 0 })
})()`

await login(USER_ACCOUNT, '123456', true)
// 第 9 节已经把演示数据里唯一一单「待发放」履约掉了，所以这里自己下一单来测取消，
// 避免用例之间互相吃数据（顺序一变就红）。
const newOrderId = await ev(`(async () => {
  try {
    const acc = await __carbonDebug.call({ url: '/points/account' })
    const page = await __carbonDebug.call({ url: '/mall/products', query: { page: 1, size: 50 } })
    const list = (page && page.items) || []
    const pick = list.find((p) => p.status === 'ON' && p.stock > 0 && p.points <= acc.balance)
    if (!pick) return 'NO_PRODUCT(balance=' + acc.balance + ',count=' + list.length + ')'
    const o = await __carbonDebug.call({
      url: '/mall/orders',
      method: 'POST',
      body: { productId: pick.productId, quantity: 1 },
      headers: { 'Idempotency-Key': 'e2e-cancel-' + Date.now() },
    })
    return o.orderId
  } catch (e) {
    return 'ERR:' + (e && (e.code || e.message))
  }
})()`)
check('下单成功（用于取消用例）', /^O\d{12}$/.test(String(newOrderId)), String(newOrderId))
const balBeforeRaw = await ev(`__carbonDebug.call({ url: '/points/account' }).then((a) => a.balance)`)
const balBefore = Number(balBeforeRaw)

await login('admin', '123456', true)
await ev(`location.hash = '#/admin/orders'`)
await wait(1800)
await ev(PAGE_HELPERS)
const adminOrderId = String(newOrderId)
check(
  '管理端能找到这单待发放订单',
  (await ev('__t.rows()')).some((r) => r.includes('待发放')),
  `orderId=${adminOrderId}`,
)

const cancelExpr = `__carbonDebug
  .cancelOrder('${adminOrderId}', '回归测试：运营取消')
  .then((o) => JSON.stringify({ s: o.status, p: o.totalPoints }))
  .catch((e) => 'ERR:' + (e.code || e.message))`
const firstCancel = await ev(cancelExpr)
let firstParsed = null
try {
  firstParsed = JSON.parse(String(firstCancel))
} catch {
  /* 失败时留空，下面断言会红 */
}
check('管理员取消成功', firstParsed?.s === 'CANCELLED', String(firstCancel))

const secondCancel = await ev(cancelExpr)
check(
  '重复取消返回原结果、不报 409',
  String(secondCancel) === String(firstCancel),
  `第一次 ${firstCancel} / 第二次 ${secondCancel}`,
)

await ev(`location.hash = '#/admin/orders'`)
await wait(1800)
await ev(PAGE_HELPERS)
check('管理端列表里该订单已取消', (await ev('__t.rows()')).some((r) => r.includes('已取消')))

// 换回下单人账号看余额与冲正流水（mock 已落 localStorage，keepData=true 保留数据）
await login(USER_ACCOUNT, '123456', true)
let walletAfter = null
try {
  walletAfter = JSON.parse(String(await ev(walletExpr(adminOrderId))))
} catch {
  walletAfter = null
}
const orderPoints = firstParsed?.p ?? 0
check(
  '积分退给了下单人（不是当前操作的管理员）',
  walletAfter?.balance === balBefore + orderPoints,
  `${balBefore} + ${orderPoints} = ${walletAfter?.balance}`,
)
check('下单人只收到一条冲正流水', walletAfter?.linked === 1, `linked=${walletAfter?.linked}`)

// 再取消一次，确认"只返还一次"：余额不动、流水不增加
await login('admin', '123456', true)
await ev(cancelExpr)
await ev(cancelExpr)
await login(USER_ACCOUNT, '123456', true)
let walletFinal = null
try {
  walletFinal = JSON.parse(String(await ev(walletExpr(adminOrderId))))
} catch {
  walletFinal = null
}
check(
  '重复取消不再返还原额',
  walletFinal?.balance === walletAfter?.balance,
  `第一次后 ${walletAfter?.balance} / 再取消两次后 ${walletFinal?.balance}`,
)
check('重复取消不再新增冲正流水', walletFinal?.linked === 1, `linked=${walletFinal?.linked}`)
console.log('\n=== 11. 积分对账：三态 + 账户级差异 ===')
// 对账是管理端页面，先确保是管理员会话（第 10 节结束时停在下单人账号）
await login('admin', '123456', true)
// 断言必须打在"结果面板"上，不能全页搜关键词：
// 页面常驻的演示说明里就有"无法判断/读取失败"，按钮本身也叫"读取失败"，
// 全页搜索会在"错误地显示成无差异"时依然通过（上一轮评审指出的问题）。
await ev(`location.hash = '#/admin/reconciliation'`)
await wait(1600)
await ev(PAGE_HELPERS)

// 11.1 初始正常态：默认无差异
const initState = await ev(`(() => ({
  empty: !!document.querySelector('[data-check="recon-empty"]'),
  error: !!document.querySelector('[data-check="recon-error"]'),
  diff: !!document.querySelector('[data-check="recon-diff"]'),
}))()`)
check('初始态显示"无差异"面板', initState?.empty === true, JSON.stringify(initState))
check('初始态不显示读取失败面板', initState?.error === false)

// 11.2 有差异态
await ev(`__t.click('有差异')`)
await wait(1600)
const reconRows = await ev('__t.rows()')
const allReconText = reconRows.join(' | ')
check('有差异态出现差异表', await ev(`!!document.querySelector('[data-check="recon-diff"]')`))
check('有差异态不显示无差异面板', await ev(`!document.querySelector('[data-check="recon-empty"]')`))
check('差异项含行程级', /行程/.test(allReconText))
check('差异项含订单级', /订单/.test(allReconText))
// 账户级差异：objectType=ACCOUNT（以前类型只允许 TRIP|ORDER，这条会被迫塞进 ORDER，语义就错了）
check('差异项含账户级（objectType=ACCOUNT）', /账户/.test(allReconText), allReconText.slice(0, 80))
// 账户级的第二种粒度：流水逐笔，objectId 是 `userId#流水序号`（如 U001#7），不能假设是纯 userId
check('差异项含流水逐笔（objectId=userId#序号）', /流水序号不连续/.test(allReconText) && /#\d+/.test(allReconText), allReconText.slice(-90))

// 11.3 读取失败态：必须命中专用面板，且无差异/差异表都不出现
await ev(`__t.click('读取失败')`)
await wait(1600)
const failState = await ev(`(() => ({
  error: !!document.querySelector('[data-check="recon-error"]'),
  title: (document.querySelector('[data-check="recon-error-title"]') || {}).textContent || '',
  empty: !!document.querySelector('[data-check="recon-empty"]'),
  diff: !!document.querySelector('[data-check="recon-diff"]'),
}))()`)
check('读取失败显示专用面板', failState?.error === true, JSON.stringify(failState))
check('失败面板标题是"核对结果读取失败"', String(failState?.title).trim() === '核对结果读取失败', String(failState?.title))
check('读取失败时不显示"无差异"面板', failState?.empty === false)
check('读取失败时不显示差异表', failState?.diff === false)

console.log('\n=== 12. 注册（P0 #11）===')
// 12.1 重复手机号：演示账号 13800138000 已存在 → 40906
await ev(`sessionStorage.clear(); localStorage.clear(); location.reload()`)
await wait(2200)
await ev(PAGE_HELPERS)
await ev(`location.hash = '#/register'`)
await wait(1200)
await ev(PAGE_HELPERS)
await ev(`__t.fill('#phone', '13800138000')`)
await ev(`__t.fill('#pwd', '123456')`)
await ev(`__t.fill('#pwd2', '123456')`)
await ev(`__t.click('提交注册')`)
await wait(1400)
const dupText = await ev('__t.text()')
check('重复手机号被拒（40906）', /已注册|该手机号已注册/.test(dupText), dupText.replace(/\n/g, ' ').slice(-120))
check('注册失败后没进首页', !String(await ev('location.hash')).startsWith('#/app'), String(await ev('location.hash')))

// 12.2 密码太短：前端先拦（不发请求），提示 6-32 位
await ev(`__t.fill('#phone', '13900001111')`)
await ev(`__t.fill('#pwd', '123')`)
await ev(`__t.fill('#pwd2', '123')`)
await ev(`__t.click('提交注册')`)
await wait(600)
check('弱密码被拦并提示长度', /6-32/.test(await ev('__t.text()')))

// 12.3 正常注册：新手机号 + 昵称 → 直接进首页，且是空数据账号
const regPhone = '1390000' + String(Date.now()).slice(-4)
await ev(`__t.fill('#phone', '${regPhone}')`)
await ev(`__t.fill('#nickname', '新同学')`)
await ev(`__t.fill('#pwd', 'abc123456')`)
await ev(`__t.fill('#pwd2', 'abc123456')`)
await ev(`__t.click('提交注册')`)
await wait(2600)
const afterRegHash = String(await ev('location.hash'))
check('注册成功后进入用户端', afterRegHash.startsWith('#/app'), afterRegHash)
await ev(PAGE_HELPERS)
const regText = await ev('__t.text()')
check('注册后的账号昵称生效', /新同学/.test(regText))
check('新账号积分从 0 开始', /当前可用积分[\s\S]{0,20}0\s*分|\b0\s*分/.test(regText), regText.replace(/\n/g, ' ').slice(0, 120))
check('新账号行程为空态（不是演示数据）', /还没有|暂无|去上报/.test(regText), regText.replace(/\n/g, ' ').slice(0, 160))

// 12.4 新账号能直接上报一条行程（注册→上报闭环）
await ev(`location.hash = '#/app/trips/new'`)
await wait(1500)
await ev(PAGE_HELPERS)
await ev(`__t.fillByPlaceholder('例如 8.6', '5')`)
await ev(`__t.fillByPlaceholder('例如 软件园东门', '宿舍')`)
await ev(`__t.fillByPlaceholder('例如 地铁二号线站', '教学楼')`)
await wait(200)
await ev(`__t.click('提交上报')`)
await wait(2800)
const newTripHash = String(await ev('location.hash'))
check('新账号上报行程后跳详情', /^#\/app\/trips\/T/.test(newTripHash), newTripHash)
await ev(PAGE_HELPERS)
check('新账号拿到了真实 tripId（服务端生成）', /T\d{8}\d{4}/.test(await ev('__t.text()')))

console.log('\n=== 13. 数据保留（评审 #38：退出重登 / 刷新都不丢）===')
// 此刻是 12 节新注册的账号，已上报过 1 条行程

// 13.1 刷新页面：token 还在 → 仍是登录态，数据没被重新播种
await ev('location.reload()')
await wait(2800)
await ev(PAGE_HELPERS)
const hashAfterReload = String(await ev('location.hash'))
check('刷新页面后仍在业务页（不会掉回登录页）', hashAfterReload.startsWith('#/app'), hashAfterReload)
await ev(`location.hash = '#/app/trips'`)
await wait(1600)
await ev(PAGE_HELPERS)
const rowsAfterReload = (await ev('__t.rows()')) ?? []
check('刷新后该账号的行程还在', rowsAfterReload.length >= 1, `rows=${rowsAfterReload.length}`)

// 13.2 退出登录 → 用「注册时自己设的密码」重新登录 → 回到同一个账号
await ev(`__carbonDebug.call({url:'/auth/logout', method:'POST'})`)
await login(regPhone, 'abc123456', true)
const backText = await ev('__t.text()')
check('用注册时设的密码能登回原账号', /新同学/.test(backText), backText.replace(/\n/g, ' ').slice(0, 100))
check('登回的是注册账号，不是演示账号', !/张生阳/.test(backText), backText.replace(/\n/g, ' ').slice(0, 100))

// 13.3 演示账号：新上报一条 → 退出 → 重登 → 那条还在（登录不再重置数据）
await login('13800138000', '123456', true)
const demoBefore = await ev(
  `__carbonDebug.call({url:'/trips', query:{page:1, size:50}}).then(p => p.total)`,
)
const keepKey = 'TR-E2E-KEEP-' + Date.now()
const keepTripId = await ev(`(async () => {
  const now = Date.now();
  const r = await __carbonDebug.call({
    url: '/trips', method: 'POST',
    headers: { 'Idempotency-Key': '${keepKey}' },
    body: {
      clientTripId: '${keepKey}', mode: 'BUS', distanceKm: 6.6,
      startTime: new Date(now - 3600000).toISOString(),
      endTime: new Date(now - 60000).toISOString(),
      startPlace: '图书馆', endPlace: '宿舍',
    },
  });
  return r.tripId;
})()`)
check('演示账号能正常上报（拿到服务端 tripId）', /^T\d{8}\d{4}$/.test(String(keepTripId)), String(keepTripId))

await ev(`__carbonDebug.call({url:'/auth/logout', method:'POST'})`)
await login('13800138000', '123456', true)
const demoAfter = await ev(
  `__carbonDebug.call({url:'/trips', query:{page:1, size:50}}).then(p => p.total)`,
)
check(
  '演示账号退出重登后数据仍在（没被重新播种）',
  Number(demoAfter) === Number(demoBefore) + 1,
  `${demoBefore} → ${demoAfter}`,
)
const keepTripVisible = await ev(
  `__carbonDebug.call({url:'/trips', query:{page:1, size:50, keyword:'图书馆'}}).then(p => p.total)`,
)
check('重登后能查到退出前上报的那条行程', Number(keepTripVisible) >= 1, `total=${keepTripVisible}`)
const keepFlow = await ev(
  `__carbonDebug.call({url:'/points/flows', query:{page:1, size:50}}).then(p => p.items.filter(f => f.refId === '${keepTripId}').length)`,
)
check('重登后那条行程的加分流水也还在（恰好一条）', Number(keepFlow) === 1, `flows=${keepFlow}`)

console.log('\n=== 运行时报错 ===')
check('全程无未捕获异常', runtimeErrors.length === 0, runtimeErrors.slice(0, 3).join(' | '))

const failed = results.filter((r) => !r.ok)
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  console.log('失败项：' + failed.map((f) => f.name).join('、'))
}
ws.close()
process.exit(failed.length ? 1 : 0)
