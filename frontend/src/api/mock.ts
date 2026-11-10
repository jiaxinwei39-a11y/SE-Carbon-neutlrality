/**
 * 假后端（mock）
 *
 * 目的：在前端把"真实结构"跑起来 —— 分页、token、错误码、精度、幂等
 * 全部按后端约定模拟。接后端时只删这一个文件 + 改 .env，页面一行都不用动。
 *
 * 每个 handler 前面的注释写清楚"真后端应该做什么"，方便拿去和后端对表。
 */
import { ApiError } from './http'
import type {
  ApiResult,
  CarbonRule,
  Order,
  Page,
  PageQuery,
  PointsAccount,
  PointsFlow,
  Product,
  ReconcileItem,
  Trip,
  TripDetail,
  TripMode,
  User,
} from '@/types'

/* -------------------------------------------------- 种子数据 */

const BASE_FACTOR = 0.2
const MODE_FACTOR: Record<TripMode, number> = { BUS: 0.05, SUBWAY: 0.04, BIKE: 0, WALK: 0 }
const POINTS_RATIO = 10

const daysAgo = (n: number, hour = 8, minute = 30) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** 减排量故意保留浮点尾巴（1.5000000000000002），用来验证"前端不二次取整" */
function calcReduction(distanceKm: number, mode: TripMode): number {
  return distanceKm * (BASE_FACTOR - MODE_FACTOR[mode])
}

let trips: TripDetail[] = []
let flows: PointsFlow[] = []
let orders: Order[] = []

