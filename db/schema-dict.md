# 数据库字典

> 负责：郭浚文（#9）　数据库：`gts`　MySQL 8.4.11
> 本文件由 `information_schema` 从实际库导出，与 `db/schema.sql` 一致，非手写。
> 字段中文名取自建表语句的 `COMMENT`，可直接用于实验报告"表2-3 表名：XXXX"。

## 1. 表清单

| 序号 | 表名 | 中文名 | 字段数 |
|---|---|---|---|
| 1 | `t_user` | 用户 | 11 |
| 2 | `t_login_session` | 登录会话 | 6 |
| 3 | `t_merchant` | 商户 | 5 |
| 4 | `t_carbon_rule` | 碳核算规则（版本化） | 13 |
| 5 | `t_trip` | 行程记录（含核算快照） | 20 |
| 6 | `t_point_account` | 积分账户 | 8 |
| 7 | `t_point_ledger` | 积分流水（只追加） | 10 |
| 8 | `t_product` | 积分商品 | 12 |
| 9 | `t_redemption_order` | 兑换订单 | 15 |
| 10 | `t_audit_log` | 审计日志 | 9 |

## 2. 索引与约束清单

| 表名 | 索引名 | 唯一 | 字段 |
|---|---|---|---|
| `t_user` | `idx_user_role_status` | 否 | role,status |
| `t_user` | `PRIMARY` | 是 | id |
| `t_user` | `uk_user_login_account` | 是 | login_account |
| `t_user` | `uk_user_phone` | 是 | phone |
| `t_user` | `uk_user_user_id` | 是 | user_id |
| `t_login_session` | `idx_session_user` | 否 | user_id |
| `t_login_session` | `PRIMARY` | 是 | id |
| `t_login_session` | `uk_session_token` | 是 | token_hash |
| `t_merchant` | `PRIMARY` | 是 | id |
| `t_merchant` | `uk_merchant_id` | 是 | merchant_id |
| `t_carbon_rule` | `fk_rule_creator` | 否 | created_by |
| `t_carbon_rule` | `idx_rule_mode_time` | 否 | mode,effective_from,effective_to |
| `t_carbon_rule` | `idx_rule_status` | 否 | status |
| `t_carbon_rule` | `PRIMARY` | 是 | id |
| `t_carbon_rule` | `uk_rule_rule_id` | 是 | rule_id |
| `t_trip` | `idx_trip_rule` | 否 | rule_id |
| `t_trip` | `idx_trip_user_created` | 否 | user_id,created_at |
| `t_trip` | `idx_trip_user_mode` | 否 | user_id,mode |
| `t_trip` | `PRIMARY` | 是 | id |
| `t_trip` | `uk_trip_trip_id` | 是 | trip_id |
| `t_trip` | `uk_trip_user_client` | 是 | user_id,client_trip_id |
| `t_point_account` | `PRIMARY` | 是 | user_id |
| `t_point_ledger` | `idx_ledger_user_created` | 否 | user_id,created_at |
| `t_point_ledger` | `idx_ledger_user_type` | 否 | user_id,type |
| `t_point_ledger` | `PRIMARY` | 是 | id |
| `t_point_ledger` | `uk_ledger_biz` | 是 | ref_type,ref_id,type |
| `t_point_ledger` | `uk_ledger_ledger_no` | 是 | ledger_no |
| `t_product` | `idx_product_merchant` | 否 | merchant_id |
| `t_product` | `idx_product_status` | 否 | status |
| `t_product` | `PRIMARY` | 是 | id |
| `t_product` | `uk_product_product_id` | 是 | product_id |
| `t_redemption_order` | `fk_order_processor` | 否 | processed_by |
| `t_redemption_order` | `idx_order_product` | 否 | product_id |
| `t_redemption_order` | `idx_order_status_created` | 否 | status,created_at |
| `t_redemption_order` | `idx_order_user_status` | 否 | user_id,status |
| `t_redemption_order` | `PRIMARY` | 是 | id |
| `t_redemption_order` | `uk_order_order_id` | 是 | order_id |
| `t_redemption_order` | `uk_order_user_request` | 是 | user_id,request_id |
| `t_audit_log` | `idx_audit_biz` | 否 | biz_type,biz_id |
| `t_audit_log` | `idx_audit_created` | 否 | created_at |
| `t_audit_log` | `idx_audit_operator` | 否 | operator_id |
| `t_audit_log` | `PRIMARY` | 是 | id |

## 3. 逐字段字典

