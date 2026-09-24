import { useEffect, useMemo, useRef, useState } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import type { Font } from "opentype.js";
import {
  boundsOfContours,
  composeView,
  computeFit,
  contoursToOutline,
  curvesInRect,
  hitCurve,
  moveAnchor,
  outlinePath,
  pinCurvePoints,
  pointsAlong,
  snapBoxToGrid,
  IDENTITY_VIEW,
  project,
  svgDocument,
  unproject,
  zoomView,
  type Bounds,
  type CurvePoint,
  type Fit,
  type OrigContour,
  type Outline,
  type Sample,
  type View,
} from "./outline/geometry";
import { loadTypeface, textToContours } from "./outline/text";

function buildDial(showGridSize: boolean, gridSize: number, snapToGrid: boolean) {
  return {
    text: { type: "text" as const, default: "Anna He", placeholder: "Type a word" },
    typeface: {
      type: "select" as const,
      options: [
        { value: "serif", label: "Serif · LT Superior" },
        { value: "sans", label: "Sans · Inter" },
      ],
      default: "serif",
    },
    letterSpacing: [0, -0.2, 0.6, 0.01] as [number, number, number, number],
    vectorPoints: [1, 1, 15, 1] as [number, number, number, number],
    grid: false,
    ...(showGridSize
      ? {
          gridSize: [gridSize, 8, 160, 4] as [number, number, number, number],
          snapToGrid,
        }
      : {}),
    exportSvg: { type: "action" as const, label: "Export SVG" },
    reset: { type: "action" as const, label: "Reset points" },
  };
}

const FACES = {
  sans: "/fonts/Inter-SemiBold.ttf",
  serif: "/fonts/LTSuperiorSerif-Semibold.otf",
} as const;

type Face = keyof typeof FACES;

type Gesture =
  | { kind: "move"; points: CurvePoint[]; x: number; y: number }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "pinch" }
  | { kind: "pan"; x: number; y: number; panX: number; panY: number };

const pointKey = (point: Pick<CurvePoint, "contour" | "seg" | "t">) =>
  `${point.contour}:${point.seg}:${point.t.toFixed(4)}`;

