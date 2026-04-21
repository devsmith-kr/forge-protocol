/**
 * shared/java-service.js
 *
 * Spring Boot 서비스 계층 Java 코드 — Service 인터페이스, ServiceImpl(CRUD 자동 구현
 * + 액션 엔드포인트 힌트).
 */

import {
  parseBody,
  parseResp,
  methodName,
  reqDtoName,
  respDtoName,
  pathSegs,
  pkgOf,
  clsOf,
  isCrudEndpoint,
  inferEntityFields,
} from './names.js';

// ── Service 인터페이스 ──────────────────────────────────

export function generateServiceInterface(grp, basePackage) {
  const pkg = pkgOf(grp.service);
  const cls = clsOf(grp.service);
  const pkgPath = `${basePackage}.${pkg}`;

  const methods = grp.endpoints
    .map((ep) => {
      const body = parseBody(ep.body);
      const resp = parseResp(ep.response);
      const mName = methodName(ep.method, ep.path);
      const hasId = ep.path.includes('{id}');

      const params = [];
      if (hasId) params.push('Long id');
      if (body.kind === 'json' && body.fields.length)
        params.push(`${reqDtoName(ep.method, ep.path)} request`);
      else if (body.kind === 'multipart') params.push('MultipartFile file');
      else if (body.kind === 'query') params.push('int page, int size');

      const ret = resp.status === '204' ? 'void' : respDtoName(ep.method, ep.path);
      return `    ${ret} ${mName}(${params.join(', ')});`;
    })
    .join('\n\n');

  return (
    `package ${pkgPath}.service;\n\n` +
    `import ${pkgPath}.dto.*;\n` +
    `import org.springframework.web.multipart.MultipartFile;\n\n` +
    `public interface ${cls}Service {\n\n` +
    `${methods}\n` +
    `}\n`
  );
}

// ── 액션 엔드포인트 힌트 ────────────────────────────────

/**
 * path 세그먼트를 보고 액션 엔드포인트 구현 힌트를 반환한다.
 * CRUD가 아닌 login/signup/approve/cancel/upload/search 등에 쓰인다.
 */
export function actionHint(ep, cls, repoVar) {
  const seg = pathSegs(ep.path).join('/');
  if (/login|signin/.test(seg))
    return [
      `1. 사용자 조회: ${repoVar}.findByEmail(request.email())`,
      '2. 비밀번호 검증: passwordEncoder.matches(...)',
      '3. JWT 발급',
    ];
  if (/signup|register/.test(seg))
    return [
      '1. 중복 이메일 확인',
      '2. 비밀번호 암호화: passwordEncoder.encode(...)',
      `3. ${repoVar}.save(entity)`,
    ];
  if (/logout/.test(seg)) return ['1. Refresh 토큰 무효화 또는 블랙리스트 등록'];
  if (/refresh/.test(seg)) return ['1. Refresh 토큰 검증', '2. 새 Access 토큰 발급'];
  if (/approv|confirm/.test(seg))
    return [
      '1. 상태 검증 (현재 상태가 승인 가능한지)',
      `2. 상태 변경 + ${repoVar}.save(entity)`,
      '3. 알림 발송',
    ];
  if (/reject|cancel/.test(seg))
    return [
      '1. 상태 검증',
      `2. 상태 변경 + ${repoVar}.save(entity)`,
      '3. 환불/복원 처리',
    ];
  if (/upload|attach/.test(seg))
    return [
      '1. 파일 유효성 검사 (확장자, 크기)',
      '2. S3 업로드: storageService.upload(file)',
      '3. URL 반환',
    ];
  if (/search|find/.test(seg))
    return [
      '1. 검색 조건 파싱',
      '2. QueryDSL 또는 Specification으로 동적 쿼리',
      '3. 결과 DTO 변환',
    ];
  return [`1. ${ep.summary || '비즈니스 로직 구현'}`, '2. 필요한 의존성 주입 추가'];
}

// ── ServiceImpl (CRUD 자동 구현) ────────────────────────

