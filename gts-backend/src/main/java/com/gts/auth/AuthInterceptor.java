package com.gts.auth;

import com.gts.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 登录校验拦截器。
 *
 * 只放行登录和注册，其余 /api/** 一律要求 Bearer 令牌。
 * 校验通过后把用户放进 ThreadLocal，Service 里用 LoginUser.require() 取。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final SessionRepository sessions;

    public AuthInterceptor(SessionRepository sessions) {
        this.sessions = sessions;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String token = AuthController.bearer(request);
        if (token == null || token.isBlank()) {
            throw new Api.BizException(Api.Codes.UNAUTHORIZED, 401, "登录已过期，请重新登录");
        }
        LoginUser user = sessions.findValid(PasswordHasher.sha256Hex(token))
                .orElseThrow(() -> new Api.BizException(Api.Codes.UNAUTHORIZED, 401, "登录已过期，请重新登录"));
        LoginUser.set(user);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        // 线程池复用线程，必须清理，否则下一个请求会拿到上一个人的身份
        LoginUser.clear();
    }
}
