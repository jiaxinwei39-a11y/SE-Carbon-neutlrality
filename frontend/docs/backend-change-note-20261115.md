# 前端 → 后端 接口变更单

| 项目 | 内容 |
| --- | --- |
| 系统 | 绿色出行碳减排积分系统（选题 14） |
| 版本 | 2026-11-15，对应前端提交 `4af55d4` / `27b1fc2` |
| 提出 | 前端（组长高泽已确认口径） |
| 依据 | `frontend/docs/api-contract.md`、`frontend/docs/openapi.yaml` |

**一句话**：本轮前端新增 2 个写接口需要后端实现；另有 3 条口径需按本文修改；其余 6 个管理端写接口**v1 明确不做**，请勿提前实现。

---

## 一、必须实现（前端已对接，缺了管理端两页就是死按钮）

### 1.1 `PATCH /admin/products/{productId}` — 商品维护

改积分单价 / 改库存 / 上下架，**一个接口**，不拆 `/status`、`/stock`。

```http
PATCH /admin/products/G01
Authorization: Bearer <admin token>
Content-Type: application/json

{ "points": 600, "stock": 99, "status": "OFF" }
```

三个字段都可选，只发要改的。

响应 `data` 返回更新后的完整商品对象：

```json
{ "productId": "G01", "name": "定制环保帆布袋", "icon": "👜",
  "points": 600, "stock": 99, "status": "OFF", "desc": "加厚棉布，可装 A4 文件" }
```

| 校验 | 规则 | 失败码 |
| --- | --- | --- |
| `points` | 整数且 ≥ 1 | `40041` / 400 |
| `stock` | 整数且 ≥ 0（0 = 兑完，用户端置灰但仍可见） | `40042` / 400 |
| `status` | 只能是 `ON` / `OFF` | `40010` / 400 |
| 商品不存在 | — | `40402` / 404 |
| 非管理员 | 一律拒绝 | `40301` / 403 |

语义要求：

1. **改价不追溯**——订单存 `unitPoints` 快照，历史订单金额不变。
2. **下架即时生效**——`status=OFF` 后 `GET /mall/products`、`GET /mall/products/{id}` 都不再返回（用户端表现为 404 / `40402`），管理端列表仍可见。
3. 同一请求内改多个字段必须在一个事务里完成。

### 1.2 `POST /admin/orders/{orderId}/fulfill` — 订单履约

```http
POST /admin/orders/0202611020003/fulfill
Authorization: Bearer <admin token>
（无 body）
```

| 当前状态 | 结果 |
| --- | --- |
| `CREATED` | → `FULFILLED`，返回订单对象 |
| `FULFILLED`（重复点） | 409 / `40903`，**绝不能重复发货** |
| `CANCELLED` | 409 / `40903` |
| 订单不存在 | 404 / `40403` |
| 非管理员 | 403 / `40301` |

**关键**：发放**只改状态**，不扣积分、不扣库存——兑换（`POST /mall/orders`）时已经扣过了。任何二次扣减都会导致积分对账（P0）对不上。

---

## 二、口径变更（3 条，需要改代码或建表）

### 2.1 `tripId` 由服务端生成

- `POST /trips` 的响应**必须**含服务端生成的 `tripId`（建议 `T{yyyyMMdd}{4位序号}`）。
- `clientTripId` 只是**幂等键**，用于"同一次提交重试"，**不能当主键、不能出现在 URL 里**。
- `GET /trips` 列表每条**必须带 `tripId`**——列表跳详情的唯一依赖。

### 2.2 `TripStatus` 保留三态

`PENDING`（核算中）/ `POINTED`（已入账）/ `FAILED`（核算失败）。

- 若后端同步核算，接口可以不返回 `PENDING`，但**枚举与表字段保留**，否则以后改异步要动契约。
- `FAILED` **不能删**：它是"这次为什么没加分"的唯一解释位。

### 2.3 商品 `icon` 字段类型

`varchar(255)` 字符串，值先用 emoji（☕🚲👜）。

- 将来换 CDN 图片 URL 不用改表、不用改前端。
- **禁止**用 `enum` 或 `char(2)`（emoji 是多字节）。

---

## 三、v1 暂未做（属 P0 未完成，等范围变更确认后再定，别当已结案）

> 这些**不是 P1 已结案项**：它们在完成标准里是 P0，只是本轮没做完。
> 若组会确认缩减，请先出产品范围变更确认，再统一改文档与验收标准。

| 接口 | 当前状态 |
| --- | --- |
| `POST /admin/products`（新增商品） | **后端已实现**，前端页面排期 v1.1（不是"后端没做"） |
| `PUT /admin/products/{id}`（改名称/描述/图文） | 后端已有，但**全量必填**；前端页面未做 |
| `POST /admin/products/{id}/status` | 后端已有；契约仍以 `PATCH /admin/products/{id}` 为准 |
| `POST /admin/products/{id}/stock` | 后端已有；契约仍以 `PATCH /admin/products/{id}` 为准 |
| `POST /admin/rules`（新增规则版本） | **后端已实现**，前端页面排期 v1.1 |
| `POST /admin/users/{id}/status`（用户启停） | **P1 后续**，不在本阶段 P0 范围，不阻塞验收 |
| `POST /auth/register`（注册） | **前后端均已实现**（2026-11-17 前端接入完成，见契约 §3.1.1） |