### t_user　用户

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 对外用户编号 | `user_id` | varchar | 32 | - | UK | 否 |  |  |
| 3 | 登录账号：普通用户=手机号 | `login_account` | varchar | 64 | - | UK | 否 |  |  |
| 4 | 手机号 | `phone` | varchar | 32 | - | UK | 是 |  |  |
| 5 | 昵称/姓名 | `nickname` | varchar | 64 | - |  | 否 |  |  |
| 6 | 口令哈希 | `password_hash` | varchar | 255 | - |  | 否 |  |  |
| 7 | 角色：USER 普通用户 / ADMIN 运营管理员 | `role` | varchar | 16 | - | IDX | 否 | USER |  |
| 8 | 状态：ENABLED 启用 / DISABLED 停用 | `status` | varchar | 16 | - |  | 否 | ENABLED |  |
| 9 | 头像文字 | `avatar_text` | varchar | 8 | - |  | 否 |  |  |
| 10 | 创建时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |
| 11 | 更新时间 | `updated_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_login_session　登录会话

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | token 的 SHA-256 十六进制 | `token_hash` | char | 64 | - | UK | 否 |  |  |
| 3 | 所属用户 | `user_id` | bigint | - | - | FK → t_user.id | 否 |  |  |
| 4 | 签发时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |
| 5 | 过期时间 | `expires_at` | datetime | 3 | - |  | 否 |  |  |
| 6 | 注销时间 | `revoked_at` | datetime | 3 | - |  | 是 |  |  |

### t_merchant　商户

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 对外商户编号 | `merchant_id` | varchar | 32 | - | UK | 否 |  |  |
| 3 | 商户名称 | `name` | varchar | 64 | - |  | 否 |  |  |
| 4 | 状态：ACTIVE 合作中 / INACTIVE 已停用 | `status` | varchar | 16 | - |  | 否 | ACTIVE |  |
| 5 | 创建时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_carbon_rule　碳核算规则（版本化）

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 对外规则编号 | `rule_id` | varchar | 32 | - | UK | 否 |  |  |
| 3 | 出行方式：BUS/SUBWAY/BIKE/WALK | `mode` | varchar | 16 | - | IDX | 否 |  |  |
| 4 | 基准排放因子 | `base_factor` | decimal | 18 | 9 |  | 否 |  |  |
| 5 | 该方式实际排放因子 | `mode_factor` | decimal | 18 | 9 |  | 否 |  |  |
| 6 | 积分系数 | `points_ratio` | decimal | 18 | 9 |  | 否 |  |  |
| 7 | 生效时间 | `effective_from` | datetime | 3 | - |  | 否 |  |  |
| 8 | 失效时间 | `effective_to` | datetime | 3 | - |  | 是 |  |  |
| 9 | 规则版本号 | `version` | varchar | 32 | - |  | 否 |  |  |
| 10 | 状态：ACTIVE 生效 / ARCHIVED 已归档 | `status` | varchar | 16 | - | IDX | 否 | ACTIVE |  |
| 11 | 创建人 | `created_by` | bigint | - | - | FK → t_user.id | 是 |  |  |
| 12 | 变更原因 | `change_reason` | varchar | 255 | - |  | 是 |  |  |
| 13 | 创建时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_trip　行程记录（含核算快照）

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 对外行程编号 | `trip_id` | varchar | 64 | - | UK | 否 |  |  |
| 3 | 所属用户 | `user_id` | bigint | - | - | FK → t_user.id | 否 |  |  |
| 4 | 客户端行程号 | `client_trip_id` | varchar | 64 | - |  | 否 |  |  |
| 5 | 出行方式 | `mode` | varchar | 16 | - |  | 否 |  |  |
| 6 | 模拟里程 | `distance_km` | decimal | 18 | 9 |  | 否 |  |  |
| 7 | 起点 | `start_place` | varchar | 128 | - |  | 否 |  |  |
| 8 | 终点 | `end_place` | varchar | 128 | - |  | 否 |  |  |
| 9 | 行程开始时间 | `start_time` | datetime | 3 | - |  | 否 |  |  |
| 10 | 行程结束时间 | `end_time` | datetime | 3 | - |  | 否 |  |  |
| 11 | 核算时的基准因子快照 | `base_factor` | decimal | 18 | 9 |  | 否 |  |  |
| 12 | 核算时的方式因子快照 | `mode_factor` | decimal | 18 | 9 |  | 否 |  |  |
| 13 | 核算时的积分系数快照 | `points_ratio` | decimal | 18 | 9 |  | 否 |  |  |
| 14 | 碳减排量 | `reduction_kg` | decimal | 18 | 9 |  | 否 |  |  |
| 15 | 本次发放积分 | `awarded_points` | bigint | - | - |  | 否 | 0 |  |
| 16 | 匹配到的规则 | `rule_id` | bigint | - | - | FK → t_carbon_rule.id | 是 |  |  |
| 17 | 规则版本快照 | `rule_version` | varchar | 32 | - |  | 否 |  |  |
| 18 | 状态：POINTED 已入账 | `status` | varchar | 16 | - |  | 否 | POINTED |  |
| 19 | 核算时间 | `calculated_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |
| 20 | 创建时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_point_account　积分账户

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 账户主键=用户 | `user_id` | bigint | - | - | FK → t_user.id | 否 |  |  |
| 2 | 当前可用积分 | `balance` | bigint | - | - |  | 否 | 0 |  |
| 3 | 累计获得积分 | `total_earned` | bigint | - | - |  | 否 | 0 |  |
| 4 | 累计消费积分 | `total_spent` | bigint | - | - |  | 否 | 0 |  |
| 5 | 有效行程数 | `trip_count` | bigint | - | - |  | 否 | 0 |  |
| 6 | 累计碳减排量 | `total_reduction_kg` | decimal | 18 | 9 |  | 否 | 0.000000000 |  |
| 7 | 乐观锁版本号 | `version` | int | - | - |  | 否 | 0 |  |
| 8 | 更新时间 | `updated_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_point_ledger　积分流水（只追加）

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 对外流水号 | `ledger_no` | varchar | 64 | - | UK | 否 |  |  |
| 3 | 所属用户 | `user_id` | bigint | - | - | FK → t_user.id | 否 |  |  |
| 4 | 类型：EARN 入账 / SPEND 消费 / REVERSE 冲正 | `type` | varchar | 16 | - |  | 否 |  |  |
| 5 | 流水摘要 | `title` | varchar | 128 | - |  | 否 |  |  |
| 6 | 本次变动积分 | `amount` | bigint | - | - |  | 否 |  |  |
| 7 | 变动后余额 | `balance_after` | bigint | - | - |  | 否 |  |  |
| 8 | 业务类型：TRIP 行程 / ORDER 订单 | `ref_type` | varchar | 16 | - | IDX | 否 |  |  |
| 9 | 业务编号：trip_id 或 order_id | `ref_id` | varchar | 64 | - |  | 否 |  |  |
| 10 | 发生时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_product　积分商品

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 对外商品编号 | `product_id` | varchar | 64 | - | UK | 否 |  |  |
| 3 | 所属商户 | `merchant_id` | bigint | - | - | FK → t_merchant.id | 否 |  |  |
| 4 | 商品名称 | `name` | varchar | 128 | - |  | 否 |  |  |
| 5 | 商品图标 | `icon` | varchar | 64 | - |  | 否 | ? |  |
| 6 | 兑换所需积分 | `points` | bigint | - | - |  | 否 |  |  |
| 7 | 可兑换库存 | `stock` | int | - | - |  | 否 | 0 |  |
| 8 | 状态：ON 上架 / OFF 下架 | `status` | varchar | 16 | - | IDX | 否 | ON |  |
| 9 | 商品描述 | `description` | varchar | 255 | - |  | 是 |  |  |
| 10 | 乐观锁版本号 | `version` | int | - | - |  | 否 | 0 |  |
| 11 | 创建时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |
| 12 | 更新时间 | `updated_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_redemption_order　兑换订单

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 对外订单号 | `order_id` | varchar | 64 | - | UK | 否 |  |  |
| 3 | 下单用户 | `user_id` | bigint | - | - | FK → t_user.id | 否 |  |  |
| 4 | 商品 | `product_id` | bigint | - | - | FK → t_product.id | 否 |  |  |
| 5 | 下单时商品名称快照 | `product_name` | varchar | 128 | - |  | 否 |  |  |
| 6 | 下单时商品图标快照 | `product_icon` | varchar | 64 | - |  | 否 | ? |  |
| 7 | 兑换数量 | `quantity` | int | - | - |  | 否 |  |  |
| 8 | 下单时单价快照 | `unit_points` | bigint | - | - |  | 否 |  |  |
| 9 | 本次消耗积分=单价×数量 | `total_points` | bigint | - | - |  | 否 |  |  |
| 10 | 状态：CREATED 待发放 / FULFILLED 已完成 / CANCELLED 已取消 | `status` | varchar | 16 | - | IDX | 否 | CREATED |  |
| 11 | 客户端请求号 | `request_id` | varchar | 64 | - |  | 否 |  |  |
| 12 | 取消原因 | `cancel_reason` | varchar | 255 | - |  | 是 |  |  |
| 13 | 处理人 | `processed_by` | bigint | - | - | FK → t_user.id | 是 |  |  |
| 14 | 处理时间 | `processed_at` | datetime | 3 | - |  | 是 |  |  |
| 15 | 下单时间 | `created_at` | datetime | 3 | - |  | 否 | CURRENT_TIMESTAMP |  |

### t_audit_log　审计日志

| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 内部主键 | `id` | bigint | - | - | PK | 否 |  |  |
| 2 | 业务类型：CARBON_RULE / PRODUCT_STOCK / REDEMPTION_ORDER / USER_STATUS | `biz_type` | varchar | 32 | - | IDX | 否 |  |  |
| 3 | 业务编号 | `biz_id` | varchar | 64 | - |  | 否 |  |  |
| 4 | 动作：CREATE / UPDATE / CANCEL / FULFILL / ENABLE / DISABLE | `action` | varchar | 32 | - |  | 否 |  |  |
| 5 | 变更前值 | `before_value` | json | - | - |  | 是 |  |  |
| 6 | 变更后值 | `after_value` | json | - | - |  | 是 |  |  |
| 7 | 操作人 | `operator_id` | bigint | - | - | FK → t_user.id | 否 |  |  |
| 8 | 变更原因 | `reason` | varchar | 255 | - |  | 是 |  |  |
| 9 | 操作时间 | `created_at` | datetime | 3 | - | IDX | 否 | CURRENT_TIMESTAMP |  |
