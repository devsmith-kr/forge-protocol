/**
 * shared/multi-module/core-sources.js — :core 공통 클래스 생성기 테스트
 *
 * 검증 포인트:
 *   - 정확히 6개 파일 반환
 *   - relPath 가 basePackage 디렉토리 구조 따름
 *   - 각 클래스의 핵심 어노테이션/메서드 존재
 *   - basePackage 변경 시 패키지/import 모두 반영
 */

import { describe, it, expect } from 'vitest';
import { coreFiles } from '../shared/multi-module/core-sources.js';

const findFile = (files, classname) => {
  const f = files.find((x) => x.relPath.endsWith(`${classname}.java`));
  if (!f) throw new Error(`${classname}.java not found in coreFiles output`);
  return f;
};

describe('coreFiles — 파일 갯수/경로', () => {
  it('정확히 6개 파일을 반환', () => {
    const files = coreFiles();
    expect(files).toHaveLength(6);
  });

  it('각 클래스가 한 번씩 등장', () => {
    const files = coreFiles();
    const names = files.map((f) => f.relPath.split('/').pop());
    expect(names.sort()).toEqual([
      'BaseEntity.java',
      'BusinessException.java',
      'CommonResponse.java',
      'ErrorCode.java',
      'GlobalExceptionHandler.java',
      'PageResponse.java',
    ]);
  });

  it('relPath 가 src/main/java/{basePackage}/core/{서브패키지}/ 구조', () => {
    const files = coreFiles('com.forge.app');
    const baseEntity = findFile(files, 'BaseEntity');
    expect(baseEntity.relPath).toBe(
      'src/main/java/com/forge/app/core/entity/BaseEntity.java',
    );

    const commonResp = findFile(files, 'CommonResponse');
    expect(commonResp.relPath).toBe(
      'src/main/java/com/forge/app/core/web/CommonResponse.java',
    );

    const handler = findFile(files, 'GlobalExceptionHandler');
    expect(handler.relPath).toBe(
      'src/main/java/com/forge/app/core/exception/GlobalExceptionHandler.java',
    );
  });

  it('basePackage 변경 시 디렉토리 구조도 변경', () => {
    const files = coreFiles('com.acme.shop');
    const baseEntity = findFile(files, 'BaseEntity');
    expect(baseEntity.relPath).toBe(
      'src/main/java/com/acme/shop/core/entity/BaseEntity.java',
    );
    expect(baseEntity.content).toContain('package com.acme.shop.core.entity;');
  });

  it('기본 basePackage 는 com.forge.app', () => {
    const files = coreFiles();
    const baseEntity = findFile(files, 'BaseEntity');
    expect(baseEntity.content).toContain('package com.forge.app.core.entity;');
  });
});

describe('BaseEntity — JPA MappedSuperclass + 자동 timestamp', () => {
  const { content } = findFile(coreFiles(), 'BaseEntity');

  it('@MappedSuperclass + abstract class', () => {
    expect(content).toContain('@MappedSuperclass');
    expect(content).toMatch(/public abstract class BaseEntity/);
  });

  it('id / createdAt / updatedAt 필드 보유', () => {
    expect(content).toMatch(/@Id\s*\n\s*@GeneratedValue/);
    expect(content).toMatch(/private Long id/);
    expect(content).toMatch(/private LocalDateTime createdAt/);
    expect(content).toMatch(/private LocalDateTime updatedAt/);
  });

  it('@PrePersist / @PreUpdate 라이프사이클 콜백', () => {
    expect(content).toContain('@PrePersist');
    expect(content).toContain('@PreUpdate');
  });

  it('Lombok @Getter / @Setter (도메인이 setter 활용)', () => {
    expect(content).toContain('@Getter');
    expect(content).toContain('@Setter');
  });
});

