package com.gts.mall;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.order.OrderDto;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 商城接口：/api/mall/** */
@RestController
@RequestMapping("/mall")
public class MallController {

    private final MallService mallService;

    public MallController(MallService mallService) {
        this.mallService = mallService;
    }

    @GetMapping("/products")
    public Api.Result<Api.Page<MallDto.ProductVo>> products(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        LoginUser.require();
        return Api.Result.ok(mallService.products(keyword, page, size));
    }

    @GetMapping("/products/{productId}")
    public Api.Result<MallDto.ProductVo> product(@PathVariable String productId) {
        LoginUser.require();
        return Api.Result.ok(mallService.product(productId));
    }

    @PostMapping("/orders")
    public Api.Result<OrderDto.OrderVo> redeem(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody MallDto.RedeemRequest req) {
        return Api.Result.ok(mallService.redeem(LoginUser.require(), idempotencyKey, req));
    }
}
