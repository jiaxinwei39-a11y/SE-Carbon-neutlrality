# 接口契约（前后端冻结版 v2）

> 冻结日期：2026-11-17
> 依据：高泽 2026-11-17 的书面答复 + 前端已合并实现（`frontend/docs/api-contract.md`）+ 后端实测
> **字段名唯一来源是前端文档**；本文档只记录决策、后端实现状态、差异处理与扩展项。
> 维护：郭浚文（后端）｜对接：高泽（前端）

## 1. 冻结的决策

| 编号 | 决策 | 落地情况 |
|---|---|---|
| D-01 | **命名一律用前端的名字**（`startPlace` / `baseFactor` / `pointsRatio` / `EARN`…）。后端实体保留自己的命名，在 DTO 层映射 | 已实现 |
| D-02 | **`tripId` 由服务端生成**，全局唯一，前端只读；**`clientTripId` 只是幂等键**，不能当主键、不能出现在 URL；**列表每条必须带 `tripId`**（列表行靠它跳详情） | 已实现；列表项含 `tripId` |
| D-03 | 管理端写接口分档：`fulfill` 与商品维护（PATCH）本周补；规则新增、商品新增、改名称图文排 v1.1；用户启停排 P1 | 后端 5 个都已实现，前端按档接入 |
| D-04 | **商品维护 v1 只保留一个 `PATCH /admin/products/{productId}`**，body `{points?, stock?, status?}` | 已实现；旧的 PUT/status/stock 标记 deprecated |
| D-05 | **`TripStatus` 保留三态**，语义定死（见 §6） | 后端只写 `POINTED` |
| D-06 | **`icon` 定 `varchar(255)` 字符串**，值先用 emoji，将来可换 URL；不能定 enum 或短 char | 已迁移 **V3**，本地库已生效 |
| D-07 | 对账差异项的 `objectType` 扩展出 **`ACCOUNT`**（账户级差异） | 已实现，待前端放宽 TS 类型 |

## 2. 后端实现状态：前端清单 22 个接口全部有实现

| # | 方法 | 路径 | 后端 |
|---|---|---|---|
| 1 | POST | `/auth/login` | ✅ |
| 2 | GET | `/auth/me` | ✅ |
| 3 | POST | `/auth/logout` | ✅ |
| 4 | GET | `/trips` | ✅ |
| 5 | POST | `/trips` | ✅ |
| 6 | GET | `/trips/{tripId}` | ✅ |
| 7 | GET | `/points/account` | ✅ |
| 8 | GET | `/points/flows` | ✅ |
| 9 | GET | `/mall/products` | ✅ |
| 10 | GET | `/mall/products/{productId}` | ✅ |
| 11 | POST | `/mall/orders` | ✅ |
| 12 | GET | `/orders` | ✅ |
| 13 | GET | `/orders/{orderId}` | ✅ |
| 14 | POST | `/admin/orders/{orderId}/cancel` | ✅ **本次新增**（原路径挪到管理端） |
| 15 | GET | `/admin/dashboard` | ✅ **本次新增** |
| 16 | GET | `/admin/rules` | ✅ |
| 17 | GET | `/admin/products` | ✅ |
| 18 | **PATCH** | `/admin/products/{productId}` | ✅ **本次新增** |
| 19 | GET | `/admin/orders` | ✅ |
| 20 | POST | `/admin/orders/{orderId}/fulfill` | ✅ |
| 21 | GET | `/admin/users` | ✅ **本次新增** |
| 22 | GET | `/admin/reconciliation` | ✅ |

后端另有 6 个前端暂未调用（不影响联调）：`POST /auth/register`、`POST /admin/products`、
`PUT /admin/products/{id}`、`POST /admin/products/{id}/status`、`POST /admin/products/{id}/stock`、
`POST /admin/rules`。

## 3. 与前端契约的 7 处差异及处理（已全部改完）

| # | 项 | 前端契约 | 原后端 | 处理 |
|---|---|---|---|---|
| 1 | 取消订单路径 | `/admin/orders/{id}/cancel` | `/orders/{id}/cancel` | 新增管理端路径；旧路径保留为兼容 |
| 2 | 商品维护形状 | 1 个 PATCH | 4 个分开端点 | 新增 PATCH；旧端点 deprecated |
| 3 | 重复发放 | 409 `40903` | 200 返回原订单 | 改为 409 `40903` |
| 4 | 取消重复 | 200 返回原订单（不二次返还） | 一致 | 无变化 |
| 5 | PATCH 校验码 | points→40041，stock→40042 | 统一 40000 | 改为专用码 |
| 6 | 对账失败 | 5xx，业务码 `50001` | 50000 | 改为 `50001` |
| 7 | 规则 `effectiveFrom` | 日期 `2026-11-01` | 完整 ISO 时间戳 | 改为 `yyyy-MM-dd` |
| 8 | `icon` 长度 | varchar(255) | varchar(64) | 迁移 V3 放宽 |

另外补了两个前端页面在调、但后端原先缺失的只读接口：`GET /admin/users`、`GET /admin/dashboard`。

## 4. 对账 `ACCOUNT` 规格（回答前端三个问题）

**Q1：`objectId` 是 userId 还是独立 accountId？**
**是 `userId`**。本库的积分账户以 `user_id` 作主键（一人一户），没有独立的 accountId。
账务行里的 `user_id` 外键指向 `t_point_account(user_id)`。

