import { createSignal, createRoot } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { TestModule, TestCase, TestFramework, TestRunResult, TestStatus } from "./types"

export interface AppState {
  modules: TestModule[]
  framework: TestFramework
  connected: boolean
  running: boolean
  lastRun: TestRunResult | null
  output: string
  error: string | null
  filter: TestStatus | "all"
}

function createAppStore() {
  const [state, setState] = createStore<AppState>({
    modules: [],
    framework: "pytest",
    connected: false,
    running: false,
    lastRun: null,
    output: "",
    error: null,
    filter: "all",
  })

  const setConnected = (v: boolean) => setState("connected", v)
  const setRunning = (v: boolean) => setState("running", v)
  const setFramework = (f: TestFramework) => setState("framework", f)
  const setOutput = (o: string) => setState("output", o)
  const appendOutput = (o: string) => setState("output", (prev) => prev + o)
  const setError = (e: string | null) => setState("error", e)
  const setLastRun = (r: TestRunResult | null) => setState("lastRun", r)
  const setFilter = (f: TestStatus | "all") => setState("filter", f)

  const setModules = (modules: TestModule[]) => setState("modules", modules)

  const toggleModule = (filepath: string) => {
    setState(
      "modules",
      (m) => m.filepath === filepath,
      "expanded",
      (e) => !e
    )
  }

  const updateTestStatus = (
    testId: string,
    status: TestStatus,
    extra?: { duration?: number; error?: string; output?: string }
  ) => {
    setState(
      produce((s) => {
        for (const mod of s.modules) {
          for (const test of mod.tests) {
            if (test.id === testId) {
              test.status = status
              if (extra?.duration !== undefined) test.duration = extra.duration
              if (extra?.error !== undefined) test.error = extra.error
              if (extra?.output !== undefined) test.output = extra.output
              return
            }
          }
        }
      })
    )
  }

  const setAllTestsStatus = (status: TestStatus) => {
    setState(
      produce((s) => {
        for (const mod of s.modules) {
          for (const test of mod.tests) {
            test.status = status
          }
        }
      })
    )
  }

  const getFilteredModules = () => {
    if (state.filter === "all") return state.modules
    return state.modules
      .map((m) => ({
        ...m,
        tests: m.tests.filter((t) => t.status === state.filter),
      }))
      .filter((m) => m.tests.length > 0)
  }

  return {
    state,
    setConnected,
    setRunning,
    setFramework,
    setOutput,
    appendOutput,
    setError,
    setLastRun,
    setFilter,
    setModules,
    toggleModule,
    updateTestStatus,
    setAllTestsStatus,
    getFilteredModules,
  }
}

export const store = createRoot(createAppStore)
