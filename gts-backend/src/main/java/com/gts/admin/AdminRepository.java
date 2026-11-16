package com.gts.admin;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** 管理端：商品维护与规则版本化 */
@Repository
public class AdminRepository {

    public record AdminProductRow(
            long id,
            String productId,
            String name,
            String icon,
            long points,
            int stock,
            String status,
            String description) {
    }

    public record RuleRow(
            long id,
            String ruleId,
            String mode,
            BigDecimal baseFactor,
            BigDecimal modeFactor,
            BigDecimal pointsRatio,
            LocalDateTime effectiveFrom,
            LocalDateTime effectiveTo,
            String version,
            String status) {
    }

    private static final RowMapper<AdminProductRow> PRODUCT_ROW = (rs, i) -> new AdminProductRow(
            rs.getLong("id"), rs.getString("product_id"), rs.getString("name"), rs.getString("icon"),
            rs.getLong("points"), rs.getInt("stock"), rs.getString("status"), rs.getString("description"));

    private static final RowMapper<RuleRow> RULE_ROW = (rs, i) -> new RuleRow(
            rs.getLong("id"), rs.getString("rule_id"), rs.getString("mode"),
            rs.getBigDecimal("base_factor"), rs.getBigDecimal("mode_factor"), rs.getBigDecimal("points_ratio"),
            rs.getObject("effective_from", LocalDateTime.class),
            rs.getObject("effective_to", LocalDateTime.class),
            rs.getString("version"), rs.getString("status"));

    private final JdbcTemplate jdbc;

    public AdminRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /* ---------------- 商品 ---------------- */

    public List<AdminProductRow> listProducts(int page, int size) {
        return jdbc.query("""
                SELECT id, product_id, name, icon, points, stock, status, description
                FROM t_product ORDER BY id LIMIT ? OFFSET ?
                """, PRODUCT_ROW, size, (page - 1) * size);
    }

    public long countProducts() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM t_product", Long.class);
        return n == null ? 0 : n;
    }

    public Optional<AdminProductRow> findProduct(String productId) {
        List<AdminProductRow> rows = jdbc.query("""
                SELECT id, product_id, name, icon, points, stock, status, description
                FROM t_product WHERE product_id = ?
                """, PRODUCT_ROW, productId);
        return rows.stream().findFirst();
    }

    public void insertProduct(String productId, long merchantId, String name, String icon,
                              long points, int stock, String status, String description) {
        jdbc.update("""
                INSERT INTO t_product (product_id, merchant_id, name, icon, points, stock, status, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, productId, merchantId, name, icon, points, stock, status, description);
    }

    public void updateProduct(String productId, String name, String icon, long points, String description) {
        jdbc.update("""
                UPDATE t_product SET name = ?, icon = ?, points = ?, description = ?, version = version + 1
                WHERE product_id = ?
                """, name, icon, points, description, productId);
    }

    public void updateProductStatus(String productId, String status) {
        jdbc.update("UPDATE t_product SET status = ?, version = version + 1 WHERE product_id = ?",
                status, productId);
    }

    public void updateProductStock(String productId, int stock) {
        jdbc.update("UPDATE t_product SET stock = ?, version = version + 1 WHERE product_id = ?",
                stock, productId);
    }

    public long firstMerchantId() {
        Long id = jdbc.queryForObject("SELECT id FROM t_merchant ORDER BY id LIMIT 1", Long.class);
        return id == null ? 0L : id;
    }

    /* ---------------- 规则 ---------------- */

    public List<RuleRow> listRules() {
        return jdbc.query("""
                SELECT id, rule_id, mode, base_factor, mode_factor, points_ratio,
                       effective_from, effective_to, version, status
                FROM t_carbon_rule ORDER BY mode, effective_from
                """, RULE_ROW);
    }

    public List<RuleRow> listRulesByMode(String mode) {
        return jdbc.query("""
                SELECT id, rule_id, mode, base_factor, mode_factor, points_ratio,
                       effective_from, effective_to, version, status
                FROM t_carbon_rule WHERE mode = ? ORDER BY effective_from
                """, RULE_ROW, mode);
    }

    /** 加锁读：拿到串行化闸门之后必须用当前读，否则会基于旧快照判断重叠 */
    public List<RuleRow> listRulesByModeForUpdate(String mode) {
        return jdbc.query("""
                SELECT id, rule_id, mode, base_factor, mode_factor, points_ratio,
                       effective_from, effective_to, version, status
                FROM t_carbon_rule WHERE mode = ? ORDER BY effective_from FOR UPDATE
                """, RULE_ROW, mode);
    }

    /**
     * 规则串行化：先锁 t_rule_mode_lock 对应行，同一出行方式的规则变更因此排队。
     * 数据库无法用 CHECK 表达"区间不重叠"，这里就是那个互斥点。
     */
    public void lockMode(String mode) {
        List<String> rows = jdbc.queryForList(
                "SELECT travel_mode FROM t_rule_mode_lock WHERE travel_mode = ? FOR UPDATE",
                String.class, mode);
        if (rows.isEmpty()) {
            throw new IllegalStateException("规则锁表缺少出行方式：" + mode);
        }
    }

    public void closeRule(long ruleId, LocalDateTime effectiveTo) {
        jdbc.update("UPDATE t_carbon_rule SET effective_to = ?, status = 'ARCHIVED' WHERE id = ?",
                effectiveTo, ruleId);
    }

    public void insertRule(String ruleId, String mode, BigDecimal baseFactor, BigDecimal modeFactor,
                           BigDecimal pointsRatio, LocalDateTime from, LocalDateTime to, String version) {
        jdbc.update("""
                INSERT INTO t_carbon_rule (rule_id, mode, base_factor, mode_factor, points_ratio,
                                           effective_from, effective_to, version, status, change_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', '运营管理员新增规则版本')
                """, ruleId, mode, baseFactor, modeFactor, pointsRatio, from, to, version);
    }
}
