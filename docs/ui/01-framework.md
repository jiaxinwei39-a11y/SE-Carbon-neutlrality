# 绿行积分 · Web 端框架设计

> 适用版本：v1.0（2026-11）　责任人：张生阳（前端与交互）
> 上游依据：`docs/01-requirements/`（用户故事 17 条、用例 17 个、业务规则 BR-01~BR-08）

## 1. 结论先行

| 维度 | 选型 | 理由 |
| --- | --- | --- |
| 形态 | **B/S，桌面优先的响应式 Web**，最小支持 1280×720，移动端只保证 375px 竖屏可用（不单独做 App） | 课程要求 Web 系统；管理端表格/图表在桌面才有生产力 |
| 前端框架 | **Vue 3 + Vite + TypeScript** | 团队最易上手，SFC 拆分页面和组件成本低，TS 能把「积分/减排」的数值类型钉死 |
| 状态 | **Pinia**（`useUserStore` / `useCartlessMallStore` 不需要，只要 user + dict） | 全局状态极少，避免过度设计 |
| 路由 | **Vue Router 4**，`meta.requiresAuth` / `meta.role` 双守卫 | 用户端与管理端两套布局靠 `meta.layout` 切换 |
| 请求 | **Axios**，统一实例 + 拦截器（token、错误提示、幂等键） | 对齐 BR-06 幂等要求 |
| 图表 | **ECharts 5**（按需引入 `BarChart`/`PieChart`/`LineChart`） | 管理端看板 |
| UI 库 | **不引入 Element Plus 等重型库**，按 `02-design-system.md` 自建 12 个基础组件 | 视觉统一、包体小；表格与表单场景简单，自建够用 |
| 后端 | **Spring Boot 3 + MySQL 8 + Flyway**，Redis 仅在需要「每日兑换次数」限流时引入 | 与系统设计课的答辩口径一致 |
| 部署 | 前端 `vite build` 产物交 Nginx 静态托管；后端 jar + MySQL，Docker Compose 一键起 | 郭浚文负责 CI/部署 |

**不做什么**（避免范围蔓延）：不做 SSR、不做 PWA、不做多语言、不做暗色主题（v1 只留 CSS 变量位）、不做移动 App 与小程序。

## 2. 信息架构

```
绿行积分（Web）
├─ 游客区（layout: blank）
│  ├─ /login            登录（UC-02）
│  └─ /register         注册（UC-01）
├─ 用户区（layout: user，顶部导航 + 1180px 内容区）
│  ├─ /                 首页：余额概览 + 快速上报 + 最近行程（UC-04/05）
│  ├─ /trips            行程记录（筛选、分页、详情抽屉）
│  ├─ /points           积分明细（流水、余额、按月对账）
│  ├─ /mall             积分商城（列表、搜索、排序）
│  ├─ /mall/:id         礼品详情 + 兑换确认
│  ├─ /orders           我的订单（状态页签、取消）
│  └─ /me               个人中心（资料、改密、退出）
└─ 管理区（layout: admin，左侧栏 + 工作台）
   ├─ /admin/dashboard  运营概览（UC-12）
   ├─ /admin/rules      碳核算规则（UC-09）
   ├─ /admin/products   礼品与库存（UC-10）
   ├─ /admin/orders     订单履约（UC-11）
   └─ /admin/users      用户管理（UC-14，启用/停用）
```

页面总数 **13**，其中 v1 必做 11 个（`/admin/users` 与礼品编辑页放 v1.1）。

## 3. 权限模型

| 角色 | 能进 | 守卫规则 |
| --- | --- | --- |
| 游客 | `/login` `/register` | 其余重定向 `/login?redirect=` |
| USER | 用户区 | `/admin/*` → 403 页 |
| ADMIN | 管理区 + 用户区只读 | 管理端写操作要求 `role === 'ADMIN'` |

前端守卫只做体验，**权限判定以后端为准**（BR-07：越权返回 403，不得靠前端隐藏按钮当安全措施）。

## 4. 前端目录结构

