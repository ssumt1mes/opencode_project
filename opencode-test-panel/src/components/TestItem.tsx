import type { Component } from "solid-js"
import { Show } from "solid-js"
import type { TestCase } from "../lib/types"
import { StatusBadge } from "./StatusBadge"

export const TestItem: Component<{
  test: TestCase
  onRun: (test: TestCase) => void
}> = (props) => {
  return (
    <div class={`test-item test-item-${props.test.status}`}>
      <div class="test-item-row">
        <StatusBadge status={props.test.status} />
        <span class="test-name" title={props.test.id}>
          {props.test.name}
        </span>
        <Show when={props.test.duration !== undefined}>
          <span class="test-duration">{props.test.duration?.toFixed(2)}s</span>
        </Show>
        <Show when={props.test.lineno}>
          <span class="test-line">L{props.test.lineno}</span>
        </Show>
        <button
          class="btn-icon btn-run-single"
          onClick={() => props.onRun(props.test)}
          title="Run this test"
        >
          &#9654;
        </button>
      </div>
      <Show when={props.test.error}>
        <pre class="test-error">{props.test.error}</pre>
      </Show>
    </div>
  )
}
