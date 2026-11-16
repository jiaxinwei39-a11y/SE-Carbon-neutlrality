package com.gts.trip;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.common.TimeUtil;
import com.gts.points.PointsRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 行程上报：校验 → 匹配规则 → 核算 → 落库 → 发分 → 返回。
 *
 * 这里是 #10 的核心，答辩必问的四个点：
 *  1. 为什么整笔在一个事务里：行程、流水、余额任何一步失败都必须整体回滚，
 *     否则会出现"有流水没余额"或"有行程没发分"的账实不符。
 *  2. 幂等怎么做：先按 (user_id, client_trip_id) 查，命中就比对输入，
 *     相同返回原结果、不同拒绝；唯一索引是并发下的最后一道防线。
 *  3. 金额怎么算：全程 BigDecimal，最后统一向下取整（RoundingMode.FLOOR），
 *     不用 double，避免 0.1+0.2 这类精度问题。
 *  4. 零积分为什么也存行程、但不写流水。
 */
@Service
public class TripService {

    private static final Set<String> MODES = Set.of("BUS", "SUBWAY", "BIKE", "WALK");
    private static final BigDecimal MAX_KM = new BigDecimal("200");
    private static final DateTimeFormatter TRIP_ID_TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final TripRepository trips;
    private final PointsRepository points;

    public TripService(TripRepository trips, PointsRepository points) {
        this.trips = trips;
        this.points = points;
    }

