# Antigravity Rules

## 1. UI & Modal Rules
- 모달창을 추가할 때 모달창이 브라우저 화면을 벗어나지 않게 해야 합니다.
- 사이즈가 커서 벗어날 우려가 있다면 내부에 스크롤 영역을 추가(`overflow-y: auto`, `max-height` 활용)하거나, 중요도가 떨어지는 부분은 축소 처리합니다.

## 2. Architecture & Code Quality
- 미래 확장성을 위해 코드 단일화(Unification/Refactoring) 작업을 항상 꼼꼼하게 수행합니다.
- 중복되는 비즈니스 로직(예: 금기어 제약 조건, 아이템 타깃 로직 등)은 공통 함수로 빼내어 단일 진실 공급원(SSOT)을 유지합니다.
- `index.html`과 `public/index.html`은 항상 100% 동일하게 일치(동기화)를 유지합니다.

## 3. Documentation & Guide Synchronization
- 게임 내 신규 기능, 아이템, 규칙, 시스템 메커니즘이 추가되거나 변경될 경우 관련된 모든 가이드 문서 및 FAQ를 반드시 함께 최신화합니다:
  - **아이템 도감**: 메인 로비 카드(`index.html`, `public/index.html`) 및 아이템 도감 상세 페이지(`public/guide/items.html`)의 아이템 개수/종류, 상세 스펙, 전략 설명, 밸런스 매트릭스 표 갱신.
  - **규칙 & 공략집**: `public/guide/rules.html`, `public/guide/strategy.html`의 신규 시스템 룰 및 공략 팁 갱신.
  - **FAQ & SEO**: `public/guide/faq.html`의 관련 Q&A 및 필요 시 Schema.org 구조화 데이터 갱신.

## 4. Model Routing & Token Conservation (역할별 모델 분리 및 토큰 절약)
- 작업량 대비 토큰 소모를 최소화하기 위해 역할별로 모델을 엄격히 분리합니다:
  - **계획 수립 및 작업 지시**: Neon (메인 데일리)
  - **코딩 / 구현**: Hydrogen (경량 고속) 또는 Neon
  - **QA (블라인드 테스트)**: Hydrogen (경량 고속)
  - **배포 (`git commit` / `git push`)**: Hydrogen (경량 고속)
- 도구 호출은 병렬 배치 처리하고, 수정 대상과 무관한 파일의 중복 조회나 과도한 프로젝트 전체 탐색을 금지합니다.
- `invoke_subagent`처럼 티어(`pro`/`flash`/`flash_lite`)만 선택 가능한 경우, **QA·배포·단순 수정 서브 에이전트는 반드시 최경량 티어(`flash_lite`)**를 사용합니다.

## 5. Default Task Scope & Strict Verification Ban (기본 작업 범위 및 검증 금지)
- **코드 및 문서 작성까지만 수행**: 코드 작업 요청 시 `[계획 수립 → 코드 작성 → public/ 동기화 → 가이드 문서 최신화]`까지만 진행하고 **즉시 작업을 종료**합니다.
- **모든 형태의 자동 검증·테스트·서버 실행 절대 금지**:
  - 코드 수정 완료 후 블라인드 QA 에이전트 실행, 브라우저 열기, E2E 테스트, 로컬 개발 서버(`npm start`, `node` 등) 실행, 테스트 스크립트(`npm test` 등) 실행을 **일절 수행하지 마십시오.**
  - 검증 및 QA는 사용자가 직접 수행하거나 별도의 새 대화 세션에서 명시적으로 지시할 때만 수행합니다. (별도 지시 시에도 `Hydrogen` / `flash_lite` 에이전트 1개, 최대 2분 이내 제한 적용)
- **즉시 종료 규칙**: 파일 수정이 완료되면 추가적인 파일 재확인이나 요약 테스트 없이 수정된 파일 목록만 간결히 보고하고 즉시 턴을 종료합니다.

## 6. Deployment Rules (배포 규칙)
- **절대 자동 배포 금지**: 코드 작성이 끝나더라도 사용자가 명시적으로 `"배포해줘"` 또는 `"배포 ㄱㄱ"`라고 지시하기 전에는 절대 `git status`, `git add`, `git commit`, `git push`를 실행하지 않습니다.
- 사용자가 명시적으로 배포를 지시한 경우에만 최경량 티어(`Hydrogen` / `flash_lite`)로 `git commit` 및 `git push`를 진행합니다.