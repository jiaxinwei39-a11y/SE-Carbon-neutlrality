-- =============================================================================
--  城市绿色出行碳减排积分系统 —— 演示种子数据
--  负责：郭浚文（#9）  结构版本：V2
--
--  前提：已执行 db/schema.sql（或 migrations V1→V2）
--  执行：mysql -uroot -p gts < db/seed.sql
--
--  【本脚本的承诺】（对应 PR #28 评审意见 1、2）
--   1. 只插入，不覆盖：商品的价格/库存、规则的因子/系数、用户昵称与口令，
--      已存在就保持原值。重跑不会把兑换掉的库存"补回去"，也不会覆盖管理员改过的价。
--   2. 拒绝不兼容的已有数据：账户已有真实行程时直接报错中止，
--      不会出现"流水加了分、账户汇总没跟上"的半成品。
--   3. 账户汇总由流水与行程推导，不硬编码：balance/total_earned/trip_count/
--      total_reduction_kg/last_seq 全部由源数据算出，天然与流水一致。
--   4. 演示业务数据（行程 + 流水 + 汇总）在一个事务里，任何一步失败整体回滚。
--   5. 想恢复成初始演示状态，请用 db/reset-demo.sql（显式、破坏性、只针对演示数据）。
--
--  演示账号（口令统一 123456）：
--      普通用户  13800138000 / 123456   （张小明，U001）
--      普通用户  13900139000 / 123456   （李小雨，U002）
--      普通用户  13700137000 / 123456   （王大力，U003）
--      运营管理员 admin      / 123456   （U004）
--
--  口令为 PBKDF2-HMAC-SHA256 加盐哈希（120000 次迭代），不是明文也不是 MD5。
-- =============================================================================

USE gts;

-- ===========================================================================
--  第一部分：参考数据（账号、账户、商户、规则锁、规则、商品）
--  全是 INSERT IGNORE —— 存在就跳过，绝不覆盖已有值。
--  ===========================================================================

INSERT IGNORE INTO t_user (user_id, login_account, phone, nickname, password_hash, role, status, avatar_text)
VALUES
  ('U001', '13800138000', '13800138000', '张小明',
   'pbkdf2_sha256$120000$vaZLMi7mgh6yICX9B6cSKQ==$zWc9j96IYdHqN7U8LRf8lwRyjQDYdG0FhyzQAGP0F04=',
   'USER', 'ENABLED', '张'),
  ('U002', '13900139000', '13900139000', '李小雨',
   'pbkdf2_sha256$120000$vaZLMi7mgh6yICX9B6cSKQ==$zWc9j96IYdHqN7U8LRf8lwRyjQDYdG0FhyzQAGP0F04=',
   'USER', 'ENABLED', '李'),
  ('U003', '13700137000', '13700137000', '王大力',
   'pbkdf2_sha256$120000$vaZLMi7mgh6yICX9B6cSKQ==$zWc9j96IYdHqN7U8LRf8lwRyjQDYdG0FhyzQAGP0F04=',
   'USER', 'ENABLED', '王'),
  ('U004', 'admin', NULL, '系统管理员',
   'pbkdf2_sha256$120000$vaZLMi7mgh6yICX9B6cSKQ==$zWc9j96IYdHqN7U8LRf8lwRyjQDYdG0FhyzQAGP0F04=',
   'ADMIN', 'ENABLED', '管');

INSERT IGNORE INTO t_point_account (user_id, balance, total_earned, total_spent, trip_count, total_reduction_kg, last_seq)
SELECT u.id, 0, 0, 0, 0, 0, 0 FROM t_user u;

INSERT IGNORE INTO t_merchant (merchant_id, name, status)
VALUES ('M001', '绿色出行权益商城', 'ACTIVE');

-- 规则串行化锁：四种方式各一行（技术表，不是业务数据）
INSERT IGNORE INTO t_rule_mode_lock (travel_mode)
VALUES ('BUS'), ('SUBWAY'), ('BIKE'), ('WALK');

INSERT IGNORE INTO t_carbon_rule (rule_id, mode, base_factor, mode_factor, points_ratio,
                                  effective_from, effective_to, version, status, change_reason)