    @Transactional
    public TripDto.TripDetailVo create(LoginUser user, String idempotencyKey, TripDto.CreateTripRequest req) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new Api.BizException(Api.Codes.IDEMPOTENCY_KEY_MISSING, 400, "缺少幂等键，请刷新页面重试");
        }

        String mode = req.mode() == null ? "" : req.mode().trim().toUpperCase();
        if (!MODES.contains(mode)) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "不支持的出行方式：" + req.mode());
        }

        BigDecimal distance = req.distanceKm();
        if (distance == null) {
            throw new Api.BizException(Api.Codes.DISTANCE_INVALID, 400, "里程需大于 0 且不超过 200 公里");
        }
        if (distance.compareTo(BigDecimal.ZERO) <= 0 || distance.compareTo(MAX_KM) > 0) {
            throw new Api.BizException(Api.Codes.DISTANCE_INVALID, 400, "里程需大于 0 且不超过 200 公里");
        }
        if (distance.stripTrailingZeros().scale() > 3) {
            throw new Api.BizException(Api.Codes.DISTANCE_INVALID, 400, "里程最多保留 3 位小数");
        }

        LocalDateTime start = TimeUtil.parseIso(req.startTime());
        LocalDateTime end = TimeUtil.parseIso(req.endTime());
        if (!end.isAfter(start)) {
            throw new Api.BizException(Api.Codes.TIME_INVALID, 400, "结束时间必须晚于开始时间");
        }
        LocalDateTime now = LocalDateTime.now(TimeUtil.ZONE);
        if (end.isAfter(now.plusSeconds(60))) {
            throw new Api.BizException(Api.Codes.TIME_INVALID, 400, "结束时间不能晚于当前时间");
        }

        String startPlace = req.startPlace().trim();
        String endPlace = req.endPlace().trim();
        String clientTripId = req.clientTripId().trim();

        // 幂等：命中已有记录时，输入完全一致才放行原结果
        Optional<TripRepository.TripRow> existing = trips.findByClientTripId(user.id(), clientTripId);
        if (existing.isPresent()) {
            return replayOrConflict(existing.get(), mode, distance, start, end, startPlace, endPlace);
        }

        TripRepository.RuleRow rule = trips.findRule(mode, end).orElseThrow(() ->
                new Api.BizException(Api.Codes.NO_CARBON_RULE, 409,
                        "该出行方式在当前时间没有生效的核算规则，请联系运营管理员"));

        // 核算：全部 BigDecimal，最后统一向下取整
        BigDecimal baseline = distance.multiply(rule.baseFactor());
        BigDecimal actual = distance.multiply(rule.modeFactor());
        BigDecimal reduction = baseline.subtract(actual).max(BigDecimal.ZERO);
        long awarded = reduction.multiply(rule.pointsRatio())
                .setScale(0, RoundingMode.FLOOR)
                .longValueExact();

        String tripId = newTripId(now);
        try {
            trips.insert(user.id(), tripId, clientTripId, mode, distance, startPlace, endPlace,
                    start, end, rule, reduction, awarded, now);
        } catch (DuplicateKeyException e) {
            // 并发下两次请求同时插入：唯一索引拦下一个，回查已存在的那条
            TripRepository.TripRow row = trips.findByClientTripId(user.id(), clientTripId)
                    .orElseThrow(() -> e);
            return replayOrConflict(row, mode, distance, start, end, startPlace, endPlace);
        }

        // 入账与序号分配在同一事务内：last_seq 的自增持有账户行锁
        long accountSeq = points.applyTrip(user.id(), awarded, reduction);
        if (awarded > 0) {
            long balanceAfter = points.balance(user.id());
            points.insertLedger(user.id(), accountSeq, "EARN",
                    "行程核算入账 · " + modeLabel(mode) + " " + distance.stripTrailingZeros().toPlainString() + " 公里",
                    awarded, balanceAfter, "TRIP", tripId);
        }

        TripRepository.TripRow saved = trips.findByTripId(user.id(), tripId).orElseThrow();
        return toDetailVo(saved);
    }

    public Api.Page<TripDto.TripVo> list(LoginUser user, String mode, String keyword,
                                         String from, String to, int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        LocalDateTime fromTime = parseDateStart(from);
        LocalDateTime toTime = parseDateEnd(to);
        List<TripDto.TripVo> items = trips.list(user.id(), mode, keyword, fromTime, toTime, p, s)
                .stream().map(this::toVo).toList();
        long total = trips.count(user.id(), mode, keyword, fromTime, toTime);
        return new Api.Page<>(items, total, p, s);
    }

    public TripDto.TripDetailVo detail(LoginUser user, String tripId) {
        TripRepository.TripRow row = trips.findByTripId(user.id(), tripId)
                .orElseThrow(() -> new Api.BizException(Api.Codes.TRIP_NOT_FOUND, 404,
                        "该行程记录不存在或已被删除"));
        return toDetailVo(row);
    }

    /* ------------------------------------------------------------------ */

    private TripDto.TripDetailVo replayOrConflict(TripRepository.TripRow row, String mode, BigDecimal distance,
                                                  LocalDateTime start, LocalDateTime end,
                                                  String startPlace, String endPlace) {
        boolean same = row.mode().equals(mode)
                && row.distanceKm().compareTo(distance) == 0
                && row.startTime().equals(start)
                && row.endTime().equals(end)
                && row.startPlace().equals(startPlace)
                && row.endPlace().equals(endPlace);
        if (!same) {
            throw new Api.BizException(Api.Codes.IDEMPOTENCY_CONFLICT, 409,
                    "相同行程号提交了不同内容，请刷新页面后重新提交");
        }
        return toDetailVo(row);
    }

    private TripDto.TripVo toVo(TripRepository.TripRow r) {
        return new TripDto.TripVo(r.tripId(), r.mode(), r.distanceKm(), r.reductionKg(), r.awardedPoints(),
                r.status(), TimeUtil.toIso(r.startTime()), TimeUtil.toIso(r.endTime()),
                r.startPlace(), r.endPlace(), TimeUtil.toIso(r.createdAt()));
    }

    private TripDto.TripDetailVo toDetailVo(TripRepository.TripRow r) {
        return new TripDto.TripDetailVo(r.tripId(), r.mode(), r.distanceKm(), r.reductionKg(), r.awardedPoints(),
                r.status(), TimeUtil.toIso(r.startTime()), TimeUtil.toIso(r.endTime()),
                r.startPlace(), r.endPlace(), TimeUtil.toIso(r.createdAt()),
                r.baseFactor(), r.modeFactor(), r.pointsRatio(),
                TimeUtil.toIso(r.calculatedAt()), r.ruleVersion());
    }

    private static String newTripId(LocalDateTime now) {
        int rnd = ThreadLocalRandom.current().nextInt(1000, 10000);
        return "TR" + now.format(TRIP_ID_TS) + rnd;
    }

    private static String modeLabel(String mode) {
        return switch (mode) {
            case "BUS" -> "公交";
            case "SUBWAY" -> "地铁";
            case "BIKE" -> "骑行";
            case "WALK" -> "步行";
            default -> mode;
        };
    }

    /** 前端传的是 yyyy-MM-dd，from 取当天 00:00:00 */
    private static LocalDateTime parseDateStart(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String s = text.trim();
        if (s.length() == 10) {
            return LocalDate.parse(s).atStartOfDay();
        }
        return TimeUtil.parseIso(s);
    }

    /** to 取当天 23:59:59.999，避免"选到今天却查不到今天"的常见问题 */
    private static LocalDateTime parseDateEnd(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String s = text.trim();
        if (s.length() == 10) {
            return LocalDate.parse(s).atTime(23, 59, 59, 999_000_000);
        }
        return TimeUtil.parseIso(s);
    }
}
