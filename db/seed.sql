-- =============================================================================
--  城市绿色出行碳减排积分系统 —— 演示种子数据
--  负责：郭浚文（#9）
--
--  前提：已执行 db/schema.sql
--  执行：mysql -uroot -p gts < db/seed.sql
--
--  本脚本可重复执行（ON DUPLICATE KEY 幂等），不会重复插入，也不会覆盖已产生的业务数据。
--
--  演示账号（口令统一 123456）：
--      普通用户  13800138000 / 123456   （张小明，U001）
--      普通用户  13900139000 / 123456   （李小雨，U002）
--      运营管理员 admin      / 123456   （U004）
--
--  注意：口令为 PBKDF2-HMAC-SHA256 加盐哈希（120000 次迭代），
--        不是明文也不是 MD5；盐与哈希以 base64 存在 password_hash 字段里，
--        校验时用同一格式重算比对。
-- =============================================================================

USE gts;

-- ---------------------------------------------------------------------------
-- 1. 用户（口令统一 123456）
-- ---------------------------------------------------------------------------
INSERT INTO t_user (user_id, login_account, phone, nickname, password_hash, role, status, avatar_text)
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
   'ADMIN', 'ENABLED', '管')
ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), avatar_text = VALUES(avatar_text);

-- ---------------------------------------------------------------------------
-- 2. 积分账户（每名用户一个，初始为 0）
-- ---------------------------------------------------------------------------
INSERT INTO t_point_account (user_id, balance, total_earned, total_spent, trip_count, total_reduction_kg)
SELECT u.id, 0, 0, 0, 0, 0 FROM t_user u
ON DUPLICATE KEY UPDATE user_id = t_point_account.user_id;

