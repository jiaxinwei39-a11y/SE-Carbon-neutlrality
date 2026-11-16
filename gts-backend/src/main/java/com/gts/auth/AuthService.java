package com.gts.auth;

import com.gts.common.Api;
import com.gts.common.TimeUtil;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 认证与注册。
 *
 * 安全上的几个点（答辩常问）：
 *  1. 账号不存在和密码错误返回同一个错误码 40101，不告诉攻击者"这个账号存在"。
 *  2. 停用用户不能登录，且已签发的会话在下次请求时立即失效（见 SessionRepository）。
 *  3. 令牌 32 字节随机，库里只存 SHA-256，不存原文。
 *  4. 口令 PBKDF2 + 随机盐，校验用常量时间比较（MessageDigest.isEqual）。
 */
@Service
public class AuthService {

    private final UserRepository users;
    private final SessionRepository sessions;
    private final int sessionHours;

    public AuthService(UserRepository users,
                       SessionRepository sessions,
                       @Value("${gts.session.hours:168}") int sessionHours) {
        this.users = users;
        this.sessions = sessions;
        this.sessionHours = sessionHours;
    }

    public AuthDto.LoginResult login(String account, String rawPassword) {
        String acc = account == null ? "" : account.trim();
        UserRepository.UserRow user = users.findByLoginAccount(acc)
                .orElseThrow(this::badCredentials);

        if (!"ENABLED".equals(user.status())) {
            throw new Api.BizException(Api.Codes.UNAUTHORIZED, 401, "账户已停用，请联系运营管理员");
        }
        if (!PasswordHasher.verify(rawPassword, user.passwordHash())) {
            throw badCredentials();
        }
        return issueToken(user);
    }

    @Transactional
    public AuthDto.LoginResult register(String phone, String rawPassword, String nickname) {
        if (users.existsByPhone(phone)) {
            throw new Api.BizException(Api.Codes.PHONE_TAKEN, 409, "该手机号已注册，请直接登录");
        }
        String userId = "U" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
        String nick = (nickname == null || nickname.isBlank()) ? maskPhone(phone) : nickname.trim();
        String avatar = nick.isEmpty() ? "绿" : nick.substring(0, 1);

        long id;
        try {
            id = users.insert(userId, phone, phone, nick, PasswordHasher.hash(rawPassword), avatar);
            users.createAccount(id);
        } catch (DuplicateKeyException e) {
            // 并发注册同一手机号：唯一索引兜底
            throw new Api.BizException(Api.Codes.PHONE_TAKEN, 409, "该手机号已注册，请直接登录");
        }

        UserRepository.UserRow created = users.findById(id).orElseThrow();
        return issueToken(created);
    }

    public AuthDto.UserVo currentUser(LoginUser loginUser) {
        UserRepository.UserRow user = users.findById(loginUser.id())
                .orElseThrow(() -> new Api.BizException(Api.Codes.UNAUTHORIZED, 401, "登录已过期，请重新登录"));
        return toVo(user);
    }

    public void logout(String rawToken) {
        if (rawToken != null && !rawToken.isBlank()) {
            sessions.revoke(PasswordHasher.sha256Hex(rawToken));
        }
    }

    private AuthDto.LoginResult issueToken(UserRepository.UserRow user) {
        String token = PasswordHasher.newToken();
        LocalDateTime expiresAt = LocalDateTime.now(ZoneId.of(TimeUtil.ZONE.getId())).plusHours(sessionHours);
        sessions.create(PasswordHasher.sha256Hex(token), user.id(), expiresAt);
        return new AuthDto.LoginResult(token, toVo(user));
    }

    private AuthDto.UserVo toVo(UserRepository.UserRow user) {
        long points = users.balanceOf(user.id());
        return new AuthDto.UserVo(user.userId(), user.nickname(), user.phone(), user.role(),
                user.avatarText(), points);
    }

    private Api.BizException badCredentials() {
        return new Api.BizException(Api.Codes.BAD_CREDENTIALS, 401, "账号或密码错误");
    }

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 11) {
            return "绿色出行用户";
        }
        return phone.substring(0, 3) + "****" + phone.substring(7);
    }
}
