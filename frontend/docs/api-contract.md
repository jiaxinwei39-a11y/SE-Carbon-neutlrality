# 接口契约（前端 ↔ 后端）

> 这份文档是**前端已经写死的约定**，后端按它实现即可直接联调。
> 所有字段名、错误码、分页参数都来自前端 `src/api/*.ts` 与 `src/api/mock.ts`（mock 就是按真实契约写的）。
> 版本：v1（2026-11-15）｜维护：前端 ｜ 对接：后端

---

## 0. 30 秒看完的部分

| 项目 | 约定 |
|---|---|
| Base URL | `http://localhost:8080/api`（前端用 `.env` 里的 `VITE_API_BASE_URL` 配置，不含 `/api` 也行，见 §1） |
| 数据格式 | `application/json; charset=utf-8` |
| 鉴权 | 请求头 `Authorization: Bearer <token>` |
| 成功响应 | HTTP 200 + `{ "code": 0, "message": "ok", "data": ... }` |
| 失败响应 | HTTP 400/401/404/409/500 + 同样结构，`code` 为业务码，`message` **直接给用户看** |
| 分页 | Query `page`（从 1 开始）、`size`（默认 10）；响应 `{ items, total, page, size }` |
| 时间 | ISO-8601 带时区，例：`2026-11-13T08:20:00.000Z` |
| 数字 | 减排量 `number`（**不截断**，前端自己格式化 6 位展示 / 9 位明细）；积分 `number`（整数） |
| 写操作 | `POST /trips`、`POST /mall/orders` 必须带 `Idempotency-Key` 头 |

---

## 1. 通用约定

### 1.1 响应包体

```json
{ "code": 0, "message": "ok", "data": { } }
```

- `code = 0` 表示成功，其他都是失败。
- 失败时 `data` 为 `null`，`message` 是**可以直接显示给用户的中文**（前端会原样展示，不再翻译）。
- 前端判断顺序：HTTP 状态 → 401 触发重新登录 → 业务 `code`。

### 1.2 分页

请求：`?page=1&size=10`（`page` 从 **1** 开始，不是 0）

响应：

```json
{ "code": 0, "message": "ok",
  "data": { "items": [], "total": 37, "page": 1, "size": 10 } }
```

### 1.3 鉴权与 401

- 登录后把 `token` 存起来，后续每个请求带 `Authorization: Bearer <token>`。
- **token 失效必须返回 HTTP 401**（业务码 `40100`）。前端收到 401 会清空登录态并跳登录页，携带 `?redirect=` 回到原页面。
- 前端也会处理「HTTP 200 但业务码 401」的情况，但**建议统一用 HTTP 401**，不要只在 body 里表达。
- **每次登录必须签发不同的 token**（JWT 的 `iat`/`jti` 或随机串即可）。
  原因：前端靠「发起请求时的 token ≠ 当前 token」来判断**旧会话的迟到响应**，不处理就会出现
  「用户重新登录后，上一个会话迟到的 401 把新会话踢下线」。若后端复用同一个 token 字符串，
  客户端在协议层面就无法区分新旧会话。前端已按此实现并有回归（e2e 第 8.5 节，http / biz 两条路径）。

### 1.4 幂等

`POST /trips`、`POST /mall/orders` 必须带请求头：

```
Idempotency-Key: <客户端生成的唯一串>
```

- 同一个 key 重复提交，**必须返回第一次的结果**（同样的 tripId / orderId），不能重复加分、不能重复扣积分。
- 超时重试复用同一个 key；**换 key 就是新业务**。
- 建议后端用 `unique index` 或 Redis `SETNX` 实现；Redis 的 TTL 只做缓存加速，
  **幂等关系本身不得因时间过期而失效**（过期后回数据库按业务键查，仍要返回原结果）。
  详见 §3.18 第 5 条。

### 1.5 枚举

| 枚举 | 取值 | 说明 |
|---|---|---|
| `TripMode` | `BUS` `SUBWAY` `BIKE` `WALK` | 公交 / 地铁 / 骑行 / 步行。**用全称，不要用 BUS/MET/BIK/WAL 的缩写** |
| `TripStatus` | `PENDING` `POINTED` `FAILED` | 待核算 / 已入账 / 核算失败 |
| `OrderStatus` | `CREATED` `FULFILLED` `CANCELLED` | 待发放 / 已完成 / 已取消 |
| `PointsFlowType` | `EARN` `SPEND` `REVERSE` | 获得 / 消费 / 冲正 |
| `Role` | `USER` `ADMIN` | 普通用户 / 管理员 |

