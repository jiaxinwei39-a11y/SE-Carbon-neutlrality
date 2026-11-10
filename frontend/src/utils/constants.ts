import type { OrderStatus, PointsFlowType, TripMode, TripStatus } from '@/types'

/** 标签色调（与 AppTag 的 tone 取值一致） */
export type TagTone = 'green' | 'amber' | 'gray' | 'rose'

/** 出行方式元数据：顺序 = 页面上的展示顺序（J015） */
export const MODE_META: Record<TripMode, { label: string; icon: string; short: string }> = {
  BUS: { label: '公交', icon: '🚌', short: '公交' },
  SUBWAY: { label: '地铁', icon: '🚇', short: '地铁' },
  BIKE: { label: '骑行', icon: '🚲', short: '骑行' },
  WALK: { label: '步行', icon: '🚶', short: '步行' },
}

/** 后端返回的枚举可能出现前端不认识的取值，兜底不白屏 */
export const MODES: TripMode[] = ['BUS', 'SUBWAY', 'BIKE', 'WALK']

export function modeLabel(mode: string): string {
  return MODE_META[mode as TripMode]?.label ?? mode
}

export function modeIcon(mode: string): string {
  return MODE_META[mode as TripMode]?.icon ?? '🚗'
}

export const TRIP_STATUS_META: Record<TripStatus, { text: string; tone: TagTone }> = {
  PENDING: { text: '核算中', tone: 'amber' },
  POINTED: { text: '已入账', tone: 'green' },
  FAILED: { text: '核算失败', tone: 'rose' },
}

export const ORDER_STATUS_META: Record<OrderStatus, { text: string; tone: TagTone }> = {
  CREATED: { text: '待发放', tone: 'amber' },
  FULFILLED: { text: '已完成', tone: 'green' },
  CANCELLED: { text: '已取消', tone: 'gray' },
}

export const FLOW_TYPE_META: Record<PointsFlowType, { text: string }> = {
  EARN: { text: '获得' },
  SPEND: { text: '消费' },
  REVERSE: { text: '冲正' },
}

/** 分页默认每页条数：与后端约定一致，不要各页各写一个 */
export const PAGE_SIZE = 10

/** 演示用：一次上报最多 200 公里（J016） */
export const MAX_DISTANCE_KM = 200
