package com.gts.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 审计日志。
 * 规则、库存、订单状态的变更必须"改了必有痕"（NFR-08），
 * 且与业务修改在同一事务里写入，不能事后补记。
 */
@Repository
public class AuditRepository {

    private final JdbcTemplate jdbc;

    public AuditRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(String bizType, String bizId, String action,
                       String beforeJson, String afterJson, long operatorId, String reason) {
        jdbc.update("""
                INSERT INTO t_audit_log (biz_type, biz_id, action, before_value, after_value, operator_id, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, bizType, bizId, action, beforeJson, afterJson, operatorId, reason);
    }
}
