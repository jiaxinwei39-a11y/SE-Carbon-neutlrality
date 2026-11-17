# 实验二 UML 设计模型（#8）

> 负责：郭浚文　　生成日期：2026-11-17
> 生成器：`tools/gen_mdj.py`（读 `docs/02-design/key-design.md` 与实际代码生成 `.mdj`）

## 1. 文件清单

| 文件 | 内容 | 说明 |
|---|---|---|
| `gts-design.mdj` | **8 张图**：包图、部署图、设计类图、5 张活动图 | 主工程，StarUML 直接打开 |
| `gts-seq-sample.mdj` | **1 张序列图**：上报行程与积分发放 | 按组长要求先交的独立样例 |
| `tools/gen_mdj.py` | 生成器 | 改内容后重新生成，不用手拖 |

两份工程都是纯 JSON（StarUML Project 格式），已通过结构自检：
元素 id 唯一、所有 `$ref` 可解析、无空引用。

## 2. 图与核对项对应

| 图 | 对应 DR | 内容 |
|---|---|---|
| 包图 | DR-02 | 接口层 boundary / 应用层 control / 领域层 entity / 基础设施 infra，4 条依赖 |
| 部署图 | DR-02 | 用户 PC（前端静态包）→ 应用服务器（`gts-backend.jar`）→ 数据库服务器（MySQL gts），HTTPS/JSON 与 JDBC 3306 |
| 设计类图 | DR-03 | 16 个类分三组：4 个 boundary Controller、5 个 control Service、7 个 entity 领域类（含属性） |
| 活动图：上报行程与积分发放 | DR-04 | 校验 → 匹配规则 → BigDecimal 核算 → 同事务写行程/流水/余额 |
| 活动图：积分商品兑换 | DR-04 | 锁账户→锁商品 → 当前读复查幂等 → 校验库存余额 → 原子扣减建单 |
| 活动图：订单取消冲正 | DR-04 | 无锁读标识 → 按序加锁 → 重读终态 → 返还与冲正 |
| 活动图：核算规则版本切换 | DR-04 | 锁 `t_rule_mode_lock` → 锁内取时间禁止追溯 → 区间校验 → 截断旧区间插新版本 |
| 活动图：只读一致性对账 | DR-04 | REPEATABLE READ 只读事务 → 9 项核对 → 只报差异不修账 |
| 序列图：上报行程与积分发放 | DR-03 | 6 条生命线、11 条消息，顺序与 `TripService.create` 实际代码一致 |

## 3. 序列图样例的消息顺序（对照代码）

| # | 消息 | 代码位置 |
|---|---|---|
| 1 | `POST /trips`（带 `Idempotency-Key`） | `TripController.create` |
| 2 | `create(user, key, req)` | `TripService.create` |
| 3 | 按 `userId + clientTripId` 查重 | `TripRepository.findByClientTripId` |
| 4 | 按结束时间匹配核算规则 | `TripRepository.findRule` |
| 5 | `SELECT 规则（因子/系数）` | 同上 |
| 6 | `applyTrip(points, reduction)` | `PointsRepository.applyTrip` |
| 7 | `UPDATE 账户 last_seq+1（行锁）` | `PointsRepository.applyTrip` |
| 8 | `INSERT 行程 + 因子快照` | `TripRepository.insert` |
| 9 | `INSERT 流水 account_seq` | `PointsRepository.insertLedger` |
| 10 | 返回 `TripDetail` | `TripService.create` |
| 11 | `200 {code:0, data}` | `GlobalExceptionHandler`/Controller |

## 4. 鲁棒图/序列图覆盖清单（DR-03）

指导书要求"按用例覆盖"，17 个用例全画 17 对图不现实，按**业务闭环**分组覆盖：

| 用例 | 鲁棒图 | 序列图 | 对应设计类 |
|---|---|---|---|
| UC-04 上报行程（含 UC-05/06 查询） | 待补 | ✅ 样例 | TripController / TripService / TripRepository / PointsRepository |
| UC-10 兑换商品（含 UC-09/11） | 待补 | 待补 | MallController / MallService / MallRepository / OrderRepository |
| UC-13 处理订单（履约/取消，含 UC-12） | 待补 | 待补 | AdminController / OrderService / AuditRepository |
| UC-16 配置核算规则 | 待补 | 待补 | AdminController / RuleService / AdminRepository |
| UC-17 核对积分账目 | 待补 | 待补 | AdminController / ReconcileService |
| UC-01/02/03/15 账户与权限 | 合并为 1 张 | 合并为 1 张 | AuthController / AuthService / UserRepository |
| UC-07/08 积分查询 | 并入 UC-04 序列 | 并入 UC-04 序列 | PointsController / PointsService |
| UC-14 运营统计 | 不单独出图（只读聚合，属 #17） | — | AdminService.dashboard |

说明：查询类用例（UC-05/06/07/08/11）没有独立业务分支，并入写路径的序列图里体现；
`UC-14` 属 P1（#17），本轮不出图。

## 5. 复现

```bash
python tools/gen_mdj.py gts-design.mdj gts-seq-sample.mdj
```

生成后建议在 StarUML 里 `File → Save` 一次再提交，避免版本差异。

## 6. 待补（下一轮）

- 鲁棒图 5 张（boundary/control/entity 构造型，参照 `第四讲作业/餐饮管理系统.mdj` 的 profile 写法）
- 其余 4 张序列图（兑换、订单处理、规则切换、对账）
- `docs/02-design/key-design.md` 里的"示意"替换为正式图引用
