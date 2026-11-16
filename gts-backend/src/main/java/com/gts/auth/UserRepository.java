package com.gts.auth;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** 用户与积分账户的读写（JdbcTemplate 直写 SQL，便于在报告里说明每一条语句） */
@Repository
public class UserRepository {

    /** 一行用户数据 */
    public record UserRow(
            long id,
            String userId,
            String loginAccount,
            String phone,
            String nickname,
            String passwordHash,
            String role,
            String status,
            String avatarText) {
    }

    private static final RowMapper<UserRow> ROW = (rs, i) -> new UserRow(
            rs.getLong("id"),
            rs.getString("user_id"),
            rs.getString("login_account"),
            rs.getString("phone"),
            rs.getString("nickname"),
            rs.getString("password_hash"),
            rs.getString("role"),
            rs.getString("status"),
            rs.getString("avatar_text"));

    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserRow> findByLoginAccount(String account) {
        List<UserRow> rows = jdbc.query("""
                SELECT id, user_id, login_account, phone, nickname, password_hash, role, status, avatar_text
                FROM t_user WHERE login_account = ?
                """, ROW, account);
        return rows.stream().findFirst();
    }

    public Optional<UserRow> findById(long id) {
        List<UserRow> rows = jdbc.query("""
                SELECT id, user_id, login_account, phone, nickname, password_hash, role, status, avatar_text
                FROM t_user WHERE id = ?
                """, ROW, id);
        return rows.stream().findFirst();
    }

    public boolean existsByPhone(String phone) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM t_user WHERE phone = ?", Integer.class, phone);
        return n != null && n > 0;
    }

    /** 新增用户：user_id 用随机 8 位十六进制，避免并发下自己算序号撞车 */
    public long insert(String userId, String loginAccount, String phone, String nickname,
                       String passwordHash, String avatarText) {
        jdbc.update("""
                INSERT INTO t_user (user_id, login_account, phone, nickname, password_hash, role, status, avatar_text)
                VALUES (?, ?, ?, ?, ?, 'USER', 'ENABLED', ?)
                """, userId, loginAccount, phone, nickname, passwordHash, avatarText);
        Long id = jdbc.queryForObject("SELECT id FROM t_user WHERE user_id = ?", Long.class, userId);
        if (id == null) {
            throw new IllegalStateException("用户创建后查不到：" + userId);
        }
        return id;
    }

    /** 开账户：一人一户，初始为 0 */
    public void createAccount(long userId) {
        jdbc.update("""
                INSERT INTO t_point_account (user_id, balance, total_earned, total_spent, trip_count, total_reduction_kg)
                VALUES (?, 0, 0, 0, 0, 0)
                """, userId);
    }

    public long balanceOf(long userId) {
        Long b = jdbc.queryForObject("SELECT balance FROM t_point_account WHERE user_id = ?", Long.class, userId);
        return b == null ? 0L : b;
    }
}
