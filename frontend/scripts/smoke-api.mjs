/**
 * 真实后端联调冒烟（不经过浏览器，直接用 Node 打 HTTP）
 *
 * 用途：接后端那天，先跑这个脚本，10 秒内知道「契约到底通没通」。
 * 它走的是和前端一样的链路：注册 → 登录 → 上报行程（含幂等）→ 积分账户/流水 → 行程详情。
 *
 * 用法：
 *   node scripts/smoke-api.mjs                       # 默认 http://localhost:8080/api
 *   node scripts/smoke-api.mjs http://192.168.1.23:8080/api
 *   BASE_API=... SKIP_REGISTER=1 node scripts/smoke-api.mjs   # 已有账号时跳过注册
 *
 * 退出码：全部通过 0，有失败 1（可接 CI，也可以直接看输出）。
 */
const BASE = (process.argv[2] || process.env.BASE_API || 'http://localhost:8080/api').replace(/\/$/, '')
const SKIP_REGISTER = process.env.SKIP_REGISTER === '1'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  → ${detail}` : ''}`)
}

const stamp = String(Date.now()).slice(-6)
/** 造一个合法的 11 位手机号：139 + 8 位数字 */
const mkPhone = (i = 0) => String(13900000000 + ((Number(stamp) + i * 7919) % 9000000))
const phone = process.env.TEST_PHONE || mkPhone(0)
const password = process.env.TEST_PASSWORD || 'abc123456'

async function call(method, path, { body, token, headers = {}, raw = false } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { code: -1, message: text.slice(0, 200), data: null }
  }
  if (raw) return { status: res.status, json }
  return { status: res.status, json, code: json?.code, data: json?.data, message: json?.message }
}

console.log(`\n后端地址：${BASE}\n`)

// 0. 后端活着吗
let health
try {
  health = await call('GET', '/points/account', { token: 'x', raw: true })
  check('后端可达（能返回 JSON 而不是连接失败）', true, `HTTP ${health.status}`)
} catch (e) {
  check('后端可达（能返回 JSON 而不是连接失败）', false, String(e.message || e))
  console.log('\n连不上后端：确认 Spring Boot 已启动、端口对、context-path 是 /api。\n')
  process.exit(1)
}

console.log('\n=== 1. 注册 ===')
if (SKIP_REGISTER) {
  console.log('  - 跳过（SKIP_REGISTER=1）')
} else {
  const r = await call('POST', '/auth/register', { body: { phone, password, nickname: '联调同学' } })
  check('注册成功', r.code === 0 && !!r.data?.token, `code=${r.code} ${r.message || ''}`)
  const dup = await call('POST', '/auth/register', { body: { phone, password } })
  check('重复手机号被拒（40906）', dup.code === 40906, `code=${dup.code}`)
  const weak = await call('POST', '/auth/register', { body: { phone: mkPhone(1), password: '123' } })
  check('弱密码被拒（40012）', weak.code === 40012, `code=${weak.code}`)
}

console.log('\n=== 2. 登录 ===')
const login = await call('POST', '/auth/login', { body: { account: phone, password } })
check('登录拿到 token', login.code === 0 && !!login.data?.token, `code=${login.code}`)
const token = login.data?.token
const user = login.data?.user
check('登录返回的 user 带 id / nickname / role', !!user?.id && !!user?.nickname && !!user?.role, JSON.stringify(user))

if (!token) {
  console.log('\n没有 token，后面没法测，先查登录接口。\n')
  process.exit(1)
}

const me = await call('GET', '/auth/me', { token })
check('GET /auth/me 认得这个 token', me.code === 0 && me.data?.id === user?.id, `id=${me.data?.id}`)

console.log('\n=== 3. 上报行程（幂等） ===')
const now = Date.now()
const payload = {
  clientTripId: `smoke-${now}`,
  mode: 'BUS',
  distanceKm: 10,
  startPlace: '联调起点',
  endPlace: '联调终点',
  startTime: new Date(now - 40 * 60 * 1000).toISOString(),
  endTime: new Date(now).toISOString(),
}
const key = payload.clientTripId
const t1 = await call('POST', '/trips', { body: payload, token, headers: { 'Idempotency-Key': key } })
check('上报成功', t1.code === 0 && !!t1.data?.tripId, `code=${t1.code} ${t1.message || ''}`)
const tripId = t1.data?.tripId
check('tripId 是服务端生成的（不是 clientTripId）', !!tripId && tripId !== key, String(tripId))
check('返回减排量与积分', Number(t1.data?.reductionKg) > 0 && Number(t1.data?.awardedPoints) > 0,
  `${t1.data?.reductionKg} kg / ${t1.data?.awardedPoints} 分`)

