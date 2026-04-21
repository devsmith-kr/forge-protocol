# 보안 정책

## 지원 버전

| 버전 | 지원 여부 | 비고 |
|------|-----------|------|
| 0.2.x | ✅ | 현재 개발 라인 |
| 0.1.x | ✅ | 보안 패치만 |
| < 0.1 | ❌ | 지원 종료 |

공개 후 릴리스는 최소 6개월간 보안 패치를 제공합니다.

## 취약점 신고

Forge Protocol에서 보안 취약점을 발견하셨다면, 책임감 있게 신고해주세요.

### 신고 방법

1. 보안 취약점에 대해 **공개 GitHub 이슈를 열지 마세요**
2. 이메일: **devsmith.kr@gmail.com**
3. 포함할 내용:
   - 취약점 설명
   - 재현 단계
   - 잠재적 영향
   - 수정 제안 (있는 경우)

### 응답 일정

- **수신 확인**: 48시간 이내
- **초기 평가**: 1주일 이내
- **수정 배포**: 심각한 문제의 경우 2주 이내

### 범위

Forge Protocol은 주로 CLI 도구와 클라이언트 사이드 Web UI입니다. 주요 보안 관심사:

- **CLI**: 템플릿 파일이나 사용자 입력을 통한 명령어 주입
- **Web UI**: 카탈로그 YAML 파싱 또는 사용자 생성 콘텐츠를 통한 XSS
- **템플릿**: 커뮤니티 기여 템플릿의 악의적 YAML 콘텐츠
- **의존성**: npm 의존성의 취약점

### 범위 외

- 서드파티 AI 서비스(Claude, GPT 등)의 문제
- 물리적 장치 접근이 필요한 취약점
- 소셜 엔지니어링 공격

## 공급망(Supply Chain) 보안

Forge Protocol은 npm으로 배포되는 오픈소스 패키지로서, 공급망 무결성을 최우선으로 여깁니다.

### 배포 아티팩트 검증

- **npm Provenance**: 모든 공식 릴리스는 `npm publish --provenance`로 배포되며,
  [GitHub Actions 워크플로 소스](../../blob/main/.github/workflows/release.yml)에서 빌드된 증명이 npm 레지스트리에 기록됩니다.
  설치 후 `npm audit signatures`로 검증할 수 있습니다.
- **Signed Tags**: `v*` 태그는 관리자의 GPG 키로 서명됩니다.
- **최소 권한 CI**: 릴리스 워크플로는 `contents: write` + `id-token: write` 외의 권한을 요구하지 않습니다.

### SBOM (Software Bill of Materials)

각 릴리스 아티팩트에 대해 `npm sbom --package-lock-only --sbom-format=cyclonedx` 기반의 SBOM을 생성할 계획입니다 (v1.0 목표).
현재는 `package-lock.json`을 공식 BOM으로 간주하며, 의존성 그래프는 GitHub의 Dependency Graph / Dependabot으로 추적합니다.

### SLSA 준수 목표

- **현재**: SLSA Build Level 1 — 빌드 서비스(GitHub Actions) 사용, 출처(provenance) 자동 첨부
- **목표(v1.0)**: SLSA Build Level 2 — 서명된 provenance + 분리된 빌드 환경
- **장기(v2.0)**: SLSA Build Level 3 — 비가역적 빌드 + 격리된 서비스

### 커뮤니티 템플릿 검증 가이드

`templates/` 외부에서 받은 `catalog.yml`은 실행 전 반드시 검토하세요.

```bash
# 구조 검증 (Zod 스키마 통과 여부)
node -e "import('./lib/schemas.js').then(m => {
  import('js-yaml').then(y => {
    import('node:fs').then(fs => {
      const data = y.default.load(fs.default.readFileSync(process.argv[1], 'utf-8'));
      m.validateYaml(m.CatalogSchema, data, 'catalog.yml');
      console.log('✓ 구조 유효');
    });
  });
})" path/to/catalog.yml

# 의심스러운 패턴 스캔
grep -n 'exec\|spawn\|eval\|Function(' path/to/catalog.yml
```

출처를 알 수 없는 템플릿은 절대 사용하지 말고, PR로 공식 저장소에 기여된 템플릿을 선호하세요.

## 사용자를 위한 보안 모범 사례

- 커뮤니티 기여 템플릿은 사용 전에 반드시 검토하세요 (위 "검증 가이드" 참조)
- Node.js와 npm 의존성을 최신 상태로 유지하세요 — `npm audit`을 정기적으로 실행
- `.forge/` 출력에는 의사결정/아키텍처 정보가 포함되므로, 공개 저장소 커밋 전 민감 정보 여부를 확인하세요
- 설치 후 `npm audit signatures`로 서명된 배포본인지 확인하세요
- CI 파이프라인에서 Forge를 실행할 때는 오프라인 카탈로그(빌트인 `commerce`)를 선호하세요

## 감사

책임감 있는 공개에 감사드리며, (허가 시) 릴리스 노트에서 보안 연구자분들을 인정합니다.

---

## English

If you discover a security vulnerability, please report it to **devsmith.kr@gmail.com** — do NOT open a public GitHub issue. We will acknowledge within 48 hours and provide an initial assessment within 1 week. See the Korean sections above for full details on scope, supply-chain posture (npm provenance, SLSA targets, SBOM), and reporting guidelines.
