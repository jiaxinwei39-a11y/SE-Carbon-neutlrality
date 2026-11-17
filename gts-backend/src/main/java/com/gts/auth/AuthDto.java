package com.gts.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 认证相关 DTO：字段名与前端 types/index.ts 完全一致，后端实体不直接暴露给前端 */
public final class AuthDto {

    private AuthDto() {
    }

    public record LoginRequest(
            @NotBlank(message = "请输入账号") String account,
            @NotBlank(message = "请输入密码") String password) {
    }

    /**
     * 注册请求：格式校验放在 Service 里做，
     * 这样能返回前端契约要求的专用码（手机号 40013、密码 40012），
     * 而不是被 @Valid 统一成 40000。
     */
    public record RegisterRequest(
            @NotBlank(message = "请输入手机号") String phone,
            @NotBlank(message = "请输入密码") String password,
            @Size(max = 20, message = "昵称最长 20 个字") String nickname) {
    }

    /** 与前端 User 接口一一对应 */
    public record UserVo(
            String id,
            String nickname,
            String phone,
            String role,
            String avatarText,
            long points) {
    }

    /** 登录/注册都返回 { token, user }，前端少发一次 /auth/me */
    public record LoginResult(String token, UserVo user) {
    }
}
