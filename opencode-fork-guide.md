# OpenCode Desktop App 포크: 사이드 패널 추가 가이드

## 아키텍처 요약

Desktop App은 3개 레이어로 구성:
```
packages/desktop/     ← Tauri v2 네이티브 쉘 (Rust)
packages/app/         ← 공유 SolidJS UI (채팅/세션 인터페이스) ★ 여기를 수정
packages/opencode/    ← CLI/서버 백엔드 (사이드카 프로세스)
```

## 핵심 파일: 레이아웃 구조

`packages/app/src/pages/layout.tsx` (2000줄) — 렌더링 부분 (라인 1865~1998):

```
div.root (flex-col)
├── <Titlebar />
└── div (flex-1 flex)
    ├── <nav> (왼쪽 사이드바 - 프로젝트/세션 목록, 64px 접힘 / 244~max 펼침)
    ├── <nav> (모바일 사이드바)
    ├── <main> (메인 콘텐츠 - 채팅 UI)       ← 현재 구조
    └── [여기에 오른쪽 사이드 패널 추가]       ← 수정 대상
```

## 수정 1: layout.tsx에 오른쪽 패널 슬롯 추가

파일: `packages/app/src/pages/layout.tsx`

### 추가할 import (파일 상단)
```tsx
import { RightPanel } from "@/components/right-panel"
```

### 수정할 부분 (라인 1985~1994)

**기존:**
```tsx
        <main
          classList={{
            "size-full overflow-x-hidden flex flex-col items-start contain-strict border-t border-border-weak-base": true,
            "xl:border-l xl:rounded-tl-sm": !layout.sidebar.opened(),
          }}
        >
          <Show when={!autoselecting()} fallback={<div class="size-full" />}>
            {props.children}
          </Show>
        </main>
```

**변경 후:**
```tsx
        <main
          classList={{
            "flex-1 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict border-t border-border-weak-base": true,
            "xl:border-l xl:rounded-tl-sm": !layout.sidebar.opened(),
          }}
        >
          <Show when={!autoselecting()} fallback={<div class="size-full" />}>
            {props.children}
          </Show>
        </main>
        <RightPanel />
```

변경 포인트:
- `<main>`의 `size-full`을 `flex-1 min-w-0`으로 변경 (오른쪽 패널 공간 확보)
- `<main>` 뒤에 `<RightPanel />` 추가

---

## 수정 2: RightPanel 컴포넌트 생성

파일: `packages/app/src/components/right-panel.tsx`

