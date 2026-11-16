package com.gts.mall;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** 商城 DTO：字段名与 frontend/src/types/index.ts 对齐 */
public final class MallDto {

    private MallDto() {
    }

    /** 与前端 Product 一致 */
    public record ProductVo(
            String productId,
            String name,
            String icon,
            long points,
            int stock,
            String status,
            String desc) {
    }

    public record RedeemRequest(
            @NotBlank(message = "请选择商品") String productId,
            @NotNull(message = "请填写兑换数量")
            @Min(value = 1, message = "兑换数量至少为 1")
            Integer quantity) {
    }
}
