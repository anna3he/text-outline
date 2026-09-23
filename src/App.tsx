import { useEffect, useRef, useState } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import type { Font } from "opentype.js";
import {
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
  type Sample,
} from "./outline/geometry";
import { loadTypeface, textToContours } from "./outline/text";

const DIAL = {
  text: { type: "text" as const, default: "Anna He", placeholder: "Type a word" },
  vectorPoints: [3, 1, 8, 1] as [number, number, number, number],
  darkMode: false,
  reset: { type: "action" as const, label: "Reset points" },
};

const TYPEFACE = "/fonts/Inter-Light.ttf";

export default function App() {
  const params = useDialKit("Type", DIAL, {
    onAction: (path) => {
      if (path === "reset") resetRef.current();
    },
  });

  const dark = params.darkMode;
  const density = Math.max(1, Math.round(params.vectorPoints));
  const text = params.text;

  const fontRef = useRef<Font | null>(null);
  const origRef = useRef<OrigContour[]>([]);
  const outlinesRef = useRef<Outline[]>([]);
  const samplesRef = useRef<Sample[]>([]);
  const boundsRef = useRef<Bounds | null>(null);
  const radiusRef = useRef(320);
  const textRef = useRef<string | null>(null);
  const densityRef = useRef(density);
  const fitRef = useRef<Fit>({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ contour: number; anchor: number; x: number; y: number } | null>(null);
  const resetRef = useRef<() => void>(() => {});

  const stageRef = useRef<HTMLElement>(null);
  const [fontReady, setFontReady] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);
  const [pointsOn, setPointsOn] = useState(false);
  const [hot, setHot] = useState<{ contour: number; anchor: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const bump = () => setTick((value) => value + 1);

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
    loadTypeface(TYPEFACE)
      .then((font) => {
        if (cancelled) return;
        fontRef.current = font;
        radiusRef.current = font.unitsPerEm * 0.16;
        setFontReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("The typeface didn’t load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const font = fontRef.current;
    if (!font) return;

    const previousText = textRef.current;
    const previousDensity = densityRef.current;
    const textChanged = previousText !== text;

    if (textChanged) {
      samplesRef.current = [];
      dragRef.current = null;
      setDragging(false);
      setHot(null);
      const contours = textToContours(font, text);
      origRef.current = contours;
      boundsRef.current = boundsOfContours(contours);
      outlinesRef.current = contoursToOutline(contours, density);
      textRef.current = text;
      densityRef.current = density;
      bump();
      return;
    }

    if (previousDensity !== density) {
      const from = previousDensity;
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
  }, [fontReady, text, density]);

  resetRef.current = () => {
    const font = fontRef.current;
    if (!font) return;
    samplesRef.current = [];
    dragRef.current = null;
    setDragging(false);
    setHot(null);
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
  const showWord = fontReady && !error && trimmed.length > 0 && outlines.length > 0 && size.w > 0;

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
    if (!hit) return;
    const [fx, fy] = unproject(point.x, point.y, fitRef.current);
    dragRef.current = { contour: hit.contour, anchor: hit.anchor, x: fx, y: fy };
    setHot(hit);
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!showWord) return;
    const point = localPoint(event);
    const drag = dragRef.current;
    if (!drag) {
      const hit = hitTest(point.x, point.y, outlinesRef.current, fitRef.current);
      setHot((current) => {
        if (current?.contour === hit?.contour && current?.anchor === hit?.anchor) return current;
        return hit;
      });
      return;
    }
    const [fx, fy] = unproject(point.x, point.y, fitRef.current);
    const dx = fx - drag.x;
    const dy = fy - drag.y;
    if (dx === 0 && dy === 0) return;
    drag.x = fx;
    drag.y = fy;
    const outline = outlinesRef.current[drag.contour];
    if (!outline) return;
    moveAnchor(outline, drag.anchor, dx, dy, samplesRef.current);
    bump();
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="app">
      <aside className="panel">
        <header className="mast">
          <h1>Outline</h1>
          <p>Hover the word, then drag a point.</p>
        </header>
        <div className="dial-slot">
          <DialRoot mode="inline" theme={dark ? "dark" : "light"} productionEnabled />
        </div>
      </aside>

      <main
        className={`stage${pointsOn ? " is-armed" : ""}${dragging ? " is-dragging" : ""}`}
        ref={stageRef}
        onPointerOver={() => {
          setPointsOn((on) => (on ? on : true));
        }}
        onPointerLeave={() => {
          if (dragRef.current) return;
          if (window.matchMedia("(hover: hover)").matches) {
            setPointsOn(false);
            setHot(null);
          }
        }}
      >
        <div className="chip">{pointsOn && count > 0 ? `${count} points` : "Hover · drag"}</div>

        {error ? <p className="stage-message">{error}</p> : null}
        {!error && !fontReady ? <p className="fallback-word">Anna He</p> : null}
        {!error && fontReady && !trimmed ? <p className="stage-message">Type a word</p> : null}
        {!error && fontReady && trimmed && outlines.length === 0 ? (
          <p className="stage-message">That text has no outlines.</p>
        ) : null}

        {showWord ? (
          <svg
            className="canvas"
            viewBox={`0 0 ${size.w} ${size.h}`}
            role="application"
            aria-label="Letter outlines. Hover to show vector points, then drag a point."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <path d={path} className="glyphs" />
            <g className={`points${pointsOn || dragging ? " is-on" : ""}`}>
              {outlines.map((outline, contour) =>
                outline.anchors.map((anchor, index) => {
                  const [x, y] = project(anchor.x, anchor.y, fit);
                  const active = hot?.contour === contour && hot.anchor === index;
                  return (
                    <circle
                      key={`${contour}-${index}-${anchor.bx.toFixed(1)}-${anchor.by.toFixed(1)}`}
                      cx={x}
                      cy={y}
                      r={active ? 5.4 : 4.15}
                      className={active ? "point is-hot" : "point"}
                    />
                  );
                }),
              )}
            </g>
          </svg>
        ) : null}
      </main>
    </div>
  );
}