```tsx
import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useGlobalSDK } from "@/context/global-sdk"
import { Persist, persisted } from "@/utils/persist"

type TestStatus = "idle" | "running" | "passed" | "failed" | "error" | "skipped"

interface TestCase {
  id: string
  name: string
  module: string
  filepath: string
  lineno?: number
  status: TestStatus
  duration?: number
  error?: string
}

interface TestModule {
  filepath: string
  name: string
  tests: TestCase[]
  expanded: boolean
}

const STATUS_STYLE: Record<TestStatus, string> = {
  idle: "bg-surface-base text-text-weak",
  running: "bg-blue-500/10 text-blue-400 animate-pulse",
  passed: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
  error: "bg-orange-500/10 text-orange-400",
  skipped: "bg-yellow-500/10 text-yellow-400",
}

const STATUS_LABEL: Record<TestStatus, string> = {
  idle: "IDLE",
  running: "RUN",
  passed: "PASS",
  failed: "FAIL",
  error: "ERR",
  skipped: "SKIP",
}

export function RightPanel() {
  const globalSDK = useGlobalSDK()

  const [panel, setPanel, , ready] = persisted(
    Persist.global("right-panel", ["right-panel.v1"]),
    createStore({
      opened: false,
      width: 320,
    }),
  )

  const [state, setState] = createStore({
    modules: [] as TestModule[],
    running: false,
    connected: false,
    output: "",
    filter: "all" as TestStatus | "all",
    summary: null as { passed: number; failed: number; errors: number; duration: number } | null,
  })

  onMount(async () => {
    try {
      await globalSDK.client.global.health()
      setState("connected", true)
    } catch {
      setState("connected", false)
    }
  })

  async function discoverTests() {
    try {
      const result1 = await globalSDK.client.find.files({ query: { query: "test_*.py", type: "file" } })
      const result2 = await globalSDK.client.find.files({ query: { query: "*_test.py", type: "file" } })
      const files = [...new Set([...((result1.data ?? []) as string[]), ...((result2.data ?? []) as string[])])].sort()

      const modules: TestModule[] = []
      for (const filepath of files) {
        const content = await globalSDK.client.file.read({ query: { path: filepath } })
        const text = (content.data as any)?.content ?? ""
        const tests = parseTests(filepath, text)
        if (tests.length > 0) {
          const name = filepath.split("/").pop() ?? filepath
          modules.push({ filepath, name, tests, expanded: true })
        }
      }
      setState("modules", modules)
    } catch (e) {
      console.error("Failed to discover tests:", e)
    }
  }

  function parseTests(filepath: string, content: string): TestCase[] {
    const lines = content.split("\n")
    const tests: TestCase[] = []
    const module = filepath.replace(/\//g, ".").replace(/\.py$/, "")

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\s*def\s+(test_\w+)\s*\(/)
      if (match) {
        tests.push({
          id: `${filepath}::${match[1]}`,
          name: match[1],
          module,
          filepath,
          lineno: i + 1,
          status: "idle",
        })
      }
    }
    return tests
  }

  async function runTests(targets?: string[]) {
    setState("running", true)
    setState("output", "")

    if (!targets) {
      setState(produce(s => {
        for (const mod of s.modules) {
          for (const test of mod.tests) test.status = "running"
        }
      }))
    }

    const cmd = `python -m pytest -v --tb=short --no-header ${targets?.join(" ") ?? ""}`

    try {
      // Use the first available session or create one
      const sessions = await globalSDK.client.session.list()
      const list = (sessions.data ?? []) as any[]
      let sessionId = list[0]?.id
      if (!sessionId) {
        const created = await globalSDK.client.session.create({ body: { title: "Test Runner" } })
        sessionId = (created.data as any)?.id
      }

      const result = await globalSDK.client.session.shell({
        path: { id: sessionId },
        body: { agent: "build", command: cmd },
      })

      const parts = (result.data as any)?.parts ?? []
      let output = ""
      for (const part of parts) {
        output += (part.text ?? part.content ?? "") + "\n"
      }
      setState("output", output)
      parseResults(output)
    } catch (e) {
      setState("output", `Error: ${e}`)
    } finally {
      setState("running", false)
    }
  }

  function parseResults(output: string) {
    for (const line of output.split("\n")) {
      const match = line.match(/^(.+?::[\w.]+)\s+(PASSED|FAILED|ERROR|SKIPPED)/)
      if (match) {
        const id = match[1].trim()
        const status = match[2].toLowerCase() as TestStatus
        setState(produce(s => {
          for (const mod of s.modules) {
            for (const test of mod.tests) {
              if (test.id === id) test.status = status
            }
          }
        }))
      }
    }

    // Parse summary
    const summaryMatch = output.match(/=+\s*([\d\w\s,]+)\s+in\s+([\d.]+)s\s*=+/)
    if (summaryMatch) {
      const s = summaryMatch[1]
      setState("summary", {
        passed: parseInt(s.match(/(\d+)\s+passed/)?.[1] ?? "0"),
        failed: parseInt(s.match(/(\d+)\s+failed/)?.[1] ?? "0"),
        errors: parseInt(s.match(/(\d+)\s+error/)?.[1] ?? "0"),
        duration: parseFloat(summaryMatch[2]),
      })
    }
  }

  function toggleModule(filepath: string) {
    setState(produce(s => {
      const mod = s.modules.find(m => m.filepath === filepath)
      if (mod) mod.expanded = !mod.expanded
    }))
  }

  const filtered = () => {
    if (state.filter === "all") return state.modules
    return state.modules
      .map(m => ({ ...m, tests: m.tests.filter(t => t.status === state.filter) }))
      .filter(m => m.tests.length > 0)
  }

  const totalTests = () => state.modules.reduce((sum, m) => sum + m.tests.length, 0)

  return (
    <Show when={ready()}>
      {/* Toggle button (항상 보임) */}
      <Show when={!panel.opened}>
        <div class="shrink-0 border-t border-l border-border-weak-base flex items-start pt-2">
          <IconButton
            icon="sidebar-right"
            variant="ghost"
            class="m-1"
            onClick={() => setPanel("opened", true)}
            aria-label="Open test panel"
          />
        </div>
      </Show>

      {/* 패널 본체 */}
      <Show when={panel.opened}>
        <ResizeHandle
          direction="horizontal"
          size={panel.width}
          min={240}
          max={typeof window === "undefined" ? 600 : window.innerWidth * 0.4}
          collapseThreshold={240}
          onResize={(w) => setPanel("width", w)}
          onCollapse={() => setPanel("opened", false)}
        />
        <aside
          class="shrink-0 border-t border-l border-border-weak-base bg-background-stronger flex flex-col overflow-hidden"
          style={{ width: `${panel.width}px` }}
        >
          {/* 헤더 */}
          <div class="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border-weak-base">
            <div class="flex items-center gap-2">
              <span class="text-13-medium text-text-strong">Test Runner</span>
              <span
                class="text-10-regular px-1.5 py-0.5 rounded font-mono uppercase"
                classList={{
                  "bg-green-500/10 text-green-400": state.connected,
                  "bg-red-500/10 text-red-400": !state.connected,
                }}
              >
                {state.connected ? "pytest" : "disconnected"}
              </span>
            </div>
            <IconButton
              icon="close"
              variant="ghost"
              class="size-6"
              onClick={() => setPanel("opened", false)}
              aria-label="Close panel"
            />
          </div>

          {/* 툴바 */}
          <div class="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-border-weak-base">
            <Button
              size="small"
              variant="primary"
              disabled={state.running || totalTests() === 0}
              onClick={() => runTests()}
            >
              {state.running ? "Running..." : "Run All"}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={state.running}
              onClick={discoverTests}
            >
              Refresh
            </Button>

            <div class="flex-1" />

            <Show when={state.summary}>
              <div class="flex gap-2 text-10-regular font-mono">
                <span class="text-green-400">{state.summary!.passed}P</span>
                <Show when={state.summary!.failed > 0}>
                  <span class="text-red-400">{state.summary!.failed}F</span>
                </Show>
                <span class="text-text-weak">{state.summary!.duration.toFixed(1)}s</span>
              </div>
            </Show>
          </div>

          {/* 필터 */}
          <div class="shrink-0 flex gap-0.5 px-3 py-1.5 border-b border-border-weak-base">
            <For each={["all", "passed", "failed", "error", "skipped"] as const}>
              {(f) => (
                <button
                  class="px-2 py-0.5 text-10-regular rounded transition-colors"
                  classList={{
                    "bg-surface-base text-text-strong": state.filter === f,
                    "text-text-weak hover:text-text-base": state.filter !== f,
                  }}
                  onClick={() => setState("filter", f)}
                >
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              )}
            </For>
          </div>

          {/* 테스트 목록 */}
          <div class="flex-1 overflow-y-auto">
            <Show
              when={filtered().length > 0}
              fallback={
                <div class="flex items-center justify-center h-32 text-text-weak text-13-regular">
                  {state.modules.length === 0
                    ? "Click Refresh to scan tests"
                    : "No tests match filter"}
                </div>
              }
            >
              <For each={filtered()}>
                {(mod) => (
                  <div class="border-b border-border-weak-base">
                    <button
                      class="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-surface-base-hover text-left"
                      onClick={() => toggleModule(mod.filepath)}
                    >
                      <span class="text-10-regular text-text-weak w-3">
                        {mod.expanded ? "\u25BC" : "\u25B6"}
                      </span>
                      <span class="text-12-medium text-text-strong font-mono truncate flex-1">
                        {mod.name}
                      </span>
                      <span class="text-10-regular text-text-weak font-mono">
                        {mod.tests.filter(t => t.status === "passed").length}/{mod.tests.length}
                      </span>
                    </button>
                    <Show when={mod.expanded}>
                      <For each={mod.tests}>
                        {(test) => (
                          <div class="group flex items-center gap-2 px-3 py-1 pl-7 hover:bg-surface-base-hover">
                            <span
                              class="text-9-regular font-mono font-semibold px-1 py-0.5 rounded shrink-0"
                              classList={{ [STATUS_STYLE[test.status]]: true }}
                            >
                              {STATUS_LABEL[test.status]}
                            </span>
                            <span
                              class="text-12-regular font-mono truncate flex-1"
                              classList={{
                                "text-text-base": test.status === "idle",
                                "text-text-strong": test.status === "passed",
                                "text-red-400": test.status === "failed" || test.status === "error",
                              }}
                            >
                              {test.name}
                            </span>
                            <Show when={test.lineno}>
                              <span class="text-10-regular text-text-weak font-mono">
                                L{test.lineno}
                              </span>
                            </Show>
                            <button
                              class="opacity-0 group-hover:opacity-100 text-10-regular text-green-400 hover:text-green-300"
                              onClick={() => runTests([test.id])}
                            >
                              &#9654;
                            </button>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>

          {/* 출력 패널 */}
          <div class="shrink-0 h-40 border-t border-border-weak-base flex flex-col" style="resize: vertical; overflow: hidden; min-height: 60px; max-height: 50vh;">
            <div class="shrink-0 flex items-center gap-2 px-3 py-1.5 text-11-medium text-text-weak uppercase tracking-wider border-b border-border-weak-base">
              <span>Output</span>
              <Show when={state.running}>
                <span class="size-1.5 rounded-full bg-blue-400 animate-pulse" />
              </Show>
            </div>
            <pre class="flex-1 overflow-auto px-3 py-2 text-11-regular font-mono text-text-base whitespace-pre-wrap break-all">
              {state.output || "No output yet. Run tests to see results."}
            </pre>
          </div>
        </aside>
      </Show>
    </Show>
  )
}
```

---

## 로컬 개발 및 테스트 방법

AGENTS.md에 명시된 방법:

```bash
# 1. 의존성 설치 (monorepo root에서)
bun install

# 2. 백엔드 서버 실행 (터미널 1)
cd packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096

# 3. App dev 서버 실행 (터미널 2)
cd packages/app
bun dev -- --port 4444

# 4. 브라우저에서 확인
open http://localhost:4444
```

## 필요한 도구
- **Bun** (패키지 매니저 & 런타임)
- **Rust + Cargo** (Desktop App 빌드 시에만 필요, web dev에서는 불필요)
- **Node.js 22+**

## 요약

수정 파일 2개:
1. `packages/app/src/pages/layout.tsx` — `<main>` 뒤에 `<RightPanel />` 추가 (2줄 변경)
2. `packages/app/src/components/right-panel.tsx` — 새 파일 생성 (Test Runner 사이드 패널)

이렇게 하면 Desktop App 안에 오른쪽 사이드 패널이 생기고, 토글 버튼으로 열고 닫을 수 있으며, ResizeHandle로 크기 조절도 됩니다.
