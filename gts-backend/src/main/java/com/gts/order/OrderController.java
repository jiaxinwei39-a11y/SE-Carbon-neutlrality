package com.gts.order;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 订单接口：/api/orders/** */
@RestController
@RequestMapping("/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping
    public Api.Result<Api.Page<OrderDto.OrderVo>> list(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return Api.Result.ok(orderService.list(LoginUser.require(), status, page, size));
    }

    @GetMapping("/{orderId}")
    public Api.Result<OrderDto.OrderVo> detail(@PathVariable String orderId) {
        return Api.Result.ok(orderService.detail(LoginUser.require(), orderId));
    }

    /** 取消仅限运营管理员（普通用户越权返回 40301，不靠前端隐藏按钮） */
    @PostMapping("/{orderId}/cancel")
    public Api.Result<OrderDto.OrderVo> cancel(@PathVariable String orderId,
                                               @Valid @RequestBody OrderDto.CancelRequest req) {
        LoginUser user = LoginUser.require();
        if (!user.isAdmin()) {
            throw new Api.BizException(Api.Codes.FORBIDDEN, 403, "无权限执行该操作");
        }
        return Api.Result.ok(orderService.cancel(user, orderId, req.reason()));
    }
}
