import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ReportContent } from "@/lib/report-document";
import {
  isOnReportMap,
  offsetReportMap,
  placeReportMapLabels,
  reportMapGeometry,
  reportMapPlan,
  validReportMapPosition,
  REPORT_MAP_HEIGHT,
  REPORT_MAP_WIDTH,
  type ReportMapViewport,
} from "@/lib/report-map";

const button = "rounded border px-3 py-1.5 text-sm disabled:opacity-50";
const world: ReportMapViewport = { center: [0, 0], zoom: 2 };

export function ReportMapViewportEditor({
  content,
  disabled,
  onChange,
}: {
  content: ReportContent;
  disabled: boolean;
  onChange: (view?: ReportMapViewport) => void;
}) {
  const [view, setView] = useState<ReportMapViewport | null>(null);
  const [failedTiles, setFailedTiles] = useState(false);
  const drag = useRef<{ x: number; y: number; view: ReportMapViewport; moved: boolean } | null>(
    null,
  );
  const { sources, natureSurvey, bridgeObservations, photoAtlas } = content;
  const geometry = useMemo(() => {
    const { points, rings } = reportMapGeometry({ sources, natureSurvey, bridgeObservations });
    if (!rings.length && !bridgeObservations?.length) {
      for (const point of photoAtlas?.mapPoints ?? []) points.push(point.position);
    }
    const positions = [...points, ...rings.flat(2)];
    return { rings, points, positions, valid: positions.every(validReportMapPosition) };
  }, [sources, natureSurvey, bridgeObservations, photoAtlas]);
  const plan = useMemo(
    () =>
      view && geometry.valid
        ? reportMapPlan(geometry.positions, REPORT_MAP_WIDTH, REPORT_MAP_HEIGHT, view)
        : null,
    [geometry, view],
  );
  const markers = plan?.points.slice(0, geometry.points.length) ?? [];
  const labels = plan
    ? placeReportMapLabels(markers, REPORT_MAP_WIDTH, REPORT_MAP_HEIGHT, true)
    : [];
  const visible = markers.filter((point) => isOnReportMap(point)).length;

  function open() {
    const automatic = geometry.positions.length
      ? reportMapPlan(geometry.positions).viewport
      : world;
    setView(content.mapViewport ?? automatic);
    setFailedTiles(false);
  }
  function panWithKeys(event: KeyboardEvent<SVGSVGElement>) {
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-100, 0],
      ArrowRight: [100, 0],
      ArrowUp: [0, -75],
      ArrowDown: [0, 75],
    };
    const offset = offsets[event.key];
    if (!view || !offset || disabled) return;
    event.preventDefault();
    setView(offsetReportMap(view, ...offset));
  }
  function dragTo(event: PointerEvent<SVGSVGElement>, finished: boolean) {
    const start = drag.current;
    if (!start || disabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 3) start.moved = true;
    if (start.moved) {
      setView(
        offsetReportMap(
          start.view,
          (-dx * REPORT_MAP_WIDTH) / bounds.width,
          (-dy * REPORT_MAP_HEIGHT) / bounds.height,
        ),
      );
    } else if (finished) {
      setView(
        offsetReportMap(
          start.view,
          ((event.clientX - bounds.left) / bounds.width - 0.5) * REPORT_MAP_WIDTH,
          ((event.clientY - bounds.top) / bounds.height - 0.5) * REPORT_MAP_HEIGHT,
        ),
      );
    }
    if (finished) drag.current = null;
  }

  let vertex = geometry.points.length;
  return (
    <section className="space-y-3 rounded-lg border p-5" aria-label="Rapportens kortudsnit">
      <h2 className="font-semibold">Kortudsnit</h2>
      {!view || !plan ? (
        <>
          <p className="text-sm">
            {content.mapViewport
              ? "Valgt kortudsnit"
              : "Automatisk oversigt over rapportens stedfæstede kilder"}
          </p>
          {!geometry.valid && (
            <p role="alert" className="text-sm">
              En af rapportens kilder har en ugyldig position. Kontrollér kilderegisteret.
            </p>
          )}
          <button
            type="button"
            className={button}
            disabled={disabled || !geometry.valid}
            onClick={open}
          >
            {content.mapViewport ? "Rediger kortudsnit" : "Vælg kortudsnit"}
          </button>
        </>
      ) : (
        <fieldset disabled={disabled} className="space-y-3">
          <p className="text-sm">
            Træk kortet, klik på det ønskede centrum eller brug piletasterne. Rammen viser udsnittet
            i PDF og Word.
          </p>
          {photoAtlas &&
            !photoAtlas.mapPoints &&
            !geometry.rings.length &&
            !bridgeObservations?.length && (
              <p className="text-sm">Positioner fra dette ældre fotoatlas hentes ved eksport.</p>
            )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={button}
              disabled={view.zoom >= 18}
              onClick={() => setView({ ...view, zoom: view.zoom + 1 })}
            >
              Zoom ind
            </button>
            <button
              type="button"
              className={button}
              disabled={view.zoom <= 1}
              onClick={() => setView({ ...view, zoom: view.zoom - 1 })}
            >
              Zoom ud
            </button>
            <span className="text-sm">Zoom {view.zoom}</span>
          </div>
          <svg
            role="group"
            aria-label="Kortudsnit. Flyt med piletasterne"
            tabIndex={0}
            viewBox={`0 0 ${REPORT_MAP_WIDTH} ${REPORT_MAP_HEIGHT}`}
            className="block w-full touch-none cursor-grab rounded border bg-muted active:cursor-grabbing"
            onKeyDown={panWithKeys}
            onPointerDown={(event) => {
              if (disabled || event.button !== 0 || !event.isPrimary) return;
              drag.current = { x: event.clientX, y: event.clientY, view, moved: false };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => dragTo(event, false)}
            onPointerUp={(event) => dragTo(event, true)}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          >
            <rect width={REPORT_MAP_WIDTH} height={REPORT_MAP_HEIGHT} fill="#edf1ed" />
            {!failedTiles &&
              plan.tiles.map((tile) => (
                <image
                  key={`${view.zoom}/${tile.column}/${tile.y}`}
                  href={tile.url}
                  x={tile.left}
                  y={tile.top}
                  width={256}
                  height={256}
                  onError={() => setFailedTiles(true)}
                />
              ))}
            {geometry.rings.map((rings, index) => {
              const path = rings
                .map((ring) => {
                  const projected = plan.points.slice(vertex, vertex + ring.length);
                  vertex += ring.length;
                  return `M${projected.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
                })
                .join(" ");
              return (
                <path
                  key={index}
                  d={path}
                  fill="#18754d"
                  fillOpacity={0.2}
                  fillRule="evenodd"
                  stroke="#18754d"
                  strokeWidth={3}
                />
              );
            })}
            {markers.map(
              ([x, y], i) =>
                isOnReportMap([x, y]) && (
                  <circle key={i} cx={x} cy={y} r={7} fill="#a82f26" stroke="white" strokeWidth={3}>
                    <title>Punkt {i + 1}</title>
                  </circle>
                ),
            )}
            {labels.map(({ index, left, top, width, height }) => (
              <g key={index} pointerEvents="none">
                <rect x={left} y={top} width={width} height={height} fill="white" />
                <text x={left + 4} y={top + 18} fontSize={20} fill="#193c2f">
                  {index + 1}
                </text>
              </g>
            ))}
          </svg>
          {failedTiles && (
            <p className="text-sm" role="status">
              Baggrundskortet kunne ikke hentes.{" "}
              <button type="button" className="underline" onClick={() => setFailedTiles(false)}>
                Prøv igen
              </button>
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {visible} af {markers.length} positioner i udsnittet · Nord er opad
            </span>
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              © OpenStreetMap contributors
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() => {
                onChange(view);
                setView(null);
              }}
            >
              Brug dette kortudsnit
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                onChange(undefined);
                setView(null);
              }}
            >
              Brug automatisk oversigt
            </button>
            <button type="button" className={button} onClick={() => setView(null)}>
              Annuller
            </button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
