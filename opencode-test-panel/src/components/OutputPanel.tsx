import type { Component } from "solid-js"
import { Show, createEffect } from "solid-js"
import { store } from "../lib/store"

export const OutputPanel: Component = () => {
  const { state } = store
  let outputRef: HTMLPreElement | undefined

  createEffect(() => {
    // Auto-scroll to bottom when output changes
    const _ = state.output
    if (outputRef) {
      outputRef.scrollTop = outputRef.scrollHeight
    }
  })

  return (
    <div class="output-panel">
      <div class="output-header">
        <span>Output</span>
        <Show when={state.running}>
          <span class="running-indicator" />
        </Show>
      </div>
      <pre class="output-content" ref={outputRef}>
        {state.output || "No output yet. Run tests to see results."}
      </pre>
    </div>
  )
}
