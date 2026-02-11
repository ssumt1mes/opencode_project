import { Component, For, onMount, Show, createSignal } from "solid-js"
import { store } from "./lib/store"
import { client } from "./lib/client"
import {
  discoverTestFiles,
  parseTestFile,
  detectFramework,
  buildTestCommand,
  parsePytestOutput,
  parseUnittestOutput,
  parseSummary,
} from "./lib/test-runner"
import type { TestCase, TestModule } from "./lib/types"

import { Toolbar } from "./components/Toolbar"
import { TestModuleGroup } from "./components/TestModuleGroup"
import { OutputPanel } from "./components/OutputPanel"
import { ConnectionStatus } from "./components/ConnectionStatus"

const App: Component = () => {
  const {
    state,
    setConnected,
    setRunning,
    setFramework,
    setModules,
    setOutput,
    setError,
    setLastRun,
    toggleModule,
    updateTestStatus,
    setAllTestsStatus,
    getFilteredModules,
  } = store

  const [sessionId, setSessionId] = createSignal<string | null>(null)

  onMount(async () => {
    await checkConnection()
    await refresh()
    await ensureSession()
    subscribeEvents()
  })

  async function checkConnection() {
    try {
      const health = await client.global.health()
      if (health.data) {
        setConnected(true)
      }
    } catch {
      setConnected(false)
      setError("Cannot connect to OpenCode server. Is it running on localhost:4096?")
    }
  }

  async function ensureSession() {
    try {
      const sessions = await client.session.list()
      const list = (sessions.data ?? []) as any[]
      if (list.length > 0) {
        setSessionId(list[0].id)
      } else {
        const created = await client.session.create({
          body: { title: "Test Runner" },
        })
        setSessionId((created.data as any)?.id ?? null)
      }
    } catch (e) {
      console.error("Failed to get/create session:", e)
    }
  }

  async function subscribeEvents() {
    try {
      const events = await client.event.subscribe()
      for await (const event of (events as any).stream) {
        if (event.type === "session.idle") {
          setRunning(false)
        }
      }
    } catch {
      // SSE connection lost, try reconnect after delay
      setTimeout(subscribeEvents, 3000)
    }
  }

  async function refresh() {
    try {
      const framework = await detectFramework()
      setFramework(framework)

      const files = await discoverTestFiles()
      const modules: TestModule[] = []

      for (const filepath of files) {
        const tests = await parseTestFile(filepath)
        if (tests.length > 0) {
          const name = filepath.split("/").pop() ?? filepath
          modules.push({ filepath, name, tests, expanded: true })
        }
      }

      setModules(modules)
      setError(null)
    } catch (e) {
      setError(`Failed to discover tests: ${e}`)
    }
  }

  async function runTests(targets?: string[]) {
    const sid = sessionId()
    if (!sid) {
      setError("No active session. Please check connection.")
      return
    }

    setRunning(true)
    setOutput("")

    if (!targets) {
      setAllTestsStatus("running")
    }

    const cmd = buildTestCommand(state.framework, targets)

    try {
      const result = await client.session.shell({
        path: { id: sid },
        body: {
          agent: "build",
          command: cmd,
        },
      })

      // Extract output from the response parts
      const parts = (result.data as any)?.parts ?? []
      let fullOutput = ""
      for (const part of parts) {
        if (part.type === "tool-result" || part.type === "text") {
          fullOutput += (part.text ?? part.content ?? "") + "\n"
        }
      }

      setOutput(fullOutput)

      // Parse results
      const parseResults =
        state.framework === "pytest"
          ? parsePytestOutput(fullOutput)
          : parseUnittestOutput(fullOutput)

      // Update individual test statuses
      for (const [testId, result] of parseResults) {
        updateTestStatus(testId, result.status, {
          error: result.error,
        })
      }

      // Mark tests not in results but were running as passed/idle
      for (const mod of state.modules) {
        for (const test of mod.tests) {
          if (test.status === "running") {
            // If not in results, keep as idle
            if (!parseResults.has(test.id)) {
              updateTestStatus(test.id, "idle")
            }
          }
        }
      }

      // Parse summary
      const summary = parseSummary(fullOutput)
      if (summary.total !== undefined) {
        setLastRun({
          total: summary.total ?? 0,
          passed: summary.passed ?? 0,
          failed: summary.failed ?? 0,
          errors: summary.errors ?? 0,
          skipped: summary.skipped ?? 0,
          duration: summary.duration ?? 0,
          timestamp: new Date().toISOString(),
        })
      }
    } catch (e) {
      setOutput(`Error running tests: ${e}`)
      setAllTestsStatus("error")
    } finally {
      setRunning(false)
    }
  }

  function runSingleTest(test: TestCase) {
    updateTestStatus(test.id, "running")
    if (state.framework === "pytest") {
      runTests([test.id])
    } else {
      runTests([test.module + "." + test.name])
    }
  }

  function runModuleTests(mod: TestModule) {
    for (const t of mod.tests) {
      updateTestStatus(t.id, "running")
    }
    runTests([mod.filepath])
  }

  return (
    <div class="app">
      <header class="app-header">
        <h1>Test Runner</h1>
        <ConnectionStatus />
      </header>

      <Show when={state.error}>
        <div class="error-banner">{state.error}</div>
      </Show>

      <Toolbar onRunAll={() => runTests()} onRefresh={refresh} />

      <div class="main-content">
        <div class="test-list">
          <Show
            when={getFilteredModules().length > 0}
            fallback={
              <div class="empty-state">
                {state.modules.length === 0
                  ? "No test files found. Click Refresh to scan."
                  : "No tests match the current filter."}
              </div>
            }
          >
            <For each={getFilteredModules()}>
              {(mod) => (
                <TestModuleGroup
                  module={mod}
                  onToggle={() => toggleModule(mod.filepath)}
                  onRunTest={runSingleTest}
                  onRunModule={runModuleTests}
                />
              )}
            </For>
          </Show>
        </div>

        <OutputPanel />
      </div>
    </div>
  )
}

export default App