### 1.6 错误码表

> 与后端 `gts-backend/src/main/java/com/gts/common/Api.java` 对齐（2026-11-17 核对）。
> 前端判定只认 `code`，`message` 只用于兜底展示；**业务错误一律 HTTP 200~499 + 非 0 code，不要用 500 表达业务错误**。

**通用与登录**

| code | HTTP | 含义 | 前端表现 |
|---|---|---|---|
| `0` | 200 | 成功 | — |
| `40000` | 400 | 参数校验失败（兜底，未细分） | toast / 字段红字，用 message |
| `40001` | 400 | 账号或密码为空 | 表单下方红字 |
| `40002` | 400 | 缺少幂等键（`Idempotency-Key`） | toast「请刷新后重试」 |
| `40012` | 400 | 密码格式非法 | 字段红字 |
| `40013` | 400 | 手机号格式非法 | 字段红字 |
| `40100` | 401 | 未登录 / 登录已过期 | 清 session，跳登录页并带 `redirect` |
| `40101` | 401 | 账号或密码错误 | 表单红字 |
| `40301` | 403 | 非管理员调用管理端接口 | toast「无权限」或 403 页 |
| `40400` | 404 | 接口路径不存在 | 兜底 toast（多为前端写错路径） |
| `50000` | 500 | 服务端异常 | toast；对账页显示「读取失败」 |

**行程与积分**

| code | HTTP | 含义 | 前端表现 |
|---|---|---|---|
| `40010` | 400 | 里程不在 (0, 200] 区间（`DISTANCE_INVALID`） | 里程输入框红字 |
| `40011` | 400 | 时间非法：结束早于开始 / 晚于当前时间（`TIME_INVALID`） | 时间字段红字 |
| `40030` | 400 | 积分不足 | toast，提示还差多少分 |
| `40401` | 404 | 行程不存在 | 整页「记录不可用」+ 返回列表 |
| `40905` | 409 | 当前时间无可用碳核算规则 | 上报页红字「规则未生效，请联系运营」 |

**商城与订单**

| code | HTTP | 含义 | 前端表现 |
|---|---|---|---|
| `40040` | 400 | 取消原因为空 | 弹窗内红字 |
| `40402` | 404 | 商品不存在（或已下架对用户不可见） | 整页「记录不可用」 |
| `40403` | 404 | 订单不存在 | 整页「记录不可用」 |
| `40901` | 409 | 库存不足 | toast，提示减少数量 |
| `40903` | 409 | 当前状态不允许该操作（发放/取消） | toast「请刷新后重试」 |
| `40904` | 409 | 幂等键复用但请求内容不同 | toast「请求内容已变化，请刷新后重试」 |
| `40908` | 409 | 商品已下架（兑换时） | toast「该礼品已下架」 |

**管理端商品与规则**

| code | HTTP | 含义 | 前端表现 |
|---|---|---|---|
| `40041` | 400 | 商品积分单价非法（须为正整数） | 弹窗积分框红字 |
| `40042` | 400 | 商品库存非法（须为 ≥0 的整数） | 弹窗库存框红字 |
| `40043` | 400 | 商品状态非法（只能是 `ON` / `OFF`） | 弹窗状态框红字 |
| `40906` | 409 | 手机号已占用（注册） | 字段红字 |
| `40907` | 409 | 规则版本区间重叠 | 规则表单红字 |
| `40909` | 409 | 规则不可追溯生效（`effectiveFrom` 早于已核算行程） | 规则表单红字 |

> `40041` / `40042` / `40043` 是 2026-11-17 与后端议定的**独立码**，需要加入 `Api.java`：
> `PRODUCT_POINTS_INVALID = 40041`、`PRODUCT_STOCK_INVALID = 40042`、`PRODUCT_STATUS_INVALID = 40043`。
> 为什么不用统一的 `40000`：前端要把红字挂到具体输入框，靠中文 message 匹配会在后端改文案时静默失效。

