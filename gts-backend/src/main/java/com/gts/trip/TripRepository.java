package com.gts.trip;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** 行程与碳核算规则的读写 */
@Repository
public class TripRepository {

    /** 行程行（含核算快照） */
    public record TripRow(
            long id,
            String tripId,
            long userId,
            String clientTripId,
            String mode,
            BigDecimal distanceKm,
            String startPlace,
            String endPlace,
            LocalDateTime startTime,
            LocalDateTime endTime,
            BigDecimal baseFactor,
            BigDecimal modeFactor,
            BigDecimal pointsRatio,
            BigDecimal reductionKg,
            long awardedPoints,
            String ruleVersion,
            String status,
            LocalDateTime calculatedAt,
            LocalDateTime createdAt) {
    }

    /** 命中的核算规则 */
    public record RuleRow(
            long id,
            String ruleId,
            String version,
            BigDecimal baseFactor,
            BigDecimal modeFactor,
            BigDecimal pointsRatio) {
    }

    private static final RowMapper<TripRow> ROW = (rs, i) -> new TripRow(
            rs.getLong("id"),
            rs.getString("trip_id"),
            rs.getLong("user_id"),
            rs.getString("client_trip_id"),
            rs.getString("mode"),
            rs.getBigDecimal("distance_km"),
            rs.getString("start_place"),
            rs.getString("end_place"),
            rs.getObject("start_time", LocalDateTime.class),
            rs.getObject("end_time", LocalDateTime.class),
            rs.getBigDecimal("base_factor"),
            rs.getBigDecimal("mode_factor"),
            rs.getBigDecimal("points_ratio"),
            rs.getBigDecimal("reduction_kg"),
            rs.getLong("awarded_points"),
            rs.getString("rule_version"),
            rs.getString("status"),
            rs.getObject("calculated_at", LocalDateTime.class),
            rs.getObject("created_at", LocalDateTime.class));

    private static final String COLS = """
            id, trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
            start_time, end_time, base_factor, mode_factor, points_ratio, reduction_kg,
            awarded_points, rule_version, status, calculated_at, created_at
            """;

    private final JdbcTemplate jdbc;

    public TripRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 按"行程结束时间"匹配规则，区间左闭右开 [effective_from, effective_to)。
     * 用结束时间而不是开始时间：一条 23:50 开始、次日 00:20 结束的行程，
     * 应该用结束那一刻生效的规则。
     */
    public Optional<RuleRow> findRule(String mode, LocalDateTime endTime) {
        List<RuleRow> rows = jdbc.query("""
                SELECT id, rule_id, version, base_factor, mode_factor, points_ratio
                FROM t_carbon_rule
                WHERE mode = ?
                  AND effective_from <= ?
                  AND (effective_to IS NULL OR effective_to > ?)
                ORDER BY effective_from DESC
                LIMIT 1
                """, (rs, i) -> new RuleRow(
                rs.getLong("id"),
                rs.getString("rule_id"),
                rs.getString("version"),
                rs.getBigDecimal("base_factor"),
                rs.getBigDecimal("mode_factor"),
                rs.getBigDecimal("points_ratio")),
                mode, endTime, endTime);
        return rows.stream().findFirst();
    }

    public Optional<TripRow> findByClientTripId(long userId, String clientTripId) {
        List<TripRow> rows = jdbc.query(
                "SELECT " + COLS + " FROM t_trip WHERE user_id = ? AND client_trip_id = ?",
                ROW, userId, clientTripId);
        return rows.stream().findFirst();
    }

    /**
     * 冲突回查专用：加锁读（当前读）。
     *
     * 普通 SELECT 在 REPEATABLE READ 下读的是事务开始时的快照，
     * 看不到并发对手刚提交的行；FOR UPDATE 读的是最新已提交数据。
     */
    public Optional<TripRow> findByClientTripIdForUpdate(long userId, String clientTripId) {
        List<TripRow> rows = jdbc.query(
                "SELECT " + COLS + " FROM t_trip WHERE user_id = ? AND client_trip_id = ? FOR UPDATE",
                ROW, userId, clientTripId);
        return rows.stream().findFirst();
    }

    public Optional<TripRow> findByTripId(long userId, String tripId) {
        List<TripRow> rows = jdbc.query(
                "SELECT " + COLS + " FROM t_trip WHERE user_id = ? AND trip_id = ?",
                ROW, userId, tripId);
        return rows.stream().findFirst();
    }

    public void insert(long userId, String tripId, String clientTripId, String mode, BigDecimal distanceKm,
                       String startPlace, String endPlace, LocalDateTime startTime, LocalDateTime endTime,
                       RuleRow rule, BigDecimal reductionKg, long awardedPoints, LocalDateTime calculatedAt) {
        jdbc.update("""
                INSERT INTO t_trip (trip_id, user_id, client_trip_id, mode, distance_km, start_place, end_place,
                                    start_time, end_time, base_factor, mode_factor, points_ratio,
                                    reduction_kg, awarded_points, rule_id, rule_version, status, calculated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POINTED', ?)
                """,
                tripId, userId, clientTripId, mode, distanceKm, startPlace, endPlace,
                startTime, endTime,
                rule.baseFactor(), rule.modeFactor(), rule.pointsRatio(),
                reductionKg, awardedPoints, rule.id(), rule.version(), calculatedAt);
    }

    /** 分页查询本人行程；所有筛选都是可选的 */
    public List<TripRow> list(long userId, String mode, String keyword,
                              LocalDateTime from, LocalDateTime to, int page, int size) {
        StringBuilder sql = new StringBuilder("SELECT " + COLS + " FROM t_trip WHERE user_id = ?");
        List<Object> args = new ArrayList<>();
        args.add(userId);

        if (mode != null && !mode.isBlank() && !"ALL".equals(mode)) {
            sql.append(" AND mode = ?");
            args.add(mode);
        }
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND (start_place LIKE ? OR end_place LIKE ? OR trip_id LIKE ?)");
            String like = "%" + keyword.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        if (from != null) {
            sql.append(" AND start_time >= ?");
            args.add(from);
        }
        if (to != null) {
            sql.append(" AND start_time <= ?");
            args.add(to);
        }
        sql.append(" ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?");
        args.add(size);
        args.add((page - 1) * size);

        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    public long count(long userId, String mode, String keyword, LocalDateTime from, LocalDateTime to) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM t_trip WHERE user_id = ?");
        List<Object> args = new ArrayList<>();
        args.add(userId);

        if (mode != null && !mode.isBlank() && !"ALL".equals(mode)) {
            sql.append(" AND mode = ?");
            args.add(mode);
        }
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND (start_place LIKE ? OR end_place LIKE ? OR trip_id LIKE ?)");
            String like = "%" + keyword.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        if (from != null) {
            sql.append(" AND start_time >= ?");
            args.add(from);
        }
        if (to != null) {
            sql.append(" AND start_time <= ?");
            args.add(to);
        }
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }
}
