import { useEffect, useRef } from "react";

/** Release only this editor's lock when its keyed task or actor is unmounted. */
export function useWorkOrderEditorLock(locked: boolean, onEditing?: (value: boolean) => void) {
  const listener = useRef(onEditing);
  const ownsLock = useRef(false);
  listener.current = onEditing;
  useEffect(() => {
    ownsLock.current = locked;
    listener.current?.(locked);
  }, [locked]);
  useEffect(
    () => () => {
      if (ownsLock.current) listener.current?.(false);
    },
    [],
  );
}
