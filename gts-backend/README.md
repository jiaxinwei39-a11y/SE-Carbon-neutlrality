# 后端工程（#10 + #12：账户 / 行程 / 积分 / 商城 / 订单 / 规则 / 对账）

城市绿色出行碳减排积分系统后端。已实现 **#10 [BE-01]** 与 **#12 [BE-02]**：
注册登录、行程核算与积分、商品浏览维护、幂等兑换、履约与取消冲正、规则版本化、只读一致性对账。

> 负责：郭浚文（neutral-jiang）
> 状态：**除商城/订单/对账（属 #12）外，#10 的验收项均已实现并实测**；
> TC-01～08、13、17、18、20 全部有执行记录，其中 TC-13 用故障注入验证了整笔回滚（见 TEST-REPORT 第 2 节）。
> **合并依赖**：本分支依赖 #28（#9）的 V2 结构（`t_point_account.last_seq`、`t_point_ledger.account_seq` 为 NOT NULL），
> **合并顺序必须先 #28 后 #29**，否则启动后写流水会因缺列失败。
> 数据库脚本在 [../deliverables/db/](../deliverables/db/)，接口契约在 [../deliverables/docs/02-design/api-contract.md](../deliverables/docs/02-design/api-contract.md)

## 1. 技术栈与选型理由

| 项 | 选择 | 为什么 |
|---|---|---|
| 语言/运行时 | Java 21 | 本机已装 JDK 21，Spring Boot 4 要求 17+ |
| 框架 | Spring Boot 4.1.2 + Spring MVC | 指导书推荐的技术栈之一 |
| 数据访问 | **JdbcTemplate 手写 SQL**，不用 JPA | 事务边界、唯一约束、`FOR UPDATE` 加锁都能一眼看清，答辩好讲；JPA 的脏检查会让人说不清"到底什么时候发的 SQL" |
| 数据库 | MySQL 8.4 + InnoDB | 依赖它的唯一约束和 CHECK 约束做兜底 |
| 口令 | PBKDF2-HMAC-SHA256（JDK 自带） | 不引 Spring Security，满足"加盐哈希"要求 |
| 认证 | 数据库会话表 + Bearer Token | 比 JWT 多一个"能立刻踢人下线"的能力（停用用户立即失效） |

## 2. 目录结构

```
gts-backend/
├── pom.xml
├── scripts/api-test.ps1          自测脚本（27 项，含 8 并发）
├── TEST-REPORT.md               自测记录（可直接进报告"功能测试记录"）
└── src/main/java/com/gts/
    ├── GtsApplication.java       入口
    ├── common/                   统一响应壳、业务异常、全局异常处理、时间转换
    ├── config/WebConfig.java     拦截器注册 + CORS
    ├── auth/                     注册登录、口令哈希、会话、拦截器
    ├── trip/                     行程上报、规则匹配、核算、幂等
    └── points/                   积分账户与流水
```

分层：`Controller`（只做参数和返回）→ `Service`（业务规则、事务）→ `Repository`（SQL）。
**事务注解只加在 Service 上**，Controller 和 Repository 不碰事务。

## 3. 怎么跑起来

前置：数据库已初始化（在仓库根目录执行）

```bash
mysql -uroot -p < db/schema.sql
mysql -uroot -p gts < db/seed.sql
```

然后设置数据库密码并启动（**密码不写在配置文件里**，避免凭据入库）：

```powershell
$env:GTS_DB_PASSWORD="你的 MySQL 密码"
cd gts-backend
mvn spring-boot:run
```

服务起在 `http://localhost:8080/api`，前端 `vite.config.ts` 里的代理目标就是它。

演示账号（口令都是 `123456`）：普通用户 `13800138000`，管理员 `admin`。

> ⚠️ 本机 8080 端口目前被另一个进程占用（看不到的 PID 10300）。如果启动报
> `Port 8080 was already in use`，用 `mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8082`
> 换端口，同时把前端 `vite.config.ts` 的 proxy target 改成 8082。