---

## 2. 接口清单（22 个）

| # | 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|---|
| 1 | POST | `/auth/login` | 登录 | 否 |
| 2 | GET | `/auth/me` | 取当前用户 | 是 |
| 3 | POST | `/auth/logout` | 退出 | 是 |
| 4 | GET | `/trips` | 行程列表（分页） | 是 |
| 5 | POST | `/trips` | 上报行程 | 是 |
| 6 | GET | `/trips/{tripId}` | 行程详情（含核算明细） | 是 |
| 7 | GET | `/points/account` | 积分账户 | 是 |
| 8 | GET | `/points/flows` | 积分流水（分页） | 是 |
| 9 | GET | `/mall/products` | 商品列表（分页） | 是 |
| 10 | GET | `/mall/products/{productId}` | 商品详情 | 是 |
| 11 | POST | `/mall/orders` | 兑换下单 | 是 |
| 12 | GET | `/orders` | 我的订单（分页） | 是 |
| 13 | GET | `/orders/{orderId}` | 订单详情 | 是 |
| 14 | POST | `/admin/orders/{orderId}/cancel` | 取消订单（**管理员**，用户端无此能力） | 管理员 |
| 15 | GET | `/admin/dashboard` | 数据概览 | 管理员 |
| 16 | GET | `/admin/rules` | 核算规则列表 | 管理员 |
| 17 | GET | `/admin/products` | 商品管理（分页，含下架） | 管理员 |
| 18 | **PATCH** | **`/admin/products/{productId}`** | **商品维护（改价/改库存/上下架）** | 管理员 |
| 19 | GET | `/admin/orders` | 订单管理（分页，全量） | 管理员 |
| 20 | **POST** | **`/admin/orders/{orderId}/fulfill`** | **订单履约（发放）** | 管理员 |
| 21 | GET | `/admin/users` | 用户管理（分页） | 管理员 |
| 22 | GET | `/admin/reconciliation` | 积分对账 | 管理员 |

> 管理端目前做**两个写操作**（订单履约、商品维护最小版）+ 一个取消动作。
> **修订（2026-11-15，评审 #23）**：取消订单从用户端挪到管理端，接口路径改为 `/admin/orders/{orderId}/cancel`；用户端不再提供任何取消入口。
> **未完成的 P0 仍然计入 P0**：注册、商品维护（当前只有改价/改库存/上下架，缺新增与图文）、规则管理。口径要缩减须先走「产品范围变更确认」，不能只改文档。

---

## 3. 逐接口说明

### 3.1 登录

```
POST /auth/login
```

请求：

```json
{ "account": "13800138000", "password": "123456" }
```

响应：

```json
{ "code": 0, "message": "ok", "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "U0001",
      "nickname": "张生阳",
      "phone": "13800138000",
      "role": "USER",
      "avatarText": "张",
      "points": 837
    }
} }
```

失败：`40001`（缺参数）、`40101`（账号或密码错误）。

> `account` 既可能是手机号，也可能是 `admin` 这类管理员账号，后端自行区分。

### 3.2 取当前用户

```
GET /auth/me
```

响应 `data`：同上的 `user` 对象。失败：`40100`。

### 3.3 退出

```
POST /auth/logout → data: null
```

前端只负责清本地 token，服务端可做 token 作废（可选）。

### 3.4 行程列表

```
GET /trips?page=1&size=10&mode=BUS&keyword=软件园&from=2026-11-01&to=2026-11-30
```

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | int | 否 | 从 1 开始，默认 1 |
| size | int | 否 | 默认 10 |
| mode | enum | 否 | `BUS`/`SUBWAY`/`BIKE`/`WALK`，`ALL` 或空表示全部 |
| keyword | string | 否 | 模糊匹配 **起点 / 终点 / 行程号** |
| from / to | date | 否 | 按 `startTime` 过滤，`yyyy-MM-dd`，含首尾 |

响应 `data.items[]`（列表项**不含**因子明细，减轻传输）：

