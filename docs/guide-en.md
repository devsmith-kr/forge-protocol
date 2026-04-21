# Forge Protocol — Getting Started Guide

> Design-first AI collaboration protocol. Start with vibes, land on structure, finish with evidence.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [How Forge is Different](#how-forge-is-different)
3. [Installation](#installation)
4. [Full Walkthrough — CLI](#full-walkthrough--cli)
   - [Phase 0.5: Meta-Smelt](#phase-05-meta-smelt--catalog-setup)
   - [Phase 1: Smelt](#phase-1-smelt--block-selection)
   - [Phase 2: Shape](#phase-2-shape--architecture)
   - [Phase 3: Build](#phase-3-build--api-contracts)
   - [Phase 4: Temper](#phase-4-temper--test-scenarios)
   - [Phase 5: Inspect](#phase-5-inspect--multi-perspective-review)
5. [Web UI Walkthrough](#web-ui-walkthrough)
6. [Understanding Block Dependencies](#understanding-block-dependencies)
7. [Output Files Reference](#output-files-reference)
8. [Custom Templates](#custom-templates)
9. [Tips for Hacker News Readers](#tips-for-hacker-news-readers)

---

## The Problem

Every AI coding tool today starts at implementation:

```
User: "Build me an e-commerce platform"
AI:   [generates 3,000 lines of code]
```

The code runs. But three weeks later you realize:
- You need a PG (Payment Gateway) contract, which takes 2–4 weeks to process
- The coupon system you added last-minute now requires changes to payments, refunds, and settlement
- Nobody asked: "What happens to a coupon when an order is partially refunded?"

**Forge forces design before code.** Not because design is virtuous, but because the dependencies are real and expensive to fix later.

---

## How Forge is Different

| | Cursor / Copilot / Bolt | Forge Protocol |
|---|---|---|
| **Starting point** | Implementation | Design |
| **Dependency tracking** | None | Automatic cascade resolution |
| **Non-code prerequisites** | Never mentioned | Surfaced before coding starts |
| **Output** | Code | YAML artifacts → then code |
| **AI role** | Write code | Validate structure you designed |

**The core insight:** Humans express ~30% of what a system actually needs. Forge resolves the other 70% through dependency graphs.

Example — selecting "Coupon" automatically triggers:
```
Coupon selected
  → requires: Payment (discount deduction logic)
  → affects:  Refund (coupon restore policy)
  → affects:  Settlement (cost allocation between parties)
  → questions:
      "Who bears the coupon cost — seller or platform?"
      "What happens to a coupon when an order is cancelled mid-payment?"
```

These questions surface at design time, not after 3 weeks of coding.

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Install globally

```bash
npm install -g forge-protocol
forge --version
```

### Or run directly from source

```bash
git clone https://github.com/devsmith-kr/forge-protocol.git
cd forge-protocol
npm install
node bin/forge.js --help
```

### Verify installation

```bash
forge --help
```

```
Usage: forge [command]

Commands:
  init          Initialize a new Forge project
  meta-smelt    Set up block catalog (built-in or AI-generated)
  smelt         Select blocks and resolve dependencies
  shape         Make architecture decisions
  build         Generate API contracts and code skeleton
  temper        Generate Given-When-Then test scenarios
  inspect       Multi-perspective code review
  status        Show project dashboard
  assemble      Auto-assemble blocks from a plan file
```

---

## Full Walkthrough — CLI

We'll build an e-commerce platform using the built-in `commerce` template.

### Initialize the project

```bash
mkdir my-shop && cd my-shop
forge init
```

```
✔ Forge 프로젝트 초기화 완료!

  Dir: .forge/

  다음 단계: forge meta-smelt — 카탈로그를 설정하세요.
```

`forge init` only creates the `.forge/` directory skeleton. Catalog setup happens in the next step. The `.forge/` directory is the single source of truth for your project — commit it alongside your source code.

---

### Phase 0.5: Meta-Smelt — Catalog Setup

```bash
forge meta-smelt
```

```
  Meta-Smelt  (Phase 0: 발굴)
  Smelt를 시작하기 전에 카탈로그를 준비합니다.

  Step 0 — 카탈로그 방식 선택

  A) 빌트인 템플릿 사용
     Commerce 선택 시 즉시 forge smelt로 이동합니다.

  B) AI 커스텀 생성
     내 도메인을 설명하면 Claude가 catalog.yml을 만들어줍니다.

  ? 카탈로그 방식을 선택하세요:
  ❯ 빌트인 템플릿 사용 (Commerce)
    AI로 커스텀 카탈로그 생성
```

Two modes:
1. **Built-in template** — Select Commerce; `catalog.yml` is copied to `.forge/catalog/` immediately
2. **AI-generated catalog** — 6-step questionnaire (idea → industry → domain → roles → features/scale → constraints) → generates a Claude prompt → you paste the result as `catalog.yml`

For this walkthrough, select the built-in **Commerce** template.

---

### Phase 1: Smelt — Block Selection

```bash
forge smelt
```

Blocks are organized into **Worlds** (zoom level 1). At every step, you see ≤ 5 choices.

```
  Phase ━━━━━━━━━━━━━━━━━━━━  Smelt (1/5)

  World 1: Customer & Auth
  ┌─────────────────────────────────────────────┐
  │ [✔] User Registration & Login               │
  │ [✔] Social Login (OAuth2)                   │
  │ [ ] MFA / 2FA                               │
  └─────────────────────────────────────────────┘

  World 2: Product & Catalog
  ┌─────────────────────────────────────────────┐
  │ [✔] Product Management                      │
  │ [✔] Category & Tag System                   │
  │ [✔] Inventory Management   ← auto-added     │
  └─────────────────────────────────────────────┘

  World 3: Orders & Payments
  ┌─────────────────────────────────────────────┐
  │ [✔] Order Management                        │
  │ [✔] Payment Processing                      │
  │ [✔] Coupon & Discount                       │
  └─────────────────────────────────────────────┘

  Dependency resolution:
    Selected:  8 blocks
    Auto-added: 3 blocks (Inventory, Refund, Settlement)
    Total:     11 blocks

  Architecture decisions required:
  ? Who bears the coupon cost?
    ❯ Platform absorbs cost
      Seller absorbs cost
      Split by contract
```

**Output:** `.forge/project/intent.yml`, `selected-blocks.yml`

> Draft is saved after each World. If you quit mid-way, `forge smelt` resumes where you left off.

---

### Phase 2: Shape — Architecture

```bash
forge shape
```

Forge reads your selected blocks' `tech_desc` fields and infers architecture decisions:

```
  Phase ━━━━━━━━━━━━━━━━━━━━  Shape (2/5)

  Detected patterns:
    ✔ JWT + OAuth2         → Spring Security
    ✔ Optimistic Locking   → JPA versioning (@Version)
    ✔ File upload          → S3-compatible storage
    ✔ Async notifications  → Spring Events / Kafka (choose one)

  ? Messaging layer:
    ❯ Spring Events (simple, in-process)
      Kafka (durable, distributed)
      RabbitMQ

  ? Database:
    ❯ H2 (development) → MySQL/PostgreSQL (production)
      PostgreSQL only
```

**Output:** `.forge/project/architecture.yml`, `architecture-prompt.md`

The `architecture-prompt.md` is a ready-to-paste Claude prompt for elaborating decisions with ADR (Architecture Decision Records).

---

### Phase 3: Build — API Contracts

```bash
forge build
```

Forge infers REST endpoints for each block and produces:

```yaml
# .forge/project/contracts.yml
services:
  - name: Auth Service
    endpoints:
      - method: POST
        path: /api/v1/auth/login
        body: "{ email, password }"
        response: "200 { accessToken, refreshToken }"
      - method: POST
        path: /api/v1/auth/refresh
        body: "{ refreshToken }"
        response: "200 { accessToken }"

  - name: Order Service
    endpoints:
      - method: POST
        path: /api/v1/orders
        body: "{ items[], shippingAddress, couponId? }"
        response: "201 { orderId, status: PENDING }"
      - method: GET
        path: /api/v1/orders/{orderId}
        response: "200 Order"
```

Also generates `build-prompt.md` — a Claude prompt to expand contracts into full OpenAPI 3.1 YAML.

---

### Phase 4: Temper — Test Scenarios

```bash
forge temper
```

Given-When-Then scenarios are generated per block, using the `tech_desc` keywords to infer test types:

```yaml
# .forge/project/test-scenarios.yml
- block: Coupon & Discount
  tests:
    - name: Valid coupon applied at checkout
      given: Active coupon, minimum order amount met
      when: POST /api/v1/orders { couponId: "SUMMER10" }
      then: 201, discount deducted, coupon usage_count incremented

    - name: Coupon used twice (idempotency)
      given: Coupon with max_usage: 1, already used once
      when: POST /api/v1/orders { couponId: "SUMMER10" }
      then: 409 COUPON_ALREADY_USED

    - name: Concurrent coupon redemption race condition
      given: Coupon with remaining_count: 1, two simultaneous requests
      when: POST /api/v1/orders × 2 (concurrent)
      then: One 201, one 409 — no overselling
```

Detected keywords → test types:
- `jwt|oauth` → authentication edge cases
- `optimistic_lock` → concurrent update scenarios  
- `idempotency` → duplicate request handling
- `rbac` → authorization boundary tests

**Output:** `.forge/project/test-scenarios.yml`, `temper-prompt.md`

---

### Phase 5: Inspect — Multi-Perspective Review

```bash
forge inspect
```

Four review lenses run automatically:

```
  Phase ━━━━━━━━━━━━━━━━━━━━  Inspect (5/5)

  🔴 Security       82/100
    [High]   JWT secret must not be hardcoded — use environment variable
    [Medium] Add rate limiting to /auth/login (brute force risk)

  🟡 Performance    74/100
    [High]   Order list endpoint needs pagination (no LIMIT clause inferred)
    [Medium] Coupon validation runs N+1 queries — add @EntityGraph

  🔵 Operability    88/100
    [Info]   Add /actuator/health for Kubernetes readiness probes
    [Info]   Structured logging recommended (JSON format for ELK)

  🟢 Scalability    71/100
    [High]   Inventory deduction is synchronous — bottleneck under load
    [Medium] No distributed lock on coupon redemption across instances
```

**Output:** `forge-report.md`, `inspect-prompt.md`

---

## Web UI Walkthrough

The Web UI provides the same 6-phase flow visually — useful for stakeholders or when you prefer a browser-based workflow.

### Basic (Prompt Copy mode)

```bash
git clone https://github.com/devsmith-kr/forge-protocol.git
cd forge-protocol/web
npm install
npm run dev
# Open http://localhost:5173
```

### With Bridge Server (Claude Code / API mode)

```bash
# Terminal 1: Web UI
cd web && npm run dev

# Terminal 2: Bridge server
npm run bridge -- --project-dir ../my-project
```

### Code Generation Modes (Phase 3 Build)

| Mode | Button | Requirements | Cost |
|------|--------|-------------|------|
| Prompt Copy | 📋 Claude Prompt Copy | None | Free (manual paste) |
| Claude Code | 🚀 Claude Code Run | Bridge server + CLI | $20/mo subscription |
| Claude API | 🔑 Claude API | Bridge server + API key | ~$2-5/project |

**Key features:**
- Phase-locked progression (you must complete each phase before advancing)
- Dependency visualization (auto-selected blocks are highlighted)
- At Phase 3: high-quality prompt copy / Claude Code auto-run / API call
- At Phase 3: download `openapi.yml` or Spring Boot skeleton ZIP
- At Phase 4: test prompt copy + JUnit5 test class ZIP download
- At Phase 5: download the full package (openapi + skeleton + tests)

Prompt Copy mode does **not** require any backend or API key. Claude Code / API modes require the Bridge server (`npm run bridge`).

---

## Understanding Block Dependencies

This is the core of Forge. Dependencies come in two types:

### `requires` — hard dependency

Block A cannot function without Block B.

```yaml
- id: resume-attach
  name: Resume & Portfolio Upload
  dependencies:
    - target: file-storage
      type: requires
      reason: Needs an S3-compatible storage layer for file handling
```

When `resume-attach` is selected, `file-storage` is auto-added silently.

### `affects` — business logic dependency

Block A changes behavior in Block B. Not a code import — a design decision.

```yaml
- id: coupon
  name: Coupon & Discount
  dependencies:
    - target: payment
      type: affects
      question: "Who absorbs the coupon discount — platform or seller?"
    - target: refund
      type: affects
      question: "Should a used coupon be restored on full refund?"
    - target: settlement
      type: affects
      question: "How is coupon cost reflected in seller settlement?"
```

`affects` dependencies generate cascade questions during Smelt. These are the questions that traditionally surface 3 weeks into development.

### The dependency resolution algorithm

```
resolveAll(selectedIds, catalog)
  → allBlocks:     full set including auto-added
  → autoAdded:     blocks added by requires rules
  → affected:      blocks whose behavior changes
  → decisions:     questions to ask the user
  → prerequisites: non-code tasks (legal, contracts, 3rd-party signups)
```

---

## Output Files Reference

```
.forge/
├── catalog/
│   └── catalog.yml           # Block definitions + dependency graph
└── project/
    ├── state.yml             # Current phase
    ├── intent.yml            # Phase 1: selected blocks + decisions
    ├── selected-blocks.yml   # Flat list of all blocks (with auto-added)
    ├── architecture.yml      # Phase 2: tech stack decisions
    ├── architecture-prompt.md
    ├── contracts.yml         # Phase 3: REST API contracts
    ├── build-prompt.md
    ├── test-scenarios.yml    # Phase 4: GWT scenarios
    ├── temper-prompt.md
    ├── prerequisites.yml     # Non-code tasks (PG contract, etc.)
    └── forge-report.md       # Phase 5: multi-perspective report
```

All files are human-readable YAML or Markdown. They are designed to be **committed alongside your source code** — they are the design artifact.

---

## Custom Templates

Templates are `catalog.yml` files. The structure:

```yaml
# templates/my-domain/catalog.yml
domain: my-domain
name: My Domain System

worlds:
  - id: world-1
    name: Core Layer
    icon: 🏗
    bundles:
      - id: bundle-1
        name: Authentication
        blocks:
          - id: user-auth
            name: User Authentication
            priority: must-have
            user_desc: "Login and registration for end users"
            tech_desc: "JWT RS256, refresh token rotation, bcrypt password hashing"
            dependencies:
              - target: email-service
                type: requires
                reason: "Email verification on signup"
              - target: audit-log
                type: affects
                question: "Log failed login attempts?"
            prerequisites:
              - name: SSL certificate
                phase: before-dev
                time: 1 day
```

Place it at `templates/my-domain/catalog.yml` and run:

```bash
forge init --template my-domain
```

To contribute a template back to the project, see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Tips for Hacker News Readers

**"Isn't this just over-engineering a simple project?"**

For small scripts, yes. Forge targets systems where dependency blindness has a real cost: e-commerce, fintech, healthcare, HR/recruiting — domains where a missing coupon/refund question costs weeks.

**"Why YAML and not a database?"**

YAML files live in git. The design artifact evolves with the code, is reviewable in PRs, and requires zero infrastructure. The protocol is stateless by design.

**"Why Spring Boot? What about Go/Rust/Node?"**

The code generator targets Spring Boot because it's the dominant enterprise Java framework. The protocol itself (YAML artifacts + dependency resolution) is language-agnostic. Contributions adding generators for other stacks are welcome.

**"Can I use this without the CLI, just as a thinking framework?"**

Yes. The `.forge/` directory structure and the catalog format are the protocol. Use them as structured documentation without ever running the CLI.

**"What's the AI's actual role here?"**

Forge does not call any AI API. It generates **prompts** that you paste into Claude/GPT. The AI validates your design — it doesn't generate it. This keeps the protocol deterministic, offline-capable, and free.

---

## Next Steps

- [CONTRIBUTING.md](../CONTRIBUTING.md) — How to add templates, fix bugs, improve generators
- [docs/spec.md](spec.md) — Full data model and block schema reference
- [GitHub Issues](https://github.com/devsmith-kr/forge-protocol/issues) — Bug reports and feature requests

---

*Forge Protocol is MIT licensed open-source software.*