function seed(): void {
  const plan: Array<[TripMode, number, number, string, string, number]> = [
    ['BUS', 10, 0, '软件园东门', '地铁二号线站', 8],
    ['SUBWAY', 12.5, 1, '地铁二号线站', '市民中心', 9],
    ['BIKE', 3.2, 2, '小区门口', '软件园东门', 7],
    ['WALK', 1.8, 3, '公司楼下', '食堂', 12],
    ['BUS', 8.4, 4, '市民中心', '火车站', 18],
    ['SUBWAY', 15.6, 5, '火车站', '机场', 16],
    ['BIKE', 5.5, 6, '公园南门', '小区门口', 19],
    ['BUS', 6.1, 8, '软件园东门', '大学城', 8],
    ['WALK', 2.4, 10, '宿舍', '教学楼', 13],
    ['SUBWAY', 9.8, 12, '大学城', '市中心', 15],
    ['BUS', 11.2, 14, '市中心', '软件园东门', 9],
    ['BIKE', 4.1, 16, '地铁站', '公司', 8],
    ['BUS', 7.7, 19, '公司', '体育馆', 20],
    ['WALK', 1.5, 21, '体育馆', '商场', 11],
    ['SUBWAY', 13.4, 24, '商场', '火车站', 14],
    ['BUS', 9.9, 27, '火车站', '酒店', 7],
    ['BIKE', 3.6, 30, '酒店', '景区', 10],
    ['BUS', 10.3, 33, '景区', '机场', 16],
    ['SUBWAY', 8.8, 36, '机场', '市中心', 18],
    ['BUS', 12.1, 39, '市中心', '软件园东门', 9],
  ]

  trips = plan.map(([mode, distanceKm, day, from, to, hour], i) => {
    const start = daysAgo(day, hour, 0)
    const end = daysAgo(day, hour, Math.round(distanceKm * 3))
    const reductionKg = calcReduction(distanceKm, mode)
    const awardedPoints = Math.max(0, Math.floor(reductionKg * POINTS_RATIO))
    return {
      tripId: `T2026${String(10 - Math.floor(day / 30)).padStart(2, '0')}${String(
        (day % 30) + 1,
      ).padStart(2, '0')}${String(i + 1).padStart(4, '0')}`,
      mode,
      distanceKm,
      reductionKg,
      awardedPoints,
      status: 'POINTED',
      startTime: start,
      endTime: end,
      startPlace: from,
      endPlace: to,
      createdAt: end,
      baseFactor: BASE_FACTOR,
      modeFactor: MODE_FACTOR[mode],
      pointsRatio: POINTS_RATIO,
      calculatedAt: end,
      ruleVersion: 'R-2026-11',
    }
  })

  // 一条核算失败的历史记录（用于验证失败态）
  trips[7].status = 'FAILED'
  trips[7].awardedPoints = 0

  const tripPoints = trips.reduce((s, t) => s + t.awardedPoints, 0)

  flows = []
  let balance = 0
  const sortedAsc = [...trips].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  sortedAsc.forEach((t, i) => {
    balance += t.awardedPoints
    flows.push({
      id: `F${String(i + 1).padStart(5, '0')}`,
      type: t.status === 'POINTED' ? 'EARN' : 'REVERSE',
      title:
        t.status === 'POINTED'
          ? `行程核算入账 · ${
              { BUS: '公交', SUBWAY: '地铁', BIKE: '骑行', WALK: '步行' }[t.mode]
            } ${t.distanceKm} 公里`
          : '行程核算失败 · 已回滚预扣',
      amount: t.awardedPoints,
      balanceAfter: balance,
      createdAt: t.createdAt,
      refId: t.tripId,
    })
  })
  // 一笔历史结转：让余额为正，并且每一分的来源都能在流水里被查到
  balance += 1500
  flows.push({
    id: 'F00000',
    type: 'EARN',
    title: '历史结转 · 校园节能周活动奖励',
    amount: 1500,
    balanceAfter: balance,
    createdAt: daysAgo(40, 9, 0),
  })
  const totalEarned = tripPoints + 1500

  // 两笔历史消费
  flows.push(
    {
      id: 'F90001',
      type: 'SPEND',
      title: '兑换 · 定制环保帆布袋',
      amount: -600,
      balanceAfter: balance - 600,
      createdAt: daysAgo(20, 14, 20),
    },
    {
      id: 'F90002',
      type: 'SPEND',
      title: '兑换 · 咖啡券',
      amount: -300,
      balanceAfter: balance - 900,
      createdAt: daysAgo(11, 10, 5),
    },
  )
  flows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  // 让余额与流水最后一条对得上
  const currentBalance = totalEarned - 900

  orders = [
    {
      orderId: 'O202611080001',
      productId: 'G02',
      productName: '咖啡券（中杯）',
      productIcon: '☕',
      quantity: 1,
      unitPoints: 300,
      totalPoints: 300,
      status: 'FULFILLED',
      createdAt: daysAgo(11, 10, 5),
    },
    {
      orderId: 'O202611050002',
      productId: 'G06',
      productName: '共享单车月卡',
      productIcon: '🚲',
      quantity: 1,
      unitPoints: 1200,
      totalPoints: 1200,
      status: 'CANCELLED',
      createdAt: daysAgo(16, 9, 40),
      cancelReason: '暂无库存，无法发放',
    },
    {
      orderId: 'O202611020003',
      productId: 'G01',
      productName: '定制环保帆布袋',
      productIcon: '👜',
      quantity: 1,
      unitPoints: 600,
      totalPoints: 600,
      status: 'CREATED',
      createdAt: daysAgo(20, 14, 20),
    },
  ]

  state.account = {
    balance: currentBalance,
    totalEarned,
    totalSpent: 900,
    tripCount: trips.length,
    totalReductionKg: trips.reduce((s, t) => s + t.reductionKg, 0),
  }
}

interface MockState {
  user: User | null
  account: PointsAccount
  products: Product[]
  rules: CarbonRule[]
  users: User[]
}

