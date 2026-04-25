/**
 * shared/java-api.js
 *
 * Spring Boot API 경계 Java 코드 — Controller, Entity, Repository, DTO(record).
 * Request/Response 형태와 직접 연결되는 파일들을 모아둔다.
 */

import {
  parseBody,
  parseResp,
  methodName,
  reqDtoName,
  respDtoName,
  javaType,
  pkgSegmentOf,
  classNameOf,
  svcVar,
  inferEntityFields,
} from './names.js';

// ── Controller ───────────────────────────────────────────

export function generateController(grp, basePackage) {
  const pkg = pkgSegmentOf(grp);
  const cls = classNameOf(grp);
  const sv = svcVar(cls);
  const pkgPath = `${basePackage}.${pkg}`;

  const imports = new Set([
    `${pkgPath}.service.${cls}Service`,
    `${pkgPath}.dto.*`,
    `io.swagger.v3.oas.annotations.Operation`,
    `io.swagger.v3.oas.annotations.tags.Tag`,
    `lombok.RequiredArgsConstructor`,
    `org.springframework.http.HttpStatus`,
    `org.springframework.http.ResponseEntity`,
    `org.springframework.web.bind.annotation.*`,
  ]);

  const methods = grp.endpoints.map((ep) => {
    const body = parseBody(ep.body);
    const resp = parseResp(ep.response);
    const mName = methodName(ep.method, ep.path);
    const hasId = ep.path.includes('{id}');
    const relPath = ep.path.replace('/api/v1', '');
    const rqd = reqDtoName(ep.method, ep.path);
    const rpd = respDtoName(ep.method, ep.path);

    const paramDefs = [];
    const paramNames = [];

    if (hasId) {
      paramDefs.push('@PathVariable Long id');
      paramNames.push('id');
    }
    if (body.kind === 'json' && body.fields.length) {
      imports.add('jakarta.validation.Valid');
      paramDefs.push(`@Valid @RequestBody ${rqd} request`);
      paramNames.push('request');
    } else if (body.kind === 'multipart') {
      imports.add('org.springframework.web.multipart.MultipartFile');
      paramDefs.push('@RequestParam("file") MultipartFile file');
      paramNames.push('file');
    } else if (body.kind === 'query') {
      paramDefs.push('@RequestParam(defaultValue = "0") int page');
      paramDefs.push('@RequestParam(defaultValue = "20") int size');
      paramNames.push('page', 'size');
    }

    const httpAnn =
      {
        GET: 'GetMapping',
        POST: 'PostMapping',
        PUT: 'PutMapping',
        PATCH: 'PatchMapping',
        DELETE: 'DeleteMapping',
      }[ep.method] || 'RequestMapping';

    const call = `${sv}.${mName}(${paramNames.join(', ')})`;
    const pStr = paramDefs.join(', ');

    let returnLine;
    if (resp.status === '204') {
      returnLine = `        ${call};\n        return ResponseEntity.noContent().build();`;
    } else if (resp.status === '201') {
      returnLine = `        return ResponseEntity.status(HttpStatus.CREATED).body(${call});`;
    } else {
      returnLine = `        return ResponseEntity.ok(${call});`;
    }

    const retType = resp.status === '204' ? 'ResponseEntity<Void>' : `ResponseEntity<${rpd}>`;

    return (
      `    @Operation(summary = "${ep.summary}")\n` +
      `    @${httpAnn}("${relPath}")\n` +
      `    public ${retType} ${mName}(${pStr}) {\n` +
      `${returnLine}\n` +
      `    }`
    );
  });

  return (
    `package ${pkgPath}.controller;\n\n` +
    [...imports].sort().map((i) => `import ${i};`).join('\n') +
    `\n\n` +
    `@RestController\n` +
    `@RequestMapping("/api/v1")\n` +
    `@RequiredArgsConstructor\n` +
    `@Tag(name = "${grp.service}")\n` +
    `public class ${cls}Controller {\n\n` +
    `    private final ${cls}Service ${sv};\n\n` +
    methods.join('\n\n') +
    `\n}\n`
  );
}

// ── Entity + Repository ──────────────────────────────────

/**
 * @param {object} grp                       service + endpoints
 * @param {string} basePackage               루트 패키지 (예: 'com.forge.app')
 * @param {object} [opts]
 * @param {boolean} [opts.extendsBaseEntity=false]
 *        true 면 id/createdAt/updatedAt + 라이프사이클 콜백을 본문에서 제거하고
 *        :core 모듈의 BaseEntity 를 상속한다. 멀티모듈 emit (Step 5) 전용.
 *        기본값(false) 은 single-module v0.4 호환 — 본문에 모든 필드 inline.
 */
