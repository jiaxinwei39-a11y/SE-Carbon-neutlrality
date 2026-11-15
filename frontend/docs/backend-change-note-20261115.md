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

## 三、v1 明确不做（请勿提前实现，避免返工）

| 接口 | 归属 |
| --- | --- |
| `POST /admin/products`（新增商品） | v1.1，P1 |
| `PUT /admin/products/{id}`（改名称/描述/图文） | v1.1，P1 |
| `POST /admin/products/{id}/status` | **不做**，并入 1.1 的 PATCH |
| `POST /admin/products/{id}/stock` | **不做**，并入 1.1 的 PATCH |
| `POST /admin/rules`（新增规则版本） | v1.1，P1（需版本化 + 生效时间 + 行程快照 + 留痕） |
| `POST /admin/users/{id}/status` | v1.1，P1 |

---

## 四、通用约定（照 `api-contract.md`，别自创）

| 项 | 约定 |
| --- | --- |
| 响应体 | `{ "code": 0, "message": "ok", "data": ... }`，`code=0` 为成功 |
| 分页 | 入参 `?page=1&size=20`，出参 `{ items, total, page, size }` |
| 时间 | ISO-8601 字符串 |
| 金额/减排量 | 后端算，`decimal(16,9)`，**不截断**；前端只负责格式化展示 |
| 幂等 | 写接口读 `Idempotency-Key` 请求头（行程、兑换） |
| 认证 | 401 用 HTTP 401（前端据此清登录态并回登录页，不能只给 200 + code） |
| 权限 | 403 / `40301` |
| 冲突 | 409 / `40901`（库存不足）、`40903`（状态不允许） |
| CORS | 需放行 `Authorization`、`Idempotency-Key` 头 |

---

## 五、联调切换（前端零配置）

```env
# frontend/.env.local
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=http://localhost:8080/api
```

切完我会重跑 `npm run e2e`（36 条断言），后端只要按本文实现，断言应全绿。

---

## 六、文档入口

| 文件 | 用途 |
| --- | --- |
| `frontend/docs/api-contract.md` | 22 个接口全量说明（字段、校验、错误码、联调清单） |
| `frontend/docs/openapi.yaml` | 21 个 path，可直接导入 Apifox / Swagger |
| `frontend/docs/scope-decisions.md` | 范围与 P0 口径（含本次三条确认） |