const state: MockState = {
  user: null,
  account: { balance: 0, totalEarned: 0, totalSpent: 0, tripCount: 0, totalReductionKg: 0 },
  products: [
    { productId: 'G01', name: '定制环保帆布袋', icon: '👜', points: 600, stock: 24, status: 'ON', desc: '加厚棉布，可装 A4 文件' },
    { productId: 'G02', name: '咖啡券（中杯）', icon: '☕', points: 300, stock: 58, status: 'ON', desc: '校内咖啡店通用，有效期 30 天' },
    { productId: 'G03', name: '公交纪念卡', icon: '🎫', points: 800, stock: 12, status: 'ON', desc: '限量版，含 50 元余额' },
    { productId: 'G04', name: '校园文创笔记本', icon: '📓', points: 450, stock: 31, status: 'ON' },
    { productId: 'G05', name: '减碳徽章套装', icon: '🏅', points: 200, stock: 66, status: 'ON' },
    { productId: 'G06', name: '共享单车月卡', icon: '🚲', points: 1200, stock: 0, status: 'ON' },
    { productId: 'G07', name: '运动水杯', icon: '🥤', points: 900, stock: 9, status: 'ON' },
    { productId: 'G08', name: '公益植树证书', icon: '🌳', points: 1500, stock: 5, status: 'ON', desc: '以你名义在库布其种一棵树' },
  ],
  rules: [
    { ruleId: 'R-2026-11-BUS', version: 'R-2026-11', mode: 'BUS', baseFactor: 0.2, modeFactor: 0.05, pointsRatio: 10, effectiveFrom: '2026-11-01', status: 'ACTIVE' },
    { ruleId: 'R-2026-11-SUBWAY', version: 'R-2026-11', mode: 'SUBWAY', baseFactor: 0.2, modeFactor: 0.04, pointsRatio: 10, effectiveFrom: '2026-11-01', status: 'ACTIVE' },
    { ruleId: 'R-2026-11-BIKE', version: 'R-2026-11', mode: 'BIKE', baseFactor: 0.2, modeFactor: 0, pointsRatio: 10, effectiveFrom: '2026-11-01', status: 'ACTIVE' },
    { ruleId: 'R-2026-11-WALK', version: 'R-2026-11', mode: 'WALK', baseFactor: 0.2, modeFactor: 0, pointsRatio: 10, effectiveFrom: '2026-11-01', status: 'ACTIVE' },
    { ruleId: 'R-2026-09-BUS', version: 'R-2026-09', mode: 'BUS', baseFactor: 0.2, modeFactor: 0.06, pointsRatio: 10, effectiveFrom: '2026-09-01', status: 'ARCHIVED' },
  ],
  users: [
    { id: 'U001', nickname: '张生阳', phone: '138****6621', role: 'USER', avatarText: '张', points: 1280 },
    { id: 'U002', nickname: '李明', phone: '139****1180', role: 'USER', avatarText: '李', points: 860 },
    { id: 'U003', nickname: '王雨', phone: '137****4432', role: 'USER', avatarText: '王', points: 2405 },
    { id: 'U004', nickname: '系统管理员', phone: '130****0001', role: 'ADMIN', avatarText: '管', points: 0 },
  ],
}

seed()

/* -------------------------------------------------- 工具 */

const MOCK_USER: User = {
  id: 'U001',
  nickname: '张生阳',
  phone: '138****6621',
  role: 'USER',
  avatarText: '张',
  points: 0,
}
const MOCK_ADMIN: User = {
  id: 'U004',
  nickname: '系统管理员',
  phone: '130****0001',
  role: 'ADMIN',
  avatarText: '管',
  points: 0,
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function paginate<T>(list: T[], query?: PageQuery | Record<string, unknown>): Page<T> {
  const page = Number(query?.page ?? 1)
  const size = Number(query?.size ?? 10)
  const start = (page - 1) * size
  return { items: list.slice(start, start + size), total: list.length, page, size }
}

function ok<T>(data: T): ApiResult<T> {
  return { code: 0, message: 'ok', data }
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))

function match(url: string, pattern: string): RegExpMatchArray | null {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$')
  return url.match(re)
}

/* -------------------------------------------------- 路由表 */

export interface MockRequestInit {
  url: string
  method: string
  query?: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
}

