package com.gts.mall;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.common.TimeUtil;
import com.gts.order.OrderDto;
import com.gts.order.OrderMapper;
import com.gts.order.OrderRepository;
import com.gts.points.PointsRepository;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 兑换：商品浏览 + 幂等下单。
 *
 * 加锁顺序（评审要求"账户→商品→订单"必须在所有写路径上一致）：
 *   1. t_point_account   FOR UPDATE  —— 先锁账户
 *   2. t_product         FOR UPDATE  —— 再锁商品
 *   3. t_redemption_order（新建，无需锁；取消时才按同顺序补锁订单行）
 *
 * 为什么要固定顺序：两个并发事务若以相反顺序拿锁就会互相等待。
 * 所有"同时动用账户和商品"的操作（兑换、取消冲正）都按这个顺序，才不会死锁。
 *
 * 兑换失败的组合一律整体回滚：扣分、减库存、建订单、写流水四件事同生共死。
 */
@Service
public class MallService {

    private static final Logger log = LoggerFactory.getLogger(MallService.class);
    private static final DateTimeFormatter ORDER_TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final MallRepository mall;
    private final OrderRepository orders;
    private final PointsRepository points;
    private final TransactionTemplate tx;
    private final TransactionTemplate retryTx;
    /** 测试用：扣分扣库存后强制失败，验证兑换整笔回滚（TC-13），默认 false */
    private final boolean failAfterRedeemSpend;

    public MallService(MallRepository mall, OrderRepository orders, PointsRepository points,
                       PlatformTransactionManager transactionManager,
                       @org.springframework.beans.factory.annotation.Value("${gts.test.fail-after-redeem-spend:false}")
                       boolean failAfterRedeemSpend) {
        this.mall = mall;
        this.orders = orders;
        this.points = points;
        this.tx = new TransactionTemplate(transactionManager);
        this.retryTx = new TransactionTemplate(transactionManager);
        this.retryTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.failAfterRedeemSpend = failAfterRedeemSpend;
    }

    public Api.Page<MallDto.ProductVo> products(String keyword, int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        List<MallDto.ProductVo> items = mall.listOnSale(keyword, p, s).stream()
                .map(this::toVo).toList();
        return new Api.Page<>(items, mall.countOnSale(keyword), p, s);
    }

    public MallDto.ProductVo product(String productId) {
        MallRepository.ProductRow row = mall.findByProductId(productId)
                .orElseThrow(() -> new Api.BizException(Api.Codes.PRODUCT_NOT_FOUND, 404, "商品不存在或已下架"));
        if (!"ON".equals(row.status())) {
            throw new Api.BizException(Api.Codes.PRODUCT_NOT_FOUND, 404, "商品不存在或已下架");
        }
        return toVo(row);
    }

    public OrderDto.OrderVo redeem(LoginUser user, String idempotencyKey, MallDto.RedeemRequest req) {
        try {
            return tx.execute(status -> redeemInTx(user, idempotencyKey, req));
        } catch (DuplicateKeyException e) {
            // 与行程上报同样的处理：第一个事务已回滚结束，新事务里当前读回查
            log.warn("兑换并发重复提交，转到新事务回查：user={}, requestId={}", user.userId(), idempotencyKey);
            return retryTx.execute(status -> replayInNewTx(user, idempotencyKey, req));
        }
    }

    /* ------------------------------------------------------------------ */

