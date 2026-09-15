# Antigravity Rules

## UI & Modal Rules
- 모달창을 추가할 때 모달창이 브라우저 화면을 벗어나지 않게 해야 합니다.
- 사이즈가 커서 벗어날 우려가 있다면 내부에 스크롤 영역을 추가(`overflow-y: auto`, `max-height` 활용)하거나, 중요도가 떨어지는 부분은 축소 처리합니다.

## Architecture & Code Quality
- 미래 확장성을 위해 코드 단일화(Unification/Refactoring) 작업을 항상 꼼꼼하게 수행합니다.
- 중복되는 비즈니스 로직(예: 금기어 제약 조건, 아이템 타깃 로직 등)은 공통 함수로 빼내어 단일 진실 공급원(SSOT)을 유지합니다.
- `index.html`과 `public/index.html`은 항상 100% 동일하게 일치(동기화)를 유지합니다.

## Documentation & Guide Synchronization
- 게임 내 신규 기능, 아이템, 규칙, 시스템 메커니즘이 추가되거나 변경될 경우 관련된 모든 가이드 문서 및 FAQ를 반드시 함께 최신화합니다:
  - **아이템 도감**: 메인 로비 카드(`index.html`, `public/index.html`) 및 아이템 도감 상세 페이지(`public/guide/items.html`)의 아이템 개수/종류, 상세 스펙, 전략 설명, 밸런스 매트릭스 표 갱신.
  - **규칙 & 공략집**: `public/guide/rules.html`, `public/guide/strategy.html`의 신규 시스템 룰 및 공략 팁 갱신.
  - **FAQ & SEO**: `public/guide/faq.html`의 관련 Q&A 및 필요 시 Schema.org 구조화 데이터 갱신.

## QA & Testing Workflow (Blind Agent Testing)
- 기능 추가 또는 버그 수정 작업 시:
  1. 사전 지식이 없는 독립된 블라인드 테스트 에이전트(`invoke_subagent`)를 실행하여 요구사항 기반의 철저한 블랙박스/회귀 테스트를 수행합니다.
  2. 테스트 통과 시에만 최종 배포(Git commit 및 push)를 진행합니다.
  3. 테스트 실패 시 원인을 파악하여 코드를 재수정하고 블라인드 재검증을 통과할 때까지 반복합니다.
