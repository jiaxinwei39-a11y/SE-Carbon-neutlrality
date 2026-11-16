-- =============================================================================
--  城市绿色出行碳减排积分系统 —— 数据库初始化脚本（结构版本 V2）
--  项目：软件工程实验 项目14        负责：郭浚文（#9）
--  目标库：MySQL 8.0.16+（本机为 MySQL 8.4）  字符集：utf8mb4
--
--  使用方法（空库初始化）：
--      mysql -uroot -p < db/schema.sql
--      mysql -uroot -p gts < db/seed.sql
--
--  【本文件 = 全新安装的最终结构】
--   既有库升级请走 db/migrations/：先 V1 再 V2，不要直接执行本文件。
--   版本记录写入 t_schema_version。
--
--  V2 相对 V1 的变化（对应 PR #28 评审意见 3）：
--   1. t_point_account 增加 last_seq，作为"账户内流水序号"的锁内游标
--   2. t_point_ledger 增加 account_seq，并加 UQ(user_id, account_seq)
--      —— 流水在账户内必须连续且唯一，不能靠时间戳或全局自增 id 来表达
--   3. 新增 t_rule_mode_lock（四种出行方式各一行），规则变更前先锁对应行，
--      再校验同方式生效区间不重叠
--   4. t_carbon_rule 增加 UQ(mode, effective_from) 作为区间起点的兜底约束
--   5. 新增 t_schema_version 记录结构版本
--
--  10 张业务表与用例映射：
--      t_user            UC-01/02/03/15    账户与权限
--      t_login_session   UC-02             登录会话
--      t_merchant        UC-12             商户（MVP 由管理员代办）
--      t_carbon_rule     UC-16             碳核算规则版本
--      t_trip            UC-04/05/06       行程与核算快照
--      t_point_account   UC-07             积分账户（含流水序号游标）
--      t_point_ledger    UC-08             积分流水（只追加，账户内有序）
--      t_product         UC-09/12          商品与库存
--      t_redemption_order UC-10/11/13      兑换订单
--      t_audit_log       UC-17/NFR-08      审计日志
--    技术表：t_rule_mode_lock（规则串行化）、t_schema_version（结构版本）
--
--  设计要点（答辩会被问，务必能讲）：
--   1. 每张表都有 id（内部主键）与 xxx_id（对外业务编号），
--      接口只暴露业务编号，避免前端拿到自增 id 推断数据量。
--   2. 幂等靠数据库唯一约束兜底，不靠应用层先查后插：
--        t_trip              UNIQUE(user_id, client_trip_id)
--        t_redemption_order  UNIQUE(user_id, request_id)
--        t_point_ledger      UNIQUE(ref_type, ref_id, type)
--      并发下第二次插入必然失败，捕获唯一键冲突即可返回已有结果。
--   3. 积分余额、库存都加 CHECK (>=0) 作为最后一道防线，
--      业务层仍需先校验并给出提示，不能靠数据库抛异常当业务错误。
--   4. 行程表冗余保存核算因子（base_factor / mode_factor / points_ratio），
--      这是"快照"，不是冗余设计错误：规则改版后历史结果必须可复现。
--   5. 流水顺序：同一账户内 account_seq 由 1 开始连续递增，
--      分配方式为"先锁账户行 → last_seq = last_seq + 1 → 用新值写流水"，
--      写流水与扣/加分在同一事务内完成。见 db/README.md 第 3 节。
-- =============================================================================

CREATE DATABASE IF NOT EXISTS gts
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE gts;

-- -----------------------------------------------------------------------------
-- 0. 结构版本（迁移用，见 db/migrations/）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_schema_version (
  version     VARCHAR(32)  NOT NULL                COMMENT '结构版本号，如 V1、V2',
  description VARCHAR(255) NULL                    COMMENT '本次变更说明',
  applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '应用时间',
  PRIMARY KEY (version)
) ENGINE = InnoDB COMMENT = '数据库结构版本记录';

