# 数据库设计（接口 ↔ 表字段对照）

> **权威来源（以这些为准，本文不复制字段字典）**
> - 建表 DDL：`db/schema.sql`（结构版本 **V2**，MySQL 8，utf8mb4）
> - 逐字段字典：`db/schema-dict.md`（每列类型/可空/默认值/注释）
> - 升级迁移：`db/migrations/V1__init.sql`、`V2__account_seq_and_rule_lock.sql`
> - 演示数据：`db/seed.sql`；测试夹具：`gts-backend/scripts/test-fixtures.sql`
> - 并发与事务方案：`db/README.md` §3
>
> **本文只解决两件事**：① 接口字段到底来自哪张表哪一列（联调时不用互相猜）；
> ② 前端与数据库必须一致的口径（精度、id 形状、枚举、幂等、快照）。
> 接口细节见 `docs/api-contract.md`，机器可读版本 `docs/openapi.yaml`。

---

## 1. 表清单：谁写、谁读

业务表 10 张 + 技术表 2 张。**前端从不直连数据库**（浏览器 → HTTP → Spring Boot → JDBC → MySQL），
下表"谁读"指的是通过哪个接口读出来。

| 表 | 用途 | 写入方 | 前端通过哪个接口读 |
|---|---|---|---|
| `t_user` | 账号、角色、状态 | 注册/管理端启停 | `POST /auth/login`、`GET /auth/me`、`GET /admin/users` |
| `t_login_session` | 登录会话（只存 token 的 SHA-256） | 登录/退出 | 不直接读；`Authorization` 校验用 |
| `t_merchant` | 商户（MVP 由运营代办） | 后端初始化 | 不暴露；商品表外键 |
| `t_carbon_rule` | 碳核算规则（**版本化**） | 管理端（未做页面） | `GET /admin/rules` |
| `t_rule_mode_lock` | 规则串行化锁（技术表，4 行） | 后端事务内 | 不暴露 |
| `t_trip` | 行程 + **核算快照** | `POST /trips` | `GET /trips`、`GET /trips/{tripId}` |
| `t_point_account` | 积分账户（一人一户，含序号游标） | 核算/兑换/取消/冲正 | `GET /points/account` |
| `t_point_ledger` | 积分流水（**只追加、账户内有序**） | 同上 | `GET /points/flows` |
| `t_product` | 商品与库存 | 管理端 `PATCH` | `GET /mall/products`、`GET /admin/products` |
| `t_redemption_order` | 兑换订单（含下单快照） | `POST /mall/orders`、履约/取消 | `GET /orders`、`GET /admin/orders` |
| `t_audit_log` | 审计日志（改了必有痕） | 规则/库存/订单/用户状态变更 | 不暴露（暂不做页面） |
| `t_schema_version` | 结构版本记录 | 迁移脚本 | 不暴露 |

---

## 2. 接口 → 表 → 字段

> 只列**前端拿到并会展示/使用**的字段；内部主键 `id` 一律不出接口（对外只用 `*_id` 业务编号）。

