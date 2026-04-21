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
  pkgOf,
  clsOf,
  svcVar,
  inferEntityFields,
} from './names.js';

// ── Controller ───────────────────────────────────────────

export function generateController(grp, basePackage) {
  const pkg = pkgOf(grp.service);
  const cls = clsOf(grp.service);
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

export function generateEntity(grp, basePackage) {
  const pkg = pkgOf(grp.service);
  const cls = clsOf(grp.service);
  const pkgPath = `${basePackage}.${pkg}`;
  const fields = inferEntityFields(grp).filter((f) => f !== 'id');

  const needsBigDecimal = fields.some((f) => javaType(f) === 'BigDecimal');
  const needsList = fields.some((f) => javaType(f).startsWith('List'));

  const imports = [
    'jakarta.persistence.*',
    'lombok.*',
    needsBigDecimal ? 'java.math.BigDecimal' : '',
    'java.time.LocalDateTime',
    needsList ? 'java.util.List' : '',
  ]
    .filter(Boolean)
    .map((i) => `import ${i};`)
    .join('\n');

  const fieldLines = fields.map((f) => `    private ${javaType(f)} ${f};`).join('\n');

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
  const pkg = pkgOf(grp.service);
  const cls = clsOf(grp.service);
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
  const pkg = pkgOf(grp.service);
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
