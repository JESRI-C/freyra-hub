import type { ReactNode } from "react";
import { useState } from "react";
import { X, CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import { Card, Pill } from "@/components/ui-bits";

export function Section({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Field({ label, value, onChange, type = "text", hint }: { label: string; value: string; onChange?: (v: string) => void; type?: string; hint?: string }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </label>
  );
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange?: (v: string) => void }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <select value={value} onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange?: (v: boolean) => void; label?: string }) {
  return (
    <button onClick={() => onChange?.(!checked)} type="button"
      className={`inline-flex items-center gap-2 select-none ${onChange ? "cursor-pointer" : ""}`}>
      <span className={`relative inline-block h-5 w-9 rounded-full transition ${checked ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-4" : ""}`} />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-xl" }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Luk" onClick={onClose} className="flex-1 bg-foreground/30 backdrop-blur-sm" />
      <aside className={`w-full ${width} bg-card border-l shadow-2xl flex flex-col`}>
        <header className="flex items-start justify-between p-5 border-b">
          <div>
            <div className="text-base font-semibold">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        {footer && <footer className="p-4 border-t bg-muted/30 flex flex-wrap gap-2">{footer}</footer>}
      </aside>
    </div>
  );
}

export function PermissionCell({ level }: { level: "full" | "limited" | "none" }) {
  if (level === "full") return <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-success/15 text-success" title="Fuld adgang"><CheckCircle2 className="h-3.5 w-3.5" /></span>;
  if (level === "limited") return <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-warning/20 text-warning-foreground" title="Begrænset"><AlertTriangle className="h-3.5 w-3.5" /></span>;
  return <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground" title="Ingen adgang"><Minus className="h-3.5 w-3.5" /></span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, "success" | "warning" | "danger" | "default" | "info"> = {
    "Aktiv": "success", "Inviteret": "info", "Inaktiv": "default",
    "Begrænset": "warning", "Ikke aktiv": "default",
    "Pause": "warning", "Planlægning": "info", "Afsluttet": "default",
    "Betalt": "success", "Udløbet": "default", "Fejler": "danger",
    "Lav": "default", "Middel": "warning", "Høj": "danger",
  };
  return <Pill tone={map[status] ?? "default"}>{status}</Pill>;
}

export function useSavedToast() {
  const [v, setV] = useState(false);
  const trigger = () => { setV(true); setTimeout(() => setV(false), 2200); };
  return { saved: v, trigger };
}

export function SavedToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 bg-success text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
      <CheckCircle2 className="h-4 w-4" /> Gemt
    </div>
  );
}