| # | 接口 | 来源表 | 字段映射要点 |
|---|---|---|---|
| 1 | `POST /auth/login` | `t_user`、`t_login_session` | 入参 `account`/`password` → `login_account`/`password_hash` 校验；返回 `user{id,nickname,phone,role,avatarText,points}`，`points` 取 `t_point_account.balance`；`token` 原文只在响应里，库里只有 `token_hash` |
| 2 | `GET /auth/me` | 同上 | 同登录返回的 `user` |
| 3 | `POST /auth/logout` | `t_login_session` | 置 `revoked_at` |
| 4 | `GET /trips` | `t_trip` | `tripId`←`trip_id`、`mode`、`distanceKm`←`distance_km`、`reductionKg`←`reduction_kg`、`awardedPoints`←`awarded_points`、`status`、`startTime`/`endTime`←`start_time`/`end_time`、`startPlace`/`endPlace`←`start_place`/`end_place` |
| 5 | `POST /trips` | `t_trip`、`t_point_account`、`t_point_ledger` | 入参 `clientTripId`→`client_trip_id`（幂等键）；服务端按 `end_time` 匹配 `t_carbon_rule` 版本，把 `base_factor`/`mode_factor`/`points_ratio`/`rule_version` **写进行程**做快照；同事务加余额、写 EARN 流水 |
| 6 | `GET /trips/{tripId}` | `t_trip` | 详情比列表多返回上面四个快照字段 + `calculatedAt`←`calculated_at` + `ruleVersion` |
| 7 | `GET /points/account` | `t_point_account` | `balance`、`totalEarned`←`total_earned`、`totalSpent`←`total_spent`、`tripCount`←`trip_count`、`totalReductionKg`←`total_reduction_kg` |
| 8 | `GET /points/flows` | `t_point_ledger` | `id`←`ledger_no`、`type`、`title`、`amount`、`balanceAfter`←`balance_after`、`createdAt`←`created_at`、`refId`←`ref_id`；`account_seq` **不出接口**（仅对账用） |
| 9 | `GET /mall/products` | `t_product` | `productId`←`product_id`、`name`、`icon`(emoji 文本)、`points`、`stock`、`status`；用户端只返回 `status='ON'` |
| 10 | `GET /mall/products/{productId}` | `t_product` | 同上 + `description`←`description` |
| 11 | `POST /mall/orders` | `t_product`、`t_redemption_order`、`t_point_account`、`t_point_ledger` | 入参 `requestId`→`request_id`（幂等键）；`product_name`/`product_icon`/`unit_points` **下单时快照**；`total_points = unit_points × quantity`；同事务扣余额、写 SPEND 流水、扣库存 |
| 12 | `GET /orders` | `t_redemption_order` | `orderId`←`order_id`、`productName`、`productIcon`、`quantity`、`unitPoints`、`totalPoints`、`status`、`createdAt`、`cancelReason` |
| 13 | `GET /orders/{orderId}` | 同上 | 同上（详情用） |
| 14 | `POST /admin/orders/{orderId}/cancel` | `t_redemption_order`、`t_point_ledger`、`t_product`、`t_audit_log` | `CREATED→CANCELLED`；`cancel_reason` 必填、`processed_by`/`processed_at` 落库；**按 `total_points` 原额返还**并写 REVERSE 流水、回补库存、写审计；**已取消再调返回原单，不再返还** |
| 15 | `GET /admin/dashboard` | 聚合 `t_trip`/`t_point_ledger`/`t_redemption_order` | 卡片与图表都是聚合值，**无对应单表字段**；口径必须与对账一致（见 §4.3） |
| 16 | `GET /admin/rules` | `t_carbon_rule` | `ruleId`←`rule_id`、`version`、`mode`、`baseFactor`、`modeFactor`、`pointsRatio`、`effectiveFrom`/`effectiveTo`（`NULL` = 至今有效）、`status`(ACTIVE/ARCHIVED) |
| 17 | `GET /admin/products` | `t_product` | 同 #9，但含 `OFF` 下架商品 |
| 18 | `PATCH /admin/products/{productId}` | `t_product`、`t_audit_log` | 只更新传了的 `points`/`stock`/`status`；`version` 乐观锁 +1；写审计 `PRODUCT_STOCK` |
| 19 | `GET /admin/orders` | `t_redemption_order` + `t_user` | 全量订单，附下单用户；含 `CANCELLED` |
| 20 | `POST /admin/orders/{orderId}/fulfill` | `t_redemption_order`、`t_audit_log` | `CREATED→FULFILLED`，**只改状态不二次扣分**；写审计 `FULFILL` |
| 21 | `GET /admin/users` | `t_user` + `t_point_account` | `userId`←`user_id`、`nickname`、`phone`、`role`、`status`、`points`←`balance` |
| 22 | `GET /admin/reconciliation` | `t_trip`/`t_point_ledger`/`t_point_account`/`t_redemption_order` | 逐条比对"期望值 vs 实际值"，**期望值来自业务表、实际值来自流水/账户汇总**；`objectType` 见 §4.6 |

---

## 3. 前端必须遵守的 6 条口径

