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

async function login(account) {
  await ev(`sessionStorage.clear(); localStorage.clear(); location.reload()`)
  await wait(2400)
  await ev(`location.hash = '#/login'`)
  await wait(800)
  await ev(PAGE_HELPERS)
  await ev(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(inputs[0], '${account}'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    s.call(inputs[1], '123456'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
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

console.log('\n=== 6. 订单与取消 ===')
await ev(`location.hash = '#/app/orders'`)
await wait(1800)
await ev(PAGE_HELPERS)
const rowsBefore = await ev('__t.rows()')
const pendingRow = rowsBefore.findIndex((r) => r.includes('待发放'))
check('订单列表有「待发放」订单', pendingRow >= 0, `第 ${pendingRow + 1} 行`)
await ev(`(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(t => t.innerText.includes('待发放'));
  [...(tr?.querySelectorAll('button') || [])].filter(b => b.textContent.trim() === '取消').forEach(b => b.click());
})()`)
await wait(800)
await ev(PAGE_HELPERS)
check('取消弹窗打开', (await ev(`!!document.querySelector('.modal.on')`)) === true)
await ev(`__t.fill('.modal textarea', '回归测试：主动取消')`)
await wait(300)
await ev(`__t.click('确认取消')`)
await wait(2400)
await ev(PAGE_HELPERS)
const rowsAfter = await ev('__t.rows()')
check('订单状态变为已取消', rowsAfter.some((r) => r.includes('已取消')), rowsAfter.find((r) => r.includes('已取消')) || '')
await ev(`location.hash = '#/app/points'`)
await wait(1500)
await ev(PAGE_HELPERS)
const pointsAfterCancel = await ev('__t.points()')
check('取消后积分原额返还', pointsAfterCancel === balanceAfter, `兑换前 ${balanceAfter} → 取消后 ${pointsAfterCancel}`)

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

console.log('\n=== 运行时报错 ===')
check('全程无未捕获异常', runtimeErrors.length === 0, runtimeErrors.slice(0, 3).join(' | '))

const failed = results.filter((r) => !r.ok)
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  console.log('失败项：' + failed.map((f) => f.name).join('、'))
}
ws.close()
process.exit(failed.length ? 1 : 0)
