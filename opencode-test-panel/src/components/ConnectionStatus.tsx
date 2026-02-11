import type { Component } from "solid-js"
import { store } from "../lib/store"

export const ConnectionStatus: Component = () => {
  const { state } = store

  return (
    <div class={`connection-status ${state.connected ? "connected" : "disconnected"}`}>
      <span class="status-dot" />
      <span class="status-text">
        {state.connected ? "Connected to OpenCode" : "Disconnected"}
      </span>
      <span class="framework-label">{state.framework}</span>
    </div>
  )
}