    private OrderDto.OrderVo redeemInTx(LoginUser user, String idempotencyKey, MallDto.RedeemRequest req) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new Api.BizException(Api.Codes.IDEMPOTENCY_KEY_MISSING, 400, "缺少幂等键，请刷新页面重试");
        }
        int quantity = req.quantity() == null ? 0 : req.quantity();
        if (quantity < 1) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "兑换数量至少为 1");
        }

        // 幂等前置：已有同请求号订单就直接返回/判冲突，不要等到扣款后才撞唯一键
        java.util.Optional<OrderRepository.OrderRow> existing =
                orders.findByUserAndRequestId(user.id(), idempotencyKey);
        if (existing.isPresent()) {
            return replayOrConflict(existing.get(), req);
        }

        // ① 锁账户
        points.lockAccountForUpdate(user.id());

        // ①.5 拿到账户锁之后必须再用**当前读**复查一次幂等记录。
        //     理由（评审复现）：两个同键请求都通过了上面的锁外查重，
        //     第一个先拿到锁并把库存扣到 0，第二个在锁上等待；
        //     等它拿到锁时若先去校验库存，会直接报"库存不足"就退出，
        //     根本走不到 DuplicateKeyException 的回查分支 —— 用户拿到的是 40901 而不是原订单。
        //     FOR UPDATE 是当前读，能看到对手刚提交的订单。
        java.util.Optional<OrderRepository.OrderRow> afterLock =
                orders.findByUserAndRequestIdForUpdate(user.id(), idempotencyKey);
        if (afterLock.isPresent()) {
            return replayOrConflict(afterLock.get(), req);
        }

        // ② 锁商品
        MallRepository.ProductRow product = mall.findByProductIdForUpdate(req.productId())
                .orElseThrow(() -> new Api.BizException(Api.Codes.PRODUCT_NOT_FOUND, 404, "商品不存在或已下架"));
        if (!"ON".equals(product.status())) {
            throw new Api.BizException(Api.Codes.PRODUCT_OFF_SHELF, 409, "商品已下架，无法兑换");
        }
        if (product.stock() < quantity) {
            throw new Api.BizException(Api.Codes.STOCK_SHORT, 409, "库存不足，请减少兑换数量");
        }

        long unitPoints = product.points();
        long totalPoints;
        try {
            totalPoints = Math.multiplyExact(unitPoints, (long) quantity);
        } catch (ArithmeticException e) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "兑换数量过大");
        }

        // ③ 扣分（原子，余额不足直接失败）
        long seq = points.spend(user.id(), totalPoints);

        // ④ 扣库存（原子，stock >= quantity）
        if (mall.decreaseStock(product.id(), quantity) == 0) {
            throw new Api.BizException(Api.Codes.STOCK_SHORT, 409, "库存不足，请减少兑换数量");
        }

        if (failAfterRedeemSpend) {
            // 测试注入：扣分与扣库存都已执行，此时失败，验证两者是否一起回滚
            throw new IllegalStateException("测试注入：兑换扣分扣库存后故意失败（TC-13）");
        }

        // ⑤ 建订单（快照单价与名称）+ 写流水
        String orderId = newOrderId();
        orders.insert(user.id(), orderId, product.id(), product.name(), product.icon(),
                quantity, unitPoints, totalPoints, idempotencyKey);

        long balanceAfter = points.balance(user.id());
        points.insertLedger(user.id(), seq, "SPEND",
                "兑换 · " + product.name() + " × " + quantity,
                -totalPoints, balanceAfter, "ORDER", orderId);

        OrderRepository.OrderRow saved = orders.findByOrderId(orderId).orElseThrow();
        return OrderMapper.toVo(saved);
    }

    private OrderDto.OrderVo replayInNewTx(LoginUser user, String idempotencyKey, MallDto.RedeemRequest req) {
        OrderRepository.OrderRow row = orders
                .findByUserAndRequestIdForUpdate(user.id(), idempotencyKey)
                .orElseThrow(() -> new Api.BizException(Api.Codes.SERVER_ERROR, 500,
                        "并发冲突后未找到已存在的订单，请重试"));
        return replayOrConflict(row, req);
    }

    /** 同请求号：内容一致返回原订单，内容不同返回 40904 */
    private OrderDto.OrderVo replayOrConflict(OrderRepository.OrderRow row, MallDto.RedeemRequest req) {
        boolean same = row.productId().equals(req.productId())
                && row.quantity() == (req.quantity() == null ? -1 : req.quantity());
        if (!same) {
            throw new Api.BizException(Api.Codes.IDEMPOTENCY_CONFLICT, 409,
                    "相同请求号提交了不同的兑换内容，请刷新页面后重新提交");
        }
        return OrderMapper.toVo(row);
    }

    private MallDto.ProductVo toVo(MallRepository.ProductRow p) {
        return new MallDto.ProductVo(p.productId(), p.name(), p.icon(), p.points(), p.stock(),
                p.status(), p.description());
    }

    private static String newOrderId() {
        String ts = LocalDateTime.now(TimeUtil.ZONE).format(ORDER_TS);
        int rnd = ThreadLocalRandom.current().nextInt(1000, 10000);
        return "RO" + ts + rnd;
    }
}