## 4. 已实现的接口（与契约一一对应）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册（契约新增，前端 `RegisterView` 目前是纯 UI） |
| POST | `/api/auth/login` | 登录，返回 `{ token, user }` |
| GET | `/api/auth/me` | 当前用户 |
| POST | `/api/auth/logout` | 注销（令牌作废） |
| POST | `/api/trips` | 上报行程（需 `Idempotency-Key` 头） |
| GET | `/api/trips` | 行程列表（分页、按方式/关键词/日期筛选） |
| GET | `/api/trips/{tripId}` | 行程详情（含因子快照） |
| GET | `/api/points/account` | 积分账户 |
| GET | `/api/points/flows` | 积分流水（分页、按类型筛选） |
| GET | `/api/mall/products` | 积分商城商品（只返回上架） |
| GET | `/api/mall/products/{productId}` | 商品详情（下架返回 40402） |
| POST | `/api/mall/orders` | 兑换下单（需 `Idempotency-Key` 头） |
| GET | `/api/orders` | 本人兑换订单（按状态筛选） |
| GET | `/api/orders/{orderId}` | 订单详情（本人或管理员） |
| POST | `/api/orders/{orderId}/cancel` | 取消订单（**仅管理员**，需填原因） |
| GET | `/api/admin/products` | 商品列表（含下架） |
| POST | `/api/admin/products` | 新增商品 |
| PUT | `/api/admin/products/{productId}` | 编辑商品（名称/图标/积分/描述） |
| POST | `/api/admin/products/{productId}/status` | 上架/下架 |
| POST | `/api/admin/products/{productId}/stock` | 调整库存 |
| GET | `/api/admin/orders` | 全平台订单 |
| POST | `/api/admin/orders/{orderId}/fulfill` | 订单履约（CREATED → FULFILLED） |
| GET | `/api/admin/rules` | 规则列表 |
| POST | `/api/admin/rules` | 新增规则版本（锁串行化、区间不重叠） |
| GET | `/api/admin/reconciliation` | 只读对账 |

## 5. 六个关键设计决策（答辩重点）

**① 整笔上报在一个事务里**
行程、流水、余额三张表要么全成功、要么全回滚。方法是 `TripService.create` 加 `@Transactional`，
中途任何异常都抛出去让事务管理器回滚，绝不 try-catch 后继续提交。

**② 幂等靠"业务键 + 唯一索引"两道防线**
- 业务键：`t_trip` 上 `UNIQUE(user_id, client_trip_id)`。
- 请求头 `Idempotency-Key` 只校验存在性（缺了返回 40002，与前端 mock 一致）；
  真正落地的去重键是 `clientTripId`，因为它由页面在"开始提交"时生成、重试复用，比请求头更可靠。
- 同键同输入 → 返回原结果；同键不同输入 → 40904。

**③ 金额全程 BigDecimal，最后向下取整**
```java
reduction = distance × (baseFactor − modeFactor)     // 不能小于 0
points    = floor(reduction × pointsRatio)
```
用 `BigDecimal` + `RoundingMode.FLOOR`，不用 `double`（`0.1+0.2 != 0.3`）。

**④ 零积分行程照样存，但不写流水**
0.04 公里的公交行程减排 0.006 kg、积分 0 分：行程要留档、`tripCount` 要加 1，
但**不写 0 元流水**——零金额流水对账时没有意义，还会污染用户的流水列表。

**⑤ 规则按"行程结束时间"匹配，区间左闭右开**
一条 23:50 出发、次日 00:20 结束的行程，应该用结束那一刻生效的规则。
SQL 是 `effective_from <= end AND (effective_to IS NULL OR effective_to > end)`。

**⑥ 时间统一"库里存本地、出口转 UTC"**
数据库 `DATETIME` 存 Asia/Shanghai 本地时间；JSON 输出一律 `2026-11-08T00:05:00.000Z`（UTC，固定 3 位毫秒）。
**格式必须固定**：前端筛选是字符串比较，`...T00:05:00Z` 和 `...T00:05:00.000Z` 混用会导致筛选漏数据。

## 5.1 并发冲突与时间精度（评审修订）