```json
{
  "tripId": "T202611130021",
  "mode": "BUS",
  "distanceKm": 10,
  "reductionKg": 1.500000123,
  "awardedPoints": 15,
  "status": "POINTED",
  "startTime": "2026-11-13T00:20:00.000Z",
  "endTime": "2026-11-13T00:55:00.000Z",
  "startPlace": "软件园东门",
  "endPlace": "地铁二号线站",
  "createdAt": "2026-11-13T00:55:12.000Z"
}
```

### 3.5 上报行程（核心接口）

```
POST /trips
Idempotency-Key: trip-1794582371070-u5qfir
```

请求：

```json
{
  "clientTripId": "CT-1794582371070-u5qfir",
  "mode": "BUS",
  "distanceKm": 10,
  "startTime": "2026-11-13T08:20:00.000Z",
  "endTime": "2026-11-13T08:55:00.000Z",
  "startPlace": "软件园东门",
  "endPlace": "地铁二号线站"
}
```

| 字段 | 校验 |
|---|---|
| distanceKm | `0 < x <= 200`，最多 3 位小数 |
| startTime / endTime | `start < end`，且 `end <= 服务器当前时间` |
| startPlace / endPlace | 必填，≤ 50 字 |
| clientTripId | 前端生成的幂等键，**只用于去重，不能当主键** |

响应 `data`：**`TripDetail`**（比列表多 5 个字段）

```json
{
  "tripId": "T202611130021",
  "mode": "BUS",
  "distanceKm": 10,
  "reductionKg": 1.500000123,
  "awardedPoints": 15,
  "status": "POINTED",
  "startTime": "...", "endTime": "...",
  "startPlace": "软件园东门", "endPlace": "地铁二号线站",
  "createdAt": "...",
  "baseFactor": 0.2,
  "modeFactor": 0.05,
  "pointsRatio": 10,
  "calculatedAt": "2026-11-13T00:55:12.000Z",
  "ruleVersion": "R-2026-11"
}
```

**后端要做的计算（务必按这个顺序）：**

```
减排量 reductionKg = distanceKm × (baseFactor − modeFactor)     // 不要四舍五入
积分   awardedPoints = floor(reductionKg × pointsRatio)          // 负数取 0
```

参考因子（来自核算规则表 `carbon_rule`，以规则表为准）：

| 出行方式 | modeFactor |
|---|---|
| BUS 公交 | 0.05 |
| SUBWAY 地铁 | 0.04 |
| BIKE 骑行 | 0.00 |
| WALK 步行 | 0.00 |

`baseFactor = 0.2 kgCO₂e/km`，`pointsRatio = 10 分/kg`。

**必须在同一个事务里**：写 `trip` → 写 `points_ledger`（EARN）→ 更新 `points_account.balance`。任一步失败整体回滚，不能出现「行程有了但没加分」。

> `tripId` **必须由服务端生成**（例：`T + yyyyMMdd + 4 位序号`）。曾经把 `clientTripId` 当主键用过，导致提交后跳详情页 404 —— 别再犯。

### 3.6 行程详情

```
GET /trips/{tripId} → TripDetail（同上）    失败：40401
```

### 3.7 积分账户

```
GET /points/account
```

```json
{ "balance": 837, "totalEarned": 1737, "totalSpent": 900,
  "tripCount": 20, "totalReductionKg": 25.39 }
```

> 必须满足：`balance = totalEarned − totalSpent`。

### 3.8 积分流水

```
GET /points/flows?page=1&size=10&type=ALL
```

`type`：`ALL`（默认）/`EARN`/`SPEND`/`REVERSE`

```json
{ "id": "F00001", "type": "EARN",
  "title": "行程核算入账 · BUS 10 公里",
  "amount": 15, "balanceAfter": 837,
  "createdAt": "2026-11-13T00:55:12.000Z",
  "refId": "T202611130021" }
```

> `amount` 带符号：获得为正，消费为负，冲正为正。`balanceAfter` 必须与该笔发生后的真实余额一致（对账要用）。

### 3.9 商品列表 / 详情

```
GET /mall/products?page=1&size=12&keyword=咖啡
GET /mall/products/{productId}
```

```json
{ "productId": "G01", "name": "咖啡券（中杯）", "icon": "☕",
  "points": 300, "stock": 20, "status": "ON", "desc": "..." }
```

