package com.gts.admin;

import com.gts.audit.AuditRepository;
import com.gts.auth.LoginUser;
import com.gts.common.Api;
import com.gts.common.TimeUtil;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 碳核算规则的版本化维护。
 *
 * 三条约束（TC-06 / TC-17 要验的）：
 *  1. 同一出行方式的生效区间**不得重叠** —— 数据库无法用 CHECK 表达跨行比较，
 *     所以用 t_rule_mode_lock 的行锁把同一方式的变更串行化，再在事务内校验。
 *  2. 已发布的因子**不覆盖** —— 只允许"结束旧区间 + 插入新版本"，从不 UPDATE 旧版本的因子。
 *  3. 禁止追溯 —— 新版本的 effectiveFrom 必须晚于或等于已有区间的边界，
 *     重叠即拒绝，因此不会把新规则插到历史区间中间。
 */
@Service
public class RuleService {

    // 精确到毫秒并带随机后缀：同一秒内连续创建两条规则时，只到秒的编号会撞主键
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final AdminRepository admin;
    private final AuditRepository audit;
    private final TransactionTemplate tx;

    public RuleService(AdminRepository admin, AuditRepository audit,
                       PlatformTransactionManager transactionManager) {
        this.admin = admin;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public List<AdminDto.CarbonRuleVo> list() {
        return admin.listRules().stream().map(this::toVo).toList();
    }

    public AdminDto.CarbonRuleVo create(LoginUser operator, AdminDto.RuleCreateRequest req) {
        String mode = req.mode() == null ? "" : req.mode().trim().toUpperCase();
        if (!List.of("BUS", "SUBWAY", "BIKE", "WALK").contains(mode)) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "不支持的出行方式：" + req.mode());
        }
        if (req.baseFactor().signum() < 0 || req.modeFactor().signum() < 0 || req.pointsRatio().signum() < 0) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "排放因子和积分系数不能为负");
        }
        LocalDateTime from = TimeUtil.parseIso(req.effectiveFrom());
        LocalDateTime to = (req.effectiveTo() == null || req.effectiveTo().isBlank())
                ? null : TimeUtil.parseIso(req.effectiveTo());
        if (to != null && !to.isAfter(from)) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "失效时间必须晚于生效时间");
        }

        return tx.execute(status -> createInTx(operator, req, mode, from, to));
    }

    private AdminDto.CarbonRuleVo createInTx(LoginUser operator, AdminDto.RuleCreateRequest req,
                                             String mode, LocalDateTime from, LocalDateTime to) {
        // 1) 先锁该方式的串行化闸门。
        //    追溯校验必须放在拿锁之后：如果先校验再等锁，请求可能在锁上等好几秒，
        //    等它真正执行时"未来"的起点已经变成过去（评审实测等待 9 秒后仍放行）。
        admin.lockMode(mode);

        // 2) 拿到锁之后重新取服务端当前时间，做禁止追溯校验（BR-01 / TC-06）。
        //    不设容差：生效时间必须不早于此刻。客户端若要"立即生效"，
        //    应提交略晚于当前时刻的时间，而不是让服务端容忍一段历史。
        LocalDateTime now = LocalDateTime.now(TimeUtil.ZONE);
        if (from.isBefore(now)) {
            throw new Api.BizException(Api.Codes.RULE_RETROACTIVE, 409,
                    "规则不能追溯生效：生效时间必须不早于当前时间（服务端当前为 "
                            + TimeUtil.toIso(now) + "）");
        }
        if (to != null && !to.isAfter(from)) {
            throw new Api.BizException(Api.Codes.PARAM_INVALID, 400, "失效时间必须晚于生效时间");
        }

        // 3) 加锁读该方式全部规则（当前读，能看到并发对手刚提交的行）
        List<AdminRepository.RuleRow> existing = admin.listRulesByModeForUpdate(mode);

        // 3) 区间判定：
        //    - 旧规则若"开放到无限"且起点早于新起点 → 正常版本交替，截断到新起点，不算冲突
        //    - 旧规则若已封闭且与新区间相交 → 真冲突
        //    - 旧规则起点落在新区间内 → 真冲突（新规则会覆盖已有版本）
        List<AdminRepository.RuleRow> toClose = new java.util.ArrayList<>();
        for (AdminRepository.RuleRow r : existing) {
            LocalDateTime rFrom = r.effectiveFrom();
            LocalDateTime rTo = r.effectiveTo();
            if (rFrom.isBefore(from)) {
                if (rTo == null) {
                    toClose.add(r);
                } else if (rTo.isAfter(from)) {
                    throw overlapError(r);
                }
            } else {
                if (to == null || rFrom.isBefore(to)) {
                    throw overlapError(r);
                }
            }
        }

        // 4) 截断被覆盖的开放区间（只改结束时间，从不改旧版本的因子）
        for (AdminRepository.RuleRow r : toClose) {
            admin.closeRule(r.id(), from);
            audit.record("CARBON_RULE", r.ruleId(), "UPDATE",
                    "{\"effectiveTo\":null}", "{\"effectiveTo\":\"" + from + "\"}", operator.id(),
                    "新版本生效，结束旧区间");
        }

        String ruleId = "R-" + LocalDateTime.now(TimeUtil.ZONE).format(TS) + "-"
                + java.util.concurrent.ThreadLocalRandom.current().nextInt(100, 1000) + "-" + mode;
        admin.insertRule(ruleId, mode, req.baseFactor(), req.modeFactor(), req.pointsRatio(), from, to, ruleId);

        audit.record("CARBON_RULE", ruleId, "CREATE", null,
                "{\"mode\":\"" + mode + "\",\"from\":\"" + from + "\"}", operator.id(),
                "新增规则版本");

        // 返回刚插入的那条（按 rule_id 反查保证字段与实际库一致）
        return admin.listRules().stream()
                .filter(r -> r.ruleId().equals(ruleId))
                .findFirst()
                .map(this::toVo)
                .orElseThrow();
    }

    private static Api.BizException overlapError(AdminRepository.RuleRow r) {
        return new Api.BizException(Api.Codes.RULE_INTERVAL_OVERLAP, 409,
                "与已发布规则 " + r.ruleId() + " 的生效区间重叠（该规则自 "
                        + r.effectiveFrom().toLocalDate() + " 起），不能覆盖已发布版本");
    }

    private AdminDto.CarbonRuleVo toVo(AdminRepository.RuleRow r) {
        // 前端契约里 effectiveFrom 是日期（"2026-11-01"），不是完整时间戳；
        // 规则列表页面直接原样渲染这个字段，返回 ISO 时间会显示成 2026-11-01T08:00:00.000Z
        return new AdminDto.CarbonRuleVo(
                r.ruleId(), r.version(), r.mode(), r.baseFactor(), r.modeFactor(), r.pointsRatio(),
                r.effectiveFrom().toLocalDate().toString(), r.status());
    }
}
