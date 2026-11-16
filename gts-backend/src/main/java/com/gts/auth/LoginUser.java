package com.gts.auth;

/**
 * 当前登录用户（请求级）。
 *
 * 用 ThreadLocal 存是因为 Service 层也要知道"我是谁"，
 * 一层层往下传 userId 会让所有方法都多一个参数。
 * 由 AuthInterceptor 在 preHandle 写入、在 afterCompletion 清理，
 * 不清会污染线程池里的下一个请求。
 */
public record LoginUser(Long id, String userId, String role) {

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }

    private static final ThreadLocal<LoginUser> HOLDER = new ThreadLocal<>();

    public static void set(LoginUser user) {
        HOLDER.set(user);
    }

    public static LoginUser get() {
        return HOLDER.get();
    }

    public static LoginUser require() {
        LoginUser u = HOLDER.get();
        if (u == null) {
            throw new com.gts.common.Api.BizException(
                    com.gts.common.Api.Codes.UNAUTHORIZED, 401, "登录已过期，请重新登录");
        }
        return u;
    }

    public static void clear() {
        HOLDER.remove();
    }
}
