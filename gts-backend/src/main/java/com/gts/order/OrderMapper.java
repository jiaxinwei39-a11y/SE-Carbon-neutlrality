package com.gts.order;

import com.gts.common.TimeUtil;

/** 订单行 → 对外 VO。商城与管理端都要用，放在订单包里作为唯一映射入口。 */
public final class OrderMapper {

    private OrderMapper() {
    }

    public static OrderDto.OrderVo toVo(OrderRepository.OrderRow o) {
        return new OrderDto.OrderVo(
                o.orderId(),
                o.productId(),
                o.productName(),
                o.productIcon(),
                o.quantity(),
                o.unitPoints(),
                o.totalPoints(),
                o.status(),
                TimeUtil.toIso(o.createdAt()),
                o.cancelReason());
    }
}
