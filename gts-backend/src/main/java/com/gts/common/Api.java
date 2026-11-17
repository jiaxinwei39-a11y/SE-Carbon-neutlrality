package com.gts.common;

import java.util.List;

/**
 * 统一响应壳。
 *
 * 前端 http.ts 里写死了 code === 0 才算成功，所以这里的约定不能改。
 */
public final class Api {

    private Api() {
    }

    /** { code, message, data } */
    public record Result<T>(int code, String message, T data) {

        public static <T> Result<T> ok(T data) {
            return new Result<>(0, "ok", data);
        }

        public static Result<Void> ok() {
            return new Result<>(0, "ok", null);
        }

        public static <T> Result<T> fail(int code, String message) {
            return new Result<>(code, message, null);
        }
    }

    /** { items, total, page, size } */
    public record Page<T>(List<T> items, long total, int page, int size) {
    }

    /**
     * 业务异常：携带业务码 + HTTP 状态码。
     * 由 GlobalExceptionHandler 统一转成 Result，Controller 不用写 try-catch。
     */
    public static class BizException extends RuntimeException {

        private final int code;
        private final int httpStatus;

        public BizException(int code, int httpStatus, String message) {
            super(message);
            this.code = code;
            this.httpStatus = httpStatus;
        }

        public int code() {
            return code;
        }

        public int httpStatus() {
            return httpStatus;
        }
    }

    /** 业务码常量：与 docs/02-design/api-contract.md 第 2 节一一对应 */
    public static final class Codes {
        public static final int OK = 0;
        public static final int PARAM_INVALID = 40000;
        public static final int LOGIN_PARAM_MISSING = 40001;
        public static final int IDEMPOTENCY_KEY_MISSING = 40002;
        public static final int DISTANCE_INVALID = 40010;
        public static final int TIME_INVALID = 40011;
        public static final int PASSWORD_INVALID = 40012;
        public static final int PHONE_INVALID = 40013;
        public static final int UNAUTHORIZED = 40100;
        public static final int BAD_CREDENTIALS = 40101;
        public static final int FORBIDDEN = 40301;
        public static final int TRIP_NOT_FOUND = 40401;
        public static final int PRODUCT_NOT_FOUND = 40402;
        public static final int ORDER_NOT_FOUND = 40403;
        public static final int ENDPOINT_NOT_FOUND = 40400;
        public static final int IDEMPOTENCY_CONFLICT = 40904;
        public static final int NO_CARBON_RULE = 40905;
        public static final int PHONE_TAKEN = 40906;
        public static final int RULE_INTERVAL_OVERLAP = 40907;
        public static final int RULE_RETROACTIVE = 40909;
        public static final int PRODUCT_OFF_SHELF = 40908;
        public static final int STOCK_SHORT = 40901;
        public static final int POINTS_SHORT = 40030;
        public static final int CANCEL_REASON_REQUIRED = 40040;
        public static final int PRODUCT_POINTS_INVALID = 40041;
        public static final int PRODUCT_STOCK_INVALID = 40042;
        public static final int ORDER_STATUS_INVALID = 40903;
        public static final int RECONCILE_UNAVAILABLE = 50001;
        public static final int SERVER_ERROR = 50000;

        private Codes() {
        }
    }
}