-- ---------------------------------------------------------------------------
-- 3. 商户
-- ---------------------------------------------------------------------------
INSERT INTO t_merchant (merchant_id, name, status)
VALUES ('M001', '绿色出行权益商城', 'ACTIVE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------------
-- 4. 碳核算规则（课程模拟参数，待 #6 最终确认后调整）
--    基准：同等里程私人燃油小汽车单人出行 0.2 kg/km
--    积分：10 分 / kg
--    生效时间统一从 2026-01-01 起，暂不设失效时间
-- ---------------------------------------------------------------------------
INSERT INTO t_carbon_rule (rule_id, mode, base_factor, mode_factor, points_ratio,
                           effective_from, effective_to, version, status, change_reason)
VALUES
  ('R-2026-11-BUS',    'BUS',    0.200000000, 0.050000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数'),
  ('R-2026-11-SUBWAY', 'SUBWAY', 0.200000000, 0.040000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数'),
  ('R-2026-11-BIKE',   'BIKE',   0.200000000, 0.000000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数'),
  ('R-2026-11-WALK',   'WALK',   0.200000000, 0.000000000, 10.000000000, '2026-01-01 00:00:00', NULL, 'R-2026-11', 'ACTIVE', '课程模拟初版参数')
ON DUPLICATE KEY UPDATE base_factor = VALUES(base_factor), mode_factor = VALUES(mode_factor),
                        points_ratio = VALUES(points_ratio), change_reason = VALUES(change_reason);

-- ---------------------------------------------------------------------------
-- 5. 商品（8 件，含 1 件低库存用于演示"库存不足"）
-- ---------------------------------------------------------------------------
INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P001', m.id, '共享单车 7 天卡',  '🚲', 120,  50, 'ON', '7 天内不限次骑行 30 分钟以内'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), description = VALUES(description);

INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P002', m.id, '地铁通勤 10 次券', '🚇', 200,  30, 'ON', '10 次单程地铁乘坐权益'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), description = VALUES(description);

INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P003', m.id, '环保帆布袋',      '🛍️', 80,  100, 'ON', '再生棉材质，容量 12L'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), description = VALUES(description);

INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P004', m.id, '不锈钢保温杯',    '🥤', 350,  20, 'ON', '500ml，保温 8 小时'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), description = VALUES(description);

INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P005', m.id, '公交月卡',        '🚌', 500,  10, 'ON', '当月公交乘车权益'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), description = VALUES(description);

INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P006', m.id, '有机咖啡券',      '☕', 60,   40, 'ON', '合作咖啡馆中杯兑换券'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), description = VALUES(description);

INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P007', m.id, '限时环保礼盒',    '🎁', 800,   2, 'ON', '仅剩 2 件，用于演示并发与库存不足'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), description = VALUES(description);

INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
SELECT 'P008', m.id, '已下架测试商品',  '📦', 100,  10, 'OFF', '用于演示下架商品不可兑换'
FROM t_merchant m WHERE m.merchant_id = 'M001'
ON DUPLICATE KEY UPDATE points = VALUES(points), stock = VALUES(stock), status = VALUES(status), description = VALUES(description);

-- ---------------------------------------------------------------------------
-- 6. U001 的演示行程（3 条，数值与规则一致，保证账实相符）
--    计算：减排量 = 里程 × (0.2 - 方式因子)，积分 = floor(减排量 × 10)
--      BUS   12.5 km → 12.5 × 0.15 = 1.875 kg → 18 分
--      SUBWAY 8.0 km → 8.0 × 0.16 = 1.280 kg → 12 分
--      BIKE   6.0 km → 6.0 × 0.20 = 1.200 kg → 12 分
--    合计：减排 4.355 kg，积分 42 分
-- ---------------------------------------------------------------------------
INSERT INTO t_trip (trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
                    start_time, end_time, base_factor, mode_factor, points_ratio,
                    reduction_kg, awarded_points, rule_id, rule_version, status, calculated_at, created_at)
SELECT 'TR202611080001', u.id, 'seed-trip-0001', 'BUS', 12.500000000, '和平路地铁站', '天津大学东门',
       '2026-11-08 07:30:00', '2026-11-08 08:05:00', 0.200000000, 0.050000000, 10.000000000,
       1.875000000, 18, r.id, 'R-2026-11', 'POINTED', '2026-11-08 08:05:10', '2026-11-08 08:05:10'
FROM t_user u, t_carbon_rule r
WHERE u.user_id = 'U001' AND r.rule_id = 'R-2026-11-BUS'
ON DUPLICATE KEY UPDATE trip_id = t_trip.trip_id;

INSERT INTO t_trip (trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
                    start_time, end_time, base_factor, mode_factor, points_ratio,
                    reduction_kg, awarded_points, rule_id, rule_version, status, calculated_at, created_at)
SELECT 'TR202611090001', u.id, 'seed-trip-0002', 'SUBWAY', 8.000000000, '营口道站', '天津站',
       '2026-11-09 18:10:00', '2026-11-09 18:32:00', 0.200000000, 0.040000000, 10.000000000,
       1.280000000, 12, r.id, 'R-2026-11', 'POINTED', '2026-11-09 18:32:20', '2026-11-09 18:32:20'
FROM t_user u, t_carbon_rule r
WHERE u.user_id = 'U001' AND r.rule_id = 'R-2026-11-SUBWAY'
ON DUPLICATE KEY UPDATE trip_id = t_trip.trip_id;

INSERT INTO t_trip (trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
                    start_time, end_time, base_factor, mode_factor, points_ratio,
                    reduction_kg, awarded_points, rule_id, rule_version, status, calculated_at, created_at)
SELECT 'TR202611100001', u.id, 'seed-trip-0003', 'BIKE', 6.000000000, '南开大学西南门', '图书馆',
       '2026-11-10 12:00:00', '2026-11-10 12:22:00', 0.200000000, 0.000000000, 10.000000000,
       1.200000000, 12, r.id, 'R-2026-11', 'POINTED', '2026-11-10 12:22:15', '2026-11-10 12:22:15'
FROM t_user u, t_carbon_rule r
WHERE u.user_id = 'U001' AND r.rule_id = 'R-2026-11-BIKE'
ON DUPLICATE KEY UPDATE trip_id = t_trip.trip_id;

-- ---------------------------------------------------------------------------
-- 7. 对应的积分流水（与上面 3 条行程一一对应，balance_after 累计为 18→30→42）
-- ---------------------------------------------------------------------------
INSERT INTO t_point_ledger (ledger_no, user_id, type, title, amount, balance_after, ref_type, ref_id, created_at)
SELECT 'PL20261108000001', u.id, 'EARN', '行程核算入账 · 公交 12.5 公里', 18, 18, 'TRIP', 'TR202611080001', '2026-11-08 08:05:10'
FROM t_user u WHERE u.user_id = 'U001'
ON DUPLICATE KEY UPDATE ledger_no = t_point_ledger.ledger_no;

INSERT INTO t_point_ledger (ledger_no, user_id, type, title, amount, balance_after, ref_type, ref_id, created_at)
SELECT 'PL20261109000001', u.id, 'EARN', '行程核算入账 · 地铁 8 公里', 12, 30, 'TRIP', 'TR202611090001', '2026-11-09 18:32:20'
FROM t_user u WHERE u.user_id = 'U001'
ON DUPLICATE KEY UPDATE ledger_no = t_point_ledger.ledger_no;

INSERT INTO t_point_ledger (ledger_no, user_id, type, title, amount, balance_after, ref_type, ref_id, created_at)
SELECT 'PL20261110000001', u.id, 'EARN', '行程核算入账 · 骑行 6 公里', 12, 42, 'TRIP', 'TR202611100001', '2026-11-10 12:22:15'
FROM t_user u WHERE u.user_id = 'U001'
ON DUPLICATE KEY UPDATE ledger_no = t_point_ledger.ledger_no;

-- ---------------------------------------------------------------------------
-- 8. 回填 U001 的账户汇总（只在账户仍为空时执行，避免覆盖真实业务数据）
-- ---------------------------------------------------------------------------
UPDATE t_point_account a
JOIN t_user u ON u.id = a.user_id
SET a.balance = 42, a.total_earned = 42, a.total_spent = 0,
    a.trip_count = 3, a.total_reduction_kg = 4.355000000
WHERE u.user_id = 'U001' AND a.total_earned = 0 AND a.balance = 0;
