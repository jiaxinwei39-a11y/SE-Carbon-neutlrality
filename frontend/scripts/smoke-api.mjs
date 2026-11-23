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
 * ⚠️ 这个脚本会**写数据**：注册 1~2 个账号、上报 2 条行程、产生对应积分流水，库存/订单链路不动。
 *    请只对**测试库 / 测试后端**运行，别对着演示库或生产库跑；
 *    演示库事后可用 `db/reset-demo.sql` 复位（该脚本会清业务数据并重新 seed）。
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

console.log('\n=== 3. 上报行程（幂等 + 精确数值） ===')
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

// 10 公里公交的准确数值：减排 = 10 × (0.2 − 0.05) = 1.5 kg；积分 = floor(1.5 × 10) = 15 分
const near = (a, b, tol = 1e-9) => Number.isFinite(Number(a)) && Math.abs(Number(a) - b) <= tol
check('10km 公交减排 = 1.5 kg（按基准 0.2 − 方式 0.05 算）', near(t1.data?.reductionKg, 1.5),
  `实际 ${t1.data?.reductionKg}`)
check('10km 公交积分 = 15 分（floor(1.5 × 10)）', Number(t1.data?.awardedPoints) === 15,
  `实际 ${t1.data?.awardedPoints}`)

// 幂等基线：记下第一次之后的余额与流水条数
const acc1 = await call('GET', '/points/account', { token })
const flows1 = await call('GET', '/points/flows?page=1&size=50', { token })
const bal1 = Number(acc1.data?.balance)
const flowTotal1 = Number(flows1.data?.total)

const t2 = await call('POST', '/trips', { body: payload, token, headers: { 'Idempotency-Key': key } })
check('同键同输入返回同一行程', t2.data?.tripId === tripId, `第2次=${t2.data?.tripId}`)

const acc2 = await call('GET', '/points/account', { token })
const flows2 = await call('GET', '/points/flows?page=1&size=50', { token })
const bal2 = Number(acc2.data?.balance)
check('重放没有再加一次积分（余额不变）', bal2 === bal1, `${bal1} → ${bal2}`)
check('重放没有新增流水（条数不变）', Number(flows2.data?.total) === flowTotal1,
  `${flowTotal1} → ${flows2.data?.total}`)
const linked = (flows2.data?.items ?? []).filter((f) => f.refId === tripId)
check('流水通过 refId 关联到该 tripId，且恰好一条 EARN',
  linked.length === 1 && linked[0].type === 'EARN' && Number(linked[0].amount) === Number(t1.data?.awardedPoints),
  linked.length ? `refId=${linked[0].refId} amount=${linked[0].amount}` : '没找到 refId 等于 tripId 的流水')

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

console.log('\n=== 5. 行程详情 / 列表（精度与公式） ===')
const detail = await call('GET', `/trips/${tripId}`, { token })
check('详情能查到', detail.code === 0 && detail.data?.tripId === tripId)
check('详情带核算快照（baseFactor/modeFactor/pointsRatio/ruleVersion）',
  detail.data?.baseFactor !== undefined && detail.data?.modeFactor !== undefined &&
  detail.data?.pointsRatio !== undefined && detail.data?.ruleVersion !== undefined,
  `rule=${detail.data?.ruleVersion}`)

// 精度不能靠"字符串长度"判断：JSON.parse 会把 1.500000000 变成 1.5，尾零本来就丢了。
// 能验证的是"没有被提前舍入"——换一个结果带非零小数位的里程，让"舍到 2 位"必然暴露：
// 7.77 km 公交 = 7.77 × 0.15 = 1.1655 kg（舍到 2 位会变成 1.17），积分 = floor(11.655) = 11。
const p2 = {
  clientTripId: `smoke-prec-${now}`,
  mode: 'BUS',
  distanceKm: 7.77,
  startPlace: '精度起点',
  endPlace: '精度终点',
  startTime: new Date(now - 30 * 60 * 1000).toISOString(),
  endTime: new Date(now).toISOString(),
}
const t4 = await call('POST', '/trips', { body: p2, token, headers: { 'Idempotency-Key': p2.clientTripId } })
check('7.77km 上报成功', t4.code === 0 && !!t4.data?.tripId, `code=${t4.code} ${t4.message || ''}`)
const tripId2 = t4.data?.tripId
check('7.77km 公交减排 = 1.1655 kg（没被舍成 1.17 或 1.2）', near(t4.data?.reductionKg, 1.1655, 1e-6),
  `实际 ${t4.data?.reductionKg}`)
check('7.77km 公交积分 = 11 分（floor(1.1655 × 10)）', Number(t4.data?.awardedPoints) === 11,
  `实际 ${t4.data?.awardedPoints}`)

const detail2 = await call('GET', `/trips/${tripId2}`, { token })
check('详情减排量与上报返回值一致（同一个数，不二次舍入）',
  near(detail2.data?.reductionKg, Number(t4.data?.reductionKg), 1e-9),
  `详情=${detail2.data?.reductionKg} 上报=${t4.data?.reductionKg}`)
check('积分 = floor(减排 × pointsRatio)（用接口返回的快照算）',
  Number.isFinite(Number(detail2.data?.reductionKg)) && Number.isFinite(Number(detail2.data?.pointsRatio)) &&
  Math.floor(Number(detail2.data.reductionKg) * Number(detail2.data.pointsRatio) + 1e-9) === Number(detail2.data?.awardedPoints),
  `${detail2.data?.reductionKg} × ${detail2.data?.pointsRatio} → ${detail2.data?.awardedPoints}`)

const list = await call('GET', '/trips?page=1&size=5', { token })
check('列表返回分页结构（items/total）', Array.isArray(list.data?.items) && typeof list.data?.total === 'number',
  `total=${list.data?.total}`)
check('列表里能翻到刚报的行程', (list.data?.items ?? []).some((x) => x.tripId === tripId))
check('列表与详情的减排量一致', (list.data?.items ?? []).filter((x) => x.tripId === tripId2)
  .every((x) => near(x.reductionKg, Number(detail2.data?.reductionKg), 1e-9)))

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
