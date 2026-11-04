import { Component, Suspense, useState, type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ProjectNavigation } from "./ProjectNavigation";
import type { ProjectStep, ProjectTab, ProjectView } from "@/lib/project-navigation";

/** Mount this with an actor/project key. Opened editors survive navigation within that scope. */
export function ProjectWorkspaceShell({
  view,
  onNavigate,
  renderTab,
  renderStep,
  taskFocused = false,
}: {
  view: ProjectView;
  onNavigate: (view: ProjectView) => void;
  renderTab: (tab: ProjectTab) => ReactNode;
  renderStep: (step: ProjectStep) => ReactNode;
  taskFocused?: boolean;
}) {
  const [opened, setOpened] = useState<{ tab?: ProjectTab; steps: ProjectStep[] }>(() =>
    view.kind === "tab" ? { tab: view.id, steps: [] } : { steps: [view.id] },
  );
  if (view.kind === "tab" && opened.tab !== view.id) setOpened({ ...opened, tab: view.id });
  if (view.kind === "step" && !opened.steps.includes(view.id))
    setOpened({ ...opened, steps: [...opened.steps, view.id] });
  return (
    <div className="min-w-0">
      <div className={`mx-auto max-w-[1200px] px-3 py-3 sm:px-6 ${taskFocused ? "" : "sm:py-6"}`}>
        <ProjectNavigation view={view} onNavigate={onNavigate} taskFocused={taskFocused} />
      </div>
      {opened.tab && (
        <div hidden={view.kind !== "tab"}>
          <ProjectToolPanel>{renderTab(opened.tab)}</ProjectToolPanel>
        </div>
      )}
      {opened.steps.map((step) => (
        <div key={step} hidden={view.kind !== "step" || view.id !== step}>
          <ProjectToolPanel>{renderStep(step)}</ProjectToolPanel>
        </div>
      ))}
    </div>
  );
}

function ProjectToolPanel({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ToolErrorBoundary onReset={reset}>
          <Suspense
            fallback={
              <p role="status" className="p-4">
                Oplysningerne hentes…
              </p>
            }
          >
            {children}
          </Suspense>
        </ToolErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

class ToolErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-4 space-y-3 rounded-lg border p-4">
        <p>Værktøjet kunne ikke åbnes. Du kan prøve igen eller vælge et andet arbejdsområde.</p>
        <button
          type="button"
          className="min-h-11 rounded-lg border px-4 py-2"
          onClick={() => {
            this.props.onReset();
            this.setState({ failed: false });
          }}
        >
          Prøv igen
        </button>
      </div>
    );
  }
}
