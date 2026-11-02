import { useRouterState } from "@tanstack/react-router";
import { programPageGuide } from "@/lib/program-map";
import { WorkspaceGuide } from "./WorkspaceGuide";
export function AppWorkspaceGuide() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const guide = programPageGuide(path);
  // The nature project's own navigation shows the precise tab/step guide.
  if (!guide || guide.id === "/app/projects/$slug") return null;
  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 pt-4 sm:px-6">
      <WorkspaceGuide question={guide.question} purpose={guide.purpose} output={guide.output} />
    </div>
  );
}
