package com.gts.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * 口令哈希与令牌生成。
 *
 * 为什么用 PBKDF2 而不是 BCrypt：
 *   PBKDF2WithHmacSHA256 是 JDK 自带的，不需要额外依赖，也不用引 Spring Security；
 *   同样满足 NFR-09"加盐哈希、禁止明文或可逆加密"。
 *   数据库里的格式是 pbkdf2_sha256$迭代次数$盐(base64)$哈希(base64)。
 */
public final class PasswordHasher {

    private static final int ITERATIONS = 120_000;
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordHasher() {
    }

    public static String hash(String rawPassword) {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        byte[] dk = pbkdf2(rawPassword, salt, ITERATIONS);
        Base64.Encoder enc = Base64.getEncoder();
        return "pbkdf2_sha256$" + ITERATIONS + "$" + enc.encodeToString(salt) + "$" + enc.encodeToString(dk);
    }

    /** 校验口令。格式不认识或算不出来一律返回 false，不抛异常，避免泄露内部细节。 */
    public static boolean verify(String rawPassword, String stored) {
        if (rawPassword == null || stored == null) {
            return false;
        }
        String[] parts = stored.split("\\$");
        if (parts.length != 4 || !"pbkdf2_sha256".equals(parts[0])) {
            return false;
        }
        try {
            int iterations = Integer.parseInt(parts[1]);
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            byte[] actual = pbkdf2(rawPassword, salt, iterations);
            return MessageDigest.isEqual(expected, actual);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static byte[] pbkdf2(String rawPassword, byte[] salt, int iterations) {
        PBEKeySpec spec = new PBEKeySpec(rawPassword.toCharArray(), salt, iterations, KEY_BITS);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("口令哈希失败", e);
        } finally {
            spec.clearPassword();
        }
    }

    /** 生成 32 字节随机令牌，Base64URL 无填充，可直接放进 Authorization 头 */
    public static String newToken() {
        byte[] buf = new byte[32];
        RANDOM.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** 令牌在库里只存 SHA-256，库被看到也无法直接冒用会话（NFR-12） */
    public static String sha256Hex(String text) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
