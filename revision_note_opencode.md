# OpenCode Fork - Revision Note

## v0.2.3 — 토글바 레이아웃 정렬 및 border 수정 (2026-02-12)

### 문제
1. 토글바에 상단 스페이서(`h-8`)를 넣어서 패널과 높이가 불일치 — 패널은 위에 붙고 토글바는 내려감
2. 스페이서로 인해 패널이 기존 탭 영역과 겹쳐 보이는 느낌
3. 패널과 토글바에 상단 border가 없어서 헤더와 시각적으로 분리 안 됨

### 수정
- `extensions/sidebar.tsx`:
  - 스페이서 제거, `rounded-tl-lg` 등 과잉 스타일링 제거
  - 패널과 토글바 모두 콘텐츠 영역 최상단에서 동일 높이로 시작
  - 패널 `aside`에 `border-t` 추가 → 헤더와 시각적 분리
  - 토글바 `div`에 `border-t` 추가 → 헤더와 시각적 분리
  - "EXT" 라벨과 아이콘 스타일링으로 Extension 영역 구분

### 교훈
- 물리적 간격(스페이서)보다 시각적 구분(border, 라벨)이 나음
- 레이아웃 일관성(패널↔토글바 높이 일치)이 우선
- 상단 border 한 줄이 헤더와의 분리에 가장 효과적

---

## v0.2.2 — 통합 Extension Sidebar (2026-02-12)

### 개요
개별 패널의 토글/리사이즈/헤더 로직을 `ExtensionSidebar`로 통합.
오른쪽 끝에 세로 토글바가 항상 보이고, 아이콘 클릭으로 패널 전환.
리사이즈 핸들 1개로 통합하여 충돌 해결.

### 구조 변경
```
기존 (v0.2.1):
  <TestRunnerPanel />   ← 각각 토글/리사이즈/헤더 내장
  <AgentMonitorPanel />

변경 (v0.2.2):
  <ExtensionSidebar />  ← 단일 컴포넌트
    ├── ResizeHandle (1개, 패널 열려있을 때만)
    ├── aside (패널 영역 — 헤더 + 선택된 패널 내용)
    └── div.toggle-bar (세로 아이콘 바, 항상 보임)
```

### 수정 파일

#### 1. `packages/app/src/extensions/sidebar.tsx` (신규)
- `ExtensionSidebar` 컴포넌트 — 통합 토글바 + 패널 컨테이너
- `PANELS` 배열로 패널 목록 관리 (id, icon, label)
- 하나의 `ResizeHandle`로 리사이즈 통합
- `Persist`로 active 패널 + 너비 상태 저장
- 아이콘 클릭 → 같은 패널이면 닫기, 다른 패널이면 전환

#### 2. `packages/app/src/extensions/test-runner/panel.tsx` (리팩토링)
- `TestRunnerPanel` → `TestRunnerContent`로 리네임
- 토글 버튼, ResizeHandle, aside, 헤더 제거 — 순수 내용만 export

#### 3. `packages/app/src/extensions/agent-monitor/panel.tsx` (리팩토링)
- `AgentMonitorPanel` → `AgentMonitorContent`로 리네임
- 토글 버튼, ResizeHandle, aside, 헤더 제거 — 순수 내용만 export

#### 4. `packages/app/src/pages/layout.tsx` (수정)
- `TestRunnerPanel` + `AgentMonitorPanel` import → `ExtensionSidebar` 1개로 교체

### 비고
- 타입체크 통과 확인
- 새 패널 추가 시: `PANELS` 배열에 항목 추가 + `extensions/기능명/panel.tsx` 생성 + sidebar.tsx에 `<Show>` 추가

---

## v0.2.1 — extensions 폴더 분리 (2026-02-12)

### 개요
커스텀 코드를 OpenCode 기존 코드와 분리하여 업스트림 머지 시 충돌 최소화.
`packages/app/src/extensions/` 하위에 기능별 폴더로 구성.

