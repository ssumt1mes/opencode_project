import { Show, createMemo, type ComponentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Persist, persisted } from "@/utils/persist"
import { TestRunnerContent } from "@/extensions/test-runner/panel"
import { AgentMonitorContent } from "@/extensions/agent-monitor/panel"

type PanelId = "test-runner" | "agent-monitor"
type IconName = ComponentProps<typeof IconButton>["icon"]

const PANELS: { id: PanelId; icon: IconName; label: string }[] = [
  { id: "test-runner", icon: "help", label: "Test Runner" },
  { id: "agent-monitor", icon: "dot-grid", label: "Agent Monitor" },
]

export function ExtensionSidebar() {
  const [state, setState, , ready] = persisted(
    Persist.global("extension-sidebar", ["extension-sidebar.v1"]),
    createStore({
      active: null as PanelId | null,
      width: 320,
    }),
  )

  function toggle(id: PanelId) {
    setState("active", state.active === id ? null : id)
  }

  const isOpen = createMemo(() => state.active !== null)

  return (
    <Show when={ready()}>
      {/* Resize handle */}
      <Show when={isOpen()}>
        <ResizeHandle
          direction="horizontal"
          edge="start"
          size={state.width}
          min={240}
          max={typeof window === "undefined" ? 600 : window.innerWidth * 0.4}
          collapseThreshold={200}
          onResize={(w) => setState("width", w)}
          onCollapse={() => setState("active", null)}
        />
      </Show>

      {/* Panel */}
      <Show when={isOpen()}>
        <aside
          class="shrink-0 border-l border-t border-border-weak-base bg-background-stronger flex flex-col overflow-hidden"
          style={{ width: `${state.width}px` }}
        >
          <div class="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border-weak-base">
            <span class="text-13-medium text-text-strong">
              {PANELS.find((p) => p.id === state.active)?.label}
            </span>
            <IconButton
              icon="close-small"
              variant="ghost"
              class="size-6"
              onClick={() => setState("active", null)}
              aria-label="Close panel"
            />
          </div>
          <div class="flex-1 overflow-hidden flex flex-col">
            <Show when={state.active === "test-runner"}>
              <TestRunnerContent />
            </Show>
            <Show when={state.active === "agent-monitor"}>
              <AgentMonitorContent />
            </Show>
          </div>
        </aside>
      </Show>

      {/* Toggle bar — same height as panel, EXT label for distinction */}
      <div class="shrink-0 w-10 border-l border-t border-border-weak-base bg-background-stronger flex flex-col items-center">
        <div class="w-full py-1.5 flex items-center justify-center border-b border-border-weak-base">
          <span class="text-[8px] font-mono uppercase tracking-wider text-text-weak">Ext</span>
        </div>
        <div class="flex flex-col items-center gap-1 py-2">
          {PANELS.map((p) => (
            <Tooltip value={p.label} placement="left">
              <IconButton
                icon={p.icon}
                variant="ghost"
                class="size-7"
                classList={{
                  "bg-surface-base text-text-strong": state.active === p.id,
                }}
                onClick={() => toggle(p.id)}
                aria-label={p.label}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    </Show>
  )
}
