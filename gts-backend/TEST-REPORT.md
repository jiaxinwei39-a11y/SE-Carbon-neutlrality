# #10 验收测试记录（按 acceptance-checklist 的 TC 编号）

> issue：**#10 [BE-01][P0] 实现账户、行程核算和积分后端**
> 要求的验证场景：**TC-01～08、13、17、18、20**
> 本文件按你们 `docs/00-product/acceptance-checklist.md` 的 TC 编号组织，可直接贴进 issue 和报告。

## 1. 环境

| 项 | 值 |
|---|---|
| 日期 | 2026-11-15 |
| JDK / 框架 | OpenJDK 21.0.13 / Spring Boot 4.1.2（Spring 7.0.10、Tomcat 11.0.27） |
| 数据库 | MySQL 8.4.11，库 `gts` |
| 服务端口 | 8082（8080 被本机其它进程占用） |
| 数据基线 | `db/seed.sql`：U001 余额 42 分、3 条行程、3 条流水 |
| 规则基线 | 4 条 `R-2026-11-*`（base 0.2，BUS 0.05 / SUBWAY 0.04 / BIKE、WALK 0）+ 2 条测试专用规则（见下） |
| 脚本 | `scripts/acceptance-test.ps1`（TC 对齐）、`scripts/api-test.ps1`（接口明细） |

## 2. TC 对齐结果

**22 条断言全部通过（pass=22, fail=0）。**

| TC | 场景 | 子用例与输入 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| **TC-01** | 公交 10km 减排 1.5kg、15 分 | BUS 10km | 减排 1.5，积分 15 | reduction=1.500000000，points=15 | 通过 |
| **TC-02** | 0.333km 取整零分、行程成功、无流水 | BUS 0.333km | 积分 0，行程保存，流水条数不变 | points=0，flows 4→4 | 通过 |
| **TC-03** | 实际因子高于基准，减排与积分为 0 | 规则 R-TEST-WALK-HI（mode_factor 0.3 > base 0.2），WALK 5km | 减排 0、积分 0 | reduction=0，points=0 | 通过 |
| **TC-04** | 里程/方式/精度/起终点/时间分别非法 | ①12.3456km ②0km ③PLANE ④起点空 ⑤结束早于开始 ⑥结束在未来 | 分别 40010/40010/40000/40000/40011/40011 | 六项全部命中对应码 | 通过 |
| **TC-05** | 规则左闭右开边界 | 旧规则区间止于 2026-11-14 00:00，新规则同刻起；①结束 23:59:59 ②结束正好 00:00:00 ③结束之后 | ①旧规则 ratio10/15分 ②**新规则**（左闭）ratio20 ③新规则 30分 | ver=R-2026-11→R-2026-11-V2，ratio 10→20，pts 15→30 | 通过 |
| **TC-06** | 缺规则时拒绝 | 结束时间 2025-12-30（早于所有规则） | 40905，不落库 | code=40905 | 通过 |
| **TC-07** | 行程重试、同键异输入 | ①同键同输入两次 ②同键改里程 | ①返回同一 tripId ②40904 | ①tripId 相同 ②code=40904 | 通过 |
| **TC-08** | 跨用户键隔离与行程越权 | ①两用户用**同一个** clientTripId 各报一次 ②U002 读 U001 的行程 | ①都成功、tripId 不同（唯一键按用户隔离）②40401 | ①两条记录、tripId 不同 ②code=40401 | 通过 |
| **TC-13** | 发分故障注入整笔回滚 | — | 行程/流水/余额全部回滚 | **未执行** | **未执行** |
| **TC-17** | 改规则不改旧快照 | 新增 V2 规则后查种子行程 TR202611080001 | 仍为 ratio 10、18 分、R-2026-11 | ratio=10，pts=18，ver=R-2026-11 | 通过 |
| **TC-18** | 越权拒绝（P1 启停部分属 #17） | ①无 token 查 /auth/me ②无 token 查 /points/account | 40100 | 均 40100 | 通过 |
| **TC-20** | 账户与本人查询 | ①余额是否等于流水合计 ②tripCount 是否等于本人行程数 | 完全相等 | balance=162、ledgerSum=162；tripCount=11、listTotal=11 | 通过 |

