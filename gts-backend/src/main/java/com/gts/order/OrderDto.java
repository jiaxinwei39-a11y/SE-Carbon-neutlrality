package com.gts.order;

import jakarta.validation.constraints.NotBlank;

/** 订单 DTO：字段名与前端 Order 一致 */
public final class OrderDto {

    private OrderDto() {
    }

    public record OrderVo(
            String orderId,
            String productId,
            String productName,
            String productIcon,
            int quantity,
            long unitPoints,
            long totalPoints,
            String status,
            String createdAt,
            String cancelReason) {
    }

    public record CancelRequest(@NotBlank(message = "请填写取消原因") String reason) {
    }
}
