-- =============================================================================
--  V1 —— 首版结构（PR #28 最初提交的形态，保留作为升级起点）
--  负责：郭浚文（#9）
--
--  本文件只用于"已有 V1 库要升到 V2"的路径验证；
--  全新安装请直接执行 db/schema.sql（已经是 V2 终态）。
-- =============================================================================

CREATE DATABASE IF NOT EXISTS gts
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE gts;

-- 迁移框架的版本表（V1 起就存在）
CREATE TABLE IF NOT EXISTS t_schema_version (
  version     VARCHAR(32)  NOT NULL COMMENT '结构版本号，如 V1、V2',
  description VARCHAR(255) NULL     COMMENT '本次变更说明',
  applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '应用时间',
  PRIMARY KEY (version)
) ENGINE = InnoDB COMMENT = '数据库结构版本记录';

CREATE TABLE IF NOT EXISTS t_user (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  user_id       VARCHAR(32)  NOT NULL COMMENT '对外用户编号',
  login_account VARCHAR(64)  NOT NULL COMMENT '登录账号',
  phone         VARCHAR(32)  NULL     COMMENT '手机号',
  nickname      VARCHAR(64)  NOT NULL COMMENT '昵称',
  password_hash VARCHAR(255) NOT NULL COMMENT '口令哈希',
  role          VARCHAR(16)  NOT NULL DEFAULT 'USER' COMMENT '角色',
  status        VARCHAR(16)  NOT NULL DEFAULT 'ENABLED' COMMENT '状态',
  avatar_text   VARCHAR(8)   NOT NULL DEFAULT '' COMMENT '头像文字',
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

CREATE TABLE IF NOT EXISTS t_login_session (
  id         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  token_hash CHAR(64)    NOT NULL COMMENT 'token 的 SHA-256',
  user_id    BIGINT      NOT NULL COMMENT '所属用户',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '签发时间',
  expires_at DATETIME(3) NOT NULL COMMENT '过期时间',
  revoked_at DATETIME(3) NULL COMMENT '注销时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_token (token_hash),
  KEY idx_session_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '登录会话';

CREATE TABLE IF NOT EXISTS t_merchant (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  merchant_id VARCHAR(32) NOT NULL COMMENT '对外商户编号',
  name        VARCHAR(64) NOT NULL COMMENT '商户名称',
  status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_merchant_id (merchant_id),
  CONSTRAINT ck_merchant_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
) ENGINE = InnoDB COMMENT = '商户';

CREATE TABLE IF NOT EXISTS t_carbon_rule (
  id             BIGINT        NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  rule_id        VARCHAR(32)   NOT NULL COMMENT '对外规则编号',
  mode           VARCHAR(16)   NOT NULL COMMENT '出行方式',
  base_factor    DECIMAL(18,9) NOT NULL COMMENT '基准排放因子',
  mode_factor    DECIMAL(18,9) NOT NULL COMMENT '方式排放因子',
  points_ratio   DECIMAL(18,9) NOT NULL COMMENT '积分系数',
  effective_from DATETIME(3)   NOT NULL COMMENT '生效时间（含）',
  effective_to   DATETIME(3)   NULL     COMMENT '失效时间（不含）',
  version        VARCHAR(32)   NOT NULL COMMENT '规则版本',
  status         VARCHAR(16)   NOT NULL DEFAULT 'ACTIVE' COMMENT '状态',
  created_by     BIGINT        NULL     COMMENT '创建人',
  change_reason  VARCHAR(255)  NULL     COMMENT '变更原因',
  created_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_rule_id (rule_id),
  KEY idx_rule_mode_time (mode, effective_from, effective_to),
  KEY idx_rule_status (status),
  CONSTRAINT ck_rule_mode CHECK (mode IN ('BUS', 'SUBWAY', 'BIKE', 'WALK')),
  CONSTRAINT ck_rule_factor CHECK (base_factor >= 0 AND mode_factor >= 0 AND points_ratio >= 0),
  CONSTRAINT fk_rule_creator FOREIGN KEY (created_by) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '碳核算规则（版本化）';

CREATE TABLE IF NOT EXISTS t_trip (
  id            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  trip_id       VARCHAR(64)   NOT NULL COMMENT '对外行程编号',
  user_id       BIGINT        NOT NULL COMMENT '所属用户',
  client_trip_id VARCHAR(64)  NOT NULL COMMENT '客户端行程号（幂等键）',
  mode          VARCHAR(16)   NOT NULL COMMENT '出行方式',
  distance_km   DECIMAL(18,9) NOT NULL COMMENT '模拟里程',
  start_place   VARCHAR(128)  NOT NULL COMMENT '起点',
  end_place     VARCHAR(128)  NOT NULL COMMENT '终点',
  start_time    DATETIME(3)   NOT NULL COMMENT '开始时间',
  end_time      DATETIME(3)   NOT NULL COMMENT '结束时间',
  base_factor   DECIMAL(18,9) NOT NULL COMMENT '基准因子快照',
  mode_factor   DECIMAL(18,9) NOT NULL COMMENT '方式因子快照',
  points_ratio  DECIMAL(18,9) NOT NULL COMMENT '积分系数快照',
  reduction_kg  DECIMAL(18,9) NOT NULL COMMENT '碳减排量',
  awarded_points BIGINT       NOT NULL DEFAULT 0 COMMENT '本次发放积分',
  rule_id       BIGINT        NULL     COMMENT '匹配规则',
  rule_version  VARCHAR(32)   NOT NULL COMMENT '规则版本快照',
  status        VARCHAR(16)   NOT NULL DEFAULT 'POINTED' COMMENT '状态',
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

CREATE TABLE IF NOT EXISTS t_point_account (
  user_id            BIGINT      NOT NULL COMMENT '账户主键=用户',
  balance            BIGINT      NOT NULL DEFAULT 0 COMMENT '当前可用积分',
  total_earned       BIGINT      NOT NULL DEFAULT 0 COMMENT '累计获得',
  total_spent        BIGINT      NOT NULL DEFAULT 0 COMMENT '累计消费',
  trip_count         BIGINT      NOT NULL DEFAULT 0 COMMENT '有效行程数',
  total_reduction_kg DECIMAL(18,9) NOT NULL DEFAULT 0 COMMENT '累计减排量',
  version            INT         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (user_id),
  CONSTRAINT ck_account_balance CHECK (balance >= 0),
  CONSTRAINT fk_account_user FOREIGN KEY (user_id) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '积分账户';

CREATE TABLE IF NOT EXISTS t_point_ledger (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  ledger_no     VARCHAR(64)  NOT NULL COMMENT '对外流水号',
  user_id       BIGINT       NOT NULL COMMENT '所属用户',
  type          VARCHAR(16)  NOT NULL COMMENT '类型',
  title         VARCHAR(128) NOT NULL COMMENT '流水摘要',
  amount        BIGINT       NOT NULL COMMENT '变动积分',
  balance_after BIGINT       NOT NULL COMMENT '变动后余额',
  ref_type      VARCHAR(16)  NOT NULL COMMENT '业务类型',
  ref_id        VARCHAR(64)  NOT NULL COMMENT '业务编号',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发生时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ledger_ledger_no (ledger_no),
  UNIQUE KEY uk_ledger_biz (ref_type, ref_id, type),
  KEY idx_ledger_user_created (user_id, created_at),
  KEY idx_ledger_user_type (user_id, type),
  CONSTRAINT ck_ledger_type CHECK (type IN ('EARN', 'SPEND', 'REVERSE')),
  CONSTRAINT ck_ledger_ref CHECK (ref_type IN ('TRIP', 'ORDER')),
  CONSTRAINT ck_ledger_balance CHECK (balance_after >= 0),
  CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '积分流水（只追加）';

CREATE TABLE IF NOT EXISTS t_product (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  product_id  VARCHAR(64) NOT NULL COMMENT '对外商品编号',
  merchant_id BIGINT      NOT NULL COMMENT '所属商户',
  name        VARCHAR(128) NOT NULL COMMENT '商品名称',
  icon        VARCHAR(64) NOT NULL DEFAULT '🎁' COMMENT '商品图标',
  points      BIGINT      NOT NULL COMMENT '兑换所需积分',
  stock       INT         NOT NULL DEFAULT 0 COMMENT '库存',
  status      VARCHAR(16) NOT NULL DEFAULT 'ON' COMMENT '状态',
  description VARCHAR(255) NULL COMMENT '描述',
  version     INT         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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

CREATE TABLE IF NOT EXISTS t_redemption_order (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  order_id      VARCHAR(64) NOT NULL COMMENT '对外订单号',
  user_id       BIGINT      NOT NULL COMMENT '下单用户',
  product_id    BIGINT      NOT NULL COMMENT '商品',
  product_name  VARCHAR(128) NOT NULL COMMENT '商品名称快照',
  product_icon  VARCHAR(64) NOT NULL DEFAULT '🎁' COMMENT '商品图标快照',
  quantity      INT         NOT NULL COMMENT '兑换数量',
  unit_points   BIGINT      NOT NULL COMMENT '单价快照',
  total_points  BIGINT      NOT NULL COMMENT '消耗积分',
  status        VARCHAR(16) NOT NULL DEFAULT 'CREATED' COMMENT '状态',
  request_id    VARCHAR(64) NOT NULL COMMENT '客户端请求号（幂等键）',
  cancel_reason VARCHAR(255) NULL COMMENT '取消原因',
  processed_by  BIGINT      NULL COMMENT '处理人',
  processed_at  DATETIME(3) NULL COMMENT '处理时间',
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

CREATE TABLE IF NOT EXISTS t_audit_log (
  id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  biz_type     VARCHAR(32)  NOT NULL COMMENT '业务类型',
  biz_id       VARCHAR(64)  NOT NULL COMMENT '业务编号',
  action       VARCHAR(32)  NOT NULL COMMENT '动作',
  before_value JSON         NULL COMMENT '变更前值',
  after_value  JSON         NULL COMMENT '变更后值',
  operator_id  BIGINT       NOT NULL COMMENT '操作人',
  reason       VARCHAR(255) NULL COMMENT '变更原因',
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '操作时间',
  PRIMARY KEY (id),
  KEY idx_audit_biz (biz_type, biz_id),
  KEY idx_audit_operator (operator_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_operator FOREIGN KEY (operator_id) REFERENCES t_user (id)
) ENGINE = InnoDB COMMENT = '审计日志';

INSERT INTO t_schema_version (version, description)
VALUES ('V1', '首版结构：10 张业务表')
ON DUPLICATE KEY UPDATE description = VALUES(description);