export function generateEntity(grp, basePackage, opts = {}) {
  const { extendsBaseEntity = false } = opts;
  const pkg = pkgSegmentOf(grp);
  const cls = classNameOf(grp);
  const pkgPath = `${basePackage}.${pkg}`;

  // BaseEntity 가 id/createdAt/updatedAt 을 제공하므로, 추론된 필드에서 중복 제거.
  // single 모드에서도 id 는 항상 제거(아래에서 inline 으로 별도 작성).
  const fields = inferEntityFields(grp).filter((f) => {
    if (f === 'id') return false;
    if (extendsBaseEntity && (f === 'createdAt' || f === 'updatedAt')) return false;
    return true;
  });

  const needsBigDecimal = fields.some((f) => javaType(f) === 'BigDecimal');
  const needsList = fields.some((f) => javaType(f).startsWith('List'));
  // single 모드는 createdAt/updatedAt 을 본문에 inline 하므로 LocalDateTime 항상 필요.
  // multi 모드는 도메인 필드에 LocalDateTime 이 있을 때만 필요 (BaseEntity 가 처리).
  const needsLocalDateTime =
    !extendsBaseEntity || fields.some((f) => javaType(f) === 'LocalDateTime');

  const imports = [
    'jakarta.persistence.*',
    'lombok.*',
    needsBigDecimal ? 'java.math.BigDecimal' : '',
    needsLocalDateTime ? 'java.time.LocalDateTime' : '',
    needsList ? 'java.util.List' : '',
    extendsBaseEntity ? `${basePackage}.core.entity.BaseEntity` : '',
  ]
    .filter(Boolean)
    .map((i) => `import ${i};`)
    .join('\n');

  const fieldLines = fields.map((f) => `    private ${javaType(f)} ${f};`).join('\n');

  if (extendsBaseEntity) {
    return (
      `package ${pkgPath}.entity;\n\n` +
      `${imports}\n\n` +
      `@Entity\n` +
      `@Table(name = "${pkg}s")\n` +
      `@Getter\n@Setter\n@NoArgsConstructor\n@AllArgsConstructor\n@Builder\n` +
      `public class ${cls} extends BaseEntity {\n\n` +
      (fieldLines ? `${fieldLines}\n` : '') +
      `}\n`
    );
  }

  // single-module 기본 동작 (v0.4 호환 — 회귀 0)
  return (
    `package ${pkgPath}.entity;\n\n` +
    `${imports}\n\n` +
    `@Entity\n` +
    `@Table(name = "${pkg}s")\n` +
    `@Getter\n@Setter\n@NoArgsConstructor\n@AllArgsConstructor\n@Builder\n` +
    `public class ${cls} {\n\n` +
    `    @Id\n` +
    `    @GeneratedValue(strategy = GenerationType.IDENTITY)\n` +
    `    private Long id;\n\n` +
    (fieldLines ? `${fieldLines}\n\n` : '') +
    `    @Column(nullable = false, updatable = false)\n` +
    `    private LocalDateTime createdAt;\n\n` +
    `    @Column(nullable = false)\n` +
    `    private LocalDateTime updatedAt;\n\n` +
    `    @PrePersist\n` +
    `    protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }\n\n` +
    `    @PreUpdate\n` +
    `    protected void onUpdate() { updatedAt = LocalDateTime.now(); }\n` +
    `}\n`
  );
}

export function generateRepository(grp, basePackage) {
  const pkg = pkgSegmentOf(grp);
  const cls = classNameOf(grp);
  const pkgPath = `${basePackage}.${pkg}`;

  return (
    `package ${pkgPath}.repository;\n\n` +
    `import ${pkgPath}.entity.${cls};\n` +
    `import org.springframework.data.jpa.repository.JpaRepository;\n\n` +
    `public interface ${cls}Repository extends JpaRepository<${cls}, Long> {\n}\n`
  );
}

// ── DTOs (Java record) ──────────────────────────────────

export function generateDtos(grp, basePackage) {
  const pkg = pkgSegmentOf(grp);
  const pkgPath = `${basePackage}.${pkg}`;
  const seen = {};

  for (const ep of grp.endpoints) {
    const body = parseBody(ep.body);
    const resp = parseResp(ep.response);
    if (body.kind === 'json' && body.fields.length) {
      const name = reqDtoName(ep.method, ep.path);
      if (!seen[name]) seen[name] = body.fields;
    }
    if (resp.kind === 'json' && resp.fields.length) {
      const name = respDtoName(ep.method, ep.path);
      if (!seen[name]) seen[name] = resp.fields;
    }
  }

  return Object.entries(seen).map(([name, fields]) => {
    const extraImports = [
      fields.some((f) => javaType(f) === 'BigDecimal') ? 'import java.math.BigDecimal;' : '',
      fields.some((f) => javaType(f) === 'LocalDateTime')
        ? 'import java.time.LocalDateTime;'
        : '',
      fields.some((f) => javaType(f).startsWith('List')) ? 'import java.util.List;' : '',
    ]
      .filter(Boolean)
      .join('\n');

    const params = fields.map((f) => `    ${javaType(f)} ${f}`).join(',\n');

    return {
      name,
      content:
        `package ${pkgPath}.dto;\n\n` +
        (extraImports ? extraImports + '\n\n' : '') +
        `public record ${name}(\n${params}\n) {}\n`,
    };
  });
}
