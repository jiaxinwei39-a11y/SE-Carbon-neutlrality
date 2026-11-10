/**
 * 全局类型定义
 * 这些类型是"前后端的共同语言"：后端接口返回的字段名必须能落到这里。
 * 改这里 = 改契约，要通知后端。
 */

/** 出行方式（J015：四个全称，不要用 BUS/MET/BIK/WAL 这种缩写） */
export type TripMode = 'BUS' | 'SUBWAY' | 'BIKE' | 'WALK'

/** 行程核算状态 */
export type TripStatus = 'PENDING' | 'POINTED' | 'FAILED'

/** 订单状态 */
export type OrderStatus = 'CREATED' | 'FULFILLED' | 'CANCELLED'

/** 积分流水类型 */
export type PointsFlowType = 'EARN' | 'SPEND' | 'REVERSE'

export interface User {
  id: string
  nickname: string
  phone: string
  role: 'USER' | 'ADMIN'
  avatarText: string
  points: number
}

export interface Trip {
  tripId: string
  mode: TripMode
  distanceKm: number
  /** 减排量，后端原精度（9 位），前端只负责格式化 */
  reductionKg: number
  awardedPoints: number
  status: TripStatus
  startTime: string
  endTime: string
  startPlace: string
  endPlace: string
  createdAt: string
}

/** 核算明细：必须带"当时用的因子"，否则历史数据无法解释（D-03） */
export interface TripDetail extends Trip {
  baseFactor: number
  modeFactor: number
  pointsRatio: number
  calculatedAt: string
  ruleVersion: string
}

export interface PointsAccount {
  balance: number
  totalEarned: number
  totalSpent: number
  tripCount: number
  totalReductionKg: number
}

export interface PointsFlow {
  id: string
  type: PointsFlowType
  title: string
  /** 正数入账、负数出账；冲正为正数 */
  amount: number
  balanceAfter: number
  createdAt: string
  refId?: string
}

export interface Product {
  productId: string
  name: string
  icon: string
  points: number
  stock: number
  status: 'ON' | 'OFF'
  desc?: string
}

export interface Order {
  orderId: string
  productId: string
  productName: string
  productIcon: string
  quantity: number
  /** 下单时的单价快照（商品改价不影响历史订单，D-08） */
  unitPoints: number
  totalPoints: number
  status: OrderStatus
  createdAt: string
  cancelReason?: string
}

export interface ReconcileItem {
  id: string
  objectType: 'TRIP' | 'ORDER'
  objectId: string
  checkName: string
  /** 期望值与实际值都用 number，保留后端原精度，前端只做展示格式化 */
  expected: number
  actual: number
}

export interface CarbonRule {
  ruleId: string
  version: string
  mode: TripMode
  baseFactor: number
  modeFactor: number
  pointsRatio: number
  effectiveFrom: string
  status: 'ACTIVE' | 'ARCHIVED'
}

/** 统一响应体：{ code, message, data } —— code === 0 才算成功 */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

/** 统一分页返回：items + total + page + size */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface PageQuery {
  page?: number
  size?: number
}
