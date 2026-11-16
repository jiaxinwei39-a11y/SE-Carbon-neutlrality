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

    public Api.Page<OrderDto.OrderVo> listOrders(int page, int size) {
        int p = page < 1 ? 1 : page;
        int s = size < 1 ? 10 : Math.min(size, 100);
        List<OrderDto.OrderVo> items = orders.listAll(p, s).stream()
                .map(OrderMapper::toVo).toList();
        return new Api.Page<>(items, orders.countAll(), p, s);
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