### 3.1 幂等由数据库唯一约束兜底，不是靠"接口里写了"
```sql
t_trip             UNIQUE (user_id, client_trip_id)
t_redemption_order UNIQUE (user_id, request_id)
t_point_ledger     UNIQUE (ref_type, ref_id, type)   -- 一次行程只能一笔 EARN、一单一笔 SPEND/一笔 REVERSE
```
- 并发下第二次插入必然失败 → 后端捕获唯一键冲突 → **返回已有结果**（同键同输入）或 **`40904`**（同键不同输入）。
- 前端责任：一次用户意图只生成一个键（`clientTripId` / `requestId`），**重试复用**、成功后重建；
  不要把"键传了"当成"幂等生效了"（这是我们真实踩过的坑，见 README §十）。

### 3.2 金额与积分：整数分，前端只格式化
- `balance` / `amount` / `total_points` / `awarded_points` 全是 `BIGINT`（整数分），**不存在小数**。
- 前端禁止做二次取整/四舍五入，只做千分位显示。

### 3.3 减排量：`DECIMAL(18,9)`，列表 6 位只为展示
- 库里 9 位小数；列表展示 6 位并注明"展示值已舍入"；核算详情展示 9 位原值。
- **积分取整用库里的原值算**（`floor(减排 × 系数)`），不能用页面上的 6 位展示值反算。

### 3.4 时间：`DATETIME(3)` + ISO-8601
- 毫秒精度；接口统一 `2026-11-15T01:10:00.000Z` 这种 ISO-8601 字符串。
- 行程匹配规则用 `end_time`：`effective_from <= end_time < effective_to`（右开区间）。

### 3.5 快照字段：不是冗余，是"历史可复现"
| 快照 | 存在哪 | 为什么 |
|---|---|---|
| `base_factor` / `mode_factor` / `points_ratio` / `rule_version` | `t_trip` | 规则改版后，历史行程的核算结果必须能原样复现 |
| `product_name` / `product_icon` / `unit_points` | `t_redemption_order` | 商品改名改价不影响历史订单展示与取消返还 |

**前端禁止**用"当前规则/当前商品价格"去重算历史数据。

### 3.6 id 一律当不透明字符串
- 对外 id：`U001`（用户）、`TR202611160001`（行程）、`RO202611160001`（订单）、`PL20261115000001`（流水）、`R-2026-11-BUS`（规则）、`G01`/`M001`。
- **不解析前缀、不假设长度**；内部自增 `id` 永不出接口（避免前端推断数据量）。
- 对账的 `objectId` 有**两种粒度**：账户汇总 `U001`、流水逐笔 `U001#7`（`userId` + `#` + `account_seq`），见 `docs/api-contract.md` §3.15。

---

## 4. 前后端容易吵起来的 4 个点（已定口径）

### 4.1 谁保证"不重复发分/扣分"
数据库：`t_point_ledger` 的 `UNIQUE(ref_type, ref_id, type)` + 两条业务唯一键。应用层先查后插在并发下会漏，**不能只靠应用层**。

### 4.2 谁保证"流水序号连续"
`t_point_account.last_seq` 锁内自增 → 写入 `t_point_ledger.account_seq`（`UNIQUE(user_id, account_seq)`，`CHECK >= 1`）。
用全局自增 `id` 或时间戳都替代不了（并发下 id 有空洞、同一毫秒可分不出先后）。
对账里"流水序号从 1 连续无断号"这一项就是查它。

### 4.3 余额与汇总字段
`t_point_account` 的 `balance`/`total_earned`/`total_spent`/`trip_count`/`total_reduction_kg` 是**汇总冗余**，
存在的意义就是"给对账当期望值"：与 `t_point_ledger` 求和结果不一致 → 就是账实差异（`ACCOUNT` 类型）。
**前端不参与计算，只展示接口给的数**。

