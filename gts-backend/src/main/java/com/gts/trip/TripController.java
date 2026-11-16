package com.gts.trip;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 行程接口：/api/trips */
@RestController
@RequestMapping("/trips")
public class TripController {

    private final TripService tripService;

    public TripController(TripService tripService) {
        this.tripService = tripService;
    }

    @GetMapping
    public Api.Result<Api.Page<TripDto.TripVo>> list(
            @RequestParam(required = false) String mode,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return Api.Result.ok(tripService.list(LoginUser.require(), mode, keyword, from, to, page, size));
    }

    @GetMapping("/{tripId}")
    public Api.Result<TripDto.TripDetailVo> detail(@PathVariable String tripId) {
        return Api.Result.ok(tripService.detail(LoginUser.require(), tripId));
    }

    /** 幂等键放请求头，与前端 createTrip 的实现一致 */
    @PostMapping
    public Api.Result<TripDto.TripDetailVo> create(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody TripDto.CreateTripRequest req) {
        return Api.Result.ok(tripService.create(LoginUser.require(), idempotencyKey, req));
    }
}
