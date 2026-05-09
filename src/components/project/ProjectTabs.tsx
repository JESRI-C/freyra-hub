import { useState } from "react";
import type { ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
}

interface ProjectTabsProps {
  tabs: Tab[];
  children: (activeTab: string) => ReactNode;
}

export function ProjectTabs({ tabs, children }: ProjectTabsProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div>
      <div className="flex gap-1 border-b overflow-x-auto pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
              active === tab.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-5">{children(active)}</div>
    </div>
  );
}
