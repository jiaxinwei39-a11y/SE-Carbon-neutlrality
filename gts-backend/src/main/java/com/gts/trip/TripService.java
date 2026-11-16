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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 行程上报：校验 → 匹配规则 → 核算 → 落库 → 发分 → 返回。
 *
 * 事务方案（针对评审意见 P1 的修订）：
 *  1. 正常路径在 tx（默认 REQUIRED）里执行，任何异常整体回滚。
 *  2. 冲突路径**不在原事务里回查**。捕获 DuplicateKeyException 时第一个事务已经
 *     被 TransactionTemplate 回滚并结束，随后用 retryTx（REQUIRES_NEW）开一个
 *     **全新事务**，并配合 SELECT ... FOR UPDATE 做当前读。
 *     原因：MySQL 默认 REPEATABLE READ，事务内第一次普通 SELECT 就固定了快照；
 *     在同一个事务里回查只能看到旧快照，看不到并发对手刚提交的行，重放会失败。
 *  3. 两个测试钩子默认关闭：
 *       gts.test.insert-delay-ms  在"前置查重"与"插入"之间休眠，用来制造并发屏障
 *       gts.test.fail-after-trip  行程写入后故意抛异常，用来验证整笔回滚（TC-13）
 */
@Service
public class TripService {

    private static final Logger log = LoggerFactory.getLogger(TripService.class);

    private static final Set<String> MODES = Set.of("BUS", "SUBWAY", "BIKE", "WALK");
    private static final BigDecimal MAX_KM = new BigDecimal("200");
    private static final DateTimeFormatter TRIP_ID_TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final TripRepository trips;
    private final PointsRepository points;
    private final TransactionTemplate tx;
    private final TransactionTemplate retryTx;

    /** 测试用：插入前延迟（毫秒），默认 0 → 生产行为不受影响 */
    private final long insertDelayMs;
    /** 测试用：行程写入后强制失败，验证回滚，默认 false */
    private final boolean failAfterTrip;

    public TripService(TripRepository trips,
                       PointsRepository points,
                       PlatformTransactionManager transactionManager,
                       @Value("${gts.test.insert-delay-ms:0}") long insertDelayMs,
                       @Value("${gts.test.fail-after-trip:false}") boolean failAfterTrip) {
        this.trips = trips;
        this.points = points;
        this.insertDelayMs = insertDelayMs;
        this.failAfterTrip = failAfterTrip;

        this.tx = new TransactionTemplate(transactionManager);
        this.retryTx = new TransactionTemplate(transactionManager);
        this.retryTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.retryTx.setReadOnly(false);
    }

    public TripDto.TripDetailVo create(LoginUser user, String idempotencyKey, TripDto.CreateTripRequest req) {
        try {
            return tx.execute(status -> createInTx(user, idempotencyKey, req));
        } catch (DuplicateKeyException e) {
            // 第一个事务已由 TransactionTemplate 回滚结束；这里开新事务做当前读回查
            log.warn("行程并发重复提交，转到新事务回查：user={}, clientTripId={}",
                    user.userId(), req.clientTripId());
            return retryTx.execute(status -> replayInNewTx(user, req));
        }
    }

    /* ------------------------------------------------------------------ */

    private TripDto.TripDetailVo createInTx(LoginUser user, String idempotencyKey,
                                            TripDto.CreateTripRequest req) {
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

        // 测试屏障：让并发请求都完成"前置查重"之后再插入，从而必然撞唯一键
        sleepForTestBarrier();

        TripRepository.RuleRow rule = trips.findRule(mode, end).orElseThrow(() ->
                new Api.BizException(Api.Codes.NO_CARBON_RULE, 409,
                        "该出行方式在当前时间没有生效的核算规则，请联系运营管理员"));

        BigDecimal baseline = distance.multiply(rule.baseFactor());
        BigDecimal actual = distance.multiply(rule.modeFactor());
        BigDecimal reduction = baseline.subtract(actual).max(BigDecimal.ZERO);
        long awarded = reduction.multiply(rule.pointsRatio())
                .setScale(0, RoundingMode.FLOOR)
                .longValueExact();

        String tripId = newTripId(now);
        trips.insert(user.id(), tripId, clientTripId, mode, distance, startPlace, endPlace,
                start, end, rule, reduction, awarded, now);

        if (failAfterTrip) {
            // 测试注入：插入行程后故意失败，验证事务是否把行程一并回滚
            throw new IllegalStateException("测试注入：行程写入后故意失败（TC-13）");
        }

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

    /**
     * 新事务内的冲突回查：用 SELECT ... FOR UPDATE 做当前读，能看到对手已提交的行。
     * 同一 clientTripId 且输入一致 → 返回原结果；输入不一致 → 40904。
     */
    private TripDto.TripDetailVo replayInNewTx(LoginUser user, TripDto.CreateTripRequest req) {
        String mode = req.mode() == null ? "" : req.mode().trim().toUpperCase();
        LocalDateTime start = TimeUtil.parseIso(req.startTime());
        LocalDateTime end = TimeUtil.parseIso(req.endTime());
        TripRepository.TripRow row = trips.findByClientTripIdForUpdate(user.id(), req.clientTripId().trim())
                .orElseThrow(() -> new Api.BizException(Api.Codes.SERVER_ERROR, 500,
                        "并发冲突后未找到已存在的行程，请重试"));
        return replayOrConflict(row, mode, req.distanceKm(), start, end,
                req.startPlace().trim(), req.endPlace().trim());
    }

    private void sleepForTestBarrier() {
        if (insertDelayMs <= 0) {
            return;
        }
        try {
            Thread.sleep(insertDelayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
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
