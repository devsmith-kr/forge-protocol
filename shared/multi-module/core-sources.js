/**
 * shared/multi-module/core-sources.js — :core 모듈 공통 클래스 본문 생성기
 *
 * 모든 :domain-* 모듈이 공유하는 6개 기반 클래스를 생성한다. 인증/보안/캐시/이벤트
 * 같은 큰 횡단 관심사는 v0.5.0 범위 밖 — 핵심 응답/예외/엔티티 베이스만 둔다.
 *
 *   BaseEntity              — JPA @MappedSuperclass (id/createdAt/updatedAt + 자동 timestamp)
 *   CommonResponse<T>       — REST 표준 응답 wrapper (success/code/message/data)
 *   PageResponse<T>          — 페이징 응답 wrapper
 *   ErrorCode                — HTTP 상태/코드/메시지 enum (6개 케이스)
 *   BusinessException        — 도메인 예외 (ErrorCode 보유)
 *   GlobalExceptionHandler   — @RestControllerAdvice 통합 예외 처리
 *
 * basePackage 가 'com.forge.app' 이면 패키지는 'com.forge.app.core.{entity|web|exception}' 가 된다.
 * 호출자(emitMultiModule) 는 반환된 relPath 앞에 ':core' 모듈 sourceRoot 를 prefix 로 붙여 emit 한다.
 */

const DEFAULT_BASE_PACKAGE = 'com.forge.app';

/**
 * @param {string} [basePackage='com.forge.app']  루트 Java 패키지 (Application 이 위치하는 곳)
 * @returns {Array<{relPath: string, content: string}>}  :core 모듈 내부 src/main/java/... 상대 경로
 */
export function coreFiles(basePackage = DEFAULT_BASE_PACKAGE) {
  const corePkg = `${basePackage}.core`;
  const pkgPath = corePkg.replace(/\./g, '/');

  return [
    {
      relPath: `src/main/java/${pkgPath}/entity/BaseEntity.java`,
      content: baseEntitySource(corePkg),
    },
    {
      relPath: `src/main/java/${pkgPath}/web/CommonResponse.java`,
      content: commonResponseSource(corePkg),
    },
    {
      relPath: `src/main/java/${pkgPath}/web/PageResponse.java`,
      content: pageResponseSource(corePkg),
    },
    {
      relPath: `src/main/java/${pkgPath}/exception/ErrorCode.java`,
      content: errorCodeSource(corePkg),
    },
    {
      relPath: `src/main/java/${pkgPath}/exception/BusinessException.java`,
      content: businessExceptionSource(corePkg),
    },
    {
      relPath: `src/main/java/${pkgPath}/exception/GlobalExceptionHandler.java`,
      content: globalExceptionHandlerSource(corePkg),
    },
  ];
}

// ── 개별 소스 ─────────────────────────────────────────────

function baseEntitySource(corePkg) {
  return `package ${corePkg}.entity;

import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/**
 * 모든 도메인 엔티티의 공통 부모.
 * id / createdAt / updatedAt 을 일괄 제공하며, JPA 라이프사이클 콜백으로
 * 타임스탬프를 자동 갱신한다.
 */
@Getter
@Setter
@MappedSuperclass
public abstract class BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
`;
}

function commonResponseSource(corePkg) {
  return `package ${corePkg}.web;

/**
 * 표준 REST 응답 wrapper. 컨트롤러는 \`CommonResponse.ok(dto)\` 로 감싸 반환한다.
 *
 * 실패 응답은 GlobalExceptionHandler 가 \`CommonResponse.error(...)\` 로 만든다.
 */
public record CommonResponse<T>(
    boolean success,
    String code,
    String message,
    T data
) {

    public static <T> CommonResponse<T> ok(T data) {
        return new CommonResponse<>(true, "OK", "success", data);
    }

    public static <T> CommonResponse<T> ok() {
        return new CommonResponse<>(true, "OK", "success", null);
    }

    public static <T> CommonResponse<T> error(String code, String message) {
        return new CommonResponse<>(false, code, message, null);
    }
}
`;
}

function pageResponseSource(corePkg) {
  return `package ${corePkg}.web;

import java.util.List;

/**
 * 페이징 응답 wrapper. Spring Data Page 와의 변환은 도메인에서 처리.
 *
 *   PageResponse.of(items, page, size, total)
 */
public record PageResponse<T>(
    List<T> items,
    int page,
    int size,
    long total
) {

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long total) {
        return new PageResponse<>(items, page, size, total);
    }
}
`;
}

function errorCodeSource(corePkg) {
  return `package ${corePkg}.exception;

import org.springframework.http.HttpStatus;

/**
 * 도메인 전반에서 재사용하는 에러 코드 enum.
 * 도메인별 전용 에러는 BusinessException 메시지로 보강하거나 별도 enum 을 추가하라.
 */
public enum ErrorCode {

    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "내부 서버 오류"),
    VALIDATION(HttpStatus.BAD_REQUEST, "VALIDATION", "요청이 유효하지 않습니다"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "NOT_FOUND", "리소스를 찾을 수 없습니다"),
    CONFLICT(HttpStatus.CONFLICT, "CONFLICT", "현재 리소스 상태와 충돌합니다"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "인증이 필요합니다"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "접근 권한이 없습니다");

    private final HttpStatus status;
    private final String code;
    private final String message;

    ErrorCode(HttpStatus status, String code, String message) {
        this.status = status;
        this.code = code;
        this.message = message;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public String message() {
        return message;
    }
}
`;
}

function businessExceptionSource(corePkg) {
  return `package ${corePkg}.exception;

import lombok.Getter;

/**
 * 도메인 비즈니스 규칙 위반 예외. ErrorCode 를 항상 보유한다.
 * GlobalExceptionHandler 가 잡아 ErrorCode.status() 로 응답을 만든다.
 */
@Getter
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.message());
        this.errorCode = errorCode;
    }

    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }
}
`;
}

function globalExceptionHandlerSource(corePkg) {
  return `package ${corePkg}.exception;

import ${corePkg}.web.CommonResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 전체 컨트롤러를 감싸는 통합 예외 처리. BusinessException → ErrorCode 매핑,
 * Bean Validation 실패 → 400, 그 외 → 500.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<CommonResponse<Void>> handleBusiness(BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        return ResponseEntity
            .status(code.status())
            .body(CommonResponse.error(code.code(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<CommonResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String msg = ex.getBindingResult().getAllErrors().isEmpty()
            ? ErrorCode.VALIDATION.message()
            : ex.getBindingResult().getAllErrors().get(0).getDefaultMessage();
        return ResponseEntity
            .status(ErrorCode.VALIDATION.status())
            .body(CommonResponse.error(ErrorCode.VALIDATION.code(), msg));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<CommonResponse<Void>> handleAny(Exception ex) {
        return ResponseEntity
            .status(ErrorCode.INTERNAL_ERROR.status())
            .body(CommonResponse.error(ErrorCode.INTERNAL_ERROR.code(), ex.getMessage()));
    }
}
`;
}
