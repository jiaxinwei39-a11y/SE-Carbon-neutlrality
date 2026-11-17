package com.gts.admin;

import com.gts.common.TimeUtil;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 只读一致性对账（UC-17 / TC-14）。
 *
 * 三条硬要求：
 *  1. **同一快照**：所有查询在一个 REPEATABLE READ 的只读事务里执行，
 *     不能拿"几秒前查的余额"和"现在查的流水"去比。
 *  2. **只读不修账**：只报告差异，绝不自动改余额、删流水或补记录。
 *  3. **读取失败要抛错**：不能让页面把"核对失败"显示成"账目无差异"。
 *     所以这里不吞异常，异常直接上抛由全局处理器变成 50000。
 */
@Service
public class ReconcileService {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate readOnlyTx;

    public ReconcileService(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.readOnlyTx = new TransactionTemplate(transactionManager);
        this.readOnlyTx.setReadOnly(true);
        this.readOnlyTx.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    public AdminDto.ReconcileResultVo check() {
        List<AdminDto.ReconcileItemVo> items;
        try {
            items = readOnlyTx.execute(status -> {
                List<AdminDto.ReconcileItemVo> list = new ArrayList<>();
                checkAccountBalance(list);
                checkLastSeq(list);
                checkSeqGap(list);
                checkTripEarn(list);
                checkTripAmount(list);
                checkOrderSpend(list);
                checkOrderReverse(list);
                checkTripCount(list);
                checkBalanceChain(list);
                return list;
            });
        } catch (RuntimeException e) {
            // 对账读取失败必须显式报错（50001），绝不能返回空数组被前端当成"无差异"
            throw new com.gts.common.Api.BizException(
                    com.gts.common.Api.Codes.RECONCILE_UNAVAILABLE, 500,
                    "对账服务暂不可用，请稍后重试");
        }
        return new AdminDto.ReconcileResultVo(TimeUtil.nowIso(), items == null ? List.of() : items);
    }

    /* ------------------------------------------------------------------ */

    private void checkAccountBalance(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT a.user_id, a.balance, COALESCE(SUM(l.amount), 0) AS ledger_sum
                FROM t_point_account a
                LEFT JOIN t_point_ledger l ON l.user_id = a.user_id
                GROUP BY a.user_id, a.balance
                HAVING a.balance <> ledger_sum
                """);
        for (Map<String, Object> r : rows) {
            add(items, "ACCOUNT", str(r.get("user_id")), "账户余额=流水合计",
                    dec(r.get("ledger_sum")), dec(r.get("balance")));
        }
    }

    private void checkLastSeq(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT a.user_id, a.last_seq, COALESCE(MAX(l.account_seq), 0) AS max_seq
                FROM t_point_account a
                LEFT JOIN t_point_ledger l ON l.user_id = a.user_id
                GROUP BY a.user_id, a.last_seq
                HAVING a.last_seq <> max_seq
                """);
        for (Map<String, Object> r : rows) {
            add(items, "ACCOUNT", str(r.get("user_id")), "last_seq=最大流水序号",
                    dec(r.get("max_seq")), dec(r.get("last_seq")));
        }
    }

