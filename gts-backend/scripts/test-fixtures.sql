-- 测试用临时规则（TC-03 / TC-05 / TC-17），测试完会随数据库重置消失
USE gts;

-- TC-03：实际因子高于基准 → 减排应被截断为 0
INSERT INTO t_carbon_rule (rule_id, mode, base_factor, mode_factor, points_ratio,
                           effective_from, effective_to, version, status, change_reason)
VALUES ('R-TEST-WALK-HI', 'WALK', 0.200000000, 0.300000000, 10.000000000,
        '2026-11-01 00:00:00', NULL, 'R-TEST-HI', 'ACTIVE', '测试用：实际因子高于基准')
ON DUPLICATE KEY UPDATE mode_factor = VALUES(mode_factor), points_ratio = VALUES(points_ratio);

-- TC-05 / TC-17：把旧 BUS 规则的区间在 2026-11-14 00:00 结束，新增 V2 规则（积分系数 10→20）
UPDATE t_carbon_rule SET effective_to = '2026-11-14 00:00:00' WHERE rule_id = 'R-2026-11-BUS';

INSERT INTO t_carbon_rule (rule_id, mode, base_factor, mode_factor, points_ratio,
                           effective_from, effective_to, version, status, change_reason)
VALUES ('R-2026-11-BUS-V2', 'BUS', 0.200000000, 0.050000000, 20.000000000,
        '2026-11-14 00:00:00', NULL, 'R-2026-11-V2', 'ACTIVE', '测试用：积分系数 10 改 20')
ON DUPLICATE KEY UPDATE points_ratio = VALUES(points_ratio);