-- -----------------------------------------------------------------------------
-- 1. 用户
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_user (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  user_id       VARCHAR(32)  NOT NULL                COMMENT '对外用户编号，如 U001',
  login_account VARCHAR(64)  NOT NULL                COMMENT '登录账号：普通用户=手机号，管理员=admin',
  phone         VARCHAR(32)  NULL                    COMMENT '手机号，管理员可为空',
  nickname      VARCHAR(64)  NOT NULL                COMMENT '昵称/姓名',
  password_hash VARCHAR(255) NOT NULL                COMMENT '口令哈希，格式 pbkdf2_sha256$迭代$盐$哈希，禁止存明文',
  role          VARCHAR(16)  NOT NULL DEFAULT 'USER' COMMENT '角色：USER 普通用户 / ADMIN 运营管理员',
  status        VARCHAR(16)  NOT NULL DEFAULT 'ENABLED' COMMENT '状态：ENABLED 启用 / DISABLED 停用',
  avatar_text   VARCHAR(8)   NOT NULL DEFAULT ''     COMMENT '头像文字（前端直接显示，取昵称首字）',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_user_id (user_id),
  UNIQUE KEY uk_user_login_account (login_account),
  UNIQUE KEY uk_user_phone (phone),
  KEY idx_user_role_status (role, status),
  CONSTRAINT ck_user_role   CHECK (role IN ('USER', 'ADMIN')),
  CONSTRAINT ck_user_status CHECK (status IN ('ENABLED', 'DISABLED'))
) ENGINE = InnoDB COMMENT = '用户';

