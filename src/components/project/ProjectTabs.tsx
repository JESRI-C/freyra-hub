import { useState } from "react";
import type { ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
}

interface ProjectTabsProps {
  tabs: Tab[];
  children: (activeTab: string) => ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  primaryTabIds?: string[];
}

export function ProjectTabs({
  tabs,
  children,
  activeTab,
  onTabChange,
  primaryTabIds,
}: ProjectTabsProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const selected = tabs.some((tab) => tab.id === (activeTab ?? active))
    ? (activeTab ?? active)
    : (tabs[0]?.id ?? "");
  const choose = (id: string) => {
    setActive(id);
    onTabChange?.(id);
  };
  const button = (tab: Tab) => (
    <button
      type="button"
      key={tab.id}
      onClick={() => choose(tab.id)}
      aria-pressed={selected === tab.id}
      className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${selected === tab.id ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"}`}
    >
      {tab.label}
    </button>
  );
  const primary = primaryTabIds ? tabs.filter((tab) => primaryTabIds.includes(tab.id)) : tabs;
  const extra = primaryTabIds ? tabs.filter((tab) => !primaryTabIds.includes(tab.id)) : [];

  return (
    <div className="min-w-0">
      <label className="block text-sm font-medium md:hidden">
        Vis på sagen
        <select
          className="mt-2 min-h-11 w-full min-w-0 rounded-xl border bg-card px-3 py-2 text-base"
          value={selected}
          onChange={(event) => choose(event.target.value)}
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </label>
      <div className="hidden gap-1 border-b overflow-x-auto pb-px md:flex">
        {primary.map(button)}
      </div>
      {!!extra.length && (
        <details
          className="mt-3 hidden md:block"
          open={extra.some((tab) => tab.id === selected) || undefined}
        >
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Flere værktøjer og historik
          </summary>
          <div className="mt-2 flex flex-wrap gap-1 rounded-lg border p-2">{extra.map(button)}</div>
        </details>
      )}
      <div className="mt-4 min-w-0 sm:mt-5">{children(selected)}</div>
    </div>
  );
}
