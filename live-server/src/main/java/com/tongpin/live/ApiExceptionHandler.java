package com.tongpin.live;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, Object>> response(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "请求失败" : error.getReason()));
    }
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<Map<String, Object>> invalid(IllegalArgumentException error) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", error.getMessage() == null ? "请求内容不正确" : error.getMessage()));
    }
}
