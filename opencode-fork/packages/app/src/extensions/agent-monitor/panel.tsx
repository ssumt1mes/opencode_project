import { For, Show, createMemo, createSignal, onMount, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import type { Session, SessionStatus } from "@opencode-ai/sdk/v2/client"

type AgentState = "idle" | "busy" | "retry"

const STATE_STYLE: Record<AgentState, string> = {
  idle: "bg-surface-base text-text-weak",
  busy: "bg-blue-500/10 text-blue-400",
  retry: "bg-orange-500/10 text-orange-400",
}

const STATE_DOT: Record<AgentState, string> = {
  idle: "bg-gray-400",
  busy: "bg-blue-400 animate-pulse",
  retry: "bg-orange-400 animate-pulse",
}

function statusToState(status?: SessionStatus): AgentState {
  if (!status) return "idle"
  return status.type as AgentState
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function AgentMonitorContent() {
  const globalSDK = useGlobalSDK()

  const [state, setState] = createStore({
    sessions: [] as Session[],
    statuses: {} as Record<string, SessionStatus>,
  })

  const [filter, setFilter] = createSignal<"all" | "busy" | "idle">("all")
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())

  async function refresh() {
    try {
      const [sessionRes, statusRes] = await Promise.all([
        globalSDK.client.session.list(),
        globalSDK.client.session.status(),
      ])
      const sessions = (sessionRes.data ?? [])
        .filter((s) => !s.time?.archived)
        .sort((a, b) => b.time.updated - a.time.updated)
      setState("sessions", sessions)
      setState("statuses", statusRes.data ?? {})
    } catch {
      // ignore
    }
  }

  onMount(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 3000)
    onCleanup(() => clearInterval(interval))
  })

  const filtered = createMemo(() => {
    const f = filter()
    if (f === "all") return state.sessions
    return state.sessions.filter((s) => {
      const st = statusToState(state.statuses[s.id])
      return st === f
    })
  })

  const busyCount = createMemo(() => {
    let count = 0
    for (const s of state.sessions) {
      if (statusToState(state.statuses[s.id]) === "busy") count++
    }
    return count
  })

  const totalCount = createMemo(() => state.sessions.length)

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderStatus(status?: SessionStatus) {
    const st = statusToState(status)
    return (
      <span
        class="text-9-regular font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 uppercase"
        classList={{
          [STATE_STYLE.idle]: st === "idle",
          [STATE_STYLE.busy]: st === "busy",
          [STATE_STYLE.retry]: st === "retry",
        }}
      >
        {st}
      </span>
    )
  }

  function renderRetryInfo(status?: SessionStatus) {
    if (!status || status.type !== "retry") return null
    return (
      <div class="px-7 py-1 text-10-regular text-orange-400 font-mono">
        Attempt {status.attempt}: {status.message}
      </div>
    )
  }

  function renderSessionDetail(session: Session) {
    return (
      <div class="px-3 py-1.5 space-y-1 bg-background-base/50">
        <div class="flex items-center justify-between">
          <span class="text-10-regular text-text-weak font-mono">
            {session.id.slice(0, 8)}...
          </span>
          <span class="text-10-regular text-text-weak font-mono">
            updated {relativeTime(session.time.updated)}
          </span>
        </div>

        <div class="text-10-regular text-text-weak font-mono">
          created {relativeTime(session.time.created)}
        </div>

        <Show when={session.summary}>
          <div class="flex gap-3 text-10-regular font-mono text-text-weak pt-1 border-t border-border-weak-base">
            <Show when={session.summary!.files > 0}>
              <span>
                {session.summary!.files} file{session.summary!.files > 1 ? "s" : ""}
              </span>
            </Show>
            <Show when={session.summary!.additions > 0}>
              <span class="text-green-400">+{session.summary!.additions}</span>
            </Show>
            <Show when={session.summary!.deletions > 0}>
              <span class="text-red-400">-{session.summary!.deletions}</span>
            </Show>
          </div>
        </Show>
      </div>
    )
  }

  return (
    <>
      {/* Summary header */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-weak-base">
        <span class="text-10-regular px-1.5 py-0.5 rounded font-mono bg-blue-500/10 text-blue-400">
          {busyCount()}/{totalCount()}
        </span>
        <div class="flex-1" />
        <div class="flex gap-3 text-10-regular font-mono">
          <span class="text-blue-400">{busyCount()} active</span>
          <span class="text-text-weak">{totalCount() - busyCount()} idle</span>
        </div>
      </div>

      {/* Filters */}
      <div class="shrink-0 flex gap-0.5 px-3 py-1.5 border-b border-border-weak-base">
        {(["all", "busy", "idle"] as const).map((f) => (
          <button
            class="px-2 py-0.5 text-10-regular rounded transition-colors"
            classList={{
              "bg-surface-base text-text-strong": filter() === f,
              "text-text-weak hover:text-text-base": filter() !== f,
            }}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? `All (${totalCount()})` : f === "busy" ? `Active (${busyCount()})` : `Idle (${totalCount() - busyCount()})`}
          </button>
        ))}
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={filtered().length > 0}
          fallback={
            <div class="flex items-center justify-center h-32 text-text-weak text-13-regular">
              {state.sessions.length === 0 ? "No active sessions" : "No sessions match filter"}
            </div>
          }
        >
          <For each={filtered()}>
            {(session) => {
              const status = createMemo(() => state.statuses[session.id])
              const st = createMemo(() => statusToState(status()))
              const isExpanded = createMemo(() => expanded().has(session.id))

              return (
                <div class="border-b border-border-weak-base">
                  <button
                    class="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-base-hover text-left"
                    onClick={() => toggleExpand(session.id)}
                  >
                    <span class={`size-2 rounded-full shrink-0 ${STATE_DOT[st()]}`} />
                    <span class="text-12-medium text-text-strong truncate flex-1">
                      {session.title || "Untitled"}
                    </span>
                    {renderStatus(status())}
                    <span class="text-10-regular text-text-weak font-mono shrink-0">
                      {formatTime(session.time.updated)}
                    </span>
                    <span class="text-10-regular text-text-weak w-3">
                      {isExpanded() ? "\u25BC" : "\u25B6"}
                    </span>
                  </button>

                  {renderRetryInfo(status())}

                  <Show when={isExpanded()}>
                    {renderSessionDetail(session)}
                  </Show>
                </div>
              )
            }}
          </For>
        </Show>
      </div>

      {/* Footer */}
      <div class="shrink-0 border-t border-border-weak-base px-3 py-2 flex items-center justify-center">
        <span class="text-10-regular text-text-weak font-mono">
          {totalCount()} sessions
        </span>
      </div>
    </>
  )
}
