# OpenCode 사이드 패널 커스텀 UI 구현 계획

## 조사 결과 요약

### Desktop App 기술 스택
- **프론트엔드**: SolidJS + SolidStart + Vite
- **스타일링**: CSS (`@import "./style/index.css"`)
- **UI 라이브러리**: `@kobalte/core`, `@opencode-ai/ui` (자체 디자인 시스템)
- **배포**: Cloudflare Workers (웹), 데스크톱은 웹 래핑 방식
- **서버**: `opencode serve` → HTTP API (OpenAPI 3.1 spec)
- **SDK**: `@opencode-ai/sdk` — 타입 안전한 JS/TS 클라이언트

### CSS/JS 수정으로 사이드 패널을 넣을 수 있는가?

**직접 주입: 불가능**
- Desktop App은 빌드된 SolidJS 앱이므로, 런타임에 임의 CSS/JS를 주입할 공식 메커니즘이 없음
- Electron과 달리 DevTools나 preload script 같은 주입 포인트가 공식적으로 제공되지 않음

**소스 포크: 가능**
- `packages/console/app/` 하위에 SolidJS 컴포넌트를 추가하고, `app.css`에 스타일을 추가하면 됨
- 다만 업스트림 업데이트 따라가기가 번거로움

**별도 웹 앱 (권장): 가능**
- 가장 현실적인 방법
- OpenCode 서버 API에 연결하는 독립적인 웹 앱을 만들어서 브라우저 탭이나 별도 창으로 운영
- CSS/JS 100% 자유롭게 제어 가능

---

## 구현 완료: Python Test Runner 사이드 패널

### 기술 스택
- **SolidJS + Vite + TypeScript**
- **@opencode-ai/sdk/client** (브라우저 전용 클라이언트)
- pytest / unittest 지원

### 프로젝트 위치
```
opencode-test-panel/
```

### 파일 구조
```
opencode-test-panel/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── index.tsx              # 엔트리포인트
    ├── App.tsx                # 메인 앱 컴포넌트
    ├── styles.css             # 전체 스타일 (다크 테마)
    ├── lib/
    │   ├── client.ts          # OpenCode SDK 클라이언트 연결
    │   ├── store.ts           # SolidJS store (전역 상태 관리)
    │   ├── types.ts           # TypeScript 타입 정의
    │   └── test-runner.ts     # 테스트 탐색/실행/파싱 로직
    └── components/
        ├── ConnectionStatus.tsx  # 서버 연결 상태 표시
        ├── OutputPanel.tsx       # 테스트 출력 패널
        ├── StatusBadge.tsx       # PASS/FAIL/RUN 상태 뱃지
        ├── TestItem.tsx          # 개별 테스트 케이스
        ├── TestModuleGroup.tsx   # 테스트 파일 그룹
        └── Toolbar.tsx           # 상단 도구 모음 (Run All, Filter)
```

### 주요 기능
1. **테스트 자동 탐색**: OpenCode API로 `test_*.py`, `*_test.py` 파일 스캔
2. **테스트 함수 파싱**: 파일 내용을 읽어 `def test_*` 및 `class Test*(TestCase)` 파싱
3. **개별/모듈/전체 실행**: OpenCode `session.shell()` API로 pytest/unittest 실행
4. **결과 실시간 파싱**: pytest -v / unittest -v 출력을 파싱해서 각 테스트 상태 업데이트
5. **필터링**: All / Passed / Failed / Error / Skipped 필터
6. **SSE 이벤트 구독**: 세션 상태 변화 실시간 감지
7. **프레임워크 자동 감지**: pytest.ini / conftest.py 존재 여부로 판단

### 실행 방법
```bash
# 1. OpenCode 서버를 고정 포트 + CORS 허용으로 실행
opencode web --port 4096 --cors http://localhost:3000

# 2. 사이드 패널 실행
cd opencode-test-panel
npm install     # (최초 1회)
npm run dev     # localhost:3000에서 열림
```

### 빌드 주의사항
- SDK import 시 `@opencode-ai/sdk/client`를 사용해야 함
  - `@opencode-ai/sdk`는 서버용 코드(child_process)를 포함해서 브라우저 빌드 실패
- `VITE_OPENCODE_URL` 환경변수로 서버 주소 변경 가능

---

## API 레퍼런스

### 이 프로젝트에서 사용하는 API

| 용도 | SDK 메서드 | HTTP |
|---|---|---|
| 서버 상태 확인 | `client.global.health()` | `GET /global/health` |
| 세션 목록 | `client.session.list()` | `GET /session` |
| 세션 생성 | `client.session.create()` | `POST /session` |
| 셸 명령 실행 | `client.session.shell()` | `POST /session/:id/shell` |
| 파일 검색 | `client.find.files()` | `GET /find/file` |
| 파일 읽기 | `client.file.read()` | `GET /file/content` |
| 이벤트 구독 | `client.event.subscribe()` | `GET /event` (SSE) |

### 추가 가능한 API

| 용도 | SDK 메서드 | 설명 |
|---|---|---|
| 파일 diff | `GET /session/:id/diff` | 변경된 파일 diff |
| Todo 리스트 | `GET /session/:id/todo` | 세션 todo |
| 메시지 목록 | `client.session.messages()` | 대화 히스토리 |
| 프롬프트 전송 | `client.session.prompt()` | AI에게 메시지 |

---

## 향후 확장 아이디어

1. **coverage 표시**: `pytest --cov` 출력 파싱해서 파일별 커버리지 시각화
2. **watch 모드**: 파일 변경 감지 후 자동 재실행 (SSE `file.edited` 이벤트 활용)
3. **AI 자동 수정**: 실패한 테스트를 OpenCode에 "이 테스트가 실패했어, 고쳐줘" 프롬프트 자동 전송
4. **테스트 히스토리**: 이전 실행 결과와 비교
5. **다른 언어 확장**: Jest, Go test 등
