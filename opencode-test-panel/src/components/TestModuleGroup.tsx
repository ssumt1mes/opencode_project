import type { Component } from "solid-js"
import { For } from "solid-js"
import type { TestModule, TestCase } from "../lib/types"
import { TestItem } from "./TestItem"

export const TestModuleGroup: Component<{
  module: TestModule
  onToggle: () => void
  onRunTest: (test: TestCase) => void
  onRunModule: (module: TestModule) => void
}> = (props) => {
  const passedCount = () =>
    props.module.tests.filter((t) => t.status === "passed").length
  const totalCount = () => props.module.tests.length
  const hasFailures = () =>
    props.module.tests.some((t) => t.status === "failed" || t.status === "error")

  return (
    <div class={`module-group ${hasFailures() ? "module-has-failures" : ""}`}>
      <div class="module-header" onClick={props.onToggle}>
        <span class="module-chevron">
          {props.module.expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span class="module-filepath" title={props.module.filepath}>
          {props.module.name}
        </span>
        <span class="module-count">
          {passedCount()}/{totalCount()}
        </span>
        <button
          class="btn-icon btn-run-module"
          onClick={(e) => {
            e.stopPropagation()
            props.onRunModule(props.module)
          }}
          title="Run all tests in this module"
        >
          &#9654;&#9654;
        </button>
      </div>
      {props.module.expanded && (
        <div class="module-tests">
          <For each={props.module.tests}>
            {(test) => (
              <TestItem test={test} onRun={props.onRunTest} />
            )}
          </For>
        </div>
      )}
    </div>
  )
}
