package com.gts.points;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.common.TimeUtil;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;

/** 积分账户与流水查询（只读） */
@Service
public class PointsService {

    private final PointsRepository points;

    public PointsService(PointsRepository points) {
        this.points = points;
    }

    public PointsDto.AccountVo account(LoginUser user) {
        PointsRepository.AccountRow row = points.account(user.id())
                .orElseThrow(() -> new IllegalStateException("积分账户不存在，userId=" + user.id()));
        return new PointsDto.AccountVo(
                row.balance(), row.totalEarned(), row.totalSpent(), row.tripCount(),
                row.totalReductionKg() == null ? BigDecimal.ZERO : row.totalReductionKg());
    }

    public Api.Page<PointsDto.FlowVo> flows(LoginUser user, String type, int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        List<PointsDto.FlowVo> items = points.flows(user.id(), type, p, s).stream()
                .map(f -> new PointsDto.FlowVo(
                        f.ledgerNo(), f.type(), f.title(), f.amount(), f.balanceAfter(),
                        TimeUtil.toIso(f.createdAt()), f.refId()))
                .toList();
        long total = points.countFlows(user.id(), type);
        return new Api.Page<>(items, total, p, s);
    }
}