**`objectId` 格式规范（重要，避免解析踩坑）：**

| 检查级别 | `objectType` | `objectId` 格式 | 示例 |
|---|---|---|---|
| 账户级 | `ACCOUNT` | **纯 `userId`** | `U001` |
| 流水级（序号连续、余额链） | `ACCOUNT` | **`userId#accountSeq`** | `U001#7` |
| 行程级 | `TRIP` | `tripId` | `TR202611080001` |
| 订单级 | `ORDER` | `orderId` | `RO202611160001` |

也就是说：**`ACCOUNT` 有两种粒度**——汇总类检查用纯 `userId`，
逐笔检查（流水序号连续、余额链断裂）用 `userId#accountSeq`。
前端展示时可以按 `#` 切开取用户名；不要假设 `objectId` 一定是纯 userId。

**Q2：差异值由前端算 `actual - expected`，后端不再单独给一列？**
**是**。后端只返回 `expected` 与 `actual` 两个数：
- `expected` = 按业务规则**应该有**的值；
- `actual` = 实际查到的值；
- 差值与正负号由前端算（`actual - expected`），后端不额外给 `diff` 字段。

**Q3：除了 TRIP / ORDER / ACCOUNT 还会有别的级别吗？**
目前只有这三类。未来可能增加 `RULE`（规则区间/版本一致性检查）。
**建议前端对未知 `objectType` 做降级显示**（原样显示字符串，不参与配色分支），
这样后端加类型时前端不用同步发版。

差异项示例：

```json
{ "id": "R1", "objectType": "ACCOUNT", "objectId": "U001",
  "checkName": "账户余额=流水合计", "expected": 42, "actual": 142 }
```

## 5. 错误码补充（在前端表之外新增）

| code | HTTP | 含义 |
|---|---|---|
| `40000` | 400 | 参数校验兜底（未细分） |
| `40012` | 400 | 密码格式非法（注册，长度 6–32） |
| `40013` | 400 | 手机号格式非法（注册，11 位） |
| `40041` | 400 | 商品积分单价非法（须 ≥1 整数） |
| `40042` | 400 | 库存非法（须 ≥0 整数） |
| `40043` | 400 | 商品状态非法（非 ON/OFF） |
| `40400` | 404 | 路径不存在（不是 500） |
| `40905` | 409 | 无可用碳核算规则 |
| `40906` | 409 | 手机号已被注册 |
| `40907` | 409 | 规则生效区间与已发布版本重叠 |
| `40908` | 409 | 商品已下架 |
| `40909` | 409 | 规则不能追溯生效（`effectiveFrom` 早于服务端当前时间） |
| `50001` | 500 | 对账读取失败（**不得**降级成"无差异"） |

> `40012` / `40013` / `40043` 已按 2026-11-17 高泽的独立码表实现，
> 注册格式校验因此从 `@Valid` 挪到 Service，否则会被统一成 `40000`。
> `50001` 仍在使用（对账读取失败），前端最新错误码表里暂未列出，请补一行。

## 6. `TripStatus` 三态语义

| 值 | 含义 | 后端是否会产生 |
|---|---|---|
| `POINTED` | 已入账（终态·成功） | ✅ 唯一落库值 |
| `FAILED` | 核算失败（终态·异常） | ❌ 当前同步核算，失败直接返回错误、不落库 |
| `PENDING` | 核算中（中间态） | ❌ 当前同步，不返回；枚举保留给将来改异步 |

前端三态渲染照常保留；后端在契约上是"只返回 POINTED"，若将来改异步再启用另外两个。

## 7. 废弃端点（保留兼容，v1.1 可删）

| 端点 | 替代 |
|---|---|
| `PUT /admin/products/{id}` | `PATCH /admin/products/{id}` |
| `POST /admin/products/{id}/status` | 同上（发 `{status}`） |
| `POST /admin/products/{id}/stock` | 同上（发 `{stock}`） |
| `POST /orders/{id}/cancel` | `POST /admin/orders/{id}/cancel` |

## 8. 仍需前端确认的两点

1. **`status` 非法的错误码**：前端文档 3.16 写的是 `40010`，但 `40010` 已被"里程非法"占用。
   后端目前返回 `40000`（参数不合法）。建议前端文档改成 `40000`，或后端改用独立码——**等前端确认**。
2. **`ReconcileItem.objectType`**：需要从 `'TRIP' | 'ORDER'` 放宽为 `'TRIP' | 'ORDER' | 'ACCOUNT'`（或 `string` + 降级），否则 ACCOUNT 差异项会被类型挡住。

## 9. 联调步骤

```bash
# 后端（需先建库）
mysql -uroot -p < db/schema.sql
mysql -uroot -p gts < db/seed.sql
cd gts-backend
export GTS_DB_PASSWORD=你的密码      # Windows: $env:GTS_DB_PASSWORD="..."
mvn spring-boot:run

# 前端
# .env.local: VITE_DATA_SOURCE=api / VITE_API_BASE_URL=http://localhost:8080/api
npm run dev
```

联调用例见 `gts-backend/TEST-REPORT.md` 与前端 `docs/api-contract.md` 第 6 节检查清单。
