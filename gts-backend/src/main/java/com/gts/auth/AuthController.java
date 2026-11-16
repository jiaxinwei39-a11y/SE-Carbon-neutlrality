package com.gts.auth;

import com.gts.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 认证接口。context-path 是 /api，所以实际路径是 /api/auth/** */
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public Api.Result<AuthDto.LoginResult> login(@Valid @RequestBody AuthDto.LoginRequest req) {
        return Api.Result.ok(authService.login(req.account(), req.password()));
    }

    /** 契约新增：前端 RegisterView 目前是纯 UI，接口由本方法提供 */
    @PostMapping("/register")
    public Api.Result<AuthDto.LoginResult> register(@Valid @RequestBody AuthDto.RegisterRequest req) {
        return Api.Result.ok(authService.register(req.phone(), req.password(), req.nickname()));
    }

    @GetMapping("/me")
    public Api.Result<AuthDto.UserVo> me() {
        return Api.Result.ok(authService.currentUser(LoginUser.require()));
    }

    @PostMapping("/logout")
    public Api.Result<Void> logout(HttpServletRequest request) {
        authService.logout(bearer(request));
        return Api.Result.ok();
    }

    static String bearer(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return null;
        }
        return header.substring(7).trim();
    }
}
