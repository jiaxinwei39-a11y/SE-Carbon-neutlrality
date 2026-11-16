-- =============================================================================
--  V2 —— 账户流水序号 + 规则串行化锁 + 区间约束
--  负责：郭浚文（#9）
--  对应 PR #28 评审意见 3、5
--
--  前提：库处于 V1（t_schema_version 里有 V1、没有 V2）
--  执行：mysql -uroot -p gts < db/migrations/V2__account_seq_and_rule_lock.sql
--
--  ⚠️ 本脚本只执行一次。数据库不支持 "ADD CONSTRAINT IF NOT EXISTS"，
--     重复执行会报 Duplicate constraint；执行前请确认：
--         SELECT * FROM t_schema_version;
--     已有 V2 就不要再跑。已有数据的升级验证步骤见 migrations/README.md。
-- =============================================================================

USE gts;

-- 0. 版本闸门：已升级过就立刻报错，避免半途重复执行
DROP PROCEDURE IF EXISTS sp_v2_guard;
DELIMITER $$
CREATE PROCEDURE sp_v2_guard()
BEGIN
  IF EXISTS (SELECT 1 FROM t_schema_version WHERE version = 'V2') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '已升级到 V2，请勿重复执行本脚本';
  END IF;
END$$
DELIMITER ;
CALL sp_v2_guard();
DROP PROCEDURE sp_v2_guard;

-- 1. 账户：增加流水序号游标
ALTER TABLE t_point_account
  ADD COLUMN last_seq BIGINT NOT NULL DEFAULT 0
    COMMENT '账户内流水序号游标，锁内自增后分配给 account_seq' AFTER total_reduction_kg,
  ADD CONSTRAINT ck_account_last_seq CHECK (last_seq >= 0);

-- 2. 流水：先加可空列，回填后再收紧为 NOT NULL + 唯一
--    确保每个有流水的用户都有账户行，否则第 4 步的外键切换会失败
INSERT IGNORE INTO t_point_account (user_id)
SELECT DISTINCT user_id FROM t_point_ledger;

ALTER TABLE t_point_ledger
  ADD COLUMN account_seq BIGINT NULL
    COMMENT '账户内流水序号，从 1 连续递增，锁内分配' AFTER user_id;

-- 回填：按发生时间、再按 id 打破同毫秒并列，每个账户从 1 开始
UPDATE t_point_ledger l
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM t_point_ledger
) x ON x.id = l.id
SET l.account_seq = x.rn;

ALTER TABLE t_point_ledger
  MODIFY COLUMN account_seq BIGINT NOT NULL
    COMMENT '账户内流水序号，从 1 连续递增，锁内分配',
  ADD UNIQUE KEY uk_ledger_account_seq (user_id, account_seq),
  ADD CONSTRAINT ck_ledger_seq CHECK (account_seq >= 1);

-- 3. 流水外键改为指向账户（流水必须挂在账户下，而不是只挂在用户下）
ALTER TABLE t_point_ledger DROP FOREIGN KEY fk_ledger_user;
ALTER TABLE t_point_ledger
  ADD CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES t_point_account (user_id);

-- 4. 账户游标对齐到已有流水的最大序号
UPDATE t_point_account a
SET a.last_seq = COALESCE((SELECT MAX(l.account_seq) FROM t_point_ledger l WHERE l.user_id = a.user_id), 0);

-- 5. 规则：区间起点唯一 + 区间合法性，配合 t_rule_mode_lock 保证不重叠
ALTER TABLE t_carbon_rule
  ADD UNIQUE KEY uk_rule_mode_from (mode, effective_from),
  ADD CONSTRAINT ck_rule_interval CHECK (effective_to IS NULL OR effective_to > effective_from);

-- 6. 规则串行化锁表（四种方式各一行）
CREATE TABLE IF NOT EXISTS t_rule_mode_lock (
  travel_mode VARCHAR(16) NOT NULL COMMENT '出行方式，四种各一行',
  PRIMARY KEY (travel_mode),
  CONSTRAINT ck_rule_lock_mode CHECK (travel_mode IN ('BUS', 'SUBWAY', 'BIKE', 'WALK'))
) ENGINE = InnoDB COMMENT = '规则串行化锁表';

INSERT IGNORE INTO t_rule_mode_lock (travel_mode)
VALUES ('BUS'), ('SUBWAY'), ('BIKE'), ('WALK');

-- 7. 记录版本
INSERT INTO t_schema_version (version, description)
VALUES ('V2', '增加账户流水序号 last_seq/account_seq、规则串行化锁表与区间约束')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 8. 升级自检：数据条数、序号连续性、游标一致性
SELECT 'ledger_rows' AS item, COUNT(*) AS value FROM t_point_ledger
UNION ALL
SELECT 'seq_max_per_user_mismatch', COUNT(*) FROM (
  SELECT a.user_id, a.last_seq
  FROM t_point_account a
  LEFT JOIN t_point_ledger l ON l.user_id = a.user_id
  GROUP BY a.user_id, a.last_seq
  HAVING a.last_seq <> COALESCE(MAX(l.account_seq), 0)
) t
UNION ALL
SELECT 'seq_gap_accounts', COUNT(*) FROM (
  SELECT user_id
  FROM t_point_ledger
  GROUP BY user_id
  HAVING MIN(account_seq) <> 1 OR MAX(account_seq) <> COUNT(*)
) g;