- 列表只返回 `status = ON`（管理端接口才返回全部）。
- `stock = 0` 时前端置灰显示「已兑完」，接口照常返回。

### 3.10 兑换下单

```
POST /mall/orders
Idempotency-Key: order-1794582371070-ab12cd
```

```json
{ "productId": "G01", "quantity": 1 }
```

响应 `data`：

```json
{ "orderId": "O202611130001",
  "productId": "G01", "productName": "咖啡券（中杯）", "productIcon": "☕",
  "quantity": 1, "unitPoints": 300, "totalPoints": 300,
  "status": "CREATED", "createdAt": "2026-11-13T01:02:00.000Z" }
```

**校验顺序（顺序会影响提示文案）：** 幂等键 → **幂等查重（命中即返回原订单，见下）** → 商品存在且上架（40402）→ 库存（40901）→ 积分（40030）。

**幂等查重要在扣分之前做**（这是实测暴露过的缺陷：只校验 `Idempotency-Key` 是否存在、却不查重，
超时重试就会新建第二单、重复扣分）：

- 用「用户 + `Idempotency-Key`」查已存在的订单；
- **同键 + 同 `productId`/`quantity`** → 直接返回**原订单对象**（`200`，`code=0`），不新建、不扣分；
- **同键 + 不同内容** → `409` + `40904 幂等键已被不同内容使用`，不得静默覆盖；
- 落库后必须把「用户 + 幂等键 → 订单」写进幂等记录，并由数据库唯一约束兜底
  （`orders(user_id, request_id)`），否则并发/重试仍可能双写。

**事务内要做**：扣库存 → 扣积分 → 写 `order` → 写 `points_ledger`（SPEND，负额）。
`unitPoints` 是**下单时快照**，之后商品改价不影响历史订单。

### 3.11 订单列表 / 详情

```
GET /orders?page=1&size=10&status=CREATED
GET /orders/{orderId}
```

`status`：`ALL`/`CREATED`/`FULFILLED`/`CANCELLED`。详情在列表字段基础上多 `cancelReason?`。

### 3.12 取消订单（**管理员**）

```
POST /admin/orders/{orderId}/cancel
Authorization: Bearer <管理员 token>
```

```json
{ "reason": "库存不足无法发放" }
```

规则：

- **权限**：只有 `ADMIN` 可调用；用户 token 调用返回 `403` / `40301`。用户端不提供取消入口（#23）。
- `reason` 必填（40040），前端已做校验，后端仍要校验。
- `CREATED` → `CANCELLED`，**原额返还积分、原数量返还库存**，并写一条 `REVERSE` 流水（正额）。
- **幂等（BR-06）**：对已经 `CANCELLED` 的订单再次调用，返回**原订单对象**（`200`，`code=0`），
  **不得返回 409、也不得再次返还积分或库存**。只有 `FULFILLED` 的订单取消才返回 `409` / `40903`。
- 返回更新后的订单对象。

### 3.13 管理端概览

```
GET /admin/dashboard
```

```json
{ "userCount": 12, "tripCount": 20, "totalReductionKg": 25.39, "totalPointsIssued": 1737,
  "modeDistribution": [ { "mode": "BUS", "count": 6 } ],
  "dailyTrend": [ { "date": "11-04", "count": 3 } ] }
```

`dailyTrend` 给**最近 7 天**即可；`modeDistribution` 固定返回 4 个方式（没有的给 0）。

### 3.14 规则 / 商品 / 订单 / 用户管理

```
GET /admin/rules          → CarbonRule[]（不分页）
GET /admin/products?page&size → Page<Product>（含 OFF）
GET /admin/orders?page&size   → Page<Order>（全量）
GET /admin/users?page&size    → Page<User>
```

`CarbonRule`：

```json
{ "ruleId": "R-2026-11-BUS", "version": "R-2026-11", "mode": "BUS",
  "baseFactor": 0.2, "modeFactor": 0.05, "pointsRatio": 10,
  "effectiveFrom": "2026-11-01", "status": "ACTIVE" }
```

> 规则表按 `effectiveFrom` 生效，历史行程保留当时的 `ruleVersion` 与因子快照。

### 3.15 积分对账（P13）

```
GET /admin/reconciliation
```

