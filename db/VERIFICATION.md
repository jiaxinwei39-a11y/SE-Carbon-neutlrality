# 数据库交付实测记录（#9）

> 负责：郭浚文　执行日期：2026-11-16　结构版本：V2
> 这份记录回应 PR #28 评审要求的三类证据：
> **业务修改后重跑 seed**、**已有表升级保留数据**、**同账户并发流水顺序**。

## 1. 环境

| 项 | 值 |
|---|---|
| 数据库 | MySQL 8.4.11（InnoDB，`gts`） |
| 客户端 | `mysql.exe`（`--default-character-set=utf8mb4`） |
| JDK / 框架 | OpenJDK 21.0.13 / Spring Boot 4.1.2（并发用例的后端） |
| 执行方式 | 脚本化，全部真实执行；下文数字均来自实际输出 |

## 2. 空库初始化

```
表数量            12      （10 张业务表 + t_rule_mode_lock + t_schema_version）
结构版本          V2
用户/规则/商品    4 / 4 / 8
行程/流水         3 / 3
U001 余额/序号    42 / 3
流水序号区间      1-3（连续）
流水合计 = 余额   42 = 42
```

## 3. seed 重跑（幂等）

连跑第二次后：

| 断言 | 实际 |
|---|---|
| 行程仍为 3 条 | 3 |
| 流水仍为 3 条 | 3 |
| 余额仍为 42 | 42 |
| `last_seq` 仍为 3 | 3 |

## 4. 业务改动后再重跑 seed ← 评审意见 1

模拟一次真实的业务变更后再执行 `seed.sql`：

```
UPDATE t_product  SET stock=47, points=125 WHERE product_id='P001';   -- 兑换掉 3 件 + 改价
UPDATE t_product  SET points=70            WHERE product_id='P006';
UPDATE t_carbon_rule SET points_ratio=12   WHERE rule_id='R-2026-11-BUS';
UPDATE t_user     SET nickname='张小明改名' WHERE user_id='U001';
```

| 断言 | 实际 | 结论 |
|---|---|---|
| P001 库存仍为 47（没有被"补回"50） | 47 | 保留业务值 |
| P001 价格仍为 125 | 125 | 保留业务值 |
| P006 价格仍为 70 | 70 | 保留业务值 |
| BUS 系数仍为 12（没被覆盖回 10） | 12 | 保留业务值 |
| 昵称未被覆盖 | 张小明改名 | 保留业务值 |

**实现方式**：参考数据（用户、账户、商户、规则、商品）全部改为 `INSERT IGNORE`，
存在即跳过；`ON DUPLICATE KEY UPDATE col = VALUES(col)` 这种"看起来幂等、其实覆盖"的写法已全部移除。

## 5. 拒绝不兼容数据 ← 评审意见 2

在 U001 下插入一条**非演示**行程后重跑 `seed.sql`：

```
ERROR 1644 (45000): 种子中止：U001 已有非演示行程。演示库请用空库初始化，或执行 db/reset-demo.sql
```

种子业务段在一个事务里，且进入前检查三种不兼容状态（有真实行程 / 演示行程不完整 / 余额非 0 且无演示行程），
任一命中就 `SIGNAL` 中止。收尾还有一道断言：账户余额必须等于流水合计、`last_seq` 必须等于最大序号，
不满足则整体回滚。

## 6. V1 → V2 升级保留数据 ← 评审意见 4

| 步骤 | 结果 |
|---|---|
| 建 V1 结构并灌入业务数据（2 条流水、余额 42、P001 库存 47） | 成功 |
| 执行 `V2__account_seq_and_rule_lock.sql` | 成功 |
| 升级后流水条数 | 2（不变） |
| 升级后余额 | 42（不变） |
| 升级后商品库存 | 47（不变） |
| 回填的 `account_seq` | 1-2（连续） |
| `last_seq` 对齐 | 2 |
| 版本表 | `V1,V2` |
| 脚本自检 `seq_max_per_user_mismatch` / `seq_gap_accounts` | 0 / 0 |
| 重复执行 V2 | 被拒（`请勿重复执行`） |

**回填算法**：`ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id)`。
同一毫秒内用 `id` 打破并列，保证每次升级得到同一组序号。

## 7. 同账户并发流水顺序 ← 评审意见 3

8 个并发请求（不同 `clientTripId`，各 15 分）同时打到运行中的后端：

```
8 个响应 code = 0,0,0,0,0,0,0,0
```

数据库侧：

| 断言 | 实际 |
|---|---|
| 流水总条数（3 条种子 + 8 条并发） | 11 |
| `account_seq` 最小值 / 最大值 | 1 / 11 |
| 序号去重后条数 | 11（无重号） |
| 连续（`MAX = COUNT`） | yes |
| 账户 `last_seq` | 11 |
| 余额 | 162（42 + 8×15） |
| 余额 = 流水合计 | yes |
| **余额链**（前一笔 `balance_after` + 本笔 `amount` = 本笔 `balance_after`）断裂数 | **0** |

逐笔明细（序号、类型、变动、余额）：

```
1  EARN 18  18        7  EARN 15 102
2  EARN 12  30        8  EARN 15 117
3  EARN 12  42        9  EARN 15 132
4  EARN 15  57       10  EARN 15 147
5  EARN 15  72       11  EARN 15 162
6  EARN 15  87
```