VALUES
  ('R-2026-11-BUS',    'BUS',    0.200000000, 0.050000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数'),
  ('R-2026-11-SUBWAY', 'SUBWAY', 0.200000000, 0.040000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数'),
  ('R-2026-11-BIKE',   'BIKE',   0.200000000, 0.000000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数'),
  ('R-2026-11-WALK',   'WALK',   0.200000000, 0.000000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数');

INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P001', m.id, '共享单车 7 天卡',  '🚲', 120,  50, 'ON', '7 天内不限次骑行 30 分钟以内' FROM t_merchant m WHERE m.merchant_id = 'M001';
INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P002', m.id, '地铁通勤 10 次券', '🚇', 200,  30, 'ON', '10 次单程地铁乘坐权益' FROM t_merchant m WHERE m.merchant_id = 'M001';
INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P003', m.id, '环保帆布袋',      '🛍️', 80,  100, 'ON', '再生棉材质，容量 12L' FROM t_merchant m WHERE m.merchant_id = 'M001';
INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P004', m.id, '不锈钢保温杯',    '🥤', 350,  20, 'ON', '500ml，保温 8 小时' FROM t_merchant m WHERE m.merchant_id = 'M001';
INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P005', m.id, '公交月卡',        '🚌', 500,  10, 'ON', '当月公交乘车权益' FROM t_merchant m WHERE m.merchant_id = 'M001';
INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P006', m.id, '有机咖啡券',      '☕', 60,   40, 'ON', '合作咖啡馆中杯兑换券' FROM t_merchant m WHERE m.merchant_id = 'M001';
INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P007', m.id, '限时环保礼盒',    '🎁', 800,   2, 'ON', '仅剩 2 件，用于演示并发与库存不足' FROM t_merchant m WHERE m.merchant_id = 'M001';
INSERT IGNORE INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P008', m.id, '已下架测试商品',  '📦', 100,  10, 'OFF', '用于演示下架商品不可兑换' FROM t_merchant m WHERE m.merchant_id = 'M001';

-- ===========================================================================
--  第二部分：演示业务数据（行程 + 流水 + 账户汇总）
--  事务 + 前置校验 + 收尾断言，任何一步不满足就整体回滚并中止。
--  ===========================================================================
DROP PROCEDURE IF EXISTS sp_seed_demo;

DELIMITER $$

CREATE PROCEDURE sp_seed_demo()
BEGIN
  DECLARE v_u1        BIGINT  DEFAULT NULL;
  DECLARE v_foreign   INT     DEFAULT 0;
  DECLARE v_seed      INT     DEFAULT 0;
  DECLARE v_balance   BIGINT  DEFAULT 0;
  DECLARE v_ledger    INT     DEFAULT 0;
  DECLARE v_seq_max   BIGINT  DEFAULT 0;
  DECLARE v_acct_ok   INT     DEFAULT 0;

  SELECT id INTO v_u1 FROM t_user WHERE user_id = 'U001';
  IF v_u1 IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '种子失败：缺少 U001，请先执行 db/schema.sql';
  END IF;

  START TRANSACTION;

  -- ---------- 前置检查：只允许"空账户"或"已是完整演示数据" ----------
  SELECT COUNT(*) INTO v_foreign
    FROM t_trip WHERE user_id = v_u1 AND client_trip_id NOT LIKE 'seed-trip-%';
  SELECT COUNT(*) INTO v_seed
    FROM t_trip WHERE user_id = v_u1 AND client_trip_id LIKE 'seed-trip-%';
  SELECT balance INTO v_balance FROM t_point_account WHERE user_id = v_u1;

  IF v_foreign > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '种子中止：U001 已有非演示行程。演示库请用空库初始化，或执行 db/reset-demo.sql';
  END IF;
  IF v_seed NOT IN (0, 3) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '种子中止：演示行程不完整（上次可能被中断），请执行 db/reset-demo.sql 后重试';
  END IF;
  IF v_seed = 0 AND v_balance <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '种子中止：U001 账户余额非 0 且无演示行程，无法安全追加演示数据';
  END IF;

  -- ---------- 演示行程（3 条，数值与规则一致） ----------
  --    BUS   12.5 km → 12.5 × 0.15 = 1.875 kg → 18 分
  --    SUBWAY 8.0 km → 8.0 × 0.16 = 1.280 kg → 12 分
  --    BIKE   6.0 km → 6.0 × 0.20 = 1.200 kg → 12 分
  INSERT IGNORE INTO t_trip (trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
                             start_time, end_time, base_factor, mode_factor, points_ratio,
                             reduction_kg, awarded_points, rule_id, rule_version, status, calculated_at, created_at)
  SELECT 'TR202611080001', u.id, 'seed-trip-0001', 'BUS', 12.500000000, '和平路地铁站', '天津大学东门',
         '2026-11-08 07:30:00', '2026-11-08 08:05:00', 0.200000000, 0.050000000, 10.000000000,
         1.875000000, 18, r.id, 'R-2026-11', 'POINTED', '2026-11-08 08:05:10', '2026-11-08 08:05:10'
  FROM t_user u, t_carbon_rule r
  WHERE u.user_id = 'U001' AND r.rule_id = 'R-2026-11-BUS';

  INSERT IGNORE INTO t_trip (trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
                             start_time, end_time, base_factor, mode_factor, points_ratio,
                             reduction_kg, awarded_points, rule_id, rule_version, status, calculated_at, created_at)
  SELECT 'TR202611090001', u.id, 'seed-trip-0002', 'SUBWAY', 8.000000000, '营口道站', '天津站',
         '2026-11-09 18:10:00', '2026-11-09 18:32:00', 0.200000000, 0.040000000, 10.000000000,
         1.280000000, 12, r.id, 'R-2026-11', 'POINTED', '2026-11-09 18:32:20', '2026-11-09 18:32:20'
  FROM t_user u, t_carbon_rule r
  WHERE u.user_id = 'U001' AND r.rule_id = 'R-2026-11-SUBWAY';

  INSERT IGNORE INTO t_trip (trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
                             start_time, end_time, base_factor, mode_factor, points_ratio,
                             reduction_kg, awarded_points, rule_id, rule_version, status, calculated_at, created_at)
  SELECT 'TR202611100001', u.id, 'seed-trip-0003', 'BIKE', 6.000000000, '南开大学西南门', '图书馆',
         '2026-11-10 12:00:00', '2026-11-10 12:22:00', 0.200000000, 0.000000000, 10.000000000,
         1.200000000, 12, r.id, 'R-2026-11', 'POINTED', '2026-11-10 12:22:15', '2026-11-10 12:22:15'
  FROM t_user u, t_carbon_rule r
  WHERE u.user_id = 'U001' AND r.rule_id = 'R-2026-11-BIKE';

  -- ---------- 对应流水（account_seq 从 1 连续递增） ----------
  INSERT IGNORE INTO t_point_ledger (ledger_no, user_id, account_seq, type, title, amount, balance_after, ref_type, ref_id, created_at)
  SELECT 'PL20261108000001', u.id, 1, 'EARN', '行程核算入账 · 公交 12.5 公里', 18, 18, 'TRIP', 'TR202611080001', '2026-11-08 08:05:10'
  FROM t_user u WHERE u.user_id = 'U001';

  INSERT IGNORE INTO t_point_ledger (ledger_no, user_id, account_seq, type, title, amount, balance_after, ref_type, ref_id, created_at)
  SELECT 'PL20261109000001', u.id, 2, 'EARN', '行程核算入账 · 地铁 8 公里', 12, 30, 'TRIP', 'TR202611090001', '2026-11-09 18:32:20'
  FROM t_user u WHERE u.user_id = 'U001';

  INSERT IGNORE INTO t_point_ledger (ledger_no, user_id, account_seq, type, title, amount, balance_after, ref_type, ref_id, created_at)
  SELECT 'PL20261110000001', u.id, 3, 'EARN', '行程核算入账 · 骑行 6 公里', 12, 42, 'TRIP', 'TR202611100001', '2026-11-10 12:22:15'
  FROM t_user u WHERE u.user_id = 'U001';

  -- ---------- 账户汇总由源数据推导（不硬编码，天然与流水一致） ----------
  UPDATE t_point_account a
  SET a.balance = COALESCE((SELECT SUM(l.amount) FROM t_point_ledger l WHERE l.user_id = a.user_id), 0),
      a.total_earned = COALESCE((SELECT SUM(l.amount) FROM t_point_ledger l WHERE l.user_id = a.user_id AND l.type = 'EARN'), 0),
      a.total_spent = COALESCE((SELECT -SUM(l.amount) FROM t_point_ledger l WHERE l.user_id = a.user_id AND l.type = 'SPEND'), 0),
      a.trip_count = (SELECT COUNT(*) FROM t_trip t WHERE t.user_id = a.user_id),
      a.total_reduction_kg = COALESCE((SELECT SUM(t.reduction_kg) FROM t_trip t WHERE t.user_id = a.user_id), 0),
      a.last_seq = COALESCE((SELECT MAX(l.account_seq) FROM t_point_ledger l WHERE l.user_id = a.user_id), 0),
      a.version = a.version + 1
  WHERE a.user_id = v_u1;

  -- ---------- 收尾断言：账户与流水必须自洽，否则整体回滚 ----------
  SELECT balance INTO v_balance FROM t_point_account WHERE user_id = v_u1;
  SELECT COUNT(*), COALESCE(MAX(account_seq), 0) INTO v_ledger, v_seq_max
    FROM t_point_ledger WHERE user_id = v_u1;

  SELECT COUNT(*) INTO v_acct_ok
    FROM t_point_account a
    WHERE a.user_id = v_u1
      AND a.balance = COALESCE((SELECT SUM(amount) FROM t_point_ledger WHERE user_id = a.user_id), 0)
      AND a.last_seq = COALESCE((SELECT MAX(account_seq) FROM t_point_ledger WHERE user_id = a.user_id), 0);

  IF v_acct_ok <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '种子中止：账户汇总与流水不一致，已回滚';
  END IF;
  IF v_balance <> 42 OR v_ledger <> 3 OR v_seq_max <> 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '种子中止：演示数据条数/余额与预期不符，已回滚';
  END IF;

  COMMIT;
END$$

DELIMITER ;

CALL sp_seed_demo();
DROP PROCEDURE sp_seed_demo;

-- 执行结果自检（可直接看输出）
SELECT u.user_id, a.balance, a.total_earned, a.trip_count, a.total_reduction_kg, a.last_seq,
       (SELECT COUNT(*) FROM t_point_ledger l WHERE l.user_id = u.id) AS ledger_rows,
       (SELECT COALESCE(SUM(l.amount), 0) FROM t_point_ledger l WHERE l.user_id = u.id) AS ledger_sum
FROM t_user u JOIN t_point_account a ON a.user_id = u.id
WHERE u.user_id = 'U001';
