/**
 * 格式化工具：**只负责显示，不负责改数据**
 * 规则来自设计标注：列表展示 6 位小数并注明"展示值已舍入"，
 * 核算明细展示 9 位原精度；积分取整以后端结果为准，前端绝不二次取整。
 */

/** 千分位整数：3450 -> 3,450 */
export function fmtPoints(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '--'
  return Math.round(n).toLocaleString('zh-CN')
}

/** 带符号的积分：+15 / -500 */
export function fmtSigned(n: number): string {
  const abs = fmtPoints(Math.abs(n))
  return n >= 0 ? `+${abs}` : `-${abs}`
}

/**
 * 减排量固定 6 位小数（列表/卡片用）
 * toFixed 是四舍五入，所以页面上必须提示"展示值已舍入"
 */
export function fmtKg6(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '--'
  return n.toFixed(6)
}

/** 明细页保留 9 位原精度，不做任何取舍展示 */
export function fmtKg9(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '--'
  return n.toFixed(9)
}

/** 里程：最多 3 位小数，末尾 0 去掉 */
export function fmtKm(n: number): string {
  return String(Number(n.toFixed(3)))
}

/** 通用小数位 */
export function fmtNum(n: number, digits: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '--'
  return n.toFixed(digits)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${fmtDate(iso)} ${fmtTime(iso)}`
}

/** 表单用：Date -> 本地 yyyy-MM-ddTHH:mm（datetime-local 的格式） */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
