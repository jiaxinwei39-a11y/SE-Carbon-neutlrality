-- =============================================================================
--  V3 —— 商品图标字段放宽到 VARCHAR(255)
--  负责：郭浚文（#9 结构维护 / #12 接口对齐）
--
--  背景：与前端约定（高泽 2026-11-17 答复 ⑤）——
--    icon 定 varchar(255) 字符串，值先用 emoji；
--    将来换 CDN 图片 URL 不用改表、不用改前端。
--    原 VARCHAR(64) 存 URL 会截断，所以放宽。
--    注意：emoji 是多字节，字段必须 utf8mb4（本库已满足），且不能定成 enum / char(2)。
--
--  前提：库处于 V2
--  执行：mysql -uroot -p gts < db/migrations/V3__product_icon_255.sql
--
--  ⚠️ 只执行一次；已有 V3 会直接中止。
-- =============================================================================

USE gts;

DROP PROCEDURE IF EXISTS sp_v3_guard;
DELIMITER $$
CREATE PROCEDURE sp_v3_guard()
BEGIN
  IF EXISTS (SELECT 1 FROM t_schema_version WHERE version = 'V3') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '已升级到 V3，请勿重复执行本脚本';
  END IF;
END$$
DELIMITER ;
CALL sp_v3_guard();
DROP PROCEDURE sp_v3_guard;

ALTER TABLE t_product
  MODIFY COLUMN icon VARCHAR(255) NOT NULL DEFAULT '🎁'
    COMMENT '商品图标：字符串（emoji 或图片 URL，前端只渲染字符串）';

INSERT INTO t_schema_version (version, description)
VALUES ('V3', 't_product.icon 放宽到 VARCHAR(255)，支持未来的图片 URL')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 自检
SELECT COLUMN_TYPE AS icon_type, CHARACTER_MAXIMUM_LENGTH AS max_len
FROM information_schema.columns
WHERE table_schema = 'gts' AND table_name = 't_product' AND column_name = 'icon';
