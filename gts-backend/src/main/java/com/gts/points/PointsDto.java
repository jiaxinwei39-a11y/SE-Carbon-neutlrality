package com.gts.points;

import java.math.BigDecimal;

/** 积分相关 DTO */
public final class PointsDto {

    private PointsDto() {
    }

    /** 与前端 PointsAccount 一致 */
    public record AccountVo(
            long balance,
            long totalEarned,
            long totalSpent,
            long tripCount,
            BigDecimal totalReductionKg) {
    }

    /** 与前端 PointsFlow 一致；amount 正数入账、负数出账、冲正为正 */
    public record FlowVo(
            String id,
            String type,
            String title,
            long amount,
            long balanceAfter,
            String createdAt,
            String refId) {
    }
}
