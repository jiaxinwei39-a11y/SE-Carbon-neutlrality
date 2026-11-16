# 后端工程（#10：账户 / 行程 / 积分）

城市绿色出行碳减排积分系统后端。范围是 **#10 [BE-01][P0] 账户、行程核算与积分后端**：
注册、登录、会话校验、行程上报（含核算快照与幂等）、积分发放、账户与流水查询、本人数据隔离。

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

## 6. 安全相关

- 账号不存在与密码错误返回**同一个** 40101，不泄露账号是否存在。
- 令牌 32 字节随机，库里只存 SHA-256；退出登录即作废。
- 停用用户（`status=DISABLED`）登录被拒，且已签发的旧会话下次请求就失效（会话查询里带 `u.status='ENABLED'`）。
- 所有查询都带 `user_id` 条件，读别人的行程返回 404 而不是 403，不暴露"这条记录存在"。

## 7. 还没做（#12 及以后）

- 商城：商品浏览/维护、兑换、库存扣减
- 订单：履约、取消冲正
- 规则维护、只读对账、运营统计
- 管理端 7 个写接口（契约 3.7 节，前端尚无调用入口，需与高泽确认）

## 8. 自测

```bash
# 先启动服务，然后
powershell -ExecutionPolicy Bypass -File scripts/api-test.ps1
```

脚本默认打 `http://127.0.0.1:8082/api`，端口不同就改脚本第 3 行。
