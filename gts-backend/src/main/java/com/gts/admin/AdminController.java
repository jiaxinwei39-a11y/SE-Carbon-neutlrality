package com.gts.admin;

import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.mall.MallDto;
import com.gts.order.OrderDto;
import com.gts.order.OrderService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端接口：/api/admin/**
 *
 * 权限在一个地方统一判断：每个方法先 requireAdmin()，
 * 不依赖前端隐藏按钮（TC-18 越权用例会直接打这些接口）。
 */
@RestController
@RequestMapping("/admin")
public class AdminController {

    private final AdminService adminService;
    private final RuleService ruleService;
    private final ReconcileService reconcileService;
    private final OrderService orderService;

    public AdminController(AdminService adminService, RuleService ruleService,
                           ReconcileService reconcileService, OrderService orderService) {
        this.adminService = adminService;
        this.ruleService = ruleService;
        this.reconcileService = reconcileService;
        this.orderService = orderService;
    }

    /* ---------------- 商品维护 ---------------- */

    @GetMapping("/products")
    public Api.Result<Api.Page<MallDto.ProductVo>> products(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        requireAdmin();
        return Api.Result.ok(adminService.listProducts(page, size));
    }

    @PostMapping("/products")
    public Api.Result<MallDto.ProductVo> createProduct(@Valid @RequestBody AdminDto.ProductCreateRequest req) {
        return Api.Result.ok(adminService.createProduct(operator(), req));
    }

    @PutMapping("/products/{productId}")
    public Api.Result<MallDto.ProductVo> updateProduct(@PathVariable String productId,
                                                       @Valid @RequestBody AdminDto.ProductUpdateRequest req) {
        return Api.Result.ok(adminService.updateProduct(operator(), productId, req));
    }

    @PostMapping("/products/{productId}/status")
    public Api.Result<MallDto.ProductVo> changeStatus(@PathVariable String productId,
                                                      @Valid @RequestBody AdminDto.StatusRequest req) {
        return Api.Result.ok(adminService.changeStatus(operator(), productId, req.status()));
    }

    @PostMapping("/products/{productId}/stock")
    public Api.Result<MallDto.ProductVo> setStock(@PathVariable String productId,
                                                  @Valid @RequestBody AdminDto.StockRequest req) {
        return Api.Result.ok(adminService.setStock(operator(), productId, req.stock()));
    }

    /* ---------------- 订单处理 ---------------- */

    @GetMapping("/orders")
    public Api.Result<Api.Page<OrderDto.OrderVo>> orders(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        requireAdmin();
        return Api.Result.ok(adminService.listOrders(page, size));
    }

    @PostMapping("/orders/{orderId}/fulfill")
    public Api.Result<OrderDto.OrderVo> fulfill(@PathVariable String orderId) {
        return Api.Result.ok(orderService.fulfill(operator(), orderId));
    }

    /* ---------------- 规则版本化 ---------------- */

    @GetMapping("/rules")
    public Api.Result<List<AdminDto.CarbonRuleVo>> rules() {
        requireAdmin();
        return Api.Result.ok(ruleService.list());
    }

    @PostMapping("/rules")
    public Api.Result<AdminDto.CarbonRuleVo> createRule(@Valid @RequestBody AdminDto.RuleCreateRequest req) {
        return Api.Result.ok(ruleService.create(operator(), req));
    }

    /* ---------------- 只读对账 ---------------- */

    @GetMapping("/reconciliation")
    public Api.Result<AdminDto.ReconcileResultVo> reconciliation() {
        requireAdmin();
        return Api.Result.ok(reconcileService.check());
    }

    /* ------------------------------------------------------------------ */

    private LoginUser operator() {
        LoginUser user = LoginUser.require();
        if (!user.isAdmin()) {
            throw new Api.BizException(Api.Codes.FORBIDDEN, 403, "无权限执行该操作");
        }
        return user;
    }

    private void requireAdmin() {
        if (!LoginUser.require().isAdmin()) {
            throw new Api.BizException(Api.Codes.FORBIDDEN, 403, "无权限执行该操作");
        }
    }
}
