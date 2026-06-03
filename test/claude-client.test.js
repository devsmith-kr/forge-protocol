import { describe, it, expect } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseForgePrompt, extractCodeFiles } from '../lib/core/claude-client.js';

describe('parseForgePrompt', () => {
  it('system/user 섹션이 명시된 프롬프트를 분리한다 (shape 패턴)', () => {
    const prompt = `# Forge Protocol — 아키텍처 설계 프롬프트

> forge shape가 자동 생성했습니다.

---

## System Prompt

당신은 시니어 소프트웨어 아키텍트입니다.
아키텍처를 설계하세요.

### 출력 형식

1. 다이어그램
2. 레이어별 설계

---

## User Message

### 선택된 블럭 (3개)

- 상품관리 (5일)
- 주문 (7일)
- 결제 (5일)

### 기술 결정사항

- backend: spring-boot`;

    const { system, user } = parseForgePrompt(prompt);

    expect(system).toContain('시니어 소프트웨어 아키텍트');
    expect(system).toContain('출력 형식');
    expect(system).not.toContain('선택된 블럭');

    expect(user).toContain('선택된 블럭');
    expect(user).toContain('상품관리');
    expect(user).toContain('spring-boot');
    expect(user).not.toContain('시니어 소프트웨어 아키텍트');
  });

  it('User Message 헤더 없이 --- 구분자로만 나뉜 프롬프트를 분리한다 (build 패턴)', () => {
    const prompt = `# Forge Protocol — 코드 생성 프롬프트

> forge forge가 자동 생성했습니다.

---

## System Prompt

당신은 시니어 풀스택 개발자입니다.

### 코드 생성 원칙

1. 계약 우선
2. 레이어 분리

---

## 기술 스택

- backend: spring-boot

## API 계약

- /api/products: GET, POST

---

## 생성 요청

위 3개 블럭의 코드를 생성해주세요.`;

    const { system, user } = parseForgePrompt(prompt);

    expect(system).toContain('시니어 풀스택 개발자');
    expect(system).toContain('계약 우선');

    expect(user).toContain('기술 스택');
    expect(user).toContain('/api/products');
    expect(user).toContain('생성 요청');
  });

  it('--- 구분자가 2개 미만이면 전체를 user 메시지로 반환한다', () => {
    const prompt = '그냥 프롬프트입니다. 구분자 없음.';
    const { system, user } = parseForgePrompt(prompt);

    expect(system).toBe('');
    expect(user).toBe(prompt);
  });

  it('User Message 헤더를 제거하고 본문만 반환한다', () => {
    const prompt = `# Title

---

## System Prompt

시스템 지시문

---

## User Message

실제 사용자 메시지 본문`;

    const { system, user } = parseForgePrompt(prompt);

    expect(system).toBe('시스템 지시문');
    expect(user).toBe('실제 사용자 메시지 본문');
  });

  it('여러 --- 구분자가 user 영역에 있으면 병합된다 ', () => {
    const prompt = `# Header

---

## System Prompt

시스템

---

## User Message

첫 번째 섹션

---

두 번째 섹션

---

세 번째 섹션`;

    const { system, user } = parseForgePrompt(prompt);

    expect(system).toBe('시스템');
    expect(user).toContain('첫 번째 섹션');
    expect(user).toContain('두 번째 섹션');
    expect(user).toContain('세 번째 섹션');
  });
});

describe('extractCodeFiles', () => {
  const testDir = join(tmpdir(), `forge-extract-test-${Date.now()}`);

  it('파일명 힌트 + 코드 블럭에서 소스 파일을 추출한다', async () => {
    const md = `
# 코드 생성 결과

### ProductService.java

\`\`\`java
package com.forge.product;

public class ProductService {
    public void findAll() {}
}
\`\`\`

### ProductController.java

\`\`\`java
package com.forge.product;

public class ProductController {
    private final ProductService service;
}
\`\`\`
`;
    const dir = join(testDir, 'hint');
    const files = await extractCodeFiles(md, dir);

    expect(files.length).toBe(2);
    const svc = await readFile(files.find((f) => f.includes('ProductService')), 'utf-8');
    expect(svc).toContain('public class ProductService');
    expect(files[0]).toContain(join('src', 'main', 'java', 'com', 'forge', 'product'));

    await rm(dir, { recursive: true, force: true });
  });

  it('파일명 힌트 없이 package+class 선언에서 추론한다', async () => {
    const md = `
\`\`\`java
package com.forge.order;

public class OrderService {
    public void create() {}
}
\`\`\`

\`\`\`java
package com.forge.order;

public class OrderServiceTest {
    public void testCreate() {}
}
\`\`\`
`;
    const dir = join(testDir, 'infer');
    const files = await extractCodeFiles(md, dir);

    expect(files.length).toBe(2);
    expect(files.find((f) => f.includes('OrderService.java'))).toBeTruthy();
    const testFile = files.find((f) => f.includes('OrderServiceTest'));
    expect(testFile).toContain(join('src', 'test', 'java'));

    await rm(dir, { recursive: true, force: true });
  });

  it('yml/properties 파일은 resources 하위에 저장한다', async () => {
    const md = `
### application.yml

\`\`\`yaml
spring:
  datasource:
    url: jdbc:h2:mem:test
\`\`\`
`;
    const dir = join(testDir, 'resources');
    const files = await extractCodeFiles(md, dir);

    expect(files.length).toBe(1);
    expect(files[0]).toContain(join('src', 'main', 'resources', 'application.yml'));

    await rm(dir, { recursive: true, force: true });
  });
});
