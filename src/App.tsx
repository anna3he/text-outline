import { useEffect, useRef, useState } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import type { Font } from "opentype.js";
import {
  anchorsInRect,
  applyWarp,
  boundsOfContours,
  computeFit,
  contoursToOutline,
  hitTest,
  moveAnchor,
  outlinePath,
  pointCount,
  project,
  refineOutline,
  samplesFrom,
  unproject,
  type Bounds,
  type Fit,
  type OrigContour,
  type Outline,
  type PointRef,
  type Sample,
} from "./outline/geometry";
import { loadTypeface, textToContours } from "./outline/text";

const DIAL = {
  text: { type: "text" as const, default: "Anna He", placeholder: "Type a word" },
  typeface: {
    type: "select" as const,
    options: [
      { value: "sans", label: "Sans · Inter" },
      { value: "serif", label: "Serif · LT Superior" },
    ],
    default: "sans",
  },
  vectorPoints: [3, 1, 8, 1] as [number, number, number, number],
  reset: { type: "action" as const, label: "Reset points" },
};

const FACES = {
  sans: "/fonts/Inter-SemiBold.ttf",
  serif: "/fonts/LTSuperiorSerif-Semibold.otf",
} as const;

type Face = keyof typeof FACES;

type Gesture =
  | { kind: "move"; points: PointRef[]; x: number; y: number }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number };

const pointKey = (point: PointRef) => `${point.contour}:${point.anchor}`;

