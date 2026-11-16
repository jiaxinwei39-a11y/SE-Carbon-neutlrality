package com.gts.auth;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 登录会话：库里只存令牌的 SHA-256，请求时同样是"哈希后查表" */
@Repository
public class SessionRepository {

    private final JdbcTemplate jdbc;

    public SessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void create(String tokenHash, long userId, LocalDateTime expiresAt) {
        jdbc.update("""
                INSERT INTO t_login_session (token_hash, user_id, expires_at) VALUES (?, ?, ?)
                """, tokenHash, userId, expiresAt);
    }

    /**
     * 校验令牌：必须同时满足「未过期」「未注销」「账户仍启用」。
     * 停用用户时旧会话立刻失效，靠的就是这里的 status 判断（NFR / #17 的验收点）。
     */
    public Optional<LoginUser> findValid(String tokenHash) {
        List<LoginUser> rows = jdbc.query("""
                SELECT u.id, u.user_id, u.role
                FROM t_login_session s
                JOIN t_user u ON u.id = s.user_id
                WHERE s.token_hash = ?
                  AND s.revoked_at IS NULL
                  AND s.expires_at > NOW(3)
                  AND u.status = 'ENABLED'
                """, (rs, i) -> new LoginUser(rs.getLong("id"), rs.getString("user_id"), rs.getString("role")),
                tokenHash);
        return rows.stream().findFirst();
    }

    public void revoke(String tokenHash) {
        jdbc.update("UPDATE t_login_session SET revoked_at = NOW(3) WHERE token_hash = ? AND revoked_at IS NULL",
                tokenHash);
    }
}