```json
{ "checkedAt": "2026-11-13T01:10:00.000Z",
  "items": [
    { "id": "RC-001", "objectType": "TRIP", "objectId": "T202610030003",
      "checkName": "积分应发未发（分）", "expected": 64, "actual": 0 },
    { "id": "RC-002", "objectType": "ORDER", "objectId": "O202611080001",
      "checkName": "库存与订单不一致（件）", "expected": 24, "actual": 23 },
    { "id": "RC-003", "objectType": "ACCOUNT", "objectId": "U001",
      "checkName": "账户余额与流水合计不符（分）", "expected": 1437, "actual": 1439 }
  ] }
```

**`objectType` 枚举（三值，2026-11-17 放宽）：**

| 值 | 含义 | `objectId` 是 | 典型差异 |
| --- | --- | --- | --- |
| `TRIP` | 行程级 | `tripId` | 积分应发未发、减排量与流水不符 |
| `ORDER` | 订单级 | `orderId` | 库存与订单不一致、订单积分与流水不符 |
| `ACCOUNT` | **账户级** | `userId` | 余额与流水合计不符、累计获得/消费对不上 |

> `ACCOUNT` 是后加的：账户级差异既不是行程也不是订单，**不要为了凑类型塞进 `ORDER`**——
> 那会让人搞不清这条差异该找谁核查。前端按 `objectType` 渲染类型标签，遇到未知值原样显示，不会崩。

- `items` 为空数组 = **无差异**；非空 = 有差异（前端渲染差异表）。
- 差异值由前端按 `actual - expected` 计算展示，**后端不用再单独算一列**。
- **服务端出错必须返回 5xx**，不能返回空数组 —— 前端把「读取失败」和「无差异」分成两个界面，混了就是漏报。
- 只读：不提供自动修复、不提供导出。

### 3.16 商品维护（改价 / 改库存 / 上下架）

> **口径确认（2026-11-15，组长高泽）**：商品维护只提供下面这一个 PATCH 接口，
> **不拆** `POST /{id}/status`、`POST /{id}/stock`。理由是同一资源的字段部分更新，
> 拆成多个动作接口会让"改价 + 改库存"无法放进同一个事务。
> 新增商品（`POST /admin/products`）与改名称/图文排在 v1.1。

> **实现对齐（2026-11-17，与后端确认选 A）**：后端现有 `PUT /admin/products/{id}` 是**全量必填**
> （`name`/`points`/`status`/`stock`），前端发 `PATCH` 会 405。请后端补一个 `@PatchMapping`
> 指向同一处理逻辑、只校验传了的字段，校验全部通过后再落盘（失败不得改动任何字段）。
> 后端已有的 `/status`、`/stock` 可以留着，但**不作为前端契约**。

```
PATCH /admin/products/{productId}
Authorization: Bearer <admin token>
Content-Type: application/json

{ "points": 600, "stock": 99, "status": "OFF" }   // 三个字段都可选，只发要改的
```

```json
{ "code": 0, "message": "ok",
  "data": { "productId": "G01", "name": "定制环保帆布袋", "icon": "👜",
            "points": 600, "stock": 99, "status": "OFF", "desc": "加厚棉布，可装 A4 文件" } }
```

| 字段 | 规则 | 失败码 |
|---|---|---|
| `points` | 整数且 ≥ 1 | `40041` |
| `stock` | 整数且 ≥ 0（0 = 兑完，用户端置灰但仍可见） | `40042` |
| `status` | 只能是 `ON` / `OFF` | `40043` |
| 非管理员 | 一律拒绝 | `40301` |

- **只改价格与库存**：`desc`、图文、新增/删除商品排在 v1.1。
- **改价不追溯**：订单里存的是 `unitPoints` 快照，历史订单金额不变。
- **下架即时生效**：`OFF` 后 `GET /mall/products` 与 `GET /mall/products/{id}` 都不再返回它（用户端 404），管理端列表仍可见。
- 真实系统还需要「变更留痕」（谁改的、改前改后、原因），v1 先只留 `updatedAt`。

### 3.17 订单履约（发放）

```
POST /admin/orders/{orderId}/fulfill
Authorization: Bearer <admin token>
（无 body）
```

