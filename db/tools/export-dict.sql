-- =============================================================================
--  字典导出的 4 个查询（gen_dict.py 的输入）
--  负责：郭浚文（#9）
--
--  对应 PR #28 评审意见 5：生成脚本必须附带可复现的导出步骤。
--  每个查询单独执行，用 -N -B 输出制表符分隔，重定向到对应 .tsv 文件。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) 列定义 → cols.tsv
-- ---------------------------------------------------------------------------
SELECT c.TABLE_NAME, c.ORDINAL_POSITION, c.COLUMN_NAME, c.COLUMN_TYPE,
       c.IS_NULLABLE, IFNULL(c.COLUMN_DEFAULT, ''), c.COLUMN_KEY, c.COLUMN_COMMENT
FROM information_schema.columns c
WHERE c.TABLE_SCHEMA = 'gts'
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;

-- ---------------------------------------------------------------------------
-- 2) 外键 → fk.tsv
-- ---------------------------------------------------------------------------
SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME
FROM information_schema.key_column_usage k
WHERE k.TABLE_SCHEMA = 'gts' AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.TABLE_NAME, k.COLUMN_NAME;

-- ---------------------------------------------------------------------------
-- 3) 索引 → idx.tsv
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
FROM information_schema.statistics
WHERE TABLE_SCHEMA = 'gts'
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;

-- ---------------------------------------------------------------------------
-- 4) CHECK 约束（字段取值范围）→ chk.tsv
-- ---------------------------------------------------------------------------
SELECT tc.TABLE_NAME, cc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
 AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = 'gts' AND tc.CONSTRAINT_TYPE = 'CHECK'
ORDER BY tc.TABLE_NAME, cc.CONSTRAINT_NAME;