export function generateServiceImpl(grp, basePackage) {
  const pkg = pkgOf(grp.service);
  const cls = clsOf(grp.service);
  const pkgPath = `${basePackage}.${pkg}`;
  const repoVar = cls[0].toLowerCase() + cls.slice(1) + 'Repository';
  const entityFields = inferEntityFields(grp).filter((f) => f !== 'id');

  const imports = new Set([
    `${pkgPath}.dto.*`,
    `${pkgPath}.entity.${cls}`,
    `${pkgPath}.repository.${cls}Repository`,
    `lombok.RequiredArgsConstructor`,
    `org.springframework.data.domain.PageRequest`,
    `org.springframework.stereotype.Service`,
    `org.springframework.transaction.annotation.Transactional`,
    `org.springframework.web.multipart.MultipartFile`,
    `java.util.List`,
  ]);

  const methods = grp.endpoints
    .map((ep) => {
      const body = parseBody(ep.body);
      const resp = parseResp(ep.response);
      const mName = methodName(ep.method, ep.path);
      const hasId = ep.path.includes('{id}');
      const isCrud = isCrudEndpoint(ep);
      const m = ep.method.toUpperCase();
      const rqd = reqDtoName(ep.method, ep.path);
      const rpd = respDtoName(ep.method, ep.path);

      const params = [];
      if (hasId) params.push('Long id');
      if (body.kind === 'json' && body.fields.length) params.push(`${rqd} request`);
      else if (body.kind === 'multipart') params.push('MultipartFile file');
      else if (body.kind === 'query') params.push('int page, int size');

      const ret = resp.status === '204' ? 'void' : rpd;
      const notFound = `new RuntimeException("${cls} not found: " + id)`;

      let bodyLines;
      if (isCrud) {
        if (m === 'GET' && !hasId) {
          bodyLines =
            `        List<${cls}> list = ${repoVar}.findAll(PageRequest.of(page, size)).getContent();\n` +
            `        return new ${rpd}(list.stream().map(this::toResponse).toList());`;
        } else if (m === 'GET' && hasId) {
          bodyLines =
            `        ${cls} entity = ${repoVar}.findById(id)\n` +
            `                .orElseThrow(() -> ${notFound});\n` +
            `        return toResponse(entity);`;
        } else if (m === 'POST') {
          bodyLines =
            `        ${cls} entity = toEntity(request);\n` +
            `        return toResponse(${repoVar}.save(entity));`;
        } else if ((m === 'PUT' || m === 'PATCH') && hasId) {
          const setters = entityFields
            .map((f) => `        // entity.set${f[0].toUpperCase() + f.slice(1)}(request.${f}());`)
            .join('\n');
          bodyLines =
            `        ${cls} entity = ${repoVar}.findById(id)\n` +
            `                .orElseThrow(() -> ${notFound});\n` +
            `        // 수정할 필드를 아래 주석을 해제하여 채우세요:\n` +
            `${setters}\n` +
            `        return toResponse(${repoVar}.save(entity));`;
        } else if (m === 'DELETE' && hasId) {
          bodyLines = `        ${repoVar}.deleteById(id);`;
        } else {
          bodyLines = `        // TODO: implement`;
        }
      } else {
        const hint = actionHint(ep, cls, repoVar);
        bodyLines =
          `        // [비즈니스 로직 구현 필요]\n` +
          hint.map((l) => `        // ${l}`).join('\n') +
          '\n' +
          `        throw new UnsupportedOperationException("${mName}: 구현 필요");`;
      }

      const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m);
      const txAnn = isMutating ? `    @Transactional\n` : '';

      return (
        `    @Override\n` +
        `${txAnn}` +
        `    public ${ret} ${mName}(${params.join(', ')}) {\n` +
        `${bodyLines}\n` +
        `    }`
      );
    })
    .join('\n\n');

  const toEntityFields = entityFields.map((f) => `        // .${f}(request.${f}())`).join('\n');
  const toResponseFields = ['id', ...entityFields]
    .map((f) => `                // entity.get${f[0].toUpperCase() + f.slice(1)}()`)
    .join(',\n');

  const helpers =
    `    private ${cls} toEntity(Object request) {\n` +
    `        // TODO: request 필드를 채우세요\n` +
    `        return ${cls}.builder()\n` +
    `${toEntityFields}\n` +
    `                .build();\n` +
    `    }\n\n` +
    `    private Object toResponse(${cls} entity) {\n` +
    `        // TODO: 반환 DTO 타입과 필드를 채우세요\n` +
    `        return new Object() { /* \n` +
    `${toResponseFields}\n` +
    `        */ };\n` +
    `    }`;

  return (
    `package ${pkgPath}.service;\n\n` +
    [...imports].sort().map((i) => `import ${i};`).join('\n') +
    `\n\n` +
    `@Service\n@RequiredArgsConstructor\n@Transactional(readOnly = true)\n` +
    `public class ${cls}ServiceImpl implements ${cls}Service {\n\n` +
    `    private final ${cls}Repository ${repoVar};\n\n` +
    `${methods}\n\n` +
    `    // ── private helpers ─────────────────────────────────\n\n` +
    `${helpers}\n` +
    `}\n`
  );
}
