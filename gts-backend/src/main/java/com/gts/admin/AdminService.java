package com.gts.admin;

import com.gts.audit.AuditRepository;
import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.mall.MallDto;
import com.gts.mall.MallService;
import com.gts.order.OrderDto;
import com.gts.order.OrderMapper;
import com.gts.order.OrderRepository;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 管理端商品维护与全平台订单查询。
 *
 * 每次改动都写审计日志（操作人、前后值、原因）并与业务修改在同一事务，
 * 对应 NFR-08"改了必有痕"。
 */
@Service
public class AdminService {

    private static final DateTimeFormatter ID_TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final AdminRepository admin;
    private final OrderRepository orders;
    private final AuditRepository audit;
    private final TransactionTemplate tx;

    public AdminService(AdminRepository admin, OrderRepository orders, AuditRepository audit,
                        PlatformTransactionManager transactionManager) {
        this.admin = admin;
        this.orders = orders;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public Api.Page<MallDto.ProductVo> listProducts(int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        List<MallDto.ProductVo> items = admin.listProducts(p, s).stream()
                .map(r -> new MallDto.ProductVo(r.productId(), r.name(), r.icon(), r.points(),
                        r.stock(), r.status(), r.description()))
                .toList();
        return new Api.Page<>(items, admin.countProducts(), p, s);
    }

    public MallDto.ProductVo createProduct(LoginUser adminUser, AdminDto.ProductCreateRequest req) {
        return tx.execute(status -> {
            // 注意：这里必须用 LocalDateTime 格式化，LocalTime 没有年份字段会抛异常
            String productId = "P" + LocalDateTime.now(com.gts.common.TimeUtil.ZONE).format(ID_TS)
                    + productIdSuffix();
            long merchantId = admin.firstMerchantId();
            if (merchantId == 0) {
                throw new Api.BizException(Api.Codes.SERVER_ERROR, 500, "缺少商户基础数据，请先执行 seed.sql");
            }
            String icon = (req.icon() == null || req.icon().isBlank()) ? "🎁" : req.icon().trim();
            admin.insertProduct(productId, merchantId, req.name().trim(), icon,
                    req.points(), req.stock(), "ON", req.description());
            audit.record("PRODUCT_STOCK", productId, "CREATE", null,
                    "{\"stock\":" + req.stock() + ",\"points\":" + req.points() + "}",
                    adminUser.id(), "新增商品");
            return toVo(productId);
        });
    }

    public MallDto.ProductVo updateProduct(LoginUser adminUser, String productId,
                                           AdminDto.ProductUpdateRequest req) {
        AdminRepository.AdminProductRow before = requireProduct(productId);
        return tx.execute(status -> {
            String icon = (req.icon() == null || req.icon().isBlank()) ? before.icon() : req.icon().trim();
            admin.updateProduct(productId, req.name().trim(), icon, req.points(), req.description());
            audit.record("PRODUCT_STOCK", productId, "UPDATE",
                    "{\"name\":\"" + before.name() + "\",\"points\":" + before.points() + "}",
                    "{\"name\":\"" + req.name().trim() + "\",\"points\":" + req.points() + "}",
                    adminUser.id(), "编辑商品");
            return toVo(productId);
        });
    }

    public MallDto.ProductVo changeStatus(LoginUser adminUser, String productId, String status) {
        AdminRepository.AdminProductRow before = requireProduct(productId);
        return tx.execute(status2 -> {
            admin.updateProductStatus(productId, status);
            audit.record("PRODUCT_STOCK", productId, "UPDATE",
                    "{\"status\":\"" + before.status() + "\"}", "{\"status\":\"" + status + "\"}",
                    adminUser.id(), "上下架");
            return toVo(productId);
        });
    }

    public MallDto.ProductVo setStock(LoginUser adminUser, String productId, int stock) {
        AdminRepository.AdminProductRow before = requireProduct(productId);
        return tx.execute(status -> {
            admin.updateProductStock(productId, stock);
            audit.record("PRODUCT_STOCK", productId, "UPDATE",
                    "{\"stock\":" + before.stock() + "}", "{\"stock\":" + stock + "}",
                    adminUser.id(), "调整库存");
            return toVo(productId);
        });
    }

    /**
     * 商品部分更新（v1 规范接口，与前端 PATCH 对齐）。
     *
     * 为什么用 PATCH 而不是三个独立端点：改价、改库存、上下架是同一资源的部分更新，
     * 一个请求提交多个字段时只产生一条审计记录，也不会出现"改价成功、改库存失败"的半截状态。
     * 先锁商品行，避免两个管理员并发修改时后写覆盖先写。
     */
    public MallDto.ProductVo patchProduct(LoginUser adminUser, String productId,
                                          AdminDto.ProductPatchRequest req) {
        if (req.points() == null && req.stock() == null && req.status() == null) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "请至少提交一个待修改字段");
        }
        return tx.execute(status -> {
            AdminRepository.AdminProductRow before = admin.findProductForUpdate(productId)
                    .orElseThrow(() -> new Api.BizException(Api.Codes.PRODUCT_NOT_FOUND, 404, "商品不存在"));

            // 按前端契约的专用错误码校验：points→40041，stock→40042
            if (req.points() != null && req.points() < 1) {
                throw new Api.BizException(Api.Codes.PRODUCT_POINTS_INVALID, 400, "商品积分单价须为正整数");
            }
            if (req.stock() != null && req.stock() < 0) {
                throw new Api.BizException(Api.Codes.PRODUCT_STOCK_INVALID, 400, "库存须为不小于 0 的整数");
            }

            if (req.points() != null) {
                admin.updateProductPoints(productId, req.points());
            }
            if (req.stock() != null) {
                admin.updateProductStock(productId, req.stock());
            }
            if (req.status() != null) {
                admin.updateProductStatus(productId, req.status());
            }

            audit.record("PRODUCT_STOCK", productId, "UPDATE",
                    "{\"points\":" + before.points() + ",\"stock\":" + before.stock()
                            + ",\"status\":\"" + before.status() + "\"}",
                    "{\"points\":" + (req.points() == null ? before.points() : req.points())
                            + ",\"stock\":" + (req.stock() == null ? before.stock() : req.stock())
                            + ",\"status\":\"" + (req.status() == null ? before.status() : req.status()) + "\"}",
                    adminUser.id(), "商品部分更新");

            return toVo(productId);
        });
    }

    public Api.Page<OrderDto.OrderVo> listOrders(int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        List<OrderDto.OrderVo> items = orders.listAll(p, s).stream()
                .map(OrderMapper::toVo).toList();
        return new Api.Page<>(items, orders.countAll(), p, s);
    }

    /** 用户列表（只读）。完整的用户启停属于 #17，本次先满足管理端页面 */
    public Api.Page<com.gts.auth.AuthDto.UserVo> listUsers(int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        List<com.gts.auth.AuthDto.UserVo> items = admin.listUsers(p, s).stream()
                .map(u -> new com.gts.auth.AuthDto.UserVo(
                        u.userId(), u.nickname(), u.phone(), u.role(), u.avatarText(), u.points()))
                .toList();
        return new Api.Page<>(items, admin.countUsers(), p, s);
    }

    /** 管理端概览（只读聚合）。完整的运营统计属 #17，这里先保证页面可用 */
    public AdminDto.DashboardVo dashboard() {
        return new AdminDto.DashboardVo(
                admin.countUsersByRole("USER"),
                admin.countTrips(),
                admin.sumReduction(),
                admin.sumEarnedPoints(),
                admin.modeDistribution(),
                admin.dailyTrend());
    }

    /* ------------------------------------------------------------------ */

    private AdminRepository.AdminProductRow requireProduct(String productId) {
        return admin.findProduct(productId)
                .orElseThrow(() -> new Api.BizException(Api.Codes.PRODUCT_NOT_FOUND, 404, "商品不存在"));
    }

    private MallDto.ProductVo toVo(String productId) {
        AdminRepository.AdminProductRow r = requireProduct(productId);
        return new MallDto.ProductVo(r.productId(), r.name(), r.icon(), r.points(), r.stock(),
                r.status(), r.description());
    }

    private static int productIdSuffix() {
        return java.util.concurrent.ThreadLocalRandom.current().nextInt(1000, 10000);
    }
}