    private void checkSeqGap(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT user_id, COUNT(*) AS cnt, MIN(account_seq) AS mn, MAX(account_seq) AS mx
                FROM t_point_ledger
                GROUP BY user_id
                HAVING MIN(account_seq) <> 1 OR MAX(account_seq) <> COUNT(*)
                """);
        for (Map<String, Object> r : rows) {
            add(items, "ACCOUNT", str(r.get("user_id")), "流水序号从1连续无断号",
                    dec(r.get("cnt")), dec(r.get("mx")));
        }
    }

    private void checkTripEarn(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT t.trip_id, t.awarded_points
                FROM t_trip t
                LEFT JOIN t_point_ledger l
                       ON l.ref_type = 'TRIP' AND l.ref_id = t.trip_id AND l.type = 'EARN'
                WHERE t.awarded_points > 0 AND l.id IS NULL
                """);
        for (Map<String, Object> r : rows) {
            add(items, "TRIP", str(r.get("trip_id")), "有积分行程必须有发放流水",
                    dec(r.get("awarded_points")), BigDecimal.ZERO);
        }
    }

    private void checkTripAmount(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT l.ref_id, l.amount, t.awarded_points
                FROM t_point_ledger l
                LEFT JOIN t_trip t ON t.trip_id = l.ref_id
                WHERE l.ref_type = 'TRIP' AND l.type = 'EARN'
                  AND (t.trip_id IS NULL OR t.awarded_points <> l.amount)
                """);
        for (Map<String, Object> r : rows) {
            add(items, "TRIP", str(r.get("ref_id")), "发放流水金额=行程积分",
                    dec(r.get("awarded_points")), dec(r.get("amount")));
        }
    }

    private void checkOrderSpend(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT o.order_id, o.total_points, l.amount
                FROM t_redemption_order o
                LEFT JOIN t_point_ledger l
                       ON l.ref_type = 'ORDER' AND l.ref_id = o.order_id AND l.type = 'SPEND'
                WHERE l.id IS NULL OR l.amount <> -o.total_points
                """);
        for (Map<String, Object> r : rows) {
            BigDecimal expected = dec(r.get("total_points")).negate();
            add(items, "ORDER", str(r.get("order_id")), "兑换流水=-订单总额",
                    expected, dec(r.get("amount")));
        }
    }

    private void checkOrderReverse(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT o.order_id, o.status, o.total_points,
                       COUNT(l.id) AS cnt, COALESCE(SUM(l.amount), 0) AS rev_sum
                FROM t_redemption_order o
                LEFT JOIN t_point_ledger l
                       ON l.ref_type = 'ORDER' AND l.ref_id = o.order_id AND l.type = 'REVERSE'
                GROUP BY o.order_id, o.status, o.total_points
                HAVING (o.status = 'CANCELLED' AND (COUNT(l.id) <> 1 OR COALESCE(SUM(l.amount), 0) <> o.total_points))
                    OR (o.status <> 'CANCELLED' AND COUNT(l.id) <> 0)
                """);
        for (Map<String, Object> r : rows) {
            add(items, "ORDER", str(r.get("order_id")), "已取消订单恰好一笔冲正",
                    dec(r.get("total_points")), dec(r.get("rev_sum")));
        }
    }

    private void checkTripCount(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT a.user_id, a.trip_count, COUNT(t.id) AS actual
                FROM t_point_account a
                LEFT JOIN t_trip t ON t.user_id = a.user_id
                GROUP BY a.user_id, a.trip_count
                HAVING a.trip_count <> COUNT(t.id)
                """);
        for (Map<String, Object> r : rows) {
            add(items, "ACCOUNT", str(r.get("user_id")), "行程数=实际行程条数",
                    dec(r.get("actual")), dec(r.get("trip_count")));
        }
    }

    /** 逐笔余额链：上一笔 balance_after + 本笔 amount 必须等于本笔 balance_after */
    private void checkBalanceChain(List<AdminDto.ReconcileItemVo> items) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT user_id, account_seq, amount, balance_after, prev_bal
                FROM (
                  SELECT user_id, account_seq, amount, balance_after,
                         LAG(balance_after, 1, 0) OVER (PARTITION BY user_id ORDER BY account_seq) AS prev_bal
                  FROM t_point_ledger
                ) x
                WHERE balance_after <> prev_bal + amount
                """);
        for (Map<String, Object> r : rows) {
            add(items, "ACCOUNT", str(r.get("user_id")) + "#" + str(r.get("account_seq")),
                    "余额链连续（上一笔余额+本笔变动）",
                    dec(r.get("prev_bal")).add(dec(r.get("amount"))), dec(r.get("balance_after")));
        }
    }

    private static void add(List<AdminDto.ReconcileItemVo> items, String type, String objectId,
                            String checkName, BigDecimal expected, BigDecimal actual) {
        items.add(new AdminDto.ReconcileItemVo(
                "R" + (items.size() + 1), type, objectId, checkName, expected, actual));
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static BigDecimal dec(Object o) {
        if (o == null) {
            return BigDecimal.ZERO;
        }
        if (o instanceof BigDecimal b) {
            return b;
        }
        return new BigDecimal(String.valueOf(o));
    }
}
