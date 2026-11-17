package com.gts.admin;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.util.List;

/** 管理端 DTO */
public final class AdminDto {

    private AdminDto() {
    }

    public record ProductCreateRequest(
            @NotBlank(message = "请填写商品名称") String name,
            String icon,
            @NotNull(message = "请填写兑换所需积分")
            @Min(value = 1, message = "兑换积分必须大于 0") Long points,
            @NotNull(message = "请填写库存")
            @Min(value = 0, message = "库存不能为负") Integer stock,
            String description) {
    }

    public record ProductUpdateRequest(
            @NotBlank(message = "请填写商品名称") String name,
            String icon,
            @NotNull(message = "请填写兑换所需积分")
            @Min(value = 1, message = "兑换积分必须大于 0") Long points,
            String description) {
    }

    public record StatusRequest(
            @NotBlank(message = "请选择状态")
            @Pattern(regexp = "ON|OFF", message = "状态只能是 ON 或 OFF") String status) {
    }

    /**
     * 商品部分更新（v1 规范接口）。
     * 与高泽前端一致：改价、改库存、上下架本质是同一资源的部分更新，
     * 用一个 PATCH 提交，字段为 null 表示不修改。
     */
    public record ProductPatchRequest(
            Long points,
            Integer stock,
            String status) {
    }

    /** 与前端 DashboardData 一致 */
    public record DashboardVo(
            long userCount,
            long tripCount,
            BigDecimal totalReductionKg,
            long totalPointsIssued,
            List<ModeCountVo> modeDistribution,
            List<DayCountVo> dailyTrend) {
    }

    public record ModeCountVo(String mode, long count) {
    }

    public record DayCountVo(String date, long count) {
    }

    public record StockRequest(
            @NotNull(message = "请填写库存")
            @Min(value = 0, message = "库存不能为负") Integer stock) {
    }

    public record RuleCreateRequest(
            @NotBlank(message = "请选择出行方式") String mode,
            @NotNull(message = "请填写基准排放因子") BigDecimal baseFactor,
            @NotNull(message = "请填写方式排放因子") BigDecimal modeFactor,
            @NotNull(message = "请填写积分系数") BigDecimal pointsRatio,
            @NotBlank(message = "请填写生效时间") String effectiveFrom,
            String effectiveTo) {
    }

    /** 与前端 CarbonRule 一致 */
    public record CarbonRuleVo(
            String ruleId,
            String version,
            String mode,
            BigDecimal baseFactor,
            BigDecimal modeFactor,
            BigDecimal pointsRatio,
            String effectiveFrom,
            String status) {
    }

    /** 对账差异项。objectType 取值 TRIP / ORDER / ACCOUNT */
    public record ReconcileItemVo(
            String id,
            String objectType,
            String objectId,
            String checkName,
            BigDecimal expected,
            BigDecimal actual) {
    }

    public record ReconcileResultVo(String checkedAt, List<ReconcileItemVo> items) {
    }
}
