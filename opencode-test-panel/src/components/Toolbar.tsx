import type { Component } from "solid-js"
import { Show } from "solid-js"
import { store } from "../lib/store"
import type { TestStatus } from "../lib/types"

const FILTERS: { value: TestStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "error", label: "Errors" },
  { value: "skipped", label: "Skipped" },
]

export const Toolbar: Component<{
  onRunAll: () => void
  onRefresh: () => void
}> = (props) => {
  const { state, setFilter } = store

  const totalTests = () =>
    state.modules.reduce((sum, m) => sum + m.tests.length, 0)

  return (
    <div class="toolbar">
      <div class="toolbar-left">
        <button
          class="btn btn-primary"
          onClick={props.onRunAll}
          disabled={state.running || totalTests() === 0}
        >
          {state.running ? "Running..." : "Run All"}
        </button>
        <button
          class="btn btn-secondary"
          onClick={props.onRefresh}
          disabled={state.running}
          title="Re-discover tests"
        >
          Refresh
        </button>
      </div>

      <div class="toolbar-center">
        {FILTERS.map((f) => (
          <button
            class={`btn-filter ${state.filter === f.value ? "active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div class="toolbar-right">
        <Show when={state.lastRun}>
          <div class="summary">
            <span class="summary-passed">{state.lastRun!.passed} passed</span>
            <Show when={state.lastRun!.failed > 0}>
              <span class="summary-failed">{state.lastRun!.failed} failed</span>
            </Show>
            <Show when={state.lastRun!.errors > 0}>
              <span class="summary-error">{state.lastRun!.errors} errors</span>
            </Show>
            <span class="summary-duration">{state.lastRun!.duration.toFixed(2)}s</span>
          </div>
        </Show>
      </div>
    </div>
  )
}