> **口径提醒（2026-11-17）**：上面"前端页面排期 v1.1"指的是**前端页面**没做，
> 不是后端没实现——后端在 `gts-backend` 里已经有 `POST /admin/products`、`POST /admin/rules`、`POST /auth/register`。
> 评审/组会时别把"前端未做页面"误读成"实现了不该做的功能"。

> **商品更新以 `PATCH` 为准（2026-11-17 与后端确认选 A，已随 #31 落地）**：契约只保留
> `PATCH /admin/products/{productId}` 局部更新（`{points?, stock?, status?}`）。
> 后端 `AdminController` 已有 `@PatchMapping("/products/{productId}")`（注释标"v1 规范接口"），
> 前端不再发 `PUT`；原有 `PUT` 与 `POST /{id}/status`、`POST /{id}/stock` 保留为兼容入口，不作为前端契约。

> **商品三类校验用独立错误码（2026-11-17 确认，已随 #31 进主分支）**：`40041` 积分单价非法、`40042` 库存非法、
> `40043` 状态非法，`Api.java` 里对应 `PRODUCT_POINTS_INVALID` / `PRODUCT_STOCK_INVALID` / `PRODUCT_STATUS_INVALID`，
> `ProductPatchRequest` 用 `BigDecimal` 接收以便识别小数。
> 不要复用 `40000`：前端要把红字挂到具体输入框，靠中文文案匹配会在后端改文案时静默失效
> （前端仍保留"收到 40000 回退通用提示"的兜底）。
> 注意 `40010` 是里程非法（`DISTANCE_INVALID`），文档早前把它当商品状态码用是错的，已更正。

---

## 四、通用约定（照 `api-contract.md`，别自创）

| 项 | 约定 |
| --- | --- |
| 响应体 | `{ "code": 0, "message": "ok", "data": ... }`，`code=0` 为成功 |
| 分页 | 入参 `?page=1&size=20`，出参 `{ items, total, page, size }` |
| 时间 | ISO-8601 字符串 |
| 金额/减排量 | 后端算，`decimal(16,9)`，**不截断**；前端只负责格式化展示 |
| 幂等 | 写接口读 `Idempotency-Key` 请求头（行程、兑换）；规则见 4.1 |
| 认证 | 401 用 HTTP 401（前端据此清登录态并回登录页，不能只给 200 + code） |
| 权限 | 403 / `40301`（**取消订单也只允许管理员**） |
| 冲突 | 409 / `40901`（库存不足）、`40903`（状态不允许） |
| CORS | 需放行 `Authorization`、`Idempotency-Key` 头 |

### 4.1 写接口的幂等要求（评审 #5）

1. 按「**用户 + 业务键**」隔离，不能跨用户命中别人的结果。
2. **同键同输入 → 重放原结果**（200 + 上次结果），不产生第二笔积分/扣减。
3. **同键不同输入 → 409**（建议 `40904 幂等键已被不同内容使用`），不要静默覆盖。
4. 不能只靠 Redis/内存：必须用**数据库唯一约束**兜底（如 `points_ledger(user_id, biz_type, biz_id)` 唯一索引），否则缓存过期后会二次入账。
5. **幂等关系不因时间失效**：不要实现“24 小时后同键算新请求”——那等于允许同一笔业务被扣第二次分。
   Redis 的短 TTL 只能当缓存，未命中时回数据库按业务键查，仍要返回原结果。

### 4.2 取消订单（评审 #23，接口已移到管理端）

- 路径：`POST /api/admin/orders/{orderId}/cancel`，body `{ "reason": "..." }`，**仅管理员**；用户 token 调它必须 403。
- `CREATED` → `CANCELLED`：原额返还积分、原数量回补库存、写一条 `REVERSE` 流水。
- **已取消的订单再次调用：返回原订单 200，不得 409，也不得二次返还**（BR-06 幂等）。
- 只有 `FULFILLED` 的订单取消才返 409 `40903`。
- 商品 `PATCH` 要先校验全部字段再落盘：`{ "points": 601, "stock": -1 }` 必须整体失败（400/`40042`），**且一个字段都不能被改动**。

---

## 五、联调切换（前端零配置）

```env
# frontend/.env.local
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=http://localhost:8080/api
```

切完我会重跑 `npm run e2e`（81 条断言），后端只要按本文实现，断言应全绿。

---

## 六、文档入口

| 文件 | 用途 |
| --- | --- |
| `frontend/docs/api-contract.md` | 全量接口说明（字段、校验、错误码、幂等总则、联调清单） |
| `frontend/docs/openapi.yaml` | 21 个 path，可直接导入 Apifox / Swagger |
| `frontend/docs/scope-decisions.md` | 范围与 P0 口径（含三条确认，以及"P0 不得私自降级"的说明） |
