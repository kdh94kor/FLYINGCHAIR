# Antigravity Rules

## UI & Modal Rules
- 모달창을 추가할 때 모달창이 브라우저 화면을 벗어나지 않게 해야 합니다.
- 사이즈가 커서 벗어날 우려가 있다면 내부에 스크롤 영역을 추가(`overflow-y: auto`, `max-height` 활용)하거나, 중요도가 떨어지는 부분은 축소 처리합니다.

## Architecture & Code Quality
- 미래 확장성을 위해 코드 단일화(Unification/Refactoring) 작업을 항상 꼼꼼하게 수행합니다.
- 중복되는 비즈니스 로직(예: 금기어 제약 조건, 아이템 타깃 로직 등)은 공통 함수로 빼내어 단일 진실 공급원(SSOT)을 유지합니다.
