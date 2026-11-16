package com.gts.points;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * 积分账户与流水。
 *
 * 设计要点：
 *  - 余额更新用 "balance = balance + ?" 的原子写法，不先查后写，避免并发丢更新。
 *  - 流水只追加，且 (ref_type, ref_id, type) 有唯一键，
 *    所以"同一行程重复发分""同一订单重复冲正"在数据库层面就不可能发生。
 */
@Repository
public class PointsRepository {

    public record AccountRow(
            long balance,
            long totalEarned,
            long totalSpent,
            long tripCount,
            BigDecimal totalReductionKg) {
    }

    public record FlowRow(
            String ledgerNo,
            String type,
            String title,
            long amount,
            long balanceAfter,
            LocalDateTime createdAt,
            String refId) {
    }

    private static final RowMapper<FlowRow> FLOW_ROW = (rs, i) -> new FlowRow(
            rs.getString("ledger_no"),
            rs.getString("type"),
            rs.getString("title"),
            rs.getLong("amount"),
            rs.getLong("balance_after"),
            rs.getObject("created_at", LocalDateTime.class),
            rs.getString("ref_id"));

    private final JdbcTemplate jdbc;

    public PointsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 行程入账：余额、累计获得、行程数、累计减排一次更新完。
     *
     * 有积分时同时分配账户内流水序号：
     *   UPDATE ... last_seq = last_seq + 1 会拿到该账户的行锁，
     *   同账户的并发发分因此排队；随后的 SELECT 读回本次分配到的值。
     * 零积分行程不写流水，也就**不能**消耗序号，否则 account_seq 会断号。
     *
     * @return 分配到的 account_seq；零积分时返回 0（不占用序号）
     */
    public long applyTrip(long userId, long points, BigDecimal reductionKg) {
        if (points > 0) {
            int n = jdbc.update("""
                    UPDATE t_point_account
                    SET last_seq = last_seq + 1,
                        balance = balance + ?,
                        total_earned = total_earned + ?,
                        trip_count = trip_count + 1,
                        total_reduction_kg = total_reduction_kg + ?,
                        version = version + 1
                    WHERE user_id = ?
                    """, points, points, reductionKg, userId);
            if (n == 0) {
                throw new IllegalStateException("积分账户不存在，userId=" + userId);
            }
            Long seq = jdbc.queryForObject(
                    "SELECT last_seq FROM t_point_account WHERE user_id = ?", Long.class, userId);
            return seq == null ? 0L : seq;
        }

        int n = jdbc.update("""
                UPDATE t_point_account
                SET trip_count = trip_count + 1,
                    total_reduction_kg = total_reduction_kg + ?,
                    version = version + 1
                WHERE user_id = ?
                """, reductionKg, userId);
        if (n == 0) {
            throw new IllegalStateException("积分账户不存在，userId=" + userId);
        }
        return 0L;
    }

    public long balance(long userId) {
        Long b = jdbc.queryForObject("SELECT balance FROM t_point_account WHERE user_id = ?", Long.class, userId);
        return b == null ? 0L : b;
    }

    /**
     * 锁定账户行（当前读）。
     * 加锁顺序的第一把锁：账户 → 商品 → 订单。必须先锁账户再动库存，
     * 所有涉及同批资源的写操作都遵守这个顺序，才不会互相死锁。
     */
    public long lockAccountForUpdate(long userId) {
        Long b = jdbc.queryForObject(
                "SELECT balance FROM t_point_account WHERE user_id = ? FOR UPDATE", Long.class, userId);
        return b == null ? 0L : b;
    }

    /**
     * 扣分并分配流水序号。
     * WHERE balance >= ? 让"余额是否够"和"扣减"变成同一条原子语句，
     * 并发下不会扣成负数；影响行数为 0 即余额不足。
     */
    public long spend(long userId, long points) {
        int n = jdbc.update("""
                UPDATE t_point_account
                SET last_seq = last_seq + 1,
                    balance = balance - ?,
                    total_spent = total_spent + ?,
                    version = version + 1
                WHERE user_id = ? AND balance >= ?
                """, points, points, userId, points);
        if (n == 0) {
            throw new com.gts.common.Api.BizException(
                    com.gts.common.Api.Codes.POINTS_SHORT, 400, "积分不足，请先积累更多绿色出行积分");
        }
        return lastSeq(userId);
    }

    /** 返还积分并分配流水序号（取消订单冲正） */
    public long refund(long userId, long points) {
        int n = jdbc.update("""
                UPDATE t_point_account
                SET last_seq = last_seq + 1,
                    balance = balance + ?,
                    total_spent = total_spent - ?,
                    version = version + 1
                WHERE user_id = ?
                """, points, points, userId);
        if (n == 0) {
            throw new IllegalStateException("积分账户不存在，userId=" + userId);
        }
        return lastSeq(userId);
    }

    public long lastSeq(long userId) {
        Long seq = jdbc.queryForObject(
                "SELECT last_seq FROM t_point_account WHERE user_id = ?", Long.class, userId);
        return seq == null ? 0L : seq;
    }

    public Optional<AccountRow> account(long userId) {
        List<AccountRow> rows = jdbc.query("""
                SELECT balance, total_earned, total_spent, trip_count, total_reduction_kg
                FROM t_point_account WHERE user_id = ?
                """, (rs, i) -> new AccountRow(
                rs.getLong("balance"),
                rs.getLong("total_earned"),
                rs.getLong("total_spent"),
                rs.getLong("trip_count"),
                rs.getBigDecimal("total_reduction_kg")),
                userId);
        return rows.stream().findFirst();
    }

    public void insertLedger(long userId, long accountSeq, String type, String title, long amount,
                             long balanceAfter, String refType, String refId) {
        jdbc.update("""
                INSERT INTO t_point_ledger (ledger_no, user_id, account_seq, type, title, amount, balance_after, ref_type, ref_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, newLedgerNo(), userId, accountSeq, type, title, amount, balanceAfter, refType, refId);
    }

    public List<FlowRow> flows(long userId, String type, int page, int size) {
        StringBuilder sql = new StringBuilder("""
                SELECT ledger_no, type, title, amount, balance_after, created_at, ref_id
                FROM t_point_ledger WHERE user_id = ?
                """);
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if (type != null && !type.isBlank() && !"ALL".equals(type)) {
            sql.append(" AND type = ?");
            args.add(type);
        }
        sql.append(" ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?");
        args.add(size);
        args.add((page - 1) * size);
        return jdbc.query(sql.toString(), FLOW_ROW, args.toArray());
    }

    public long countFlows(long userId, String type) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM t_point_ledger WHERE user_id = ?");
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if (type != null && !type.isBlank() && !"ALL".equals(type)) {
            sql.append(" AND type = ?");
            args.add(type);
        }
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    /** 对外流水号：PL + yyyyMMddHHmmssSSS + 4 位随机，唯一键兜底 */
    private static String newLedgerNo() {
        String ts = LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        int rnd = ThreadLocalRandom.current().nextInt(1000, 10000);
        return "PL" + ts + rnd;
    }
}
