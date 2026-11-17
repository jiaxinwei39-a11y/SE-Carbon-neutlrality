-- =============================================================================
--  V4 —— 订单快照字段 product_icon 同步放宽到 VARCHAR(255)
--  负责：郭浚文（#9 结构维护）
--
--  背景：V3 只放宽了 t_product.icon，漏了兑换订单里的图标快照
--        t_redemption_order.product_icon（仍是 VARCHAR(64)）。
--        评审实测：商品用 103 字符图片 URL 时下单成功、兑换时报
--        Data too long for column 'product_icon'，接口返回 50000，
--        等于"能上架、不能兑换"。
--        订单里的 product_icon 是下单时快照，宽度必须与商品表一致。
--
--  前提：库处于 V3
--  执行：mysql -uroot -p gts < db/migrations/V4__order_product_icon_255.sql
-- =============================================================================

USE gts;

DROP PROCEDURE IF EXISTS sp_v4_guard;
DELIMITER $$
CREATE PROCEDURE sp_v4_guard()
BEGIN
  IF EXISTS (SELECT 1 FROM t_schema_version WHERE version = 'V4') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '已升级到 V4，请勿重复执行本脚本';
  END IF;
END$$
DELIMITER ;
CALL sp_v4_guard();
DROP PROCEDURE sp_v4_guard;

ALTER TABLE t_redemption_order
  MODIFY COLUMN product_icon VARCHAR(255) NOT NULL DEFAULT '🎁'
    COMMENT '下单时商品图标快照：字符串（emoji 或图片 URL）';

INSERT INTO t_schema_version (version, description)
VALUES ('V4', 't_redemption_order.product_icon 同步放宽到 VARCHAR(255)，与商品表一致')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 自检：两处图标字段都应是 varchar(255)
SELECT TABLE_NAME AS tbl, COLUMN_TYPE AS icon_type, CHARACTER_MAXIMUM_LENGTH AS max_len
FROM information_schema.columns
WHERE table_schema = 'gts' AND column_name IN ('icon', 'product_icon')
ORDER BY TABLE_NAME;