export async function mockRequest<T>(req: MockRequestInit): Promise<T> {
  // 延迟是为了让骨架屏真的有机会出现；真实网络只会更慢
  await sleep(280 + Math.random() * 220)
  const { method } = req
  const url = req.url.split('?')[0]

  /* ---------- 认证 ---------- */
  if (url === '/auth/login' && method === 'POST') {
    const body = req.body as { account?: string; password?: string } | undefined
    if (!body?.account || !body?.password) throw new ApiError('请输入账号和密码', 40001, 400)
    if (body.password !== '123456') throw new ApiError('账号或密码错误', 40101, 401)
    const isAdmin = body.account.toLowerCase() === 'admin'
    const user = isAdmin ? { ...MOCK_ADMIN } : { ...MOCK_USER }
    state.user = user
    return ok({ token: `mock-token-${user.id}`, user }) as unknown as T
  }

  if (url === '/auth/me' && method === 'GET') {
    if (!state.user) throw new ApiError('登录已过期，请重新登录', 40100, 401)
    return ok({ ...state.user }) as unknown as T
  }

  if (url === '/auth/logout') {
    state.user = null
    return ok(null) as unknown as T
  }

  /* ---------- 行程 ---------- */
  if (url === '/trips' && method === 'GET') {
    const q = req.query ?? {}
    const mode = str(q.mode)
    const keyword = str(q.keyword).trim()
    const from = str(q.from)
    const to = str(q.to)
    let list = [...trips]
    if (mode && mode !== 'ALL') list = list.filter((t) => t.mode === mode)
    if (keyword) {
      list = list.filter(
        (t) =>
          t.startPlace.includes(keyword) ||
          t.endPlace.includes(keyword) ||
          t.tripId.toLowerCase().includes(keyword.toLowerCase()),
      )
    }
    if (from) list = list.filter((t) => t.startTime >= new Date(from).toISOString())
    if (to) list = list.filter((t) => t.startTime <= new Date(`${to}T23:59:59`).toISOString())

    // 列表不返回因子细节，只返回展示需要的字段（和真后端 DTO 一致）
    const items = list.map<Trip>((t) => ({
      tripId: t.tripId,
      mode: t.mode,
      distanceKm: t.distanceKm,
      reductionKg: t.reductionKg,
      awardedPoints: t.awardedPoints,
      status: t.status,
      startTime: t.startTime,
      endTime: t.endTime,
      startPlace: t.startPlace,
      endPlace: t.endPlace,
      createdAt: t.createdAt,
    }))
    return ok(paginate(items, q as PageQuery)) as unknown as T
  }

  if (url === '/trips' && method === 'POST') {
    // 真后端：校验参数 → 检查 Idempotency-Key 是否已处理过 → 用规则表算减排 → 落库 → 加分
    const key = req.headers?.['Idempotency-Key']
    if (!key) throw new ApiError('缺少幂等键，请刷新页面重试', 40002, 400)
    const body = req.body as {
      clientTripId: string
      mode: TripMode
      distanceKm: number
      startTime: string
      endTime: string
      startPlace: string
      endPlace: string
    }
    const exists = trips.find((t) => t.tripId === body.clientTripId)
    if (exists) return ok(exists) as unknown as T // 幂等：重复提交返回同一结果

    const distanceKm = Number(body.distanceKm)
    if (!(distanceKm > 0) || distanceKm > 200) {
      throw new ApiError('里程需大于 0 且不超过 200 公里', 40010, 400)
    }
    if (new Date(body.startTime) >= new Date(body.endTime)) {
      throw new ApiError('结束时间必须晚于开始时间', 40011, 400)
    }

    const reductionKg = calcReduction(distanceKm, body.mode)
    const awardedPoints = Math.max(0, Math.floor(reductionKg * POINTS_RATIO))
    const trip: TripDetail = {
      tripId: body.clientTripId,
      mode: body.mode,
      distanceKm,
      reductionKg,
      awardedPoints,
      status: 'POINTED',
      startTime: body.startTime,
      endTime: body.endTime,
      startPlace: body.startPlace,
      endPlace: body.endPlace,
      createdAt: new Date().toISOString(),
      baseFactor: BASE_FACTOR,
      modeFactor: MODE_FACTOR[body.mode],
      pointsRatio: POINTS_RATIO,
      calculatedAt: new Date().toISOString(),
      ruleVersion: 'R-2026-11',
    }
    trips = [trip, ...trips]
    state.account.balance += awardedPoints
    state.account.totalEarned += awardedPoints
    state.account.tripCount += 1
    state.account.totalReductionKg += reductionKg
    flows = [
      {
        id: `F${Date.now()}`,
        type: 'EARN',
        title: `行程核算入账 · ${body.mode} ${distanceKm} 公里`,
        amount: awardedPoints,
        balanceAfter: state.account.balance,
        createdAt: trip.createdAt,
        refId: trip.tripId,
      },
      ...flows,
    ]
    return ok(trip) as unknown as T
  }

  const tripM = match(url, '/trips/:id')
  if (tripM && method === 'GET') {
    const found = trips.find((t) => t.tripId === tripM[1])
    if (!found) throw new ApiError('该行程记录不存在或已被删除', 40401, 404)
    return ok(found) as unknown as T
  }

  /* ---------- 积分 ---------- */
  if (url === '/points/account' && method === 'GET') {
    return ok({ ...state.account }) as unknown as T
  }
  if (url === '/points/flows' && method === 'GET') {
    const type = str(req.query?.type)
    const list = type && type !== 'ALL' ? flows.filter((f) => f.type === type) : flows
    return ok(paginate(list, req.query)) as unknown as T
  }

  /* ---------- 商城 ---------- */
  if (url === '/mall/products' && method === 'GET') {
    const keyword = str(req.query?.keyword).trim()
    let list = state.products.filter((p) => p.status === 'ON')
    if (keyword) list = list.filter((p) => p.name.includes(keyword))
    return ok(paginate(list, req.query)) as unknown as T
  }
  const prodM = match(url, '/mall/products/:id')
  if (prodM && method === 'GET') {
    const p = state.products.find((x) => x.productId === prodM[1])
    if (!p) throw new ApiError('商品不存在或已下架', 40402, 404)
    return ok(p) as unknown as T
  }

  if (url === '/mall/orders' && method === 'POST') {
    // 真后端：校验库存 → 扣积分 → 建订单，全程一个事务
    const memberKey = req.headers?.['Idempotency-Key']
    if (!memberKey) throw new ApiError('缺少幂等键，请刷新页面重试', 40002, 400)
    const body = req.body as { productId: string; quantity: number }
    const product = state.products.find((p) => p.productId === body.productId)
    if (!product) throw new ApiError('商品不存在或已下架', 40402, 404)
    if (product.stock < body.quantity) throw new ApiError('库存不足，请减少兑换数量', 40901, 409)
    const totalPoints = product.points * body.quantity
    if (state.account.balance < totalPoints) {
      throw new ApiError(`积分不足，还差 ${totalPoints - state.account.balance} 分`, 40030, 400)
    }
    const order: Order = {
      orderId: `O${Date.now()}`,
      productId: product.productId,
      productName: product.name,
      productIcon: product.icon,
      quantity: body.quantity,
      unitPoints: product.points,
      totalPoints,
      status: 'CREATED',
      createdAt: new Date().toISOString(),
    }
    orders = [order, ...orders]
    product.stock -= body.quantity
    state.account.balance -= totalPoints
    state.account.totalSpent += totalPoints
    flows = [
      {
        id: `F${Date.now()}`,
        type: 'SPEND',
        title: `兑换 · ${product.name} × ${body.quantity}`,
        amount: -totalPoints,
        balanceAfter: state.account.balance,
        createdAt: order.createdAt,
        refId: order.orderId,
      },
      ...flows,
    ]
    return ok(order) as unknown as T
  }

  /* ---------- 订单 ---------- */
  if (url === '/orders' && method === 'GET') {
    const status = str(req.query?.status)
    const list = status && status !== 'ALL' ? orders.filter((o) => o.status === status) : orders
    return ok(paginate(list, req.query)) as unknown as T
  }
  const orderM = match(url, '/orders/:id')
  if (orderM && method === 'GET') {
    const o = orders.find((x) => x.orderId === orderM[1])
    if (!o) throw new ApiError('订单不存在', 40403, 404)
    return ok(o) as unknown as T
  }
  const cancelM = match(url, '/orders/:id/cancel')
  if (cancelM && method === 'POST') {
    const o = orders.find((x) => x.orderId === cancelM[1])
    if (!o) throw new ApiError('订单不存在', 40403, 404)
    const body = req.body as { reason?: string }
    if (!body?.reason || !body.reason.trim()) throw new ApiError('请填写取消原因', 40040, 400)
    if (o.status !== 'CREATED') throw new ApiError('当前订单状态不允许取消，请刷新后重试', 40903, 409)
    o.status = 'CANCELLED'
    o.cancelReason = body.reason
    // 返还原额、原数量（J052）
    state.account.balance += o.totalPoints
    state.account.totalSpent -= o.totalPoints
    const product = state.products.find((p) => p.productId === o.productId)
    if (product) product.stock += o.quantity
    flows = [
      {
        id: `F${Date.now()}`,
        type: 'REVERSE',
        title: `订单取消冲正 · ${o.productName}`,
        amount: o.totalPoints,
        balanceAfter: state.account.balance,
        createdAt: new Date().toISOString(),
        refId: o.orderId,
      },
      ...flows,
    ]
    return ok(o) as unknown as T
  }

  /* ---------- 管理端 ---------- */
  if (url === '/admin/dashboard' && method === 'GET') {
    return ok({
      userCount: state.users.filter((u) => u.role === 'USER').length,
      tripCount: trips.length,
      totalReductionKg: trips.reduce((s, t) => s + t.reductionKg, 0),
      totalPointsIssued: state.account.totalEarned,
      modeDistribution: (['BUS', 'SUBWAY', 'BIKE', 'WALK'] as TripMode[]).map((m) => ({
        mode: m,
        count: trips.filter((t) => t.mode === m).length,
      })),
      dailyTrend: [
        { date: '11-04', count: 3 },
        { date: '11-05', count: 5 },
        { date: '11-06', count: 2 },
        { date: '11-07', count: 6 },
        { date: '11-08', count: 4 },
        { date: '11-09', count: 7 },
        { date: '11-10', count: 5 },
      ],
    }) as unknown as T
  }
  if (url === '/admin/rules' && method === 'GET') {
    return ok(state.rules) as unknown as T
  }
  if (url === '/admin/products' && method === 'GET') {
    return ok(paginate(state.products, req.query)) as unknown as T
  }
  if (url === '/admin/orders' && method === 'GET') {
    return ok(paginate(orders, req.query)) as unknown as T
  }
  if (url === '/admin/users' && method === 'GET') {
    return ok(paginate(state.users, req.query)) as unknown as T
  }
  if (url === '/admin/reconciliation' && method === 'GET') {
    // 对账页三态：无差异 / 有差异 / 读取失败。
    // 这里用 query.diff=1 模拟"有差异"，diff=error 模拟"读取失败"，方便演示与验收。
    const mode = str(req.query?.diff)
    if (mode === 'error') throw new ApiError('对账服务暂时不可用，请稍后重试', 50001, 500)
    const items: ReconcileItem[] =
      mode === '1'
        ? [
            {
              id: 'RC-001',
              objectType: 'TRIP',
              objectId: trips[2]?.tripId ?? 'T0002',
              checkName: '积分应发未发（分）',
              expected: 64,
              actual: 0,
            },
            {
              id: 'RC-002',
              objectType: 'ORDER',
              objectId: orders[0]?.orderId ?? 'O0001',
              checkName: '库存与订单不一致（件）',
              expected: 24,
              actual: 23,
            },
          ]
        : []
    return ok({ checkedAt: new Date().toISOString(), items }) as unknown as T
  }

  throw new ApiError(`mock 未实现的接口：${method} ${url}`, 40400, 404)
}
