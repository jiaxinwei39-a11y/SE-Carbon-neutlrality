# 数据库迁移（migrations）

> 负责：郭浚文（#9）
> 对应 PR #28 评审意见 4：**"可重复初始化不等于迁移升级"**

## 1. 两种安装方式，别混用

| 场景 | 用什么 | 说明 |
|---|---|---|
| **全新空库** | `db/schema.sql` | 已经是最新结构（V4），执行完直接 `db/seed.sql` |
| **已有库升级** | `db/migrations/V1__init.sql` → `V2` → `V3` → `V4` | 逐版本执行，数据保留 |

> ⚠️ **`schema.sql` 有安装闸门**：检测到库里已有 `t_schema_version` 就立即中止。
> 因为它用 `CREATE TABLE IF NOT EXISTS`，在旧库上会跳过所有建表（旧列宽不更新），
> 却仍会写入 V1–V4 版本号，造成"版本表说已升级、结构还是旧的"，
> 之后 V3/V4 迁移看到版本号就拒绝执行，旧库再也升不上来。

`schema.sql` 不是迁移脚本：它用 `CREATE TABLE IF NOT EXISTS`，对已存在的同名表会**跳过**，
所以旧结构缺的列、唯一键、CHECK 都不会被补上。升级必须走本目录。

## 2. 版本记录

版本写在 `t_schema_version`：

```sql
SELECT * FROM t_schema_version ORDER BY version;
```

| 版本 | 内容 |
|---|---|
| `V1` | 首版：10 张业务表 |
| `V2` | `t_point_account.last_seq`、`t_point_ledger.account_seq` 与 `UQ(user_id, account_seq)`、`t_rule_mode_lock`、`UQ(mode, effective_from)`、`ck_rule_interval` |
| `V3` | `t_product.icon` 放宽到 `VARCHAR(255)`（支持图片 URL） |
| `V4` | `t_redemption_order.product_icon` 同步放宽到 `VARCHAR(255)`（订单快照必须与商品表同宽） |

执行迁移前**必须先查这个表**，已有目标版本就不要重复执行。
MySQL 不支持 `ADD CONSTRAINT IF NOT EXISTS`，重复执行会报 `Duplicate key/constraint`。
`V2` 脚本开头有版本闸门（`sp_v2_guard`），已升级过会直接 `SIGNAL` 中止。

## 3. 从 V1 升级到 V2 的步骤

```bash
# 1) 备份（课程环境也建议做，一条命令的事）
mysqldump -uroot -p gts > backup-v1-$(date +%Y%m%d).sql

# 2) 确认当前版本是 V1
mysql -uroot -p gts -e "SELECT * FROM t_schema_version;"

# 3) 执行 V2
mysql -uroot -p gts < db/migrations/V2__account_seq_and_rule_lock.sql

# 4) 看脚本末尾的自检输出：
#    ledger_rows                升级前行数（应与升级后一致）
#    seq_max_per_user_mismatch  应为 0（账户 last_seq 与流水最大序号一致）
#    seq_gap_accounts           应为 0（每个账户序号从 1 连续到 COUNT(*)）
```

V2 做四件事，都**不删数据**：

1. `t_point_account` 加 `last_seq`（默认 0）
2. `t_point_ledger` 加 `account_seq`：先加可空列 → 按 `(created_at, id)` 用
   `ROW_NUMBER() OVER (PARTITION BY user_id ...)` 回填 → 再收紧为 `NOT NULL` 并加唯一键
3. `t_point_ledger` 外键从 `t_user` 改指向 `t_point_account`（流水必须挂在账户下）
4. 新建 `t_rule_mode_lock` 并灌入四种方式，`t_carbon_rule` 补 `UQ(mode, effective_from)`

**回填顺序决定了结果**：同一毫秒内的两笔流水用 `id` 打破并列，保证每次升级得到同一组序号，
不会因为执行时间不同而产生不同结果。

## 4. 保留数据的验证怎么做

详见 `db/VERIFICATION.md` 第 4 节，要点：

```
建 V1 库 → 灌入业务数据（3 条行程 + 3 条流水 + 改过库存的商品）
        → 记录每张表行数与关键字段快照
        → 执行 V2
        → 对比：行数不变、余额不变、商品库存/价格不变、流水序号 1..n 连续
```

## 5. 已知边界

| 情况 | 行为 | 处理 |
|---|---|---|
| 已存在 `V2` | V2 脚本第一节 `SIGNAL` 中止 | 正常，无需处理 |
| `t_carbon_rule` 里有同 `mode + effective_from` 的重复行 | `ALTER ... ADD UNIQUE` 失败 | 先人工合并重复规则，再重跑 |
| 有流水但缺账户行 | V2 会先 `INSERT IGNORE` 补账户 | 自动处理 |
| 未来版本 | 按 `V3__xxx.sql` 递增命名，同一套流程 | 待实验二/三补充 |