这两处是评审指出的真实缺陷，改法如下。

**① 重复键之后不能在同一事务里回查**

MySQL 默认隔离级别是 `REPEATABLE READ`：事务内第一次普通 `SELECT` 就固定了快照。
两个请求同时进来时，双方的前置查重都看不到对方；后插入的那个会拿到唯一键冲突，
但它在**同一个事务里**再查一次，读到的仍是旧快照 —— 看不到对手刚提交的行，于是重放失败。

现在的做法（`TripService.create`）：

```
tx.execute(...)                     // 第一个事务，异常时由 TransactionTemplate 整体回滚
  └─ 失败 → catch (DuplicateKeyException)
       └─ retryTx.execute(...)      // REQUIRES_NEW，全新事务 + 新快照
            └─ SELECT ... FOR UPDATE  // 当前读，能看到对手已提交的行
```

关键点：**第一个事务在进入 catch 之前已经被回滚并结束**，回查发生在第二个事务里。
回查用 `FOR UPDATE` 做当前读，而不是普通 `SELECT`。

实测（隔离级别 `REPEATABLE-READ`，用 `gts.test.insert-delay-ms=400` 让两个请求都先完成前置查重）：

| 场景 | 结果 |
|---|---|
| 两个并发相同请求 | 都是 `code=0`，**同一个 `tripId`**，库里只有 1 条行程、1 条流水 |
| 两个并发、同键不同里程 | 一个 `code=0`，一个 `40904`，库里只有 1 条行程 |

**② 时间必须截断到毫秒**

数据库列是 `DATETIME(3)`，只存毫秒。如果 `parseIso` 保留微秒，首次入库会被截断，
而幂等比较用的是未截断的值，重放时两者不等 → 误判成"同键不同内容"返回 40904。
现在 `TimeUtil.parseIso` 统一 `truncatedTo(ChronoUnit.MILLIS)`。

实测：请求时间带 `.123456Z`，入库为 `.123`，重放同一请求返回原 `tripId`（`code=0`）。

**测试钩子（默认关闭，不影响生产行为）**

| 配置 | 作用 |
|---|---|
| `gts.test.insert-delay-ms` | 在前置查重与插入之间休眠，制造"两个请求都通过查重"的并发屏障 |
| `gts.test.fail-after-trip` | 行程写入后强制抛异常，用于 TC-13 故障注入 |

## 5.2 商城与订单：加锁顺序与状态机（#12）

**加锁顺序固定为 账户 → 商品 → 订单。**

三条写路径都遵守同一个顺序，避免两个事务反向加锁互相等待：

| 操作 | 加锁顺序 |
|---|---|
| 兑换 | 锁账户 → 锁商品 → 新建订单（无需锁） |
| 履约 | 无锁读订单拿 id → 锁账户 → 锁商品 → 锁订单 → 重读状态 |
| 取消冲正 | 同履约，然后返还积分、恢复库存、写冲正流水 |

**为什么先无锁读一次订单**：取消需要知道用户和商品才能按正确顺序加锁，
但直接锁订单就是"订单 → 账户"，与兑换的顺序相反，会死锁。
所以先无锁读出标识，再按 账户 → 商品 → 订单 加锁并重读状态。

**状态机**只有三条边：`CREATED → FULFILLED`、`CREATED → CANCELLED`，终态不可逆。

- 重复履约 / 重复取消：已处于目标终态 → 返回原结果，**不重复返还**；
- 反向转换（履约一个已取消的订单、取消一个已履约的订单）→ `40903`；
- 履约与取消并发：两者都锁同一订单行并重读状态，后到的看到终态即返回或拒绝，
  所以**只有一个能成功**，且冲正流水数量与最终状态一致。

**冲正流水唯一性**由 `UNIQUE(ref_type, ref_id, type)` 保证：
同一订单最多一笔 `SPEND`、一笔 `REVERSE`，应用层重复调用也不会写第二笔。

## 5.3 只读对账（#12）

`GET /api/admin/reconciliation` 在**一个 `REPEATABLE READ` 只读事务**里跑完所有检查，
保证余额、流水、订单、行程看到的是同一快照。检查项：