export default function App() {
  const params = useDialKit("Type", DIAL, {
    onAction: (path) => {
      if (path === "reset") resetRef.current();
    },
  });

  const [dark, setDark] = useState(false);
  const density = Math.max(1, Math.round(params.vectorPoints));
  const text = params.text;
  const face: Face = params.typeface === "serif" ? "serif" : "sans";

  const fontsRef = useRef<Partial<Record<Face, Font>>>({});
  const origRef = useRef<OrigContour[]>([]);
  const outlinesRef = useRef<Outline[]>([]);
  const samplesRef = useRef<Sample[]>([]);
  const boundsRef = useRef<Bounds | null>(null);
  const radiusRef = useRef(320);
  const textRef = useRef<string | null>(null);
  const faceRef = useRef<Face | null>(null);
  const densityRef = useRef(density);
  const fitRef = useRef<Fit>({ scale: 1, tx: 0, ty: 0 });
  const gestureRef = useRef<Gesture | null>(null);
  const selectionRef = useRef<PointRef[]>([]);
  const resetRef = useRef<() => void>(() => {});

  const stageRef = useRef<HTMLElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);
  const [pointsOn, setPointsOn] = useState(false);
  const [hot, setHot] = useState<PointRef | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<PointRef[]>([]);
  const [marquee, setMarquee] = useState<Gesture & { kind: "marquee" } | null>(null);

  const bump = () => setTick((value) => value + 1);

  const replaceSelection = (points: PointRef[]) => {
    selectionRef.current = points;
    setSelection(points);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({ w: box.width, h: box.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
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
    const densityChanged = densityRef.current !== density;

    if (textChanged || faceChanged) {
      samplesRef.current = [];
      gestureRef.current = null;
      replaceSelection([]);
      setDragging(false);
      setHot(null);
      setMarquee(null);
      radiusRef.current = font.unitsPerEm * 0.16;
      const contours = textToContours(font, text);
      origRef.current = contours;
      boundsRef.current = boundsOfContours(contours);
      outlinesRef.current = contoursToOutline(contours, density);
      textRef.current = text;
      faceRef.current = face;
      densityRef.current = density;
      bump();
      return;
    }

    if (densityChanged) {
      gestureRef.current = null;
      replaceSelection([]);
      setMarquee(null);
      const from = densityRef.current;
      if (density > from && density % from === 0 && outlinesRef.current.length > 0) {
        outlinesRef.current = outlinesRef.current.map((outline) => refineOutline(outline, density / from));
        samplesRef.current = samplesFrom(outlinesRef.current);
      } else {
        outlinesRef.current = contoursToOutline(origRef.current, density).map((outline) =>
          applyWarp(outline, samplesRef.current, radiusRef.current),
        );
        samplesRef.current = samplesFrom(outlinesRef.current);
      }
      densityRef.current = density;
      bump();
    }
  }, [fontsReady, text, density, face]);

  resetRef.current = () => {
    const font = fontsRef.current[faceRef.current ?? "sans"];
    if (!font) return;
    samplesRef.current = [];
    gestureRef.current = null;
    replaceSelection([]);
    setDragging(false);
    setHot(null);
    setMarquee(null);
    outlinesRef.current = contoursToOutline(origRef.current, densityRef.current);
    bump();
  };

  const outlines = outlinesRef.current;
  void tick;
  const fit = computeFit(size.w, size.h, boundsRef.current);
  fitRef.current = fit;
  const path = outlinePath(outlines, fit);
  const count = pointCount(outlines);
  const trimmed = text.trim();
  const showWord = fontsReady && !error && trimmed.length > 0 && outlines.length > 0 && size.w > 0;
  const showPoints = pointsOn || dragging || selection.length > 0 || marquee !== null;

  const preview = marquee ? anchorsInRect(outlines, fit, marquee) : [];
  const marked = new Set((marquee ? preview : selection).map(pointKey));
  const hotKey = hot ? pointKey(hot) : "";

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
    const hit = hitTest(point.x, point.y, outlinesRef.current, fitRef.current);
    setPointsOn(true);
    if (hit) {
      const already = selectionRef.current.some(
        (item) => item.contour === hit.contour && item.anchor === hit.anchor,
      );
      const moving = already ? selectionRef.current : [hit];
      if (!already) replaceSelection(moving);
      const [fx, fy] = unproject(point.x, point.y, fitRef.current);
      gestureRef.current = { kind: "move", points: moving, x: fx, y: fy };
      setHot(hit);
      setDragging(true);
      setMarquee(null);
    } else {
      const next = { kind: "marquee" as const, x0: point.x, y0: point.y, x1: point.x, y1: point.y };
      gestureRef.current = next;
      setMarquee(next);
      setDragging(true);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!showWord) return;
    const point = localPoint(event);
    const gesture = gestureRef.current;
    if (!gesture) {
      const hit = hitTest(point.x, point.y, outlinesRef.current, fitRef.current);
      setHot((current) => {
        if (current?.contour === hit?.contour && current?.anchor === hit?.anchor) return current;
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
    const dx = fx - gesture.x;
    const dy = fy - gesture.y;
    if (dx === 0 && dy === 0) return;
    gesture.x = fx;
    gesture.y = fy;
    for (const item of gesture.points) {
      const outline = outlinesRef.current[item.contour];
      if (!outline) continue;
      moveAnchor(outline, item.anchor, dx, dy, samplesRef.current);
    }
    bump();
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setDragging(false);
    if (gesture?.kind === "marquee") {
      const span = Math.hypot(gesture.x1 - gesture.x0, gesture.y1 - gesture.y0);
      replaceSelection(span < 4 ? [] : anchorsInRect(outlinesRef.current, fitRef.current, gesture));
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
        onPointerOver={() => {
          setPointsOn((on) => (on ? on : true));
        }}
        onPointerLeave={() => {
          if (gestureRef.current) return;
          if (window.matchMedia("(hover: hover)").matches) {
            setPointsOn(false);
            setHot(null);
          }
        }}
      >
        <div className="chip">{chip}</div>

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
            <path d={path} className="glyphs" />
            <g className={`points${showPoints ? " is-on" : ""}`}>
              {outlines.map((outline, contour) =>
                outline.anchors.map((anchor, index) => {
                  const [x, y] = project(anchor.x, anchor.y, fit);
                  const key = `${contour}:${index}`;
                  const active = marked.has(key) || key === hotKey;
                  return (
                    <circle
                      key={`${key}-${anchor.bx.toFixed(1)}-${anchor.by.toFixed(1)}`}
                      cx={x}
                      cy={y}
                      r={active ? 5.4 : 4.15}
                      className={active ? "point is-hot" : "point"}
                    />
                  );
                }),
              )}
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

      <aside className="panel">
        <header className="mast">
          <div>
            <h1>Text Outline</h1>
            <p>Hover for points. Drag a box to move several.</p>
          </div>
          <button
            type="button"
            className="theme-toggle"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={dark}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <MoonIcon /> : <SunIcon />}
          </button>
        </header>
        <div className="dial-slot">
          <DialRoot mode="inline" theme={dark ? "dark" : "light"} productionEnabled />
        </div>
      </aside>
    </div>
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
