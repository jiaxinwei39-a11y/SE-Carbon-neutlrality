package com.gts.mall;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** 商品读写。库存扣减/恢复都放在这里，保证"只会变一次"的语义集中。 */
@Repository
public class MallRepository {

    public record ProductRow(
            long id,
            String productId,
            String name,
            String icon,
            long points,
            int stock,
            String status,
            String description) {
    }

    private static final RowMapper<ProductRow> ROW = (rs, i) -> new ProductRow(
            rs.getLong("id"),
            rs.getString("product_id"),
            rs.getString("name"),
            rs.getString("icon"),
            rs.getLong("points"),
            rs.getInt("stock"),
            rs.getString("status"),
            rs.getString("description"));

    private static final String COLS =
            "id, product_id, name, icon, points, stock, status, description";

    private final JdbcTemplate jdbc;

    public MallRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 用户端只看到上架商品 */
    public List<ProductRow> listOnSale(String keyword, int page, int size) {
        StringBuilder sql = new StringBuilder("SELECT " + COLS + " FROM t_product WHERE status = 'ON'");
        List<Object> args = new ArrayList<>();
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND name LIKE ?");
            args.add("%" + keyword.trim() + "%");
        }
        sql.append(" ORDER BY id LIMIT ? OFFSET ?");
        args.add(size);
        args.add((page - 1) * size);
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    public long countOnSale(String keyword) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM t_product WHERE status = 'ON'");
        List<Object> args = new ArrayList<>();
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND name LIKE ?");
            args.add("%" + keyword.trim() + "%");
        }
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public Optional<ProductRow> findByProductId(String productId) {
        List<ProductRow> rows = jdbc.query(
                "SELECT " + COLS + " FROM t_product WHERE product_id = ?", ROW, productId);
        return rows.stream().findFirst();
    }

    /** 兑换时锁定商品行：加锁顺序的第二把锁 */
    public Optional<ProductRow> findByProductIdForUpdate(String productId) {
        List<ProductRow> rows = jdbc.query(
                "SELECT " + COLS + " FROM t_product WHERE product_id = ? FOR UPDATE", ROW, productId);
        return rows.stream().findFirst();
    }

    /** 兑换/取消时按内部主键锁商品行（加锁顺序的第二把锁） */
    public Optional<ProductRow> findByInternalIdForUpdate(long internalId) {
        List<ProductRow> rows = jdbc.query(
                "SELECT " + COLS + " FROM t_product WHERE id = ? FOR UPDATE", ROW, internalId);
        return rows.stream().findFirst();
    }

    public Optional<ProductRow> findByInternalId(long internalId) {
        List<ProductRow> rows = jdbc.query(
                "SELECT " + COLS + " FROM t_product WHERE id = ?", ROW, internalId);
        return rows.stream().findFirst();
    }

    /**
     * 扣库存：WHERE stock >= ? 让"够不够"和"扣减"成为同一条原子语句。
     * 返回 0 表示库存不足，不会扣成负数（数据库还有 ck_product_stock 兜底）。
     */
    public int decreaseStock(long productInternalId, int quantity) {
        return jdbc.update(
                "UPDATE t_product SET stock = stock - ?, version = version + 1 WHERE id = ? AND stock >= ?",
                quantity, productInternalId, quantity);
    }

    public void increaseStock(long productInternalId, int quantity) {
        jdbc.update("UPDATE t_product SET stock = stock + ?, version = version + 1 WHERE id = ?",
                quantity, productInternalId);
    }
}