| 检查 | 说明 |
|---|---|
| 账户余额 = 流水合计 | 最核心的账实一致 |
| `last_seq` = 最大流水序号 | 序号游标与流水对齐 |
| 流水序号从 1 连续 | 无断号、无重号 |
| 有积分行程必有 EARN 流水 | 发放不漏 |
| EARN 金额 = 行程积分 | 发放金额正确 |
| 兑换流水 = -订单总额 | 扣减金额正确 |
| 已取消订单恰好一笔冲正 | 冲正不重不漏 |
| 未取消订单没有冲正 | 不误冲正 |
| 行程数 / 余额链 | 汇总一致、逐笔可推 |

**只读不修账**：只返回差异项，绝不自动改余额或删流水；
**读取失败必须抛错**：不吞异常，避免页面把"核对失败"显示成"无差异"。

## 5.4 评审修订：幂等复查与规则追溯

**① 兑换拿到账户锁后必须再查一次幂等记录**

原来的查重只在锁外做一次。评审复现出问题：两个同 `Idempotency-Key` 的请求都通过了锁外查重，
第一个先拿到账户锁、把库存扣到 0；第二个在账户锁上等待，等它拿到锁时先去校验库存，
看到"库存不足"就直接退出 —— **根本走不到 `DuplicateKeyException` 的回查分支**，
用户拿到的是 40901 而不是原订单。余额恰好只够一单时同理。

现在在**拿到账户锁之后、校验商品之前**，用 `SELECT ... FOR UPDATE`（当前读）复查一次：

```
锁外查重（快路径）
 → 锁账户
 → 当前读复查幂等记录（FOR UPDATE）   ← 新增
 → 锁商品 → 校验库存 → 扣分 → 扣库存 → 建订单
```

**② 规则禁止追溯生效**

之前只校验了区间重叠，没校验起点是否在过去。评审实测：`effectiveFrom=2026-11-01`
（当天是 11-17）能成功，旧规则被截断到 11-01，过去的历史补录会按新系数算分，
违反 `business-rules.md` BR-01 与 TC-06。

现在**先拿 `t_rule_mode_lock` 的行锁，再用锁内取到的当前时间校验**：`from` 必须不早于此刻，
否则返回 `40909`，**不设容差**。

为什么要放在拿锁之后：如果先校验再等锁，请求可能在锁上等好几秒，
等它真正执行时那个"未来"的起点已经变成过去（评审实测等待 9 秒后仍被放行）。
锁内取时间，才能保证"校验时刻"就是"真正生效判断的时刻"。

不设容差意味着：客户端若要"立即生效"，应提交略晚于当前时刻的时间，
而不是让服务端容忍一段历史。失败时旧区间、审计日志、规则条数都不变。

**③ 规则编号唯一性**

`ruleId` 原来只精确到秒，同一秒内连续建两条规则会撞主键，被全局处理器误报成"重复提交"。
改为毫秒 + 3 位随机后缀。

## 6. 安全相关

- 账号不存在与密码错误返回**同一个** 40101，不泄露账号是否存在。
- 令牌 32 字节随机，库里只存 SHA-256；退出登录即作废。
- 停用用户（`status=DISABLED`）登录被拒，且已签发的旧会话下次请求就失效（会话查询里带 `u.status='ENABLED'`）。
- 所有查询都带 `user_id` 条件，读别人的行程返回 404 而不是 403，不暴露"这条记录存在"。

## 7. 还没做（#17 及以后）

- 运营统计 / 管理端数据概览（US-14，属 #17 P1）
- 个人资料修改、用户启停（#17）
- 前端联调（#13）、测试与部署（#14 / #15）

> 说明：`GET /api/admin/dashboard` 属于运营统计，按分工归 #17，本次未实现。

## 8. 自测

```bash
# 先启动服务，然后
powershell -ExecutionPolicy Bypass -File scripts/api-test.ps1
```

脚本默认打 `http://127.0.0.1:8082/api`，端口不同就改脚本第 3 行。