const t2 = await call('POST', '/trips', { body: payload, token, headers: { 'Idempotency-Key': key } })
check('同键同输入返回同一行程（不重复加积分）', t2.data?.tripId === tripId, `第2次=${t2.data?.tripId}`)

const t3 = await call('POST', '/trips', { body: { ...payload, startPlace: '换了个起点' }, token, headers: { 'Idempotency-Key': key } })
check('同键改输入被拒（40904）', t3.code === 40904, `code=${t3.code}`)

console.log('\n=== 4. 积分账户 / 流水 ===')
const acc = await call('GET', '/points/account', { token })
check('账户余额 >= 本次行程积分', acc.code === 0 && Number(acc.data?.balance) >= Number(t1.data?.awardedPoints),
  `balance=${acc.data?.balance} 本次=${t1.data?.awardedPoints}`)
check('累计获得 >= 本次积分', Number(acc.data?.totalEarned) >= Number(t1.data?.awardedPoints), `totalEarned=${acc.data?.totalEarned}`)

const flows = await call('GET', '/points/flows?page=1&size=10', { token })
const flowItems = flows.data?.items ?? []
check('流水列表有 EARN 记录', flowItems.some((f) => f.type === 'EARN'), `共 ${flowItems.length} 条`)
check('流水金额合计与账户一致（抽查最新一条）',
  flowItems.length ? Number(flowItems[0].balanceAfter) === Number(acc.data?.balance) : false,
  `最新 balanceAfter=${flowItems[0]?.balanceAfter} 账户=${acc.data?.balance}`)

console.log('\n=== 5. 行程详情 / 列表 ===')
const detail = await call('GET', `/trips/${tripId}`, { token })
check('详情能查到', detail.code === 0 && detail.data?.tripId === tripId)
check('详情带核算快照（baseFactor/modeFactor/pointsRatio/ruleVersion）',
  detail.data?.baseFactor !== undefined && detail.data?.modeFactor !== undefined &&
  detail.data?.pointsRatio !== undefined && detail.data?.ruleVersion !== undefined,
  `rule=${detail.data?.ruleVersion}`)
check('详情减排量是原始精度（不是 6 位截断）',
  detail.data?.reductionKg !== undefined && String(detail.data.reductionKg).replace('.', '').length > 6,
  String(detail.data?.reductionKg))

const list = await call('GET', '/trips?page=1&size=5', { token })
check('列表返回分页结构（items/total）', Array.isArray(list.data?.items) && typeof list.data?.total === 'number',
  `total=${list.data?.total}`)
check('列表里能翻到刚报的行程', (list.data?.items ?? []).some((x) => x.tripId === tripId))

console.log('\n=== 6. 越权（换个账号看不到别人的行程） ===')
if (!SKIP_REGISTER) {
  const otherPhone = mkPhone(2)
  const other = await call('POST', '/auth/register', { body: { phone: otherPhone, password } })
  const otherToken = other.data?.token
  if (otherToken) {
    const stolen = await call('GET', `/trips/${tripId}`, { token: otherToken })
    check('B 账号查 A 的行程被拒（404/403，不能返回数据）',
      stolen.code === 40401 || stolen.code === 40403 || stolen.status === 403 || stolen.status === 404,
      `code=${stolen.code} status=${stolen.status}`)
  } else {
    console.log('  - 第二个账号注册失败，跳过越权检查')
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  console.log('失败项：' + failed.map((f) => f.name).join('、'))
  console.log('\n排查顺序：① 后端有没有启动/端口对不对 ② context-path 是否 /api' +
    ' ③ 响应体是不是 {code,message,data} ④ 错误码是否和 docs/api-contract.md §1.6 一致\n')
}
process.exit(failed.length ? 1 : 0)