### 폴더 구조
```
packages/app/src/extensions/
├── test-runner/
│   └── panel.tsx          ← 기존 components/test-runner-panel.tsx에서 이동
└── agent-monitor/
    └── panel.tsx          ← 기존 components/agent-monitor-panel.tsx에서 이동
```

### 변경 사항
- `components/test-runner-panel.tsx` → `extensions/test-runner/panel.tsx` 이동
- `components/agent-monitor-panel.tsx` → `extensions/agent-monitor/panel.tsx` 이동
- `layout.tsx` import 경로 업데이트:
  ```diff
  - import { TestRunnerPanel } from "@/components/test-runner-panel"
  - import { AgentMonitorPanel } from "@/components/agent-monitor-panel"
  + import { TestRunnerPanel } from "@/extensions/test-runner/panel"
  + import { AgentMonitorPanel } from "@/extensions/agent-monitor/panel"
  ```
- Agent Monitor에서 `useSync()` → `useGlobalSDK()` 직접 API 호출로 변경 (context provider 범위 이슈 해결)

### 비고
- `@/*` alias가 `./src/*`를 가리키므로 별도 설정 변경 불필요
- 향후 extensions 추가 시 같은 패턴으로 `extensions/기능명/` 폴더 생성
- 타입체크 통과 확인

---

## v0.2.0 — Agent Monitor Panel + 패널 분리 (2026-02-12)

### 개요
멀티에이전트 시각화 패널(Agent Monitor)을 추가하고, 기존 테스트 러너 패널을 리네임/분리.
두 패널은 독립적으로 열기/닫기/리사이즈 가능하며, 동시에 열 수도 있음.

### 수정 파일

#### 1. `packages/app/src/extensions/agent-monitor/panel.tsx` (신규, ~270줄)
- 세션/에이전트 실시간 상태 모니터링 패널
- 주요 기능:
  - 글로벌 싱크 스토어(`useSync()`)에서 `session_status`, `session`, `message`, `part` 직접 구독
  - SSE 이벤트 스트림을 통한 실시간 상태 업데이트 (별도 폴링 불필요)
  - 세션별 상태 표시: `idle` / `busy` / `retry`
  - 세션 확장 시 최근 5개 메시지 미리보기 (USR/AI 구분)
  - 파일 변경 요약 (additions/deletions/files)
  - 필터: All / Active / Idle
- UI 구성:
  - 헤더: "Agent Monitor" + active/total 카운터
  - 필터 바: All(N) / Active(N) / Idle(N)
  - 세션 목록: 상태 dot + 제목 + 상태 뱃지 + 시간 + 확장 화살표
  - 확장 시: 메시지 미리보기 + 파일 변경 요약
  - 하단 요약: active/idle 카운트
- 토글 버튼에 active 카운트 뱃지 표시 (파란색 원)
- ResizeHandle로 왼쪽 가장자리 드래그 리사이즈 지원
- Persist로 열림/너비 상태 저장

#### 2. `packages/app/src/extensions/test-runner/panel.tsx` (리네임)
- 기존 `right-panel.tsx` → `extensions/test-runner/panel.tsx`로 이동
- 컴포넌트명: `RightPanel` → `TestRunnerPanel`로 변경
- 기능 변경 없음

#### 3. `packages/app/src/pages/layout.tsx` (수정, import 변경)
- **79번줄**: import 변경
  ```diff
  - import { RightPanel } from "@/components/right-panel"
  + import { TestRunnerPanel } from "@/components/test-runner-panel"
  + import { AgentMonitorPanel } from "@/components/agent-monitor-panel"
  ```
- **1997-1998번줄**: 두 패널 모두 삽입
  ```diff
  - <RightPanel />
  + <TestRunnerPanel />
  + <AgentMonitorPanel />
  ```

### 레이아웃 구조 변경
```
div.root (flex-col)
├── <Titlebar />
└── div (flex-1 flex)
    ├── <nav>                ← 왼쪽 사이드바 (기존)
    ├── <main>               ← 채팅 UI (기존)
    ├── <TestRunnerPanel />  ← 테스트 패널 (v0.1.0에서 리네임)
    └── <AgentMonitorPanel />← 에이전트 모니터 (신규)
```