### 4.4 状态机（前端只能做体验，判定在服务端）
| 表 | 字段 | 允许值 | 备注 |
|---|---|---|---|
| `t_redemption_order` | `status` | `CREATED` → `FULFILLED` / `CANCELLED` | 只有 `CREATED` 可履约/取消；其余一律 `409`/`40903` |
| `t_trip` | `status` | `POINTED`（唯一落库值） | 核算失败不落库（BR-04）；前端枚举保留 `PENDING`/`FAILED` 只为兼容，**后端不会返回** |
| `t_user` | `status` | `ENABLED` / `DISABLED` | 停用后不能登录（属 P1，前端暂无入口） |
| `t_carbon_rule` | `status` | `ACTIVE` / `ARCHIVED` | 不覆盖历史；改版 = 关旧区间 + 插新版本 |
| `t_product` | `status` | `ON` / `OFF` | `OFF` 对用户端不可见（`40402`），管理端仍可见 |
| `t_audit_log` | `biz_type` | `CARBON_RULE`/`PRODUCT_STOCK`/`REDEMPTION_ORDER`/`USER_STATUS` | 动作：`CREATE`/`UPDATE`/`CANCEL`/`FULFILL`/`ENABLE`/`DISABLE` |

---

## 5. 页面 ↔ 表对照（排期/评审时用）

| 页面 | 路由 | 读的表 | 写的表 |
|---|---|---|---|
| 登录/注册 | `/login`、`/register` | `t_user`、`t_login_session` | 同左（注册页面未做） |
| 首页（余额 + 上报） | `/app` | `t_point_account`、`t_trip`、`t_carbon_rule` | `t_trip`、`t_point_ledger`、`t_point_account` |
| 行程列表 / 明细 | `/app/trips`、`/app/trips/:id` | `t_trip`、`t_carbon_rule`（经快照） | — |
| 积分账户 | `/app/points` | `t_point_account`、`t_point_ledger` | — |
| 积分商城 / 商品详情 | `/app/mall`、`/app/mall/:id` | `t_product` | — |
| 我的订单 | `/app/orders` | `t_redemption_order` | —（取消已移到管理端） |
| 管理端 · 概览 | `/admin/dashboard` | 聚合查询 | — |
| 管理端 · 订单/履约/取消 | `/admin/orders` | `t_redemption_order`、`t_user` | `t_redemption_order`、`t_point_ledger`、`t_product`、`t_audit_log` |
| 管理端 · 商品 | `/admin/products` | `t_product` | `t_product`、`t_audit_log` |
| 管理端 · 规则（只读） | `/admin/rules` | `t_carbon_rule` | —（编辑属 P0 未完成） |
| 管理端 · 对账 | `/admin/reconciliation` | 全表只读 | —（不提供自动修复） |
| 管理端 · 用户 | `/admin/users` | `t_user`、`t_point_account` | —（启停属 P1） |

---

## 6. 还没统一的三处（需要后端/组会拍板）

| # | 分叉 | 现状 | 建议 |
|---|---|---|---|
| 1 | 商品维护接口形状 | 前端用 `PATCH /admin/products/{id}`（只传改的字段）；后端 `AdminController` 只有**全量必填的 `PUT`** + `/status`、`/stock` 两个动作接口 → 前端 PATCH 会 405 | 后端补 `@PatchMapping` 复用同一逻辑（已选 A），`/status`、`/stock` 保留但不作为契约 |
| 2 | 商品校验错误码 | 契约约定 `40041`(单价)/`40042`(库存)/`40043`(状态)；后端主分支 `Api.java` 暂无，仍返回 `40000` | 后端加三码；前端已写"优先独立码、收到 `40000` 回退通用提示" |
| 3 | 对账读取失败码 | 契约用 `50001`；主分支无，后端 PR #31 会返回 | 合并 #31 后把契约状态从 🟡 改成 ✅ |

> 另有一条**建议**（不影响当前联调）：`GET /admin/dashboard` 的四张卡片与图表目前没写清聚合口径
> （按天？按方式？是否含已取消订单）。建议后端把 SQL 口径写进接口文档，否则前端演示时数字对不上没法解释。

---

## 7. 改库的流程（避免文档与代码分叉）

1. 改结构 **必须** 走 `db/migrations/V{n}__xxx.sql`，不要直接改 `db/schema.sql` 当补丁；
2. 同步 `db/schema-dict.md`（字段字典）与本文档 §2 的字段映射；
3. 若影响接口返回字段 → 同步 `docs/api-contract.md` 与 `docs/openapi.yaml`；
4. 若影响前端展示口径（精度、枚举、快照）→ 在 `docs/scope-decisions.md` 记一条决策。
