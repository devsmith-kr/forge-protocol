# Forge Protocol 기여 가이드

Forge Protocol에 관심을 가져주셔서 감사합니다! 이 가이드는 기여를 시작하는 데 도움을 드립니다.

## 목차

- [개발 환경 설정](#개발-환경-설정)
- [프로젝트 구조](#프로젝트-구조)
- [기여 방법](#기여-방법)
- [새 템플릿 추가하기](#새-템플릿-추가하기)
- [코드 규칙](#코드-규칙)
- [Pull Request 절차](#pull-request-절차)

## 개발 환경 설정

### 사전 요구사항

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0

### CLI 개발

```bash
# 저장소 클론
git clone https://github.com/devsmith-kr/forge-protocol.git
cd forge-protocol

# 의존성 설치
npm install

# CLI 명령어 실행
node bin/forge.js --help
node bin/forge.js init --template commerce
```

### Web UI 개발

```bash
cd web
npm install
npm run dev
# http://localhost:5173 열기
```

## 프로젝트 구조

```
forge-protocol/
├── bin/forge.js              # CLI 엔트리포인트
├── lib/
│   ├── init.js               # forge init
│   ├── meta-smelt.js         # forge meta-smelt (Phase 0)
│   ├── smelt.js              # forge smelt (Phase 1)
│   ├── shape.js              # forge shape (Phase 2)
│   ├── build.js              # forge forge (Phase 3)
│   ├── temper.js             # forge temper (Phase 4)
│   ├── inspect.js            # forge inspect (Phase 5)
│   ├── assemble.js           # forge assemble
│   ├── assembler.js          # 조립 엔진
│   ├── status.js             # forge status
│   ├── catalog.js            # 카탈로그 로더
│   ├── dependency.js         # 의존성 해결 엔진
│   ├── domain-surveys.js     # 도메인별 설문 정의
│   └── core/
│       ├── ui.js             # 리치 UI 컴포넌트
│       └── project.js        # 프로젝트 유틸리티
├── templates/
│   └── commerce/catalog.yml  # Commerce 템플릿 (21개 블럭 / 19개 의존성 / 6 World)
├── web/                      # React + Vite Web UI
└── docs/                     # 문서
```

## 기여 방법

### 버그 신고

[버그 리포트](https://github.com/devsmith-kr/forge-protocol/issues/new?template=bug_report.yml) 이슈 템플릿을 사용하세요. 포함할 내용:

- 재현 단계
- 예상 동작 vs 실제 동작
- 환경 정보 (Node.js 버전, OS, CLI/Web)

### 기능 제안

[기능 요청](https://github.com/devsmith-kr/forge-protocol/issues/new?template=feature_request.yml) 이슈 템플릿을 사용하세요.

### 새 템플릿 요청

[템플릿 요청](https://github.com/devsmith-kr/forge-protocol/issues/new?template=template_request.yml) 이슈 템플릿을 사용하세요. 설명할 내용:

- 대상 도메인
- 예상 블럭 및 워크플로우
- 해당 도메인의 현실 준비물

## 새 템플릿 추가하기

1. `templates/` 아래에 디렉토리를 생성하세요:
   ```
   templates/your-domain/catalog.yml
   ```

2. 카탈로그 YAML 구조를 따르세요:
   ```yaml
   domain: your-domain
   description: 도메인에 대한 간략한 설명
   worlds:
     - name: World 이름
       description: 이 World가 다루는 범위
       bundles:
         - name: 번들 이름
           blocks:
             - id: unique-block-id
               name: 사람이 읽을 수 있는 이름
               description: 이 블럭이 하는 일
               dependencies: [other-block-id]
               priority: must-have    # must-have | should-have | nice-to-have
               decisions: []          # 필요한 아키텍처 결정사항
               prerequisites: []     # 현실 준비물
   ```

3. 주요 규칙:
   - 블럭 `id`는 카탈로그 내에서 고유해야 합니다
   - 의존성은 다른 블럭의 `id`를 참조합니다
   - 각 World는 3~5개 번들로 유지하세요
   - 각 번들은 3~7개 블럭으로 구성하세요
   - 사용자에게 한 번에 5개 이하의 선택지만 보여야 합니다

4. 템플릿을 테스트하세요:
   ```bash
   node bin/forge.js init --template your-domain
   node bin/forge.js smelt
   ```

## 코드 규칙

- **모듈 시스템**: ESM (`import`/`export`), CommonJS 사용 금지
- **Node.js**: Node 18+ 기능 사용
- **언어**: 한국어 주석 및 변수명 사용 가능 (영문 병행)
- **의존성**: 최소화 — `chalk`, `inquirer`, `commander`, `js-yaml`, `ora` 사용
- **파일 명명**: 소문자 + 하이픈 (`meta-smelt.js`, `metaSmelt.js` 아님)
- **YAML 출력**: 모든 프로토콜 아티팩트는 사용자 프로젝트의 `.forge/` 디렉토리에 저장

## Pull Request 절차

1. 저장소를 **Fork**하고 기능 브랜치를 생성하세요:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. 변경사항을 반영하고 다음을 확인하세요:
   - CLI 명령어 동작: `node bin/forge.js --help`
   - Web UI 빌드: `cd web && npm run build`
   - 기존 템플릿에 대한 호환성 파괴 없음

3. 명확한 메시지로 **커밋**하세요:
   ```
   feat: 18개 블럭을 포함한 헬스케어 템플릿 추가
   fix: smelt에서 의존성 순환 감지 수정
   docs: 새 템플릿 안내로 README 업데이트
   ```
   [Conventional Commits](https://www.conventionalcommits.org/) 스타일을 사용하세요.

4. **Pull Request를 제출**하고 다음을 포함하세요:
   - 변경사항 요약
   - 영향 범위 (CLI / Web / 템플릿)
   - 테스트 단계

5. **리뷰**: 메인테이너가 PR을 리뷰합니다. 피드백에 적극적으로 응답해주세요.

## 질문이 있으신가요?

[Discussion](https://github.com/devsmith-kr/forge-protocol/discussions)을 열거나 Issues를 통해 연락해주세요.

Forge Protocol을 함께 만들어주셔서 감사합니다!

---

## English

Thank you for your interest in contributing to Forge Protocol! For English speakers: the project follows ESM modules, Node 18+, and [Conventional Commits](https://www.conventionalcommits.org/). See the Korean sections above for detailed contribution guidelines — the code structure and examples are language-neutral. Feel free to open issues or discussions in English.