export default function App() {
  const gridSizeHeld = useRef(40);
  const snapHeld = useRef(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const dial = useMemo(
    () => buildDial(gridOpen, gridSizeHeld.current, snapHeld.current),
    [gridOpen],
  );
  const params = useDialKit("Type", dial, {
    onAction: (path) => {
      if (path === "reset") resetRef.current();
      if (path === "exportSvg") exportRef.current();
    },
  });

  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>(IDENTITY_VIEW);
  const density = Math.max(1, Math.round(params.vectorPoints));
  const spacing = Math.round(params.letterSpacing * 100) / 100;
  const text = params.text;
  const face: Face = params.typeface === "sans" ? "sans" : "serif";
  const gridOn = params.grid;
  const gridSizeValue = "gridSize" in params ? params.gridSize : undefined;
  if (typeof gridSizeValue === "number") gridSizeHeld.current = gridSizeValue;
  const snapValue = "snapToGrid" in params ? params.snapToGrid : undefined;
  if (typeof snapValue === "boolean") snapHeld.current = snapValue;
  const gridSize = Math.max(4, gridSizeHeld.current);
  const snapOn = gridOn && snapHeld.current;

  const fontsRef = useRef<Partial<Record<Face, Font>>>({});
  const origRef = useRef<OrigContour[]>([]);
  const outlinesRef = useRef<Outline[]>([]);
  const pointsRef = useRef<CurvePoint[]>([]);
  const samplesRef = useRef<Sample[]>([]);
  const boundsRef = useRef<Bounds | null>(null);
  const textRef = useRef<string | null>(null);
  const faceRef = useRef<Face | null>(null);
  const spacingRef = useRef<number | null>(null);
  const densityRef = useRef(density);
  const fitRef = useRef<Fit>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ zoom: number; panX: number; panY: number; dist: number; cx: number; cy: number } | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const selectionRef = useRef<CurvePoint[]>([]);
  const resetRef = useRef<() => void>(() => {});
  const exportRef = useRef<() => void>(() => {});

  const stageRef = useRef<HTMLElement>(null);
  const hitRef = useRef<SVGPathElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);
  const [pointsOn, setPointsOn] = useState(false);
  const [hot, setHot] = useState<CurvePoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<CurvePoint[]>([]);
  const [marquee, setMarquee] = useState<Gesture & { kind: "marquee" } | null>(null);

  const bump = () => setTick((value) => value + 1);
  viewRef.current = view;

  useEffect(() => {
    setGridOpen((open) => (open === gridOn ? open : gridOn));
  }, [gridOn]);

  const replaceSelection = (points: CurvePoint[]) => {
    selectionRef.current = points;
    setSelection(points);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 1600);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({ w: box.width, h: box.height });
    });
    observer.observe(stage);
    const onWheel = (event: WheelEvent) => {
      if (!boundsRef.current) return;
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const pixels = (value: number) =>
        event.deltaMode === 1 ? value * 16 : event.deltaMode === 2 ? value * rect.height : value;
      const dx = pixels(event.deltaX);
      const dy = pixels(event.deltaY);
      const pinch = event.ctrlKey || event.metaKey;
      const trackpad = event.deltaMode === 0 && (event.deltaX !== 0 || !Number.isInteger(event.deltaY));
      if (!pinch && trackpad) {
        setView((current) => ({ ...current, panX: current.panX - dx, panY: current.panY - dy }));
        return;
      }
      const factor = Math.exp(-dy * 0.0015);
      const base = computeFit(rect.width, rect.height, boundsRef.current);
      setView((current) =>
        zoomView(current, base, rect.width, rect.height, event.clientX - rect.left, event.clientY - rect.top, current.zoom * factor),
      );
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      const step = event.shiftKey ? 80 : 24;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = move[event.key];
      if (!delta) return;
      event.preventDefault();
      setView((current) => ({ ...current, panX: current.panX + delta[0], panY: current.panY + delta[1] }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      stage.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (Object.keys(FACES) as Face[]).map(async (id) => {
        const font = await loadTypeface(FACES[id]);
        return [id, font] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        fontsRef.current = Object.fromEntries(entries);
        setFontsReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("A typeface didn’t load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const font = fontsRef.current[face];
    if (!font) return;

    const textChanged = textRef.current !== text;
    const faceChanged = faceRef.current !== face;
    const spacingChanged = spacingRef.current !== spacing;
    const densityChanged = densityRef.current !== density;

    if (textChanged || faceChanged || spacingChanged) {
      samplesRef.current = [];
      gestureRef.current = null;
      replaceSelection([]);
      setDragging(false);
      setHot(null);
      setMarquee(null);
      const contours = textToContours(font, text, spacing);
      origRef.current = contours;
      boundsRef.current = boundsOfContours(contours);
      outlinesRef.current = contoursToOutline(contours, 1);
      pointsRef.current = pointsAlong(outlinesRef.current, density);
      textRef.current = text;
      faceRef.current = face;
      spacingRef.current = spacing;
      densityRef.current = density;
      setView(IDENTITY_VIEW);
      bump();
      return;
    }

    if (densityChanged) {
      gestureRef.current = null;
      replaceSelection([]);
      setHot(null);
      setMarquee(null);
      pointsRef.current = pointsAlong(outlinesRef.current, density);
      densityRef.current = density;
      bump();
    }
  }, [fontsReady, text, density, face, spacing]);

  resetRef.current = () => {
    samplesRef.current = [];
    gestureRef.current = null;
    replaceSelection([]);
    setDragging(false);
    setHot(null);
    setMarquee(null);
    outlinesRef.current = contoursToOutline(origRef.current, 1);
    pointsRef.current = pointsAlong(outlinesRef.current, densityRef.current);
    bump();
  };

  exportRef.current = () => {
    if (outlinesRef.current.length === 0) {
      setNotice("Nothing to export");
      return;
    }
    const fill = getComputedStyle(document.documentElement).getPropertyValue("--glyph").trim() || "#c9c9c5";
    const markup = svgDocument(outlinesRef.current, fill);
    if (!markup) {
      setNotice("Nothing to export");
      return;
    }
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "outline";
    link.href = url;
    link.download = `${slug}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Exported SVG");
  };

  const outlines = outlinesRef.current;
  const curvePoints = pointsRef.current;
  void tick;
  const baseFit = computeFit(size.w, size.h, boundsRef.current);
  const fit = composeView(baseFit, view, size.w, size.h);
  fitRef.current = fit;
  const path = outlinePath(outlines, fit);
  const count = curvePoints.length;
  const trimmed = text.trim();
  const showWord = fontsReady && !error && trimmed.length > 0 && outlines.length > 0 && size.w > 0;
  const showPoints = pointsOn || dragging || marquee !== null;

  const preview = marquee ? curvesInRect(curvePoints, fit, marquee) : [];
  const marked = new Set((marquee ? preview : selection).map(pointKey));
  const hotKey = hot ? pointKey(hot) : "";

  const pinchSnapshot = () => {
    const pair = [...pointersRef.current.values()];
    const a = pair[0];
    const b = pair[1];
    if (!a || !b) return null;
    return {
      zoom: viewRef.current.zoom,
      panX: viewRef.current.panX,
      panY: viewRef.current.panY,
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  };

  const nearText = (x: number, y: number) => {
    const node = hitRef.current;
    if (!node || !node.getAttribute("d")) return false;
    const point = new DOMPoint(x, y);
    return node.isPointInFill(point) || node.isPointInStroke(point);
  };

  const revealPoints = (x: number, y: number) => {
    if (gestureRef.current || nearText(x, y)) {
      setPointsOn(true);
      return;
    }
    setPointsOn(false);
    setHot(null);
  };

  const localPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!showWord) return;
    const point = localPoint(event);
    if (event.button === 1) {
      event.preventDefault();
      gestureRef.current = {
        kind: "pan",
        x: point.x,
        y: point.y,
        panX: viewRef.current.panX,
        panY: viewRef.current.panY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      setMarquee(null);
      return;
    }
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size >= 2) {
      gestureRef.current = { kind: "pinch" };
      pinchRef.current = pinchSnapshot();
      setDragging(true);
      setMarquee(null);
      return;
    }
    const hit = hitCurve(point.x, point.y, pointsRef.current, fitRef.current);
    setPointsOn(true);
    if (hit) {
      const already = selectionRef.current.some((item) => pointKey(item) === pointKey(hit));
      const picks = already && selectionRef.current.length > 0 ? selectionRef.current : [hit];
      const moving = pinCurvePoints(outlinesRef.current, picks);
      pointsRef.current = pointsAlong(outlinesRef.current, densityRef.current);
      replaceSelection(moving);
      const [fx, fy] = unproject(point.x, point.y, fitRef.current);
      gestureRef.current = { kind: "move", points: moving, x: fx, y: fy };
      setHot(moving[0] ?? null);
      setDragging(true);
      setMarquee(null);
      bump();
    } else {
      const next = { kind: "marquee" as const, x0: point.x, y0: point.y, x1: point.x, y1: point.y };
      gestureRef.current = next;
      setMarquee(next);
      setDragging(true);
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!showWord) return;
    const point = localPoint(event);
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, point);
    const gesture = gestureRef.current;
    if (gesture?.kind === "pan") {
      setView({
        zoom: viewRef.current.zoom,
        panX: gesture.panX + (point.x - gesture.x),
        panY: gesture.panY + (point.y - gesture.y),
      });
      return;
    }
    if (gesture?.kind === "pinch") {
      const pinch = pinchRef.current;
      const pair = [...pointersRef.current.values()];
      if (!pinch || pair.length < 2 || pinch.dist < 1) return;
      const [a, b] = pair;
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rect = event.currentTarget.getBoundingClientRect();
      const base = computeFit(rect.width, rect.height, boundsRef.current);
      const next = zoomView(
        { zoom: pinch.zoom, panX: pinch.panX, panY: pinch.panY },
        base,
        rect.width,
        rect.height,
        pinch.cx,
        pinch.cy,
        pinch.zoom * (dist / pinch.dist),
      );
      setView({
        zoom: next.zoom,
        panX: next.panX + (cx - pinch.cx),
        panY: next.panY + (cy - pinch.cy),
      });
      return;
    }
    if (!gesture) {
      const hit = hitCurve(point.x, point.y, pointsRef.current, fitRef.current);
      setHot((current) => {
        if (pointKeyOrEmpty(current) === pointKeyOrEmpty(hit)) return current;
        return hit;
      });
      return;
    }
    if (gesture.kind === "marquee") {
      gesture.x1 = point.x;
      gesture.y1 = point.y;
      setMarquee({ ...gesture });
      return;
    }
    const [fx, fy] = unproject(point.x, point.y, fitRef.current);
    let targetX = fx;
    let targetY = fy;
    if (snapOn && gesture.points.length > 0) {
      const followX = fx - gesture.x;
      const followY = fy - gesture.y;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const item of gesture.points) {
        const [sx, sy] = project(item.x + followX, item.y + followY, fitRef.current);
        minX = Math.min(minX, sx);
        minY = Math.min(minY, sy);
        maxX = Math.max(maxX, sx);
        maxY = Math.max(maxY, sy);
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const shift = snapBoxToGrid(
        { minX, minY, maxX, maxY },
        rect.width,
        rect.height,
        gridSize,
        viewRef.current.zoom,
        viewRef.current.panX,
        viewRef.current.panY,
      );
      const scale = fitRef.current.scale || 1;
      targetX = gesture.x + followX + shift.x / scale;
      targetY = gesture.y + followY + shift.y / scale;
    }
    const dx = targetX - gesture.x;
    const dy = targetY - gesture.y;
    if (dx === 0 && dy === 0) return;
    gesture.x = targetX;
    gesture.y = targetY;
    for (const item of gesture.points) {
      const outline = outlinesRef.current[item.contour];
      if (!outline) continue;
      moveAnchor(outline, item.seg, dx, dy, samplesRef.current);
      item.x += dx;
      item.y += dy;
    }
    pointsRef.current = pointsAlong(outlinesRef.current, densityRef.current);
    bump();
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size >= 2) {
      pinchRef.current = pinchSnapshot();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (pointersRef.current.size === 1) pinchRef.current = null;
    const gesture = gestureRef.current;
    gestureRef.current = null;
    pinchRef.current = null;
    setDragging(false);
    if (gesture?.kind === "marquee") {
      const span = Math.hypot(gesture.x1 - gesture.x0, gesture.y1 - gesture.y0);
      replaceSelection(span < 4 ? [] : curvesInRect(pointsRef.current, fitRef.current, gesture));
      setMarquee(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const markedCount = marquee ? preview.length : selection.length;
  const chip =
    markedCount > 0
      ? `${markedCount} selected`
      : showPoints && count > 0
        ? `${count} points`
        : "Hover · drag";

  return (
    <div className="app">
      <main
        className={`stage${showPoints ? " is-armed" : ""}${dragging ? " is-dragging" : ""}${marquee ? " is-selecting" : ""}`}
        ref={stageRef}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          revealPoints(event.clientX - rect.left, event.clientY - rect.top);
        }}
        onPointerLeave={() => {
          if (gestureRef.current) return;
          if (window.matchMedia("(hover: hover)").matches) {
            setPointsOn(false);
            setHot(null);
          }
        }}
      >
        <div className="chip">{notice || chip}</div>
        <button
          type="button"
          className="fit"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setSize({ w, h });
            const panel = document.querySelector(".panel");
            const panelTop = panel?.getBoundingClientRect().top ?? h;
            const visibleH = w <= 800 && panel ? Math.max(120, panelTop - 12) : h;
            if (visibleH >= h - 8) {
              setView({ zoom: 1, panX: 0, panY: 0 });
              return;
            }
            const base = computeFit(w, h, boundsRef.current);
            const fitted = computeFit(w, visibleH, boundsRef.current);
            const zoom = base.scale > 0 ? fitted.scale / base.scale : 1;
            setView({ zoom, panX: 0, panY: visibleH / 2 - h / 2 });
          }}
        >
          Fit to screen
        </button>
        {error ? <p className="stage-message">{error}</p> : null}
        {!error && !fontsReady ? <p className="fallback-word">Anna He</p> : null}
        {!error && fontsReady && !trimmed ? <p className="stage-message">Type a word</p> : null}
        {!error && fontsReady && trimmed && outlines.length === 0 ? (
          <p className="stage-message">That text has no outlines.</p>
        ) : null}

        {showWord ? (
          <svg
            className="canvas"
            viewBox={`0 0 ${size.w} ${size.h}`}
            role="application"
            aria-label="Letter outlines. Hover to show vector points. Drag a box to select several, then drag them together."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {gridOn ? (
              <path d={gridPath(size.w, size.h, gridSize, view.zoom, view.panX, view.panY)} className="grid" />
            ) : null}
            <path d={path} className="glyphs" />
            <path ref={hitRef} d={path} className="glyph-hit" />
            <g className={`points${showPoints ? " is-on" : ""}`}>
              {curvePoints.map((anchor) => {
                const [x, y] = project(anchor.x, anchor.y, fit);
                const key = pointKey(anchor);
                const active = marked.has(key) || key === hotKey;
                return (
                  <circle
                    key={key}
                    cx={x}
                    cy={y}
                    r={active ? 5.4 : 4.15}
                    className={active ? "point is-hot" : "point"}
                  />
                );
              })}
            </g>
            {marquee ? (
              <rect
                className="marquee"
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
              />
            ) : null}
          </svg>
        ) : null}
      </main>

      {panelOpen ? (
        <aside className="panel">
          <header className="mast">
            <div>
              <h1>Text Outline</h1>
              <p>Hover to drag points.</p>
            </div>
            <div className="mast-actions">
              <button
                type="button"
                className="theme-toggle"
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                aria-pressed={dark}
                onClick={() => setDark((value) => !value)}
              >
                {dark ? <MoonIcon /> : <SunIcon />}
              </button>
              <button
                type="button"
                className="panel-toggle"
                aria-expanded={true}
                aria-label="Hide panel"
                onClick={() => setPanelOpen(false)}
              >
                <ChevronIcon down />
              </button>
            </div>
          </header>
          <div className="dial-slot">
            <DialRoot mode="inline" theme={dark ? "dark" : "light"} productionEnabled />
          </div>
        </aside>
      ) : (
        <button type="button" className="panel-show" aria-expanded={false} aria-label="Show panel" onClick={() => setPanelOpen(true)}>
          <ChevronIcon />
        </button>
      )}
    </div>
  );
}

function pointKeyOrEmpty(point: CurvePoint | null) {
  return point ? pointKey(point) : "";
}

function gridPath(width: number, height: number, gap: number, zoom: number, panX: number, panY: number) {
  const size = Math.max(4, gap * zoom);
  const originX = width / 2 + panX - Math.ceil((width / 2 + panX) / size) * size;
  const originY = height / 2 + panY - Math.ceil((height / 2 + panY) / size) * size;
  let d = "";
  for (let x = originX; x <= width + 0.5; x += size) d += `M${trim(x)} 0V${trim(height)}`;
  for (let y = originY; y <= height + 0.5; y += size) d += `M0 ${trim(y)}H${trim(width)}`;
  return d;
}

function trim(value: number) {
  return (Math.round(value * 100) / 100).toString();
}

function ChevronIcon({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chevron">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d={down ? "M6.5 9.5 12 14.5l5.5-5" : "M6.5 14.5 12 9.5l5.5 5"}
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path
        fill="currentColor"
        d="M11.1 2.2h1.8v2.3h-1.8zm0 17.3h1.8v2.3h-1.8zM2.2 11.1h2.3v1.8H2.2zm17.3 0h2.3v1.8h-2.3zM4.4 5.6l1.3-1.3 1.6 1.6-1.3 1.3zm12.3 12.3 1.3-1.3 1.6 1.6-1.3 1.3zM18.3 4.3l1.3 1.3-1.6 1.6-1.3-1.3zm-12.3 12.3 1.3 1.3-1.6 1.6-1.3-1.3z"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M14.2 2.6A8.2 8.2 0 1 0 21.4 14 6.4 6.4 0 0 1 14.2 2.6z" />
    </svg>
  );
}
