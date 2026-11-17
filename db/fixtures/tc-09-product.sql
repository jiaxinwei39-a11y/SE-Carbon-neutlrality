-- TC-09 课程验收商品。仅在已执行 schema.sql 和 seed.sql 的独立测试库执行。
-- 从仓库根目录执行：mysql --default-character-set=utf8mb4 -u root -p gts < db/fixtures/tc-09-product.sql
-- 每次验收使用新的测试库。重复执行会因商品编号已存在而失败，避免重置已兑换库存。
INSERT INTO t_product (product_id, merchant_id, name, points, stock, status, description)
VALUES (
  'QA-TC09',
  (SELECT id FROM t_merchant WHERE merchant_id = 'M001'),
  'TC-09 验收商品',
  20,
  2,
  'ON',
  '仅用于课程测试'
);
