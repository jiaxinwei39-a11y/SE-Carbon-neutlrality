package com.gts.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全局异常 → 统一响应壳。
 * 保证前端拿到的永远是 { code, message, data }，不会突然收到 Spring 默认的 error 页面。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(Api.BizException.class)
    public ResponseEntity<Api.Result<Void>> onBiz(Api.BizException ex) {
        HttpStatus status = HttpStatus.resolve(ex.httpStatus());
        return ResponseEntity.status(status == null ? HttpStatus.BAD_REQUEST : status)
                .body(Api.Result.fail(ex.code(), ex.getMessage()));
    }

    /** @Valid 校验失败：取第一条字段错误，直接给中文提示 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Api.Result<Void>> onInvalid(MethodArgumentNotValidException ex) {
        FieldError fe = ex.getBindingResult().getFieldError();
        String msg = fe == null ? "请求参数不合法" : fe.getDefaultMessage();
        return ResponseEntity.badRequest().body(Api.Result.fail(Api.Codes.PARAM_INVALID, msg));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Api.Result<Void>> onUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest()
                .body(Api.Result.fail(Api.Codes.PARAM_INVALID, "请求体格式不正确"));
    }

    /** 唯一约束冲突：说明业务层的幂等/防重逻辑没走到，这里兜底并记录下来 */
    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<Api.Result<Void>> onDuplicate(DuplicateKeyException ex) {
        log.warn("唯一约束冲突：{}", ex.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Api.Result.fail(Api.Codes.IDEMPOTENCY_CONFLICT, "该请求已处理，请勿重复提交"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Api.Result<Void>> onOther(Exception ex) {
        log.error("未处理异常", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Api.Result.fail(Api.Codes.SERVER_ERROR, "服务异常，请稍后重试"));
    }
}