```json
{ "code": 0, "message": "ok",
  "data": { "orderId": "O202611080001", "productId": "G02", "productName": "咖啡券（中杯）",
            "quantity": 1, "unitPoints": 300, "totalPoints": 300,
            "status": "FULFILLED", "createdAt": "2026-11-04T02:05:00.000Z" } }
```

| 情况 | 返回 |
|---|---|
| `status = CREATED` | 200，改为 `FULFILLED` |
| `status = FULFILLED`（重复点） | **409 `40903`**，绝不能重复发货 |
| `status = CANCELLED` | 409 `40903` |
| 订单不存在 | 404 `40403` |
| 非管理员 | 403 `40301` |

- **履约只改状态**：兑换时积分和库存已经扣过，发放**不能再扣一次**（这是最容易写错的一处）。
- 状态机单向：`CREATED → FULFILLED`，无反悔接口；要退还走管理端「取消」（仅 `CREATED` 可取消）或线下售后。

---

## 3.18 幂等总则（评审 #5，所有写接口都适用）

写接口（上报行程、兑换下单、履约、取消）都必须满足：

1. **按「用户 + 业务键」隔离**：幂等键只在**同一个用户**内有效，不能跨用户命中别人的结果。
   行程用 `Idempotency-Key` 头，兑换用 `requestId`，取消/履约用资源 id 本身（订单只能取消一次）。
2. **同键同输入 → 重放原结果**：返回 200 + 上一次的结果，**不产生第二笔积分、第二笔扣减**。
3. **同键不同输入 → 拒绝**：返回 `409`（建议 `40904 幂等键已被不同内容使用`），不要静默覆盖。
   **"内容"指请求体的全部业务字段，不是其中几个**——行程要连 `startPlace`/`endPlace` 一起比，
   兑换要连 `productId`/`quantity` 一起比。漏比一个字段，就等于允许"换内容走重放"（实测踩过：只比方式/里程/时间，
   把 A→B 改成 C→D 仍返回旧行程）。建议直接比较规范化后的整个请求体（排序 key 后做哈希）。
4. **缓存不可信**：幂等结果不能只存在 Redis/内存里，必须有**数据库唯一约束**或业务记录兜底
   （例如 `points_ledger` 上 `(user_id, biz_type, biz_id)` 唯一索引），
   否则缓存过期后同一请求可能二次入账/二次扣分。
5. **幂等记录不得因为时间而失效**（评审修订）：
   - **不要写"24 小时后同一请求算新请求"**——那等于允许同一笔业务被扣第二次分，是缺陷不是特性。
   - 幂等键与其结果的对应关系要**永久可查**（或至少覆盖该业务的生命周期）；
     Redis 里的短 TTL 只能当**加速缓存**，命中不到时必须回数据库按业务键查一次。
   - 真正的兜底是**业务唯一约束**：`points_ledger(user_id, biz_type, biz_id)`、
     `orders(user_id, request_id)` 这类唯一索引，数据库层面就写不进第二条。
   - 清理只允许发生在业务已终结且归档之后，且清理后重放应查业务表返回原结果，而不是重新记账。

前端对应做法（已实现）：`clientTripId` 在页面打开时生成、成功后重建；`requestId` 在打开兑换确认框时生成、失败复用；
超时提示「结果尚未确认」，**不当成失败自动换号重试**。

---

## 4. 后端必须保证的 6 件事（评审会问）

1. **主键由服务端生成**，`clientTripId` / `Idempotency-Key` 只用于去重。
2. **写操作走事务**：行程+流水+余额、订单+扣分+扣库存，任一步失败全回滚（商品 PATCH 同理：先校验全部字段再落盘）。
3. **积分流水是账**：每笔都要有 `balanceAfter`，且 `balance = totalEarned − totalSpent` 恒成立 —— 对账页就是靠这个。
4. **精度不截断**：减排量存 `decimal(16,9)`（或 double），前端负责显示 6 位/9 位；后端一旦四舍五入到 2 位，明细页就无法还原计算过程。
5. **401 用 HTTP 状态码**，不要只在 body 里返回业务码（前端两种都处理，但服务端应以 HTTP 401 为准）。
6. **状态冲突才返回 409**：重复履约、取消已发放订单返回 409；
   **重复取消已取消的订单按幂等返回原结果，不能返回 409、更不能二次返还**。