-- -----------------------------------------------------------------------------
-- 2. 登录会话
--    只存 token 的 SHA-256，不存原文：库被看到也无法直接冒用会话（NFR-12）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_login_session (
  id         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  token_hash CHAR(64)    NOT NULL                COMMENT 'token 的 SHA-256 十六进制，不存原文',
  user_id    BIGINT      NOT NULL                COMMENT '所属用户，t_user.id',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '签发时间',
  expires_at DATETIME(3) NOT NULL                COMMENT '过期时间',
  revoked_at DATETIME(3) NULL                    COMMENT '注销时间，NULL 表示未注销',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_token (token_hash),
  KEY idx_session_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '登录会话';

-- -----------------------------------------------------------------------------
-- 3. 商户（MVP 无独立登录端，由运营管理员代办）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_merchant (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  merchant_id VARCHAR(32) NOT NULL                COMMENT '对外商户编号，如 M001',
  name        VARCHAR(64) NOT NULL                COMMENT '商户名称',
  status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE 合作中 / INACTIVE 已停用',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_merchant_id (merchant_id),
  CONSTRAINT ck_merchant_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
) ENGINE = InnoDB COMMENT = '商户';

-- -----------------------------------------------------------------------------
-- 4. 规则串行化锁（技术表，不是领域实体）
--    四种出行方式各一行。变更规则时先 SELECT ... FOR UPDATE 锁对应行，
--    再校验同方式生效区间，最后原子地结束旧区间并插入新版本。
--    数据库没有"区间不重叠"约束，靠这张表的行锁把并发写串行化。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_rule_mode_lock (
  travel_mode VARCHAR(16) NOT NULL COMMENT '出行方式，四种各一行',
  PRIMARY KEY (travel_mode),
  CONSTRAINT ck_rule_lock_mode CHECK (travel_mode IN ('BUS', 'SUBWAY', 'BIKE', 'WALK'))
) ENGINE = InnoDB COMMENT = '规则串行化锁表';

-- -----------------------------------------------------------------------------
-- 5. 碳核算规则（版本化，不覆盖历史）
--    effective_to 为 NULL 表示"当前有效、尚未结束"
--    同一 mode 的生效区间不得重叠：写入前锁 t_rule_mode_lock 对应行；
--    UQ(mode, effective_from) 保证同一方式不会出现两个同起点的版本。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_carbon_rule (
  id             BIGINT        NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  rule_id        VARCHAR(32)   NOT NULL                COMMENT '对外规则编号，如 R-2026-11-BUS',
  mode           VARCHAR(16)   NOT NULL                COMMENT '出行方式：BUS/SUBWAY/BIKE/WALK',
  base_factor    DECIMAL(18,9) NOT NULL                COMMENT '基准排放因子（kg CO2e/km），燃油小汽车单人',
  mode_factor    DECIMAL(18,9) NOT NULL                COMMENT '该方式实际排放因子（kg CO2e/km）',
  points_ratio   DECIMAL(18,9) NOT NULL                COMMENT '积分系数（分/kg），发放积分=floor(减排量×系数)',
  effective_from DATETIME(3)   NOT NULL                COMMENT '生效时间（含）',
  effective_to   DATETIME(3)   NULL                    COMMENT '失效时间（不含），NULL=至今有效',
  version        VARCHAR(32)   NOT NULL                COMMENT '规则版本号，与 rule_id 一起标识一次修订',
  status         VARCHAR(16)   NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE 生效 / ARCHIVED 已归档',
  created_by     BIGINT        NULL                    COMMENT '创建人，t_user.id',
  change_reason  VARCHAR(255)  NULL                    COMMENT '变更原因（审计要求，NFR-08）',
  created_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_rule_id (rule_id),
  UNIQUE KEY uk_rule_mode_from (mode, effective_from),
  KEY idx_rule_mode_time (mode, effective_from, effective_to),
  KEY idx_rule_status (status),
  CONSTRAINT ck_rule_mode CHECK (mode IN ('BUS', 'SUBWAY', 'BIKE', 'WALK')),
  CONSTRAINT ck_rule_factor CHECK (base_factor >= 0 AND mode_factor >= 0 AND points_ratio >= 0),
  CONSTRAINT ck_rule_interval CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT fk_rule_creator FOREIGN KEY (created_by) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '碳核算规则（版本化）';

-- -----------------------------------------------------------------------------
-- 6. 行程记录（含核算快照）
--    status 只写 POINTED：设计约定核算失败不落库（BR-04），
--    PENDING/FAILED 保留给前端枚举兼容，实际不会写进本表。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_trip (
  id            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  trip_id       VARCHAR(64)   NOT NULL                COMMENT '对外行程编号，服务端生成',
  user_id       BIGINT        NOT NULL                COMMENT '所属用户，t_user.id',
  client_trip_id VARCHAR(64)  NOT NULL                COMMENT '客户端行程号，幂等键（同一用户内唯一）',
  mode          VARCHAR(16)   NOT NULL                COMMENT '出行方式',
  distance_km   DECIMAL(18,9) NOT NULL                COMMENT '模拟里程（公里），>0 且 <=200',
  start_place   VARCHAR(128)  NOT NULL                COMMENT '起点',
  end_place     VARCHAR(128)  NOT NULL                COMMENT '终点',
  start_time    DATETIME(3)   NOT NULL                COMMENT '行程开始时间',
  end_time      DATETIME(3)   NOT NULL                COMMENT '行程结束时间，用于匹配规则',
  base_factor   DECIMAL(18,9) NOT NULL                COMMENT '核算时的基准因子快照',
  mode_factor   DECIMAL(18,9) NOT NULL                COMMENT '核算时的方式因子快照',
  points_ratio  DECIMAL(18,9) NOT NULL                COMMENT '核算时的积分系数快照',
  reduction_kg  DECIMAL(18,9) NOT NULL                COMMENT '碳减排量（kg），max(0, 基准-实际)',
  awarded_points BIGINT       NOT NULL DEFAULT 0      COMMENT '本次发放积分，向下取整后结果',
  rule_id       BIGINT        NULL                    COMMENT '匹配到的规则，t_carbon_rule.id',
  rule_version  VARCHAR(32)   NOT NULL                COMMENT '规则版本快照，历史可追溯',
  status        VARCHAR(16)   NOT NULL DEFAULT 'POINTED' COMMENT '状态：POINTED 已入账（当前唯一落库值）',
  calculated_at DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '核算时间',
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_trip_trip_id (trip_id),
  UNIQUE KEY uk_trip_user_client (user_id, client_trip_id),
  KEY idx_trip_user_created (user_id, created_at),
  KEY idx_trip_user_mode (user_id, mode),
  KEY idx_trip_rule (rule_id),
  CONSTRAINT ck_trip_mode CHECK (mode IN ('BUS', 'SUBWAY', 'BIKE', 'WALK')),
  CONSTRAINT ck_trip_distance CHECK (distance_km > 0 AND distance_km <= 200),
  CONSTRAINT ck_trip_time CHECK (end_time > start_time),
  CONSTRAINT ck_trip_points CHECK (awarded_points >= 0),
  CONSTRAINT fk_trip_user FOREIGN KEY (user_id) REFERENCES t_user (id),
  CONSTRAINT fk_trip_rule FOREIGN KEY (rule_id) REFERENCES t_carbon_rule (id)
) ENGINE = InnoDB COMMENT = '行程记录（含核算快照）';

-- -----------------------------------------------------------------------------
-- 7. 积分账户（一人一户）
--    last_seq：账户内流水序号游标。分配序号时必须先锁本行（FOR UPDATE），
--              再 last_seq = last_seq + 1，用新值作为 account_seq 写流水。
--    total_earned / total_spent / trip_count / total_reduction_kg 是汇总冗余字段，
--    存在的意义就是"给对账当期望值"：与流水汇总不一致即说明有账实差异（UC-17）。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_point_account (
  user_id            BIGINT      NOT NULL                COMMENT '账户主键=用户，t_user.id',
  balance            BIGINT      NOT NULL DEFAULT 0      COMMENT '当前可用积分，不得为负',
  total_earned       BIGINT      NOT NULL DEFAULT 0      COMMENT '累计获得积分',
  total_spent        BIGINT      NOT NULL DEFAULT 0      COMMENT '累计消费积分（不含已冲正）',
  trip_count         BIGINT      NOT NULL DEFAULT 0      COMMENT '有效行程数',
  total_reduction_kg DECIMAL(18,9) NOT NULL DEFAULT 0    COMMENT '累计碳减排量（kg）',
  last_seq           BIGINT      NOT NULL DEFAULT 0      COMMENT '账户内流水序号游标，锁内自增后分配给 account_seq',
  version            INT         NOT NULL DEFAULT 0      COMMENT '乐观锁版本号，每次变动 +1',
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (user_id),
  CONSTRAINT ck_account_balance CHECK (balance >= 0),
  CONSTRAINT ck_account_last_seq CHECK (last_seq >= 0),
  CONSTRAINT fk_account_user FOREIGN KEY (user_id) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '积分账户';

-- -----------------------------------------------------------------------------
-- 8. 积分流水（只追加，不更新不删除）
--    account_seq：账户内序号，从 1 开始连续递增，UQ(user_id, account_seq) 保证唯一。
--      用途：对账时按序号逐条核对"上一笔余额 + 本笔变动 = 本笔余额"，
--      全局自增 id 和时间戳都不能替代（并发下 id 有空洞、时间可同毫秒）。
--    UNIQUE(ref_type, ref_id, type) 保证：
--      一次行程只能有一笔 EARN；一个订单只能有一笔 SPEND、一笔 REVERSE。
--    这是"不重复发放/不重复冲正"的最终防线（BR-04、BR-06）。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_point_ledger (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  ledger_no     VARCHAR(64)  NOT NULL                COMMENT '对外流水号，如 PL20261115000001',
  user_id       BIGINT       NOT NULL                COMMENT '所属账户=用户，t_point_account.user_id',
  account_seq   BIGINT       NOT NULL                COMMENT '账户内流水序号，从 1 连续递增，锁内分配',
  type          VARCHAR(16)  NOT NULL                COMMENT '类型：EARN 入账 / SPEND 消费 / REVERSE 冲正',
  title         VARCHAR(128) NOT NULL                COMMENT '流水摘要，直接展示给用户',
  amount        BIGINT       NOT NULL                COMMENT '本次变动积分，正数入账、负数出账、冲正为正',
  balance_after BIGINT       NOT NULL                COMMENT '变动后余额',
  ref_type      VARCHAR(16)  NOT NULL                COMMENT '业务类型：TRIP 行程 / ORDER 订单',
  ref_id        VARCHAR(64)  NOT NULL                COMMENT '业务编号：trip_id 或 order_id',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发生时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ledger_ledger_no (ledger_no),
  UNIQUE KEY uk_ledger_account_seq (user_id, account_seq),
  UNIQUE KEY uk_ledger_biz (ref_type, ref_id, type),
  KEY idx_ledger_user_created (user_id, created_at),
  KEY idx_ledger_user_type (user_id, type),
  CONSTRAINT ck_ledger_type CHECK (type IN ('EARN', 'SPEND', 'REVERSE')),
  CONSTRAINT ck_ledger_ref CHECK (ref_type IN ('TRIP', 'ORDER')),
  CONSTRAINT ck_ledger_seq CHECK (account_seq >= 1),
  CONSTRAINT ck_ledger_balance CHECK (balance_after >= 0),
  CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES t_point_account (user_id)
) ENGINE = InnoDB COMMENT = '积分流水（只追加、账户内有序）';

-- -----------------------------------------------------------------------------
-- 9. 商品
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_product (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  product_id  VARCHAR(64) NOT NULL                COMMENT '对外商品编号',
  merchant_id BIGINT      NOT NULL                COMMENT '所属商户，t_merchant.id',
  name        VARCHAR(128) NOT NULL               COMMENT '商品名称',
  icon        VARCHAR(64) NOT NULL DEFAULT '🎁'   COMMENT '商品图标（emoji，前端直接显示）',
  points      BIGINT      NOT NULL                COMMENT '兑换所需积分（单价）',
  stock       INT         NOT NULL DEFAULT 0      COMMENT '可兑换库存，不得为负',
  status      VARCHAR(16) NOT NULL DEFAULT 'ON'   COMMENT '状态：ON 上架 / OFF 下架',
  description VARCHAR(255) NULL                   COMMENT '商品描述',
  version     INT         NOT NULL DEFAULT 0      COMMENT '乐观锁版本号',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_product_id (product_id),
  KEY idx_product_status (status),
  KEY idx_product_merchant (merchant_id),
  CONSTRAINT ck_product_points CHECK (points > 0),
  CONSTRAINT ck_product_stock CHECK (stock >= 0),
  CONSTRAINT ck_product_status CHECK (status IN ('ON', 'OFF')),
  CONSTRAINT fk_product_merchant FOREIGN KEY (merchant_id) REFERENCES t_merchant (id)
) ENGINE = InnoDB COMMENT = '积分商品';

-- -----------------------------------------------------------------------------
-- 10. 兑换订单
--    product_name / product_icon / unit_points 是下单时快照：
--    商品改名改价不影响历史订单展示与取消返还（BR-05、BR-06）。
--    UNIQUE(user_id, request_id) 保证同一请求只生成一张订单。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_redemption_order (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  order_id      VARCHAR(64) NOT NULL                COMMENT '对外订单号，如 RO20261115000001',
  user_id       BIGINT      NOT NULL                COMMENT '下单用户，t_user.id',
  product_id    BIGINT      NOT NULL                COMMENT '商品，t_product.id',
  product_name  VARCHAR(128) NOT NULL               COMMENT '下单时商品名称快照',
  product_icon  VARCHAR(64) NOT NULL DEFAULT '🎁'   COMMENT '下单时商品图标快照',
  quantity      INT         NOT NULL                COMMENT '兑换数量，>=1',
  unit_points   BIGINT      NOT NULL                COMMENT '下单时单价快照',
  total_points  BIGINT      NOT NULL                COMMENT '本次消耗积分=单价×数量，取消时按此值返还',
  status        VARCHAR(16) NOT NULL DEFAULT 'CREATED' COMMENT '状态：CREATED 待发放 / FULFILLED 已完成 / CANCELLED 已取消',
  request_id    VARCHAR(64) NOT NULL                COMMENT '客户端请求号，幂等键（同一用户内唯一）',
  cancel_reason VARCHAR(255) NULL                   COMMENT '取消原因，取消时必填',
  processed_by  BIGINT      NULL                    COMMENT '处理人（履约/取消），t_user.id',
  processed_at  DATETIME(3) NULL                    COMMENT '处理时间',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '下单时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_order_id (order_id),
  UNIQUE KEY uk_order_user_request (user_id, request_id),
  KEY idx_order_user_status (user_id, status),
  KEY idx_order_status_created (status, created_at),
  KEY idx_order_product (product_id),
  CONSTRAINT ck_order_quantity CHECK (quantity >= 1),
  CONSTRAINT ck_order_points CHECK (unit_points > 0 AND total_points > 0),
  CONSTRAINT ck_order_status CHECK (status IN ('CREATED', 'FULFILLED', 'CANCELLED')),
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES t_user (id),
  CONSTRAINT fk_order_product FOREIGN KEY (product_id) REFERENCES t_product (id),
  CONSTRAINT fk_order_processor FOREIGN KEY (processed_by) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '兑换订单';

-- -----------------------------------------------------------------------------
-- 11. 审计日志（规则、库存、订单状态变更，NFR-08）
--     与业务修改在同一事务内写入，保证"改了必有痕"
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_audit_log (
  id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  biz_type     VARCHAR(32)  NOT NULL                COMMENT '业务类型：CARBON_RULE / PRODUCT_STOCK / REDEMPTION_ORDER / USER_STATUS',
  biz_id       VARCHAR(64)  NOT NULL                COMMENT '业务编号',
  action       VARCHAR(32)  NOT NULL                COMMENT '动作：CREATE / UPDATE / CANCEL / FULFILL / ENABLE / DISABLE',
  before_value JSON         NULL                    COMMENT '变更前值（结构化 JSON）',
  after_value  JSON         NULL                    COMMENT '变更后值（结构化 JSON）',
  operator_id  BIGINT       NOT NULL                COMMENT '操作人，t_user.id',
  reason       VARCHAR(255) NULL                    COMMENT '变更原因',
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '操作时间',
  PRIMARY KEY (id),
  KEY idx_audit_biz (biz_type, biz_id),
  KEY idx_audit_operator (operator_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_operator FOREIGN KEY (operator_id) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '审计日志';

-- -----------------------------------------------------------------------------
-- 12. 记录本次安装的结构版本
-- -----------------------------------------------------------------------------
INSERT INTO t_schema_version (version, description)
VALUES ('V2', '基于 V1 增加账户流水序号 last_seq/account_seq、规则串行化锁表与结构版本表')
ON DUPLICATE KEY UPDATE description = VALUES(description);
