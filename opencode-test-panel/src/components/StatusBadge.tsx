import type { Component } from "solid-js"
import type { TestStatus } from "../lib/types"

const STATUS_CONFIG: Record<TestStatus, { label: string; class: string }> = {
  idle: { label: "IDLE", class: "badge-idle" },
  running: { label: "RUN", class: "badge-running" },
  passed: { label: "PASS", class: "badge-passed" },
  failed: { label: "FAIL", class: "badge-failed" },
  error: { label: "ERR", class: "badge-error" },
  skipped: { label: "SKIP", class: "badge-skipped" },
}

export const StatusBadge: Component<{ status: TestStatus }> = (props) => {
  const config = () => STATUS_CONFIG[props.status]

  return (
    <span class={`badge ${config().class}`}>
      {config().label}
    </span>
  )
}
