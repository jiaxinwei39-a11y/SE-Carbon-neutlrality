package com.gts;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 城市绿色出行碳减排积分系统 —— 后端入口。
 *
 * 当前实现范围（#10）：
 *   注册 / 登录 / 会话校验
 *   行程上报（含核算快照与幂等）
 *   积分账户与流水
 *   本人数据隔离
 *
 * 尚未实现（#12）：商城、兑换、订单、规则维护、对账。
 */
@SpringBootApplication
public class GtsApplication {
    public static void main(String[] args) {
        SpringApplication.run(GtsApplication.class, args);
    }
}