describe('CommonResponse — Java record + factory 메서드', () => {
  const { content } = findFile(coreFiles(), 'CommonResponse');

  it('record<T> 시그니처', () => {
    expect(content).toMatch(/public record CommonResponse<T>/);
    expect(content).toContain('boolean success');
    expect(content).toContain('String code');
    expect(content).toContain('String message');
    expect(content).toContain('T data');
  });

  it("ok(data) / ok() / error(code, msg) static factory", () => {
    expect(content).toMatch(/public static <T> CommonResponse<T> ok\(T data\)/);
    expect(content).toMatch(/public static <T> CommonResponse<T> ok\(\)/);
    expect(content).toMatch(/public static <T> CommonResponse<T> error\(String code, String message\)/);
  });
});

describe('PageResponse — record + of static factory', () => {
  const { content } = findFile(coreFiles(), 'PageResponse');

  it('record<T> + items/page/size/total 필드', () => {
    expect(content).toMatch(/public record PageResponse<T>/);
    expect(content).toContain('List<T> items');
    expect(content).toContain('int page');
    expect(content).toContain('int size');
    expect(content).toContain('long total');
  });

  it('of(items, page, size, total) static factory', () => {
    expect(content).toMatch(/public static <T> PageResponse<T> of\(/);
  });
});

describe('ErrorCode — enum 6 케이스', () => {
  const { content } = findFile(coreFiles(), 'ErrorCode');

  it('public enum ErrorCode', () => {
    expect(content).toMatch(/public enum ErrorCode/);
  });

  it.each([
    ['INTERNAL_ERROR', 'INTERNAL_SERVER_ERROR'],
    ['VALIDATION', 'BAD_REQUEST'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['CONFLICT', 'CONFLICT'],
    ['UNAUTHORIZED', 'UNAUTHORIZED'],
    ['FORBIDDEN', 'FORBIDDEN'],
  ])('%s 케이스가 HttpStatus.%s 에 매핑', (code, status) => {
    expect(content).toMatch(new RegExp(`${code}\\s*\\(\\s*HttpStatus\\.${status}`));
  });

  it('status() / code() / message() accessor 노출', () => {
    expect(content).toContain('public HttpStatus status()');
    expect(content).toContain('public String code()');
    expect(content).toContain('public String message()');
  });
});

describe('BusinessException — RuntimeException 확장', () => {
  const { content } = findFile(coreFiles(), 'BusinessException');

  it('extends RuntimeException + ErrorCode 보유', () => {
    expect(content).toMatch(/class BusinessException extends RuntimeException/);
    expect(content).toContain('private final ErrorCode errorCode');
  });

  it('생성자 2종 (ErrorCode, ErrorCode+message)', () => {
    expect(content).toMatch(/public BusinessException\(ErrorCode errorCode\)/);
    expect(content).toMatch(/public BusinessException\(ErrorCode errorCode, String message\)/);
  });

  it('@Getter 로 errorCode 노출 (Lombok)', () => {
    expect(content).toContain('@Getter');
  });
});

describe('GlobalExceptionHandler — @RestControllerAdvice', () => {
  const { content } = findFile(coreFiles(), 'GlobalExceptionHandler');

  it('@RestControllerAdvice', () => {
    expect(content).toContain('@RestControllerAdvice');
  });

  it('BusinessException / Validation / Exception 3개 핸들러', () => {
    expect(content).toContain('@ExceptionHandler(BusinessException.class)');
    expect(content).toContain('@ExceptionHandler(MethodArgumentNotValidException.class)');
    expect(content).toContain('@ExceptionHandler(Exception.class)');
  });

  it('CommonResponse 를 본인 패키지에서 import (basePackage 반영)', () => {
    const { content: c1 } = findFile(coreFiles('com.acme.shop'), 'GlobalExceptionHandler');
    expect(c1).toContain('import com.acme.shop.core.web.CommonResponse;');
    expect(c1).not.toContain('com.forge.app');
  });

  it('ResponseEntity.status(code.status()) 로 HTTP 코드 반영', () => {
    expect(content).toMatch(/ResponseEntity\s*\.status\(/);
  });
});
