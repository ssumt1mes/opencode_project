import { For, Show, createMemo, onMount } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { useGlobalSDK } from "@/context/global-sdk"

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

const FILTERS = ["all", "passed", "failed", "error", "skipped"] as const

export function TestRunnerContent() {
  const globalSDK = useGlobalSDK()

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
      const health = await globalSDK.client.global.health()
      if (health.data) setState("connected", true)
    } catch {
      setState("connected", false)
    }
  })

  async function discover() {
    try {
      const r1 = await globalSDK.client.find.files({ query: "test_*.py", type: "file" })
      const r2 = await globalSDK.client.find.files({ query: "*_test.py", type: "file" })
      const files = [...new Set([...(r1.data ?? []), ...(r2.data ?? [])])].sort()

      const modules: TestModule[] = []
      for (const filepath of files) {
        const content = await globalSDK.client.file.read({ path: filepath })
        const text = content.data?.content ?? ""
        const tests = parse(filepath, text)
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

  function parse(filepath: string, content: string): TestCase[] {
    const lines = content.split("\n")
    const tests: TestCase[] = []
    const mod = filepath.replace(/\//g, ".").replace(/\.py$/, "")

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*def\s+(test_\w+)\s*\(/)
      if (!m) continue
      tests.push({
        id: `${filepath}::${m[1]}`,
        name: m[1],
        module: mod,
        filepath,
        lineno: i + 1,
        status: "idle",
      })
    }
    return tests
  }

  async function run(targets?: string[]) {
    setState("running", true)
    setState("output", "")

    if (!targets) {
      setState(
        produce((s) => {
          for (const mod of s.modules)
            for (const test of mod.tests) test.status = "running"
        }),
      )
    }

    const cmd = `python -m pytest -v --tb=short --no-header ${targets?.join(" ") ?? ""}`

    try {
      const sessions = await globalSDK.client.session.list()
      let sid = sessions.data?.[0]?.id
      if (!sid) {
        const created = await globalSDK.client.session.create({ title: "Test Runner" })
        sid = created.data?.id
      }
      if (!sid) throw new Error("No session available")

      const result = await globalSDK.client.session.shell({
        sessionID: sid,
        agent: "build",
        command: cmd,
      })

      const output = JSON.stringify(result.data ?? {}, null, 2)

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
      const m = line.match(/^(.+?::[\w.]+)\s+(PASSED|FAILED|ERROR|SKIPPED)/)
      if (!m) continue
      const id = m[1].trim()
      const status = m[2].toLowerCase() as TestStatus
      setState(
        produce((s) => {
          for (const mod of s.modules)
            for (const test of mod.tests)
              if (test.id === id) test.status = status
        }),
      )
    }

    const sm = output.match(/=+\s*([\d\w\s,]+)\s+in\s+([\d.]+)s\s*=+/)
    if (sm) {
      setState("summary", {
        passed: parseInt(sm[1].match(/(\d+)\s+passed/)?.[1] ?? "0"),
        failed: parseInt(sm[1].match(/(\d+)\s+failed/)?.[1] ?? "0"),
        errors: parseInt(sm[1].match(/(\d+)\s+error/)?.[1] ?? "0"),
        duration: parseFloat(sm[2]),
      })
    }
  }

  function toggleModule(filepath: string) {
    setState(
      produce((s) => {
        const mod = s.modules.find((m) => m.filepath === filepath)
        if (mod) mod.expanded = !mod.expanded
      }),
    )
  }

  const filtered = createMemo(() => {
    if (state.filter === "all") return state.modules
    return state.modules
      .map((m) => ({ ...m, tests: m.tests.filter((t) => t.status === state.filter) }))
      .filter((m) => m.tests.length > 0)
  })

  const total = createMemo(() => state.modules.reduce((sum, m) => sum + m.tests.length, 0))

  return (
    <>
      {/* Status + Toolbar */}
      <div class="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-border-weak-base">
        <span
          class="text-10-regular px-1.5 py-0.5 rounded font-mono uppercase"
          classList={{
            "bg-green-500/10 text-green-400": state.connected,
            "bg-red-500/10 text-red-400": !state.connected,
          }}
        >
          {state.connected ? "pytest" : "offline"}
        </span>
        <div class="flex-1" />
        <Button size="small" disabled={state.running || total() === 0} onClick={() => run()}>
          {state.running ? "Running..." : "Run All"}
        </Button>
        <Button size="small" variant="ghost" disabled={state.running} onClick={discover}>
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <Show when={state.summary}>
        <div class="shrink-0 flex gap-2 px-3 py-1.5 text-10-regular font-mono border-b border-border-weak-base">
          <span class="text-green-400">{state.summary!.passed}P</span>
          <Show when={state.summary!.failed > 0}>
            <span class="text-red-400">{state.summary!.failed}F</span>
          </Show>
          <span class="text-text-weak">{state.summary!.duration.toFixed(1)}s</span>
        </div>
      </Show>

      {/* Filters */}
      <div class="shrink-0 flex gap-0.5 px-3 py-1.5 border-b border-border-weak-base">
        <For each={FILTERS}>
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

      {/* Test list */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={filtered().length > 0}
          fallback={
            <div class="flex items-center justify-center h-32 text-text-weak text-13-regular">
              {state.modules.length === 0 ? "Click Refresh to scan tests" : "No tests match filter"}
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
                  <span class="text-12-medium text-text-strong font-mono truncate flex-1">{mod.name}</span>
                  <span class="text-10-regular text-text-weak font-mono">
                    {mod.tests.filter((t) => t.status === "passed").length}/{mod.tests.length}
                  </span>
                </button>
                <Show when={mod.expanded}>
                  <For each={mod.tests}>
                    {(test) => (
                      <div class="group flex items-center gap-2 px-3 py-1 pl-7 hover:bg-surface-base-hover">
                        <span
                          class={`text-9-regular font-mono font-semibold px-1 py-0.5 rounded shrink-0 ${STATUS_STYLE[test.status]}`}
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
                          <span class="text-10-regular text-text-weak font-mono">L{test.lineno}</span>
                        </Show>
                        <button
                          class="opacity-0 group-hover:opacity-100 text-10-regular text-green-400 hover:text-green-300 transition-opacity"
                          onClick={() => run([test.id])}
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

      {/* Output */}
      <div class="shrink-0 h-40 border-t border-border-weak-base flex flex-col">
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
    </>
  )
}