### 데이터 소스
- `sync.data.session` — 세션 목록
- `sync.data.session_status` — 세션별 상태 (`idle` / `busy` / `retry`)
- `sync.data.message[sessionID]` — 세션별 메시지
- `sync.data.part[messageID]` — 메시지별 파트 (텍스트 미리보기용)
- 모두 SSE 이벤트 스트림(`event.subscribe`)으로 실시간 동기화됨

### 비고
- 타입체크 통과 확인
- Oh My OpenCode의 멀티에이전트(Sisyphus, Oracle, Librarian 등)가 백그라운드에서 실행될 때, 각 세션의 상태가 실시간으로 Agent Monitor에 반영됨
- tmux 없이도 데스크톱 앱에서 에이전트 상태 시각화 가능

---

## v0.1.0 — Python Test Runner Side Panel (2026-02-12)

### 개요
OpenCode Desktop App에 pytest/unittest 테스트 러너 사이드 패널을 추가.
오른쪽에 접이식 패널로 통합되며, 테스트 탐색/실행/결과 확인이 가능.

### 수정 파일

#### 1. `packages/app/src/components/right-panel.tsx` (신규, 384줄)
- 테스트 러너 사이드 패널 전체 컴포넌트
- 주요 기능:
  - `discover()` — `test_*.py`, `*_test.py` 패턴으로 테스트 파일 탐색 (SDK `find.files` 사용)
  - `parse()` — 파일 내 `def test_*` 패턴으로 테스트 함수 추출
  - `run()` — `python -m pytest -v` 명령을 SDK `session.shell`로 실행
  - `parseResults()` — pytest 출력 파싱하여 PASS/FAIL 상태 업데이트
- UI 구성:
  - 헤더: 패널 제목 + 연결 상태 표시 + 닫기 버튼
  - 툴바: Run All / Refresh 버튼 + 요약 (pass/fail/시간)
  - 필터: All / Passed / Failed / Error / Skipped
  - 테스트 목록: 모듈별 트리 구조, 개별 실행 버튼
  - 출력 패널: pytest 원본 출력 표시
- 사용 기술: SolidJS, createStore, ResizeHandle, Persist
- SDK v2 API 사용: `find.files`, `file.read`, `session.list`, `session.create`, `session.shell`

#### 2. `packages/app/src/pages/layout.tsx` (수정, 3군데)
- **79번줄**: `import { RightPanel } from "@/components/right-panel"` 추가
- **1987번줄**: `<main>` 클래스 `size-full` → `flex-1 min-w-0` 변경 (flex 레이아웃 대응)
- **1995번줄**: `</main>` 뒤에 `<RightPanel />` 삽입

### 레이아웃 구조 변경
```
div.root (flex-col)
├── <Titlebar />
└── div (flex-1 flex)
    ├── <nav>            ← 왼쪽 사이드바 (기존, 변경 없음)
    ├── <main>           ← 채팅 UI (클래스만 수정)
    └── <RightPanel />   ← 테스트 패널 (신규 추가)
```

### SDK v2 API 참고
SDK 호출은 모두 flat parameter 방식 (v2):
```ts
find.files({ query: "test_*.py", type: "file" })
file.read({ path: "path/to/file.py" })
session.create({ title: "Test Runner" })
session.shell({ sessionID: "...", agent: "build", command: "pytest ..." })
```

### 실행 방법
```bash
# 터미널 1: 백엔드 (포트 4096)
cd packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096

# 터미널 2: 프론트엔드 (포트 4444)
cd packages/app
bun dev -- --port 4444

# 브라우저에서 http://localhost:4444 열기
```

### 비고
- OpenCode 기존 코드는 layout.tsx 외에 변경 없음
- 타입체크 통과 확인 (`bun run --filter '@opencode-ai/app' typecheck`)
- 디자인 토큰은 OpenCode 기존 것 그대로 사용 (text-text-strong, bg-background-stronger 등)
