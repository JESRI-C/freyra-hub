import { useRef, useState } from "react";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export function BeforeAfterCompare({ beforeUrl, afterUrl, beforeLabel = "Før", afterLabel = "Efter" }: Props) {
  const [pos, setPos] = useState(50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full max-w-4xl max-h-[80vh] aspect-video rounded-lg overflow-hidden select-none bg-black shadow-2xl"
      onMouseDown={(e) => {
        dragging.current = true;
        move(e.clientX);
      }}
      onMouseMove={(e) => dragging.current && move(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      <img src={afterUrl} alt={afterLabel} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img src={beforeUrl} alt={beforeLabel} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      </div>

      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-md cursor-ew-resize">
          <div className="flex items-center gap-0.5 text-black text-xs font-bold">
            ‹ ›
          </div>
        </div>
      </div>

      <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded bg-black/60 text-white">
        {beforeLabel}
      </span>
      <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded bg-black/60 text-white">
        {afterLabel}
      </span>
    </div>
  );
}
