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
// 地铁因子按 docs/00-product/decisions.md 的已确认口径取 0.030000（2026-11-17 产品经理确认；0.04 是旧口径）
const MODE_FACTOR: Record<TripMode, number> = { BUS: 0.05, SUBWAY: 0.03, BIKE: 0, WALK: 0 }
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
/** 幂等表：clientTripId → tripId。真后端是一张 unique 索引的表，这里用 Map 模拟 */
const tripIdByClientId = new Map<string, string>()
/** 幂等表：兑换 requestId（Idempotency-Key）→ orderId。防止连点/重试重复扣分 */
const orderIdByRequestKey = new Map<string, string>()

/* -------------------------------------------------- 持久化：退出重登 / 刷新都不丢数据
 *
 * 评审 #38 的要求：演示账号产生的数据，在「退出再登录」和「刷新页面」之后必须还在。
 * 真后端靠数据库，mock 用 localStorage 存一份快照（key 带版本号，结构一变就重新播种）。
 * 存储不可用（file:// 某些策略、隐私模式）时自动退化为纯内存，功能不受影响。
 */
const DB_KEY = 'carbon_mock_db_v3'

interface MockAccount {
  /** 明文只因为这是 mock；真后端是 PBKDF2 哈希（见 AuthService） */
  password: string
  /** 完整手机号，登录时用来查账号（展示用的是打码后的 phone） */
  loginPhone: string
  user: User
}

interface MockBucket {
  trips: TripDetail[]
  flows: PointsFlow[]
  orders: Order[]
  account: PointsAccount
  tripIdByClientId: Array<[string, string]>
  orderIdByRequestKey: Array<[string, string]>
}

/** userId → 账号（含密码、登录手机号） */
const accounts = new Map<string, MockAccount>()
/** userId → 该用户自己的业务数据（行程/流水/订单/账户/幂等表） */
const buckets = new Map<string, MockBucket>()
/** token → userId：有了它，刷新页面后 /auth/me 还认得出你是谁 */
const tokens = new Map<string, string>()

function emptyAccount(): PointsAccount {
  return { balance: 0, totalEarned: 0, totalSpent: 0, tripCount: 0, totalReductionKg: 0 }
}

function emptyBucket(): MockBucket {
  return {
    trips: [],
    flows: [],
    orders: [],
    account: emptyAccount(),
    tripIdByClientId: [],
    orderIdByRequestKey: [],
  }
}

/** 把"当前正在操作用的那几个变量"打包成可持久化的快照 */
function snapshotBucket(): MockBucket {
  return {
    trips,
    flows,
    orders,
    account: { ...state.account },
    tripIdByClientId: [...tripIdByClientId.entries()],
    orderIdByRequestKey: [...orderIdByRequestKey.entries()],
  }
}

/** 反向操作：把某个用户的数据装载成"当前数据" */
function applyBucket(b: MockBucket): void {
  trips = b.trips ?? []
  flows = b.flows ?? []
  orders = b.orders ?? []
  state.account = { ...(b.account ?? emptyAccount()) }
  tripIdByClientId.clear()
  for (const [k, v] of b.tripIdByClientId ?? []) tripIdByClientId.set(k, v)
  orderIdByRequestKey.clear()
  for (const [k, v] of b.orderIdByRequestKey ?? []) orderIdByRequestKey.set(k, v)
}

/**
 * 切换当前登录用户：先把自己这份存回去，再装对方那份。
 * 这样 A 的行程和积分不会出现在 B 的页面上（真后端是 WHERE user_id = ?）。
 */
function switchUser(userId: string): void {
  const acct = accounts.get(userId)
  if (!acct) return
  if (state.user && accounts.has(state.user.id)) {
    buckets.set(state.user.id, snapshotBucket())
  }
  state.user = { ...acct.user }
  applyBucket(buckets.get(userId) ?? emptyBucket())
}

/**
 * 管理端视角：把所有用户的数据摊平。
 * 真后端是 `SELECT ... ` 不带 user_id 过滤；mock 里每个人一个 bucket，所以要合并。
 * 当前用户那份额外取一次实时快照，避免 map 里存的还是登录时的旧数据。
 */