```
src/
├─ main.ts                 挂载 + 全局样式 + 路由守卫注册
├─ App.vue                 按 route.meta.layout 切换布局
├─ router/index.ts         路由表 + 守卫
├─ stores/user.ts          token、profile、role、登录/登出
├─ api/
│  ├─ http.ts              Axios 实例：baseURL、token 注入、统一错误、幂等键
│  ├─ auth.ts  trips.ts  points.ts  mall.ts  orders.ts  admin.ts
├─ layouts/
│  ├─ UserLayout.vue       顶栏 + 内容容器
│  ├─ AdminLayout.vue      侧栏 + 面包屑 + 内容
│  └─ BlankLayout.vue
├─ components/             AppButton/AppInput/AppSelect/AppTable/AppModal/AppTag/
│                          AppEmpty/AppPagination/AppToast/AppDrawer/StatCard/LineChart
├─ views/                  对应第 2 节 13 个页面
├─ styles/
│  ├─ tokens.css           设计变量（颜色/字号/间距/圆角/阴影）
│  ├─ base.css             reset + 排版基线
│  └─ utilities.css        少量原子类（.row .between .mt-16 .text-muted）
└─ utils/                  format.ts（积分/碳量/日期）、validators.ts、constants.ts
```

## 5. 接口约定（前后端契约）

```http
POST /api/trips
Idempotency-Key: 8f3c...        # BR-06：客户端生成，24h 内重复提交返回同一结果
{ "clientTripId": "...", "mode": "BUS", "distanceKm": 10.0, "startTime": "...", "endTime": "..." }
→ 201 { "tripId": "...", "reductionKg": 1.5, "awardedPoints": 15, "status": "POINTED" }
```

| 约定 | 内容 |
| --- | --- |
| 响应体 | `{ code: 0, message: "ok", data: ... }`；非 0 即业务失败，`message` 可直接展示 |
| 分页 | `?page=1&size=20` → `{ items, total, page, size }` |
| 时间 | 全部 ISO-8601 带时区；前端只做展示格式化 |
| 数值 | 减排量 `decimal(10,2)`、积分 `int`；**前端不做二次取整**，以服务端返回为准（BR-02/BR-03） |
| 金额式字段 | 一律以「分/千克」为单位传数字，禁止传带单位字符串 |

## 6. 关键前端约束（来自业务规则）

| 规则 | 前端落点 |
| --- | --- |
| BR-02 减排 = 里程 ×(基准因子 − 方式因子) | 首页预估用同一公式，但**标注「预估，以服务端计算为准」**；不允许前端落库 |
| BR-03 积分 = floor(减排 × 积分比例) | 预估展示 `Math.floor`，与后端对齐；负数截 0 |
| BR-05 结束时间不得早于开始时间 | 表单即时校验 + 提交前二次校验 |
| BR-06 幂等 | 提交按钮进入 loading 并禁用；`Idempotency-Key` 一次点击生成一次 |
| BR-08 积分不足/库存不足 | 兑换前本地预检（体验），最终以后端错误码为准并给出可操作提示 |

## 7. 里程碑（对齐迭代计划）

| 阶段 | 产出 | 负责 |
| --- | --- | --- |
| M1 框架 | 脚手架、路由、布局、tokens.css、12 个基础组件 | 张生阳 |
| M2 用户端 | 登录/注册/首页/行程/积分 5 页联调 | 张生阳 + 魏嘉鑫 |
| M3 交易 | 商城/详情/订单（含兑换幂等） | 张生阳 + 魏嘉鑫 |
| M4 管理端 | 看板/规则/礼品/订单 4 页联调 | 张生阳 + 李金平 |
| M5 收尾 | 空态/错误态/骨架屏、可访问性、部署 | 郭浚文 |

## 8. 待确认

1. 是否需要「管理端同账号切用户端」的入口？（原型里放在 `/me` 的「运营管理端」，实现时建议独立域名或路径，避免角色混淆）
2. 礼品详情是否需要富文本说明（运营可编辑）？若需要，v1 用纯文本 + 换行，v1.1 再上富文本。
3. 图表是否需要导出 PNG？课程演示建议只做「截图」，不做导出功能。