---

## 5. 前端怎么切到真后端（不用改代码）

1. 项目根目录新建 `.env.local`：

```ini
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=http://localhost:8080/api
```

2. `npm run dev` 重启。
3. 打开浏览器 → 登录。如果登录失败，先用 Postman 打一遍 `POST /api/auth/login`，确认响应体是 `{code,message,data}` 结构。
4. 想切回 mock：把 `VITE_DATA_SOURCE` 改成 `mock`（或删掉 `.env.local`）。

> 前端所有请求都走 `src/api/http.ts` 里的 `request()`，mock 与真实后端**共用同一套调用代码**，所以切换只是改环境变量。

---

## 6. 联调检查清单

- [ ] `POST /api/auth/login` 返回 `{code:0,data:{token,user}}`
- [ ] 带 token 请求 `GET /api/auth/me` 正常，去掉 token 返回 **HTTP 401**
- [ ] `GET /api/trips?page=1&size=10` 返回 `{items,total,page,size}`
- [ ] `POST /api/trips` 带同一个 `Idempotency-Key` 连发两次，`tripId` 相同、积分只加一次
- [ ] 行程详情能返回 `baseFactor/modeFactor/pointsRatio/calculatedAt/ruleVersion`
- [ ] `POST /api/mall/orders` 积分不足返回 `40030`、库存不足返回 `40901`
- [ ] 取消订单后积分与库存都回来，且多一条 `REVERSE` 流水
- [ ] 用户 token 调 `/api/admin/orders/{id}/cancel` 返回 **403**（用户端无取消能力）
- [ ] 同一订单连续取消两次：第二次返回原订单、积分只返还一次、库存只回补一次
- [ ] 同一 `Idempotency-Key` 换一份 body 再发：返回 409，不覆盖上一次结果
- [ ] `GET /api/admin/reconciliation` 出错时返回 5xx（不要返回空数组）
- [ ] 跨域：`Access-Control-Allow-Origin` 允许 `http://localhost:5173`，并放行 `Authorization`、`Idempotency-Key` 请求头，`OPTIONS` 预检返回 200

---

## 附：数据结构（TypeScript 定义，可直接抄成 Java DTO）

```ts
type TripMode = 'BUS' | 'SUBWAY' | 'BIKE' | 'WALK'
type TripStatus = 'PENDING' | 'POINTED' | 'FAILED'
type OrderStatus = 'CREATED' | 'FULFILLED' | 'CANCELLED'
type PointsFlowType = 'EARN' | 'SPEND' | 'REVERSE'

interface User { id: string; nickname: string; phone: string; role: 'USER' | 'ADMIN'; avatarText: string; points: number }

interface Trip {
  tripId: string; mode: TripMode; distanceKm: number; reductionKg: number
  awardedPoints: number; status: TripStatus
  startTime: string; endTime: string; startPlace: string; endPlace: string; createdAt: string
}

interface TripDetail extends Trip {
  baseFactor: number; modeFactor: number; pointsRatio: number
  calculatedAt: string; ruleVersion: string
}

interface PointsAccount { balance: number; totalEarned: number; totalSpent: number; tripCount: number; totalReductionKg: number }

interface PointsFlow { id: string; type: PointsFlowType; title: string; amount: number; balanceAfter: number; createdAt: string; refId?: string }

interface Product { productId: string; name: string; icon: string; points: number; stock: number; status: 'ON' | 'OFF'; desc?: string }

interface Order {
  orderId: string; productId: string; productName: string; productIcon: string
  quantity: number; unitPoints: number; totalPoints: number
  status: OrderStatus; createdAt: string; cancelReason?: string
}

interface CarbonRule {
  ruleId: string; version: string; mode: TripMode
  baseFactor: number; modeFactor: number; pointsRatio: number
  effectiveFrom: string; status: 'ACTIVE' | 'ARCHIVED'
}

interface ReconcileItem { id: string; objectType: 'TRIP' | 'ORDER'; objectId: string; checkName: string; expected: number; actual: number }

interface ApiResult<T> { code: number; message: string; data: T }
interface Page<T> { items: T[]; total: number; page: number; size: number }
```