function allOwners(): Array<{ id: string; bucket: MockBucket }> {
  const list: Array<{ id: string; bucket: MockBucket }> = []
  for (const [id, bucket] of buckets) {
    list.push({ id, bucket: state.user?.id === id ? snapshotBucket() : bucket })
  }
  if (state.user && !buckets.has(state.user.id)) {
    list.push({ id: state.user.id, bucket: snapshotBucket() })
  }
  return list
}

/**
 * 全局序号游标（行程号/订单号共用一套策略）。
 *
 * 为什么不能像原来那样用 `orders.length + 1`：
 * mock 里每个账号一个 bucket，`orders` 只是**当前账号**的订单。两个新用户当天各自
 * 首次兑换都会算出 `...0001`，于是出现跨账号重复的订单号；管理端按订单号取消/履约时
 * 只能命中"第一个匹配到的用户"，就会拿 B 的单给 A 退款。真后端是全局自增主键 +
 * 唯一索引，mock 必须等价：序号全站唯一、并随快照一起持久化。
 */
const seqCounters = { trip: 0, order: 0 }

function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 从已有编号里扫出最大的序号，用于老快照（没有 seq 字段）时的兜底 */
function scanMaxSeq(prefix: string, ids: Iterable<string>): number {
  const re = new RegExp(`^${prefix}\\d{8}(\\d{4,})$`)
  let max = 0
  for (const id of ids) {
    const m = re.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

/** 全站所有已用编号（跨账号），既用于去重也用于兜底扫描 */
function allIssuedIds(): Set<string> {
  const set = new Set<string>()
  for (const { bucket } of allOwners()) {
    for (const t of bucket.trips) set.add(t.tripId)
    for (const o of bucket.orders) set.add(o.orderId)
  }
  return set
}

/** 生成全站唯一的业务编号：T/O + yyyyMMdd + 4 位以上序号 */
function nextGlobalId(kind: 'trip' | 'order'): string {
  const prefix = kind === 'trip' ? 'T' : 'O'
  const stamp = todayStamp()
  const used = allIssuedIds()
  let n = Math.max(seqCounters[kind], scanMaxSeq(prefix, used)) + 1
  let id = `${prefix}${stamp}${String(n).padStart(4, '0')}`
  while (used.has(id)) {
    n += 1
    id = `${prefix}${stamp}${String(n).padStart(4, '0')}`
  }
  seqCounters[kind] = n
  return id
}

function nextOrderId(): string {
  return nextGlobalId('order')
}

/**
 * 按订单号跨用户找订单（管理端履约/取消要用）。
 * 订单号全站唯一是本函数的前提；万一真的撞号（历史脏数据），宁可报错也不要
 * 随便挑一个用户去退款 —— 那会把 B 的单退给 A。
 */
function findOrderAnyOwner(orderId: string): { id: string; owner: MockBucket; order: Order } | null {
  const hits: Array<{ id: string; owner: MockBucket; order: Order }> = []
  for (const { id, bucket } of allOwners()) {
    const order = bucket.orders.find((x) => x.orderId === orderId)
    if (order) hits.push({ id, owner: bucket, order })
  }
  if (hits.length > 1) {
    throw new ApiError('订单号重复，为避免退错账户已拒绝操作，请联系管理员核对数据', 50000, 500)
  }
  return hits[0] ?? null
}

/** 把改过的某个用户数据写回去；改的是当前用户就同步到实时状态 */
function commitOwner(owner: { id: string; owner: MockBucket }): void {
  buckets.set(owner.id, owner.owner)
  if (state.user?.id === owner.id) applyBucket(owner.owner)
}

function storage(): Storage | null {
  try {
    const ls = window.localStorage
    ls.getItem(DB_KEY)
    return ls
  } catch {
    return null
  }
}

function persist(): void {
  const ls = storage()
  if (!ls) return
  // 落盘前把当前用户的最新积分同步回账号，管理端用户列表才看得到变化
  if (state.user && accounts.has(state.user.id)) {
    const snap = snapshotBucket()
    buckets.set(state.user.id, snap)
    const acct = accounts.get(state.user.id)
    if (acct) {
      acct.user = { ...acct.user, points: snap.account.balance }
    }
  }
  const payload = {
    v: 3,
    accounts: [...accounts.entries()],
    buckets: [...buckets.entries()],
    products: state.products,
    rules: state.rules,
    users: state.users,
    tokens: [...tokens.entries()],
    // 全局序号游标要一起存，否则刷新后重新从 1 开始又会撞号
    seq: { ...seqCounters },
  }
  try {
    ls.setItem(DB_KEY, JSON.stringify(payload))
  } catch {
    /* 配额满 / 隐私模式：忽略，内存里照样能演示 */
  }
}

function loadDb(): boolean {
  const ls = storage()
  if (!ls) return false
  const raw = ls.getItem(DB_KEY)
  if (!raw) return false
  try {
    const db = JSON.parse(raw) as {
      v?: number
      accounts?: Array<[string, MockAccount]>
      buckets?: Array<[string, MockBucket]>
      products?: Product[]
      rules?: CarbonRule[]
      users?: User[]
      tokens?: Array<[string, string]>
      seq?: { trip?: number; order?: number }
    }
    // 版本不匹配就当作没有：宁可重新播种，也不要拿旧结构硬跑
    if (db.v !== 3 || !db.accounts?.length) return false
    accounts.clear()
    for (const [id, acct] of db.accounts) accounts.set(id, acct)
    buckets.clear()
    for (const [id, b] of db.buckets ?? []) buckets.set(id, b)
    tokens.clear()
    for (const [t, id] of db.tokens ?? []) tokens.set(t, id)
    if (db.products?.length) state.products = db.products
    if (db.rules?.length) state.rules = db.rules
    if (db.users?.length) state.users = db.users
    // 老快照没有 seq 字段：先把游标置 0，第一次取号时会用全站已有编号兜底扫描
    seqCounters.trip = Number(db.seq?.trip ?? 0)
    seqCounters.order = Number(db.seq?.order ?? 0)
    return true
  } catch {
    return false
  }
}

/** 首次运行：把种子数据挂到演示账号上，并给每个演示账号设置密码 */
function seedAccounts(): void {
  accounts.clear()
  buckets.clear()
  tokens.clear()
  // state.users[0] 是演示用户张生阳，seed() 刚造的那份数据就是他的
  const demo = state.users[0]
  accounts.set(demo.id, { password: '123456', loginPhone: '13800138000', user: { ...demo } })
  buckets.set(demo.id, snapshotBucket())
  for (const u of state.users.slice(1)) {
    accounts.set(u.id, {
      password: '123456',
      // 其余演示账号（含管理员）用占位手机号，密码同样是 123456
      loginPhone: `1390000${u.id.slice(1).padStart(4, '0')}`,
      user: { ...u },
    })
    buckets.set(u.id, emptyBucket())
  }
  state.user = null
}

/** 清库重来（e2e 用；界面上也有"重置演示数据"的入口价值） */
function resetDb(): void {
  try {
    storage()?.removeItem(DB_KEY)
  } catch {
    /* 忽略 */
  }
  accounts.clear()
  buckets.clear()
  tokens.clear()
  state.user = null
  state.products = DEFAULT_PRODUCTS.map((p) => ({ ...p }))
  state.rules = DEFAULT_RULES.map((r) => ({ ...r }))
  state.users = DEFAULT_USERS.map((u) => ({ ...u }))
  trips = []
  flows = []
  orders = []
  state.account = emptyAccount()
  seqCounters.trip = 0
  seqCounters.order = 0
  seed()
  seedAccounts()
  persist()
}

/**
 * 用请求头里的 token 恢复会话：刷新页面后内存里的 state.user 是空的，
 * 但 token 还在，靠这里把人和他的数据一起装回来（真后端是查 session 表）。
 */
function restoreSession(headers?: Record<string, string>): void {
  const raw = headers?.Authorization ?? headers?.authorization ?? ''
  const token = raw.replace(/^Bearer\s+/i, '').trim()
  if (!token) return
  const uid = tokens.get(token)
  if (!uid) return
  if (state.user?.id === uid) return
  switchUser(uid)
}

const DEFAULT_PRODUCTS: Product[] = [
  { productId: 'G01', name: '定制环保帆布袋', icon: '👜', points: 600, stock: 24, status: 'ON', desc: '加厚棉布，可装 A4 文件' },
  { productId: 'G02', name: '咖啡券（中杯）', icon: '☕', points: 300, stock: 58, status: 'ON', desc: '校内咖啡店通用，有效期 30 天' },
  { productId: 'G03', name: '公交纪念卡', icon: '🎫', points: 800, stock: 12, status: 'ON', desc: '限量版，含 50 元余额' },
  { productId: 'G04', name: '校园文创笔记本', icon: '📓', points: 450, stock: 31, status: 'ON' },
  { productId: 'G05', name: '减碳徽章套装', icon: '🏅', points: 200, stock: 66, status: 'ON' },
  { productId: 'G06', name: '共享单车月卡', icon: '🚲', points: 1200, stock: 0, status: 'ON' },
  { productId: 'G07', name: '运动水杯', icon: '🥤', points: 900, stock: 9, status: 'ON' },
  { productId: 'G08', name: '公益植树证书', icon: '🌳', points: 1500, stock: 5, status: 'ON', desc: '以你名义在库布其种一棵树' },
]

const DEFAULT_RULES: CarbonRule[] = [
  { ruleId: 'R-2026-11-BUS', version: 'R-2026-11', mode: 'BUS', baseFactor: 0.2, modeFactor: 0.05, pointsRatio: 10, effectiveFrom: '2026-11-01', status: 'ACTIVE' },
  { ruleId: 'DEMO-SUBWAY-01', version: 'DEMO-2026-11', mode: 'SUBWAY', baseFactor: 0.2, modeFactor: 0.03, pointsRatio: 10, effectiveFrom: '2026-11-17', status: 'ACTIVE' },
  { ruleId: 'R-2026-11-BIKE', version: 'R-2026-11', mode: 'BIKE', baseFactor: 0.2, modeFactor: 0, pointsRatio: 10, effectiveFrom: '2026-11-01', status: 'ACTIVE' },
  { ruleId: 'R-2026-11-WALK', version: 'R-2026-11', mode: 'WALK', baseFactor: 0.2, modeFactor: 0, pointsRatio: 10, effectiveFrom: '2026-11-01', status: 'ACTIVE' },
  { ruleId: 'R-2026-09-BUS', version: 'R-2026-09', mode: 'BUS', baseFactor: 0.2, modeFactor: 0.06, pointsRatio: 10, effectiveFrom: '2026-09-01', status: 'ARCHIVED' },
]

const DEFAULT_USERS: User[] = [
  { id: 'U001', nickname: '张生阳', phone: '138****6621', role: 'USER', avatarText: '张', points: 1280 },
  { id: 'U002', nickname: '李明', phone: '139****1180', role: 'USER', avatarText: '李', points: 860 },
  { id: 'U003', nickname: '王雨', phone: '137****4432', role: 'USER', avatarText: '王', points: 2405 },
  { id: 'U004', nickname: '系统管理员', phone: '130****0001', role: 'ADMIN', avatarText: '管', points: 0 },
]

function seed(): void {
  // 重新播种时把幂等表一起清掉：它们是"上次会话"的产物，
  // 留着会让新的 clientTripId 撞上旧 tripId（真后端换库/重置数据时同理）。
  tripIdByClientId.clear()
  orderIdByRequestKey.clear()

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
  account: emptyAccount(),
  products: DEFAULT_PRODUCTS.map((p) => ({ ...p })),
  rules: DEFAULT_RULES.map((r) => ({ ...r })),
  users: DEFAULT_USERS.map((u) => ({ ...u })),
}

// 首次运行（或换了存储版本）：播种 + 建演示账号；否则直接用 localStorage 里的那份
if (!loadDb()) {
  seed()
  seedAccounts()
  persist()
}

/* -------------------------------------------------- 工具 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone
}

/**
 * 每次登录/注册都签发一个「新」token（真实 JWT 的 iat/jti 也会变）。
 * 前端靠"发请求时的 token ≠ 当前 token"识别"旧会话的迟到响应"；
 * 如果每次都是同一个字符串，客户端就没法区分新旧会话，迟到 401 会误杀新会话。
 */
function issueToken(user: User): string {
  return `mock-token-${user.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 已注册手机号：等价于数据库上的 UNIQUE(phone)，账号表就是 accounts */
function phoneTaken(phone: string): boolean {
  for (const a of accounts.values()) if (a.loginPhone === phone) return true
  return false
}

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

/**
 * 管理端写接口的统一鉴权。
 * 前端路由守卫只是"体验层"，真正拦人的必须在这里（真后端对应 @PreAuthorize("hasRole('ADMIN')")）。
 * 否则任何知道接口地址的人都能自己发请求改数据。
 */
function requireAdmin(): void {
  if (state.user?.role !== 'ADMIN') throw new ApiError('无权限执行该操作', 40301, 403)
}

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

async function handleRequest<T>(req: MockRequestInit): Promise<T> {
  // 延迟是为了让骨架屏真的有机会出现；真实网络只会更慢
  await sleep(280 + Math.random() * 220)
  const { method } = req
  const url = req.url.split('?')[0]

  // 刷新页面后内存里没有当前用户，但请求头里还有 token —— 先把人和他的数据装回来
  restoreSession(req.headers)

  /* ---------- 认证 ---------- */
  if (url === '/auth/login' && method === 'POST') {
    const body = req.body as { account?: string; password?: string } | undefined
    if (!body?.account || !body?.password) throw new ApiError('请输入账号和密码', 40001, 400)

    // 按账号表查人：手机号 / 用户编号 / admin 别名都能登（真后端查 t_user）
    const raw = body.account.trim()
    let acct: MockAccount | undefined
    if (raw.toLowerCase() === 'admin') {
      for (const a of accounts.values()) if (a.user.role === 'ADMIN') { acct = a; break }
    } else {
      for (const a of accounts.values()) {
        if (a.loginPhone === raw || a.user.phone === raw || a.user.id === raw) { acct = a; break }
      }
    }
    // 账号不存在和密码错误返回同一个错误，避免被枚举出手机号
    if (!acct || acct.password !== body.password) throw new ApiError('账号或密码错误', 40101, 401)

    switchUser(acct.user.id)
    const user = { ...acct.user }
    const token = issueToken(user)
    tokens.set(token, user.id)
    // 这里不再 seed()：登录是"打开这个人的数据"，不是"重置演示数据"
    return ok({ token, user }) as unknown as T
  }

  /* 注册：与后端 AuthController#register 对齐
     —— 手机号格式 40013、密码长度 40012、手机号占用 40906，成功直接返回 { token, user } */
  if (url === '/auth/register' && method === 'POST') {
    const body = req.body as { phone?: string; password?: string; nickname?: string } | undefined
    const phone = str(body?.phone).trim()
    const password = str(body?.password)
    const nickname = str(body?.nickname).trim()
    if (!phone || !password) throw new ApiError('请输入手机号和密码', 40001, 400)
    if (!/^1\d{10}$/.test(phone)) throw new ApiError('手机号格式不正确', 40013, 400)
    if (password.length < 6 || password.length > 32)
      throw new ApiError('密码长度需为 6-32 位', 40012, 400)
    if (nickname.length > 20) throw new ApiError('昵称最长 20 个字', 40000, 400)
    if (phoneTaken(phone)) throw new ApiError('该手机号已注册，请直接登录', 40906, 409)

    const fallbackName = maskPhone(phone)
    const user: User = {
      // 真后端是 U + 8 位大写；这里同样给出不透明编号
      id: `U${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      nickname: nickname || fallbackName,
      phone: fallbackName,
      role: 'USER',
      avatarText: (nickname || '绿').slice(0, 1),
      points: 0,
    }
    // 新账号从零开始：独立的一份 bucket，不碰演示账号的数据
    accounts.set(user.id, { password, loginPhone: phone, user: { ...user } })
    buckets.set(user.id, emptyBucket())
    state.users = [...state.users.filter((u) => u.id !== user.id), { ...user }]
    switchUser(user.id)
    const token = issueToken(user)
    tokens.set(token, user.id)
    return ok({ token, user }) as unknown as T
  }

  if (url === '/auth/me' && method === 'GET') {
    if (!state.user) throw new ApiError('登录已过期，请重新登录', 40100, 401)
    return ok({ ...state.user }) as unknown as T
  }

  if (url === '/auth/logout') {
    // 退出只注销当前 token，不动任何业务数据（下次登录原样回来）
    const raw = req.headers?.Authorization ?? req.headers?.authorization ?? ''
    const token = raw.replace(/^Bearer\s+/i, '').trim()
    if (token) tokens.delete(token)
    state.user = null
    return ok(null) as unknown as T
  }

  /* ---------- 演示调试钩子（只在 mock 模式存在，供 e2e 验证边界行为） ---------- */
  if (url === '/_debug/reset' && (method === 'POST' || method === 'GET')) {
    // 清库重来：删掉持久化快照并重新播种（e2e 每轮开始都调用，避免上一轮数据影响断言）
    resetDb()
    return ok(true) as unknown as T
  }

  if (url === '/_debug/slow401' && method === 'GET') {
    // 故意先等一段时间再返回 401，用来复现"旧会话的迟到 401"
    // mode=http → HTTP 401；mode=biz → HTTP 200 但业务码 40100（评审要求的第二条真实路径）
    const ms = Number((req.query ?? {}).ms ?? 1200)
    const mode = String((req.query ?? {}).mode ?? 'http')
    await sleep(Number.isFinite(ms) && ms >= 0 ? ms : 1200)
    throw new ApiError('登录已过期，请重新登录', 40100, mode === 'biz' ? 200 : 401)
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
    // 幂等：同一个 clientTripId 重复提交，返回第一次落库的那条，不重复加分；
    // 同键但内容不同 → 409（评审要求：不能静默把新内容当重放）
    // 注意：比较必须覆盖**全部业务字段**，漏掉起终点就会把 A→B 改成 C→D 的重放当成重试放过去。
    const dupTripId = tripIdByClientId.get(body.clientTripId)
    if (dupTripId) {
      const dup = trips.find((t) => t.tripId === dupTripId)
      if (dup) {
        const sameInput =
          dup.mode === body.mode &&
          Number(dup.distanceKm) === Number(body.distanceKm) &&
          dup.startTime === body.startTime &&
          dup.endTime === body.endTime &&
          dup.startPlace === body.startPlace &&
          dup.endPlace === body.endPlace
        if (!sameInput) throw new ApiError('幂等键已被不同内容使用', 40904, 409)
        return ok(dup) as unknown as T
      }
    }

    const distanceKm = Number(body.distanceKm)
    if (!(distanceKm > 0) || distanceKm > 200) {
      throw new ApiError('里程需大于 0 且不超过 200 公里', 40010, 400)
    }
    if (new Date(body.startTime) >= new Date(body.endTime)) {
      throw new ApiError('结束时间必须晚于开始时间', 40011, 400)
    }

    const reductionKg = calcReduction(distanceKm, body.mode)
    const awardedPoints = Math.max(0, Math.floor(reductionKg * POINTS_RATIO))
    // 业务主键由**服务端**生成，和前端传的 clientTripId 是两回事：
    // clientTripId 只用于幂等去重，绝不能当成 tripId 用（否则详情页拿它去查会 404）。
    // 也必须跨用户唯一：用 allOwners() 汇总全域编号 + 全局游标，而不是 trips.length
    const tripId = nextGlobalId('trip')
    const trip: TripDetail = {
      tripId,
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
    tripIdByClientId.set(body.clientTripId, tripId)
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
    // 下架商品对用户不可见（管理员在 /admin/products 里仍能看到）
    if (!p || p.status !== 'ON') throw new ApiError('商品不存在或已下架', 40402, 404)
    return ok(p) as unknown as T
  }

  if (url === '/mall/orders' && method === 'POST') {
    // 真后端：校验库存 → 扣积分 → 建订单，全程一个事务
    const memberKey = req.headers?.['Idempotency-Key']
    if (!memberKey) throw new ApiError('缺少幂等键，请刷新页面重试', 40002, 400)
    const body = req.body as { productId: string; quantity: number }

    // 幂等：同一个 requestId 重复提交（连点、超时重试）必须返回第一次的订单，
    // 绝不能再扣一次积分 / 再减一次库存。同键但内容不同 → 409（评审要求）。
    const dupOrderId = orderIdByRequestKey.get(memberKey)
    if (dupOrderId) {
      const dup = orders.find((o) => o.orderId === dupOrderId)
      if (dup) {
        const sameInput = dup.productId === body.productId && dup.quantity === Number(body.quantity)
        if (!sameInput) throw new ApiError('幂等键已被不同内容使用', 40904, 409)
        return ok(dup) as unknown as T
      }
    }

    const product = state.products.find((p) => p.productId === body.productId)
    if (!product || product.status !== 'ON') throw new ApiError('商品不存在或已下架', 40402, 404)
    if (product.stock < body.quantity) throw new ApiError('库存不足，请减少兑换数量', 40901, 409)
    const totalPoints = product.points * body.quantity
    if (state.account.balance < totalPoints) {
      throw new ApiError(`积分不足，还差 ${totalPoints - state.account.balance} 分`, 40030, 400)
    }
    const order: Order = {
      // 订单号与后端保持同一形状：O + yyyyMMdd + 4 位序号（如 O202611230001），
      // 不要用 Date.now()——长度对不上，前端与文档里的示例都是 12 位。
      orderId: nextOrderId(),
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
    orderIdByRequestKey.set(memberKey, order.orderId)
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
  /* ---------- 管理端 ---------- */
  // 取消订单只在管理端：#23 明确用户端不提供取消入口。
  // 幂等按 BR-06：同一订单重复取消，返回原结果，不报 409、也不再返还第二次。
  const adminCancelM = match(url, '/admin/orders/:id/cancel')
  if (adminCancelM && method === 'POST') {
    requireAdmin()
    const target = findOrderAnyOwner(adminCancelM[1])
    if (!target) throw new ApiError('订单不存在', 40403, 404)
    const owner = target.owner
    const o = target.order
    const body = req.body as { reason?: string } | undefined
    if (!body?.reason || !body.reason.trim()) throw new ApiError('请填写取消原因', 40040, 400)

    // 已经取消了：直接回放原结果（幂等，绝不二次返还）
    if (o.status === 'CANCELLED') return ok({ ...o }) as unknown as T
    // 已发放的不能取消：这是状态冲突，不是重复提交
    if (o.status !== 'CREATED') throw new ApiError('当前订单状态不允许取消，请刷新后重试', 40903, 409)

    o.status = 'CANCELLED'
    o.cancelReason = body.reason.trim()
    // 返还原额、原数量（J052）——退给"下单人"，不是退给当前管理员
    owner.account.balance += o.totalPoints
    owner.account.totalSpent -= o.totalPoints
    const product = state.products.find((p) => p.productId === o.productId)
    if (product) product.stock += o.quantity
    owner.flows = [
      {
        id: `F${Date.now()}`,
        type: 'REVERSE',
        title: `订单取消冲正 · ${o.productName}`,
        amount: o.totalPoints,
        balanceAfter: owner.account.balance,
        createdAt: new Date().toISOString(),
        refId: o.orderId,
      },
      ...owner.flows,
    ]
    commitOwner(target)
    return ok({ ...o }) as unknown as T
  }

  if (url === '/admin/dashboard' && method === 'GET') {
    // 运营视角是"全站"，所以把所有用户的数据摊平后汇总（真后端就是不带 user_id 的聚合查询）
    const owners = allOwners()
    const allTrips = owners.flatMap((x) => x.bucket.trips)
    return ok({
      userCount: state.users.filter((u) => u.role === 'USER').length,
      tripCount: allTrips.length,
      totalReductionKg: allTrips.reduce((s, t) => s + t.reductionKg, 0),
      totalPointsIssued: owners.reduce((s, x) => s + x.bucket.account.totalEarned, 0),
      modeDistribution: (['BUS', 'SUBWAY', 'BIKE', 'WALK'] as TripMode[]).map((m) => ({
        mode: m,
        count: allTrips.filter((t) => t.mode === m).length,
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
    // 管理端看全站订单：合并所有用户后按下单时间倒序
    const allOrders = allOwners()
      .flatMap((x) => x.bucket.orders)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return ok(paginate(allOrders, req.query)) as unknown as T
  }
  if (url === '/admin/users' && method === 'GET') {
    return ok(paginate(state.users, req.query)) as unknown as T
  }
  if (url === '/admin/reconciliation' && method === 'GET') {
    // 对账页三态：无差异 / 有差异 / 读取失败。
    // 这里用 query.diff=1 模拟"有差异"，diff=error 模拟"读取失败"，方便演示与验收。
    const mode = str(req.query?.diff)
    if (mode === 'error') throw new ApiError('对账服务暂时不可用，请稍后重试', 50001, 500)
    // 对账是全站核对，样本从所有用户里取第一份有数据的
    const owners = allOwners()
    const sampleOwner = owners.find((x) => x.bucket.trips.length > 0) ?? owners[0]
    const sampleTrip = sampleOwner?.bucket.trips[0]
    const sampleOrder = owners.flatMap((x) => x.bucket.orders)[0]
    const accountId = sampleOwner?.id ?? state.user?.id ?? 'U001'
    const items: ReconcileItem[] =
      mode === '1'
        ? [
            {
              id: 'RC-001',
              objectType: 'TRIP',
              objectId: sampleTrip?.tripId ?? 'T0002',
              checkName: '积分应发未发（分）',
              expected: 64,
              actual: 0,
            },
            {
              id: 'RC-002',
              objectType: 'ORDER',
              objectId: sampleOrder?.orderId ?? 'O0001',
              checkName: '库存与订单不一致（件）',
              expected: 24,
              actual: 23,
            },
            {
              id: 'RC-003',
              // 账户级差异：既不是行程也不是订单，objectType 用 ACCOUNT（objectId 是用户 id）。
              // 以前只能塞进 ORDER，语义是错的，所以放开了枚举。
              objectType: 'ACCOUNT',
              objectId: accountId,
              checkName: '账户余额与流水合计不符（分）',
              expected: 1437,
              actual: 1439,
            },
            {
              id: 'RC-004',
              // 账户级的第二种粒度：流水逐笔，objectId 是 `userId#流水序号`（如 U001#7）。
              // 前端原样展示、不假设 objectId 一定是纯 userId。
              objectType: 'ACCOUNT',
              objectId: `${accountId}#7`,
              checkName: '流水序号不连续（应无断号）',
              expected: 7,
              actual: 8,
            },
          ]
        : []
    return ok({ checkedAt: new Date().toISOString(), items }) as unknown as T
  }

  /* ---------- 管理端写操作（履约 / 商品维护） ---------- */
  const fulfillM = match(url, '/admin/orders/:id/fulfill')
  if (fulfillM && method === 'POST') {
    requireAdmin()
    const target = findOrderAnyOwner(fulfillM[1])
    if (!target) throw new ApiError('订单不存在', 40403, 404)
    const o = target.order
    // 状态机门禁：只有「待发放」能履约；重复点不会重复发货
    if (o.status !== 'CREATED') throw new ApiError('当前订单状态不允许发放，请刷新后重试', 40903, 409)
    o.status = 'FULFILLED'
    commitOwner(target)
    // 注意：兑换时库存与积分已经扣过，履约只改状态，绝不能再扣一次
    return ok({ ...o }) as unknown as T
  }

  const adminProductM = match(url, '/admin/products/:id')
  if (adminProductM && method === 'PATCH') {
    requireAdmin()
    const p = state.products.find((x) => x.productId === adminProductM[1])
    if (!p) throw new ApiError('商品不存在', 40402, 404)
    const body = (req.body ?? {}) as { points?: number; stock?: number; status?: 'ON' | 'OFF' }

    // 先全量校验，再一次性写入。
    // 早期版本"边校验边赋值"：{ points: 601, stock: -1 } 虽然返回 400，
    // 但单价已经被改成 601 —— 失败请求不允许改动任何字段。
    const next: { points?: number; stock?: number; status?: 'ON' | 'OFF' } = {}
    if (body.points !== undefined) {
      if (!Number.isInteger(body.points) || body.points < 1) {
        throw new ApiError('积分单价必须是大于 0 的整数', 40041, 400)
      }
      next.points = body.points
    }
    if (body.stock !== undefined) {
      if (!Number.isInteger(body.stock) || body.stock < 0) {
        throw new ApiError('库存必须是不小于 0 的整数', 40042, 400)
      }
      next.stock = body.stock
    }
    if (body.status !== undefined) {
      if (body.status !== 'ON' && body.status !== 'OFF') {
        throw new ApiError('商品状态只能是 ON 或 OFF', 40043, 400)
      }
      next.status = body.status
    }

    // 校验全部通过后才落盘，保证原子性
    if (next.points !== undefined) p.points = next.points
    if (next.stock !== undefined) p.stock = next.stock
    // 下架后商城列表/详情都查不到（见 /mall/products 的 status 过滤）
    if (next.status !== undefined) p.status = next.status

    return ok({ ...p }) as unknown as T
  }

  throw new ApiError(`mock 未实现的接口：${method} ${url}`, 40400, 404)
}

/**
 * 对外入口：每个请求结束后（写操作）把最新快照落盘。
 * 只读请求（GET）不落盘，省得每次翻页都重写一遍 localStorage。
 */
export async function mockRequest<T>(req: MockRequestInit): Promise<T> {
  const result = await handleRequest<T>(req)
  if (req.method !== 'GET') persist()
  return result
}