8 个并发请求分配到 4～11 号，**连续、不重号、余额链一环不断**。
分配方式是"`UPDATE last_seq = last_seq + 1` 持有账户行锁 → `SELECT` 读回 → 写流水"，
`UQ(user_id, account_seq)` 兜底。**没有**使用全局自增 `id` 或 `DATETIME(3)` 充当顺序。

## 8. 规则区间互斥

| 用例 | 结果 |
|---|---|
| 同 `mode + effective_from` 重复插入 | `ERROR 1062 ... for key 't_carbon_rule.uk_rule_mode_from'` |
| 锁表串行化：会话 A 持锁 3 秒，B 同时申请同一行 | B **等待 2.69 秒**后才获得锁 → 串行化生效 |
| 清理测试数据后规则数 | 4（恢复基线） |

说明：**"区间不重叠"无法用单条 CHECK 表达**（要跨行比较），因此采用
"锁 `t_rule_mode_lock` 对应行 → 事务内校验区间 → 原子结束旧区间并插入新版本"。
`UQ(mode, effective_from)` 只兜底"同起点重复"，不是区间互斥的全部保证，这一点在 `db/README.md` 第 3.2 节已写明。

## 9. 复现命令

```bash
# 空库初始化
mysql -uroot -p < db/schema.sql
mysql -uroot -p gts < db/seed.sql

# 重跑（幂等）
mysql -uroot -p gts < db/seed.sql

# 恢复演示状态
mysql -uroot -p gts < db/reset-demo.sql
mysql -uroot -p gts < db/seed.sql

# 升级路径
mysql -uroot -p < db/migrations/V1__init.sql
mysql -uroot -p gts < db/migrations/V2__account_seq_and_rule_lock.sql

# 字典
mysql -uroot -p gts -N -B -e "<export-dict.sql 查询 1>" > cols.tsv
python db/tools/gen_dict.py cols.tsv fk.tsv idx.tsv chk.tsv schema-dict.md
```

## 10. 异常回滚（第二轮评审补充）

评审指出：`SIGNAL` 只让过程退出，**不等于回滚**；交互连接随后一条 `COMMIT`
或一句隐式提交的 DDL，就会把半截写入提交掉。因此两个过程都补了 `EXIT HANDLER`：

```sql
DECLARE EXIT HANDLER FOR SQLEXCEPTION
BEGIN
  ROLLBACK;
  RESIGNAL;
END;
```

验证方式（**同一连接制造中途失败，再执行 COMMIT**）：

1. 干净初始化 → `reset-demo.sql` 清空演示业务数据 → 账户余额 0、行程 0
2. 预先插入一条 `account_seq = 9` 的流水，使种子的收尾断言（条目数 = 3）必然失败
3. 用 `mysql --force` 执行"`seed.sql` + `COMMIT;` + 查询"（模拟调用方继续提交）
4. 结果：

```
ERROR 1644 (45000) at line 218: 种子中止：演示数据条数/余额与预期不符，已回滚
AFTER_COMMIT
trips=0
ledger=1
```

| 断言 | 实际 |
|---|---|
| 失败后被中止的 3 条行程没有留下 | `trips = 0` |
| 只有预先手工插入的那 1 条流水 | `ledger = 1` |
| 余额没有被改动 | `0` |

即使同一连接紧接着执行 `COMMIT`，也没有任何半成品被提交。

## 11. reset-demo 对后续规则版本的处理（第二轮评审补充）

原实现只是把基线版本的 `effective_to` 置 NULL，**没有处理后续版本**：
若已存在 `R-2026-11-BUS-V2`，重置后两条规则都覆盖当前时间，后端按 `effective_from DESC`
仍会选中 V2，等于没重置。

现在 `reset-demo.sql` 会**删除非基线版本**（被行程引用的版本不删，检测到就中止），
再恢复基线版本的因子与区间。验证：

| 步骤 | 结果 |
|---|---|
| 插入 `R-2026-11-BUS-V2`（2026-03-01 起，系数 20） | BUS 规则数 = 2 |
| 重置前按"结束时间落在区间内 + effective_from DESC"匹配 | 命中 `R-2026-11-BUS-V2` |
| 执行 `reset-demo.sql` | BUS 规则数 = 1 |
| 重置后同样的匹配查询 | 命中 `R-2026-11-BUS`（基线） |
| 基线系数 | 恢复为 10 |

## 12. 未覆盖的部分（如实标注）

| 项 | 状态 | 说明 |
|---|---|---|
| 迁移的**自动化**执行器 | 未实现 | 目前逐版本手工执行 + `t_schema_version` 记录；后续可接 Flyway |
| 区间重叠的**数据库级**拦截 | 不可能 | 由锁表 + 事务内校验承担，已在 README 说明边界 |
| 失败注入回滚（TC-13） | 已在 #10 执行 | 用 `gts.test.fail-after-trip` 注入，行程/流水/余额均未变，见 `gts-backend/TEST-REPORT.md` |
| 峰值并发（>8） | 未测 | 课程演示规模按 20 并发规划，留给 #14 压测 |
