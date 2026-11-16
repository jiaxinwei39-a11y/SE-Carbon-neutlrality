package com.gts.trip;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/** 行程相关 DTO：对外字段名与 frontend/src/types/index.ts 一致 */
public final class TripDto {

    private TripDto() {
    }

    public record CreateTripRequest(
            @NotBlank(message = "缺少客户端行程号") String clientTripId,
            @NotBlank(message = "请选择出行方式") String mode,
            @NotNull(message = "请填写里程") BigDecimal distanceKm,
            @NotBlank(message = "请填写开始时间") String startTime,
            @NotBlank(message = "请填写结束时间") String endTime,
            @NotBlank(message = "请填写起点") String startPlace,
            @NotBlank(message = "请填写终点") String endPlace) {
    }

    /** 列表项：不带核算因子，减少传输量 */
    public record TripVo(
            String tripId,
            String mode,
            BigDecimal distanceKm,
            BigDecimal reductionKg,
            long awardedPoints,
            String status,
            String startTime,
            String endTime,
            String startPlace,
            String endPlace,
            String createdAt) {
    }

    /** 详情：带核算因子快照，保证历史可解释（D-03） */
    public record TripDetailVo(
            String tripId,
            String mode,
            BigDecimal distanceKm,
            BigDecimal reductionKg,
            long awardedPoints,
            String status,
            String startTime,
            String endTime,
            String startPlace,
            String endPlace,
            String createdAt,
            BigDecimal baseFactor,
            BigDecimal modeFactor,
            BigDecimal pointsRatio,
            String calculatedAt,
            String ruleVersion) {
    }
}
