package com.gts.common;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoUnit;

/**
 * 时间约定（这是联调最容易踩坑的一处）。
 *
 * 数据库用 DATETIME 存"本地时间"（Asia/Shanghai），
 * 对外 JSON 一律输出 UTC ISO 8601 且固定 3 位毫秒，例如 2026-11-08T00:05:00.000Z。
 *
 * 为什么必须固定格式：前端筛选逻辑是字符串比较
 *   t.startTime >= new Date(from).toISOString()
 * 如果有时输出 2026-11-08T00:05:00Z、有时输出 ...00.000Z，
 * 比较基准不一致，筛选会漏数据。
 */
public final class TimeUtil {

    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private static final DateTimeFormatter OUT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneId.of("UTC"));

    private static final DateTimeFormatter LENIENT =
            new DateTimeFormatterBuilder().appendPattern("yyyy-MM-dd'T'HH:mm:ss[.SSS]").toFormatter();

    private TimeUtil() {
    }

    /** 数据库里的本地时间 → 对外 UTC ISO 字符串 */
    public static String toIso(LocalDateTime local) {
        if (local == null) {
            return null;
        }
        return OUT.format(local.atZone(ZONE).toInstant());
    }

    public static String nowIso() {
        return toIso(LocalDateTime.now(ZONE));
    }

    /**
     * 客户端传入的 ISO 时间 → 数据库用的本地时间。
     * 接受带 Z 的 UTC、带偏移量的写法、以及不带时区的裸时间（按 Asia/Shanghai 理解）。
     *
     * 统一截断到毫秒：数据库列是 DATETIME(3)，只存毫秒。
     * 如果这里保留微秒，首次入库会被数据库截断，
     * 重放时用于幂等比较的值与库里存的值不相等，会被误判成"同键不同内容"。
     */
    public static LocalDateTime parseIso(String text) {
        return parseIsoRaw(text).truncatedTo(ChronoUnit.MILLIS);
    }

    private static LocalDateTime parseIsoRaw(String text) {
        if (text == null || text.isBlank()) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "时间不能为空");
        }
        String s = text.trim();
        try {
            return LocalDateTime.ofInstant(Instant.parse(s), ZONE);
        } catch (DateTimeParseException ignore) {
            // 继续尝试其它格式
        }
        try {
            return LocalDateTime.ofInstant(OffsetDateTime.parse(s).toInstant(), ZONE);
        } catch (DateTimeParseException ignore) {
            // 继续尝试无时区格式
        }
        try {
            return LocalDateTime.parse(s, LENIENT);
        } catch (DateTimeParseException e) {
            throw new Api.BizException(Api.Codes.TIME_INVALID, 400, "时间格式不正确：" + text);
        }
    }
}
