import { useEffect, useState, useCallback } from "react";
import { PORTFOLIO_SEED } from "@/lib/impact-data";

const KEY = "freyra:impact:portfolio";
const COMPARE_KEY = "freyra-impact-compare-v1";

export function usePortfolio() {
  const [ids, setIds] = useState<string[]>(PORTFOLIO_SEED);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setIds(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(ids));
  }, [ids, hydrated]);
  const add = useCallback((id: string) => setIds((s) => (s.includes(id) ? s : [...s, id])), []);
  const remove = useCallback((id: string) => setIds((s) => s.filter((x) => x !== id)), []);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, add, remove, has };
}

export function useCompare() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(COMPARE_KEY);
      if (raw) setIds(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    sessionStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
  }, [ids]);
  const toggle = useCallback(
    (id: string) =>
      setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id])),
    [],
  );
  const clear = useCallback(() => setIds([]), []);
  return { ids, toggle, clear, has: (id: string) => ids.includes(id) };
}
