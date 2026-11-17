# 数据库交付说明（#9）

> 负责：郭浚文　结构版本：V4
> 对应 PR #28 评审意见 3、4、5 的补充说明

## 1. 目录与执行顺序

```
db/
├── schema.sql                    空库初始化（V4 终态；已有库会被闸门拒绝）
├── seed.sql                      演示种子（只插入不覆盖、事务内、带前置校验）
├── reset-demo.sql                显式重置演示数据（破坏性，仅演示库）
├── schema-dict.md                逐字段字典（工具生成）
├── migrations/                   既有库升级
│   ├── V1__init.sql              首版结构
│   ├── V2__account_seq_and_rule_lock.sql
│   ├── V3__product_icon_255.sql
│   ├── V4__order_product_icon_255.sql
│   └── README.md                 升级步骤与边界
└── tools/
    ├── gen_dict.py               字典生成器
    └── export-dict.sql           字典的 4 个导出查询
```

**全新空库**：`schema.sql` → `seed.sql`（`schema.sql` 检测到已有结构会中止）
**已有库**：`migrations/` 里按 V1 → V2 → V3 → V4 逐版本升级（数据保留，见 migrations/README.md）
**恢复演示状态**：`reset-demo.sql` → `seed.sql`

## 2. 与 key-design.md 3.2/3.3 的对照

设计文档给出的是逻辑结构，本库是它的落地实现。**有命名差异，没有语义缺失**，逐项对照如下。

| 设计文档 | 本库 | 说明 |
|---|---|---|
| `app_user` | `t_user` | 表名前缀 `t_`，避免与业务名词混淆 |
| `point_account.id`（PK）+ `user_id`（UQ） | `user_id` 直接作主键 | 账户与用户 1:1，省一次关联；设计里的 `account_id` 即 `user_id` |
| `point_ledger.account_id` | `user_id` | 同上，且外键指向 `t_point_account(user_id)` |
| `business_type`（TRIP_GRANT / REDEMPTION_DEBIT / REDEMPTION_REVERSAL）+ `business_id` | `ref_type`(TRIP/ORDER) + `type`(EARN/SPEND/REVERSE) + `ref_id` | 设计把"业务来源"和"方向"合并在一个字段；本库拆成两列，`UQ(ref_type, ref_id, type)` 与设计的 `UQ(business_type, business_id)` **等价**。拆分的好处是兑换取消时 `REVERSE` 与 `SPEND` 能挂在同一张订单上而不冲突 |
| `travel_mode` | `mode` | 取值完全相同（BUS/SUBWAY/BIKE/WALK），只是列名更短 |
| `baseline_factor` / `mode_factor` / `points_per_kg`，`DECIMAL(12,6)` | `base_factor` / `mode_factor` / `points_ratio`，`DECIMAL(18,9)` | 列名对齐前端 DTO；精度提高到 9 位小数，因为减排量要乘里程（0.333 km × 0.15 = 0.04995，再乘系数 10 后被向下取整，6 位小数在极端里程下会丢精度） |
| `DATETIME(6)` | `DATETIME(3)` | 毫秒精度足够本项目；`DATETIME` 不是排序依据（见第 3 节） |
| `point_account.last_seq` | **已实现** `last_seq BIGINT NOT NULL DEFAULT 0` | 默认 0，锁内自增 |
| `point_ledger.account_seq` + `UQ(account_id, account_seq)` | **已实现** `account_seq BIGINT NOT NULL` + `UQ(user_id, account_seq)` | 从 1 连续递增，`ck_ledger_seq` 保证 ≥1 |
| `rule_mode_lock(travel_mode PK)` | **已实现** `t_rule_mode_lock` | 四种方式各一行，种子脚本会灌入 |

## 3. 并发方案（数据库侧到底保证了什么）

评审意见 3 的核心要求是：**不能把时间戳或 version 字段当作顺序/区间互斥的保证**。本库的做法：

### 3.1 账户内流水顺序

```sql
-- 同一个事务内，由业务层（#10 TripService）执行：
UPDATE t_point_account
   SET last_seq = last_seq + 1, balance = balance + ?, ...
 WHERE user_id = ?;                    -- 这条语句持有该账户行锁
-- 再读回本次分配到的序号（行锁仍在本事务手里）
SELECT last_seq FROM t_point_account WHERE user_id = ?;
-- 然后把该值写进流水
INSERT INTO t_point_ledger (..., account_seq, ...) VALUES (..., ? , ...);
```

- **串行化来源**：InnoDB 行锁。同一账户的并发发分在同一行上排队，序号不会重号也不会乱序。
- **兜底约束**：`UQ(user_id, account_seq)`，万一应用写错直接插入失败。
- **为什么不能用 `id` 或时间**：全局自增 `id` 跨账户交错且有空洞，不能表达"该账户第几笔"；
  `DATETIME(3)` 在同一毫秒内可并列，排序不稳定。
- **不同账户之间不互相阻塞**：锁的粒度是账户行。

### 3.2 规则生效区间互斥

```sql
START TRANSACTION;
SELECT travel_mode FROM t_rule_mode_lock WHERE travel_mode = ? FOR UPDATE;  -- 串行化闸门
-- 校验：该方式下 [from, to) 与既有区间不重叠
UPDATE t_carbon_rule SET effective_to = ? WHERE ... ;   -- 原子结束旧区间
INSERT INTO t_carbon_rule (...) VALUES (...);           -- 插入新版本
COMMIT;
```

- **串行化来源**：`t_rule_mode_lock` 的行锁，同一方式同时只有一个变更事务。
- **兜底约束**：`UQ(mode, effective_from)`（同起点不会重复）+ `ck_rule_interval`（`to > from`）。
- **区间不重叠无法用单个 CHECK 表达**（要跨行比较），所以必须"锁表 + 事务内校验"，这一点在迁移脚本与本节都写明了。

### 3.3 事务边界（交接给 #10 / #12）

数据库只负责**约束与顺序**；跨表原子性由应用层事务保证，分工如下：

| 场景 | 事务范围 | 负责 |
|---|---|---|
| 上报行程 | 插行程 + 发分（改账户 `last_seq`/`balance`）+ 写流水，同一事务 | #10 `TripService.create`（`@Transactional`） |
| 兑换 | 账户 → 商品 → 订单 顺序加锁，扣分/减库存/写流水/建订单同一事务 | #12 |
| 取消冲正 | 订单 → 账户 → 商品，返还 + 冲正流水同一事务 | #12 |

**证据**：`db/VERIFICATION.md` 第 6 节有两笔并发发分得到 `account_seq = 4,5` 且余额连续的实际记录。

## 4. 字典怎么复现

```bash
# 1) 数据库就绪后，分别执行 tools/export-dict.sql 里的 4 条查询
mysql -uroot -p gts -N -B -e "<查询1>" > cols.tsv
mysql -uroot -p gts -N -B -e "<查询2>" > fk.tsv
mysql -uroot -p gts -N -B -e "<查询3>" > idx.tsv
mysql -uroot -p gts -N -B -e "<查询4>" > chk.tsv

# 2) 生成
python tools/gen_dict.py cols.tsv fk.tsv idx.tsv chk.tsv schema-dict.md
```

字典包含四部分：表清单、索引与唯一约束清单、**CHECK 约束清单（字段取值范围）**、逐字段字典。
键列同时标注 `PK` 与 `FK→表.列`（例如 `t_point_account.user_id` 是 `PK,FK→t_user.id`）。

## 5. 凭据

`db/` 下没有任何账号、口令或连接串。
后端数据库口令通过环境变量 `GTS_DB_PASSWORD` 注入，见 `gts-backend/README.md`。
