package com.gts.order;

import com.gts.audit.AuditRepository;
import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.mall.MallRepository;
import com.gts.mall.MallService;
import com.gts.points.PointsRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 订单查询、履约、取消冲正。
 *
 * 状态机只有三条边：CREATED → FULFILLED、CREATED → CANCELLED，终态不可逆。
 *
 * 取消冲正的三条硬要求：
 *  1. 同一订单只能有一笔冲正流水 —— 由 t_point_ledger 的 UQ(ref_type, ref_id, type) 兜底；
 *  2. 重复取消不再返还 —— 第二次进来看到状态已是 CANCELLED，直接返回原结果；
 *  3. 履约与取消竞争只能一个成功 —— 两者都锁同一行订单并重读状态，后到的看到终态即返回/拒绝。
 *
 * 加锁顺序与兑换一致：账户 → 商品 → 订单。
 * 取消时先无锁读一次订单拿到 userId/productId，再按顺序加锁并重读订单状态；
 * 这是设计文档 key-design 3.4 要求的做法，避免"先锁订单再锁账户"造成反向顺序。
 */
@Service
public class OrderService {

    private final OrderRepository orders;
    private final MallRepository mall;
    private final PointsRepository points;
    private final AuditRepository audit;
    private final TransactionTemplate tx;

    public OrderService(OrderRepository orders, MallRepository mall, PointsRepository points,
                        AuditRepository audit, PlatformTransactionManager transactionManager) {
        this.orders = orders;
        this.mall = mall;
        this.points = points;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public Api.Page<OrderDto.OrderVo> list(LoginUser user, String status, int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        List<OrderDto.OrderVo> items = orders.listByUser(user.id(), status, p, s).stream()
                .map(OrderMapper::toVo).toList();
        return new Api.Page<>(items, orders.countByUser(user.id(), status), p, s);
    }

    /** 本人或管理员可看；他人订单按"不存在"处理，不暴露存在性 */
    public OrderDto.OrderVo detail(LoginUser user, String orderId) {
        OrderRepository.OrderRow row = orders.findByOrderId(orderId)
                .orElseThrow(() -> new Api.BizException(Api.Codes.ORDER_NOT_FOUND, 404, "订单不存在"));
        if (!user.isAdmin() && row.userId() != user.id()) {
            throw new Api.BizException(Api.Codes.ORDER_NOT_FOUND, 404, "订单不存在");
        }
        return OrderMapper.toVo(row);
    }

    public OrderDto.OrderVo cancel(LoginUser admin, String orderId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new Api.BizException(Api.Codes.CANCEL_REASON_REQUIRED, 400, "请填写取消原因");
        }
        return tx.execute(status -> cancelInTx(admin, orderId, reason.trim()));
    }

    public OrderDto.OrderVo fulfill(LoginUser admin, String orderId) {
        return tx.execute(status -> fulfillInTx(admin, orderId));
    }

    /* ------------------------------------------------------------------ */

    private OrderDto.OrderVo cancelInTx(LoginUser admin, String orderId, String reason) {
        OrderRepository.OrderRow snapshot = orders.findByOrderId(orderId)
                .orElseThrow(() -> new Api.BizException(Api.Codes.ORDER_NOT_FOUND, 404, "订单不存在"));

        // 按 账户 → 商品 → 订单 的顺序加锁
        points.lockAccountForUpdate(snapshot.userId());
        mall.findByInternalIdForUpdate(snapshot.productInternalId());
        OrderRepository.OrderRow locked = orders.findByOrderIdForUpdate(orderId).orElseThrow();

        if ("CANCELLED".equals(locked.status())) {
            // 重复取消：返回原结果，不再返还第二笔
            return OrderMapper.toVo(locked);
        }
        if ("FULFILLED".equals(locked.status())) {
            throw new Api.BizException(Api.Codes.ORDER_STATUS_INVALID, 409,
                    "订单已完成履约，不能取消，请刷新后重试");
        }

        long seq = points.refund(locked.userId(), locked.totalPoints());
        mall.increaseStock(locked.productInternalId(), locked.quantity());
        orders.updateStatus(orderId, "CANCELLED", reason, admin.id());

        long balanceAfter = points.balance(locked.userId());
        points.insertLedger(locked.userId(), seq, "REVERSE",
                "订单取消冲正 · " + locked.productName(),
                locked.totalPoints(), balanceAfter, "ORDER", orderId);

        audit.record("REDEMPTION_ORDER", orderId, "CANCEL",
                "{\"status\":\"CREATED\"}", "{\"status\":\"CANCELLED\"}", admin.id(), reason);

        return OrderMapper.toVo(orders.findByOrderId(orderId).orElseThrow());
    }

    private OrderDto.OrderVo fulfillInTx(LoginUser admin, String orderId) {
        OrderRepository.OrderRow snapshot = orders.findByOrderId(orderId)
                .orElseThrow(() -> new Api.BizException(Api.Codes.ORDER_NOT_FOUND, 404, "订单不存在"));

        points.lockAccountForUpdate(snapshot.userId());
        mall.findByInternalIdForUpdate(snapshot.productInternalId());
        OrderRepository.OrderRow locked = orders.findByOrderIdForUpdate(orderId).orElseThrow();

        if ("FULFILLED".equals(locked.status())) {
            return OrderMapper.toVo(locked);
        }
        if ("CANCELLED".equals(locked.status())) {
            throw new Api.BizException(Api.Codes.ORDER_STATUS_INVALID, 409,
                    "订单已取消，不能履约，请刷新后重试");
        }

        orders.updateStatus(orderId, "FULFILLED", null, admin.id());
        audit.record("REDEMPTION_ORDER", orderId, "FULFILL",
                "{\"status\":\"CREATED\"}", "{\"status\":\"FULFILLED\"}", admin.id(), null);

        return OrderMapper.toVo(orders.findByOrderId(orderId).orElseThrow());
    }
}
