package com.gts.order;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** 兑换订单读写 */
@Repository
public class OrderRepository {

    public record OrderRow(
            long id,
            String orderId,
            long userId,
            long productInternalId,
            String productId,
            String productName,
            String productIcon,
            int quantity,
            long unitPoints,
            long totalPoints,
            String status,
            String requestId,
            String cancelReason,
            LocalDateTime createdAt,
            LocalDateTime processedAt) {
    }

    private static final RowMapper<OrderRow> ROW = (rs, i) -> new OrderRow(
            rs.getLong("id"),
            rs.getString("order_id"),
            rs.getLong("user_id"),
            rs.getLong("product_id"),
            rs.getString("product_code"),
            rs.getString("product_name"),
            rs.getString("product_icon"),
            rs.getInt("quantity"),
            rs.getLong("unit_points"),
            rs.getLong("total_points"),
            rs.getString("status"),
            rs.getString("request_id"),
            rs.getString("cancel_reason"),
            rs.getObject("created_at", LocalDateTime.class),
            rs.getObject("processed_at", LocalDateTime.class));

    /** product_id 是内部外键，product_code 是对外编号，查询时做一次关联 */
    private static final String SELECT = """
            SELECT o.id, o.order_id, o.user_id, o.product_id,
                   p.product_id AS product_code,
                   o.product_name, o.product_icon, o.quantity, o.unit_points,
                   o.total_points, o.status, o.request_id, o.cancel_reason,
                   o.created_at, o.processed_at
            FROM t_redemption_order o
            JOIN t_product p ON p.id = o.product_id
            """;

    private final JdbcTemplate jdbc;

    public OrderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(long userId, String orderId, long productInternalId, String productName, String productIcon,
                       int quantity, long unitPoints, long totalPoints, String requestId) {
        jdbc.update("""
                INSERT INTO t_redemption_order (order_id, user_id, product_id, product_name, product_icon,
                                                quantity, unit_points, total_points, status, request_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?)
                """, orderId, userId, productInternalId, productName, productIcon,
                quantity, unitPoints, totalPoints, requestId);
    }

    public Optional<OrderRow> findByOrderId(String orderId) {
        List<OrderRow> rows = jdbc.query(SELECT + " WHERE o.order_id = ?", ROW, orderId);
        return rows.stream().findFirst();
    }

    /** 加锁顺序的第三把锁：订单 */
    public Optional<OrderRow> findByOrderIdForUpdate(String orderId) {
        List<OrderRow> rows = jdbc.query(SELECT + " WHERE o.order_id = ? FOR UPDATE", ROW, orderId);
        return rows.stream().findFirst();
    }

    public Optional<OrderRow> findByUserAndRequestIdForUpdate(long userId, String requestId) {
        List<OrderRow> rows = jdbc.query(
                SELECT + " WHERE o.user_id = ? AND o.request_id = ? FOR UPDATE", ROW, userId, requestId);
        return rows.stream().findFirst();
    }

    /**
     * 幂等前置查询（不加锁）。
     * 必须在扣款、扣库存之前调用：否则"同键不同内容"的请求会先因余额/库存不足
     * 返回 40030/40901，而不是 40904，用户看到的错误就变成了误导。
     */
    public Optional<OrderRow> findByUserAndRequestId(long userId, String requestId) {
        List<OrderRow> rows = jdbc.query(
                SELECT + " WHERE o.user_id = ? AND o.request_id = ?", ROW, userId, requestId);
        return rows.stream().findFirst();
    }

    public List<OrderRow> listByUser(long userId, String status, int page, int size) {
        StringBuilder sql = new StringBuilder(SELECT + " WHERE o.user_id = ?");
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if (status != null && !status.isBlank() && !"ALL".equals(status)) {
            sql.append(" AND o.status = ?");
            args.add(status);
        }
        sql.append(" ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?");
        args.add(size);
        args.add((page - 1) * size);
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    public long countByUser(long userId, String status) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM t_redemption_order WHERE user_id = ?");
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if (status != null && !status.isBlank() && !"ALL".equals(status)) {
            sql.append(" AND status = ?");
            args.add(status);
        }
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public List<OrderRow> listAll(int page, int size) {
        return jdbc.query(SELECT + " ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?",
                ROW, size, (page - 1) * size);
    }

    public long countAll() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM t_redemption_order", Long.class);
        return n == null ? 0 : n;
    }

    public void updateStatus(String orderId, String status, String cancelReason, Long processedBy) {
        jdbc.update("""
                UPDATE t_redemption_order
                SET status = ?, cancel_reason = ?, processed_by = ?, processed_at = NOW(3)
                WHERE order_id = ?
                """, status, cancelReason, processedBy, orderId);
    }
}
