package com.gts.points;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 积分接口：/api/points/** */
@RestController
@RequestMapping("/points")
public class PointsController {

    private final PointsService pointsService;

    public PointsController(PointsService pointsService) {
        this.pointsService = pointsService;
    }

    @GetMapping("/account")
    public Api.Result<PointsDto.AccountVo> account() {
        return Api.Result.ok(pointsService.account(LoginUser.require()));
    }

    @GetMapping("/flows")
    public Api.Result<Api.Page<PointsDto.FlowVo>> flows(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return Api.Result.ok(pointsService.flows(LoginUser.require(), type, page, size));
    }
}
