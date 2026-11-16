-- =============================================================================
--  演示数据重置（破坏性，仅用于课程演示库）
--  负责：郭浚文（#9）
--
--  作用：清空演示账户 U001～U003 的行程与流水，账户归零，
--        商品与规则恢复为种子基线，然后可以重新执行 db/seed.sql。
--
--  ⚠️ 只在演示库执行。它会删除这三个账户的全部行程与积分流水。
--     有商城订单数据时直接中止（#12 落地后再扩展本脚本）。
--
--  用法：mysql -uroot -p gts < db/reset-demo.sql
--        然后：mysql -uroot -p gts < db/seed.sql
-- =============================================================================

USE gts;

DROP PROCEDURE IF EXISTS sp_reset_demo;

DELIMITER $$

CREATE PROCEDURE sp_reset_demo()
BEGIN
  DECLARE v_orders BIGINT DEFAULT 0;
  DECLARE v_ref    BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT COUNT(*) INTO v_orders FROM t_redemption_order;
  IF v_orders > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '重置中止：已存在兑换订单，本脚本不删除订单数据，请手工处理后再执行';
  END IF;

  START TRANSACTION;

  -- 1. 删除演示账户的流水（先删子表，避免外键/序号断裂）
  DELETE l FROM t_point_ledger l
  JOIN t_user u ON u.id = l.user_id
  WHERE u.user_id IN ('U001', 'U002', 'U003');

  -- 2. 删除演示账户的行程
  DELETE t FROM t_trip t
  JOIN t_user u ON u.id = t.user_id
  WHERE u.user_id IN ('U001', 'U002', 'U003');

  -- 3. 账户归零
  UPDATE t_point_account a
  JOIN t_user u ON u.id = a.user_id
  SET a.balance = 0, a.total_earned = 0, a.total_spent = 0,
      a.trip_count = 0, a.total_reduction_kg = 0, a.last_seq = 0,
      a.version = a.version + 1
  WHERE u.user_id IN ('U001', 'U002', 'U003');

  -- 4. 商品恢复种子基线（价格、库存、上下架、描述）
  UPDATE t_product SET points = 120, stock = 50,  status = 'ON',  description = '7 天内不限次骑行 30 分钟以内' WHERE product_id = 'P001';
  UPDATE t_product SET points = 200, stock = 30,  status = 'ON',  description = '10 次单程地铁乘坐权益'           WHERE product_id = 'P002';
  UPDATE t_product SET points = 80,  stock = 100, status = 'ON',  description = '再生棉材质，容量 12L'             WHERE product_id = 'P003';
  UPDATE t_product SET points = 350, stock = 20,  status = 'ON',  description = '500ml，保温 8 小时'                WHERE product_id = 'P004';
  UPDATE t_product SET points = 500, stock = 10,  status = 'ON',  description = '当月公交乘车权益'                  WHERE product_id = 'P005';
  UPDATE t_product SET points = 60,  stock = 40,  status = 'ON',  description = '合作咖啡馆中杯兑换券'              WHERE product_id = 'P006';
  UPDATE t_product SET points = 800, stock = 2,   status = 'ON',  description = '仅剩 2 件，用于演示并发与库存不足' WHERE product_id = 'P007';
  UPDATE t_product SET points = 100, stock = 10,  status = 'OFF', description = '用于演示下架商品不可兑换'          WHERE product_id = 'P008';

  -- 5. 规则：删除后续版本，只保留基线版本
  --    只把基线版本的 effective_to 置 NULL 是不够的：若已存在 BUS V2，
  --    两条规则会同时覆盖当前时间，后端按 effective_from DESC 仍会选中 V2，
  --    重置就没有回到基线。所以必须把非基线版本真正删掉。
  --    被行程引用的版本不能删（会破坏历史），遇到就中止。
  SELECT COUNT(*) INTO v_ref
    FROM t_carbon_rule r
    JOIN t_trip t ON t.rule_id = r.id
   WHERE (r.mode = 'BUS'    AND r.rule_id <> 'R-2026-11-BUS')
      OR (r.mode = 'SUBWAY' AND r.rule_id <> 'R-2026-11-SUBWAY')
      OR (r.mode = 'BIKE'   AND r.rule_id <> 'R-2026-11-BIKE')
      OR (r.mode = 'WALK'   AND r.rule_id <> 'R-2026-11-WALK');
  IF v_ref > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '重置中止：存在行程引用了非基线规则版本，删除会破坏历史数据';
  END IF;

  DELETE FROM t_carbon_rule
   WHERE (mode = 'BUS'    AND rule_id <> 'R-2026-11-BUS')
      OR (mode = 'SUBWAY' AND rule_id <> 'R-2026-11-SUBWAY')
      OR (mode = 'BIKE'   AND rule_id <> 'R-2026-11-BIKE')
      OR (mode = 'WALK'   AND rule_id <> 'R-2026-11-WALK');

  -- 基线版本恢复初版因子与区间
  UPDATE t_carbon_rule SET base_factor = 0.200000000, mode_factor = 0.050000000, points_ratio = 10.000000000,
                           effective_from = '2026-01-01 00:00:00', effective_to = NULL, status = 'ACTIVE'
   WHERE rule_id = 'R-2026-11-BUS';
  UPDATE t_carbon_rule SET base_factor = 0.200000000, mode_factor = 0.040000000, points_ratio = 10.000000000,
                           effective_from = '2026-01-01 00:00:00', effective_to = NULL, status = 'ACTIVE'
   WHERE rule_id = 'R-2026-11-SUBWAY';
  UPDATE t_carbon_rule SET base_factor = 0.200000000, mode_factor = 0.000000000, points_ratio = 10.000000000,
                           effective_from = '2026-01-01 00:00:00', effective_to = NULL, status = 'ACTIVE'
   WHERE rule_id = 'R-2026-11-BIKE';
  UPDATE t_carbon_rule SET base_factor = 0.200000000, mode_factor = 0.000000000, points_ratio = 10.000000000,
                           effective_from = '2026-01-01 00:00:00', effective_to = NULL, status = 'ACTIVE'
   WHERE rule_id = 'R-2026-11-WALK';

  COMMIT;
END$$

DELIMITER ;

CALL sp_reset_demo();
DROP PROCEDURE sp_reset_demo;

SELECT '演示数据已重置，请重新执行 db/seed.sql' AS result;