### TC-13 为什么未执行（必须如实写）

TC-13 要求**故障注入**（在发分/兑换/取消的中间步骤人为制造失败，验证整笔回滚）。
当前实现的事务边界是 `@Transactional` 包住"插行程 → 改账户 → 写流水"三步，逻辑上满足回滚要求，
但**没有做真实的故障注入验证**，所以按项目约定记为"未执行"，不能写成通过。
建议由李金平在 #14 用如下方式补：临时把 `t_point_ledger` 改名为只读表 / 触发唯一键冲突，观察行程是否回滚。

## 3. 补充：接口明细测试（27 项断言）

TC 只定义"场景组"，验收清单第 4 条要求"按每个输入、分支拆成 TC-04.1 等子用例分别记录"。
明细用例见 `scripts/api-test.ps1`，覆盖：登录成功/密码错误、越权、注册、重复手机号、
列表分页与筛选、行程详情快照、流水分页、缺幂等键、非法模式、里程越界、时间倒序、零积分不写流水。

其中最关键的一条是**并发重复提交**：

```
8 个并发请求，同 clientTripId
codes = 0,0,0,0,0,0,0,0        （8 个都告诉用户"成功"）
distinct tripIds = 1           （数据库只有 1 条行程）
balance 72 -> 87, delta = +15  （只加一次分）
```

## 4. 与 issue 验收条件的对应

| #10 验收条件 | 实现位置 | 证据 |
|---|---|---|
| Decimal/BigDecimal 计算并仅最终向下取整 | `TripService.create`：`distance.multiply(factor)`，最后 `setScale(0, FLOOR)` | TC-01（1.5kg→15分）、TC-02（0.4995→0） |
| 零积分行程成功且不写零额流水 | `TripService`：`if (awarded > 0) insertLedger(...)` | TC-02（flows 4→4） |
| 同键同输入重放、不同输入拒绝 | `t_trip` 唯一键 `(user_id, client_trip_id)` + 输入比对 | TC-07 |
| 并发至多一笔行程和发分 | 唯一键冲突捕获后回查 | 并发测试（8→1） |
| 行程/快照/流水/余额同事务回滚 | `@Transactional` 包住三步写入 | 设计满足，TC-13 **未验证** |
| 角色和数据归属由服务端验证 | 拦截器 + 所有查询带 `user_id` | TC-08、TC-18 |

## 5. 测试专用规则的说明

`scripts/test-fixtures.sql` 会临时插入两条规则并修改一条旧规则的结束时间：

- `R-TEST-WALK-HI`：mode_factor 0.3 > base 0.2，用于 TC-03
- `R-2026-11-BUS-V2`：积分系数 20，用于 TC-05 / TC-17
- 旧 `R-2026-11-BUS` 的 `effective_to` 改为 2026-11-14 00:00

**这些改动只用于测试，跑完必须重置数据库**（`DROP DATABASE gts` → 重新执行 schema + seed）。
当前库已重置为干净的种子状态：4 条规则、3 条行程、余额 42 分。

## 6. 复现

```bash
# 1. 干净初始化
mysql -uroot -p < db/schema.sql
mysql -uroot -p gts < db/seed.sql

# 2. 启动后端
cd gts-backend && mvn spring-boot:run

# 3. 应用测试规则
mysql -uroot -p gts < gts-backend/scripts/test-fixtures.sql

# 4. 跑 TC 用例（端口不同请改脚本第 3 行）
powershell -ExecutionPolicy Bypass -File gts-backend/scripts/acceptance-test.ps1

# 5. 跑完重置，别把测试数据留下
```
