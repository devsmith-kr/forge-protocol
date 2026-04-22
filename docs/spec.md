# Forge Protocol — 상세 스펙 참고 문서

> 이 파일은 자동 로드되지 않습니다. 필요 시 직접 열어 참고하세요.
> 최종 업데이트: 2026-04-22 (v0.3.0 기준)

---

## 핵심 철학

"도돌이표 설계 승격" — 기존 바이브코딩은 "만들어줘" → 바로 코드. Forge는 심문→구조화→검증 후 코드.

왜 필요한가:
1. 인간은 원하는 것의 30%만 말함 (의도의 불완전성)
2. 블럭 간 보이지 않는 연결을 사람이 다 파악 불가 (쿠폰→환불/정산/결제)
3. 코드 전에 현실 준비물(사업자등록, PG계약)이 필요한데 아무도 안 알려줌
4. 기존 AI 코딩 도구는 전부 "구현"에서 시작

두 겹의 언어:
- `user_desc`: 일반인용 (비유, 일상 언어)
- `tech_desc`: 개발자용 (기술 스택, 패턴, 자료구조)

---

## 데이터 모델

### 계층 엔티티
```
World → Bundle → Block → TechSpec
```

### 횡단 엔티티
```
Dependency (source → target, type: requires|affects, condition)
CascadeRule (trigger → add_blocks[], ask_questions[])
UserDecision (question, options[], cascade_effects[])
Prerequisite (name, phase, where, time, cost) — World0 ↔ Block
```

### .forge/ 구조 (v0.3.0 실제)
```
.forge/
├── catalog/catalog.yml       # 블럭 카탈로그 (오픈소스 공유)
├── project/
│   ├── state.yml             # 현재 Phase
│   ├── intent.yml            # Phase 1 결과
│   ├── selected-blocks.yml
│   ├── decisions.yml
│   ├── architecture.yml      # Phase 2 결과
│   ├── contracts.yml         # Phase 3 결과
│   ├── test-scenarios.yml    # Phase 4 결과
│   ├── forge-report.md       # Phase 5 결과
│   └── {phase}-prompt.md     # Claude 전달용 프롬프트 (Phase별)
└── generated/
    └── backend/              # forge emit 결과 (Spring Boot + JUnit5)
```

---

## 커머스 블럭 카탈로그

### 현재 번들된 카탈로그 (v0.3.0 실측)

| 항목 | 수량 |
|------|------|
| World | **6** |
| 블럭 | **21** |
| 의존성 | **19** |

**6개 World**: 파는 사람(w-seller) / 사는 사람(w-buyer) / 물류(w-logistics) / 돈(w-money) / 관리(w-admin) / 연동(w-integration)

`templates/commerce/catalog.yml`이 단일 소스이며 CLI/Web UI가 공용으로 사용한다.

### 설계 비전 (확장 로드맵)

commerce 도메인을 쿠팡급 수준으로 온전히 표현하려면 아래 규모가 필요하다. 현재 21블럭은 MVP 수준이며, 오픈소스 기여/요청에 따라 점진적으로 확장될 예정.

```
6개 세계 / 30개 묶음 / 129개 블럭 (필수 47개)

① 파는 사람의 세계 (7묶음): 입점/인증, 상품관리, 재고관리, 가격/프로모션, 주문처리, 정산, 판매자도구
② 사는 사람의 세계 (6묶음): 가입/인증, 상품탐색, 구매, 결제, 주문이후, 소통
③ 물건이 이동하는 세계 (5묶음): 입고, 보관, 출고, 배송, 반품물류
④ 돈이 흐르는 세계 (4묶음): 결제처리, 환불, 정산, 세무
⑤ 관리하는 세계 (5묶음): 판매자관리, 분쟁관리, 콘텐츠관리, 운영도구, 시스템운영
⑥ 연결하는 세계 (5묶음): 사용자인증연동, 알림시스템, 배송연동, 결제연동, 외부시스템
```

---

## 세 가지 사용 모드

| 모드 | 대상 | 인터페이스 | 현재 상태 |
|------|------|------------|-----------|
| 대화형 | 일반인, 초보 개발자 | AI와 자연어 대화 | MetaSmelt AI 모드 + Claude Bridge로 부분 지원 |
| 시각형 | 기획자, PM | 블럭 클릭/토글 웹 UI | ✅ Web UI 완전 구현 |
| 개발자형 | 시니어 개발자 | CLI + YAML 직접 편집 | ✅ CLI 완전 구현 |

Forge는 기존 도구(Cursor, Claude Code) 앞단에 붙는 구조. 대체가 아니라 보완.
Claude Bridge(`web/server/bridge.js`)를 띄우면 Web UI에서 Claude Code CLI 또는 Claude API를 직접 호출해 코드 생성까지 일원화할 수 있다.

---

## 강점

1. 블럭 의존성 지식 그래프 — 설계 단계에서 누락을 방지
2. 모델 무관 개방형 표준 — Claude/GPT/Gemini 어디서든 `.forge/` YAML을 읽기 가능
3. 대상: "개발자"뿐 아니라 "서비스 만들고 싶은 모든 사람"
4. **CLI/Web UI 단일 소스 공유** — `shared/` 모듈로 코드 생성 로직 일원화 (v0.3.0)

---

## 코드 생성 파이프라인 (v0.3.0)

```
contracts.yml  ─┐
                ├─→  shared/openapi.js      → openapi.yaml
                ├─→  shared/java-api.js     → Controller, DTO
                ├─→  shared/java-service.js → Service, Repository, Entity
                ├─→  shared/project.js      → build.gradle | pom.xml, application.yml
test-scenarios.yml ─→ shared/java-test.js  → JUnit5 테스트 클래스
```

- CLI: `forge emit --target all --build gradle|maven`
- Web UI: BuildPhase/TemperPhase에서 ZIP 다운로드 또는 Claude Bridge 실행
- 출력 경로: `.forge/generated/backend/`
- **프론트엔드 emit은 아직 미구현** — `forge shape`에서 React/Vue/Svelte 선택은 `architecture.yml`에 기록만 되고, 실제 스켈레톤 코드는 생성하지 않는다

---

## Meta-Smelt 프롬프트 체인 (내부 설계)

1. 역할 추출 → 2. 워크플로우 추출 → 3. World/Block 매핑 → 4. 의존성 추론 → 5. World 0 추론

검증 예시: 채용 시스템 → 5세계, 26블럭, 9의존성 자동 생성
