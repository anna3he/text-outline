export type Vec = { x: number; y: number };

export type OrigSeg = { c1: Vec; c2: Vec; p1: Vec };

export type OrigContour = { p0: Vec; segs: OrigSeg[] };

export type Anchor = { x: number; y: number; bx: number; by: number };

export type Seg = {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  b1x: number;
  b1y: number;
  b2x: number;
  b2y: number;
};

export type Outline = { anchors: Anchor[]; segs: Seg[] };

export type Sample = { x: number; y: number; dx: number; dy: number };

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type Fit = { scale: number; tx: number; ty: number };

type Cubic = { p0: Vec; c1: Vec; c2: Vec; p1: Vec };

const EPS = 0.49;

export function commandsToContours(
  commands: Array<
    | { type: "M"; x: number; y: number }
    | { type: "L"; x: number; y: number }
    | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "Q"; x1: number; y1: number; x: number; y: number }
    | { type: "Z" }
  >,
): OrigContour[] {
  const contours: OrigContour[] = [];
  let current: { start: Vec; cursor: Vec; segs: OrigSeg[] } | null = null;

  const flush = () => {
    if (!current) return;
    const contour = current;
    current = null;
    if (contour.segs.length === 0) return;
    const end = contour.segs[contour.segs.length - 1].p1;
    if (dist2(end, contour.start) > 0.25) {
      contour.segs.push(lineToCubic(end, contour.start));
    } else {
      contour.segs[contour.segs.length - 1].p1 = { ...contour.start };
    }
    contours.push({ p0: contour.start, segs: contour.segs });
  };

  for (const cmd of commands) {
    if (cmd.type === "M") {
      flush();
      const p = { x: cmd.x, y: cmd.y };
      current = { start: p, cursor: p, segs: [] };
      continue;
    }
    if (!current) continue;
    if (cmd.type === "Z") {
      flush();
      continue;
    }
    if (cmd.type === "L") {
      const p1 = { x: cmd.x, y: cmd.y };
      if (dist2(current.cursor, p1) > 0.01) current.segs.push(lineToCubic(current.cursor, p1));
      current.cursor = p1;
      continue;
    }
    if (cmd.type === "C") {
      const c1 = { x: cmd.x1, y: cmd.y1 };
      const c2 = { x: cmd.x2, y: cmd.y2 };
      const p1 = { x: cmd.x, y: cmd.y };
      if (dist2(current.cursor, p1) > 0.01 || dist2(current.cursor, c1) > 0.01) {
        current.segs.push({ c1, c2, p1 });
      }
      current.cursor = p1;
      continue;
    }
    const q = { x: cmd.x1, y: cmd.y1 };
    const p1 = { x: cmd.x, y: cmd.y };
    if (dist2(current.cursor, p1) > 0.01 || dist2(current.cursor, q) > 0.01) {
      current.segs.push(quadToCubic(current.cursor, q, p1));
    }
    current.cursor = p1;
  }
  flush();
  return contours;
}

export function contoursToOutline(contours: OrigContour[], density: number): Outline[] {
  const n = Math.max(1, Math.round(density));
  return contours.map((contour) => buildOutline(contour, n)).filter((outline) => outline.anchors.length >= 3);
}

export function refineOutline(outline: Outline, factor: number): Outline {
  const k = Math.max(1, Math.round(factor));
  if (k === 1) return cloneOutline(outline);
  const count = outline.anchors.length;
  const anchors: Anchor[] = [{ ...outline.anchors[0] }];
  const segs: Seg[] = [];

  for (let i = 0; i < count; i++) {
    const a0 = outline.anchors[i];
    const a1 = outline.anchors[(i + 1) % count];
    const seg = outline.segs[i];
    const live = subdivideCubic(
      {
        p0: { x: a0.x, y: a0.y },
        c1: { x: seg.c1x, y: seg.c1y },
        c2: { x: seg.c2x, y: seg.c2y },
        p1: { x: a1.x, y: a1.y },
      },
      k,
    );
    const base = subdivideCubic(
      {
        p0: { x: a0.bx, y: a0.by },
        c1: { x: seg.b1x, y: seg.b1y },
        c2: { x: seg.b2x, y: seg.b2y },
        p1: { x: a1.bx, y: a1.by },
      },
      k,
    );
    for (let j = 0; j < k; j++) {
      segs.push(segFromCubics(live[j], base[j]));
      const isClose = i === count - 1 && j === k - 1;
      if (!isClose) {
        anchors.push({
          x: live[j].p1.x,
          y: live[j].p1.y,
          bx: base[j].p1.x,
          by: base[j].p1.y,
        });
      }
    }
  }

  return { anchors, segs };
}

export function moveAnchor(outline: Outline, index: number, dx: number, dy: number, samples: Sample[]) {
  const count = outline.anchors.length;
  if (count < 2 || index < 0 || index >= count) return;
  const anchor = outline.anchors[index];
  anchor.x += dx;
  anchor.y += dy;
  upsertSample(samples, anchor.bx, anchor.by, dx, dy);

  const prev = (index - 1 + count) % count;
  const outgoing = outline.segs[index];
  const incoming = outline.segs[prev];
  if (outgoing) {
    outgoing.c1x += dx;
    outgoing.c1y += dy;
    upsertSample(samples, outgoing.b1x, outgoing.b1y, dx, dy);
  }
  if (incoming) {
    incoming.c2x += dx;
    incoming.c2y += dy;
    upsertSample(samples, incoming.b2x, incoming.b2y, dx, dy);
  }
}

export function applyWarp(outline: Outline, samples: Sample[], radius: number): Outline {
  if (samples.length === 0 || radius <= 0) return outline;
  for (const anchor of outline.anchors) {
    const offset = offsetAt(anchor.bx, anchor.by, samples, radius);
    anchor.x = anchor.bx + offset.dx;
    anchor.y = anchor.by + offset.dy;
  }
  for (const seg of outline.segs) {
    const o1 = offsetAt(seg.b1x, seg.b1y, samples, radius);
    const o2 = offsetAt(seg.b2x, seg.b2y, samples, radius);
    seg.c1x = seg.b1x + o1.dx;
    seg.c1y = seg.b1y + o1.dy;
    seg.c2x = seg.b2x + o2.dx;
    seg.c2y = seg.b2y + o2.dy;
  }
  return outline;
}

export function samplesFrom(outlines: Outline[]): Sample[] {
  const samples: Sample[] = [];
  for (const outline of outlines) {
    for (const anchor of outline.anchors) {
      pushOffset(samples, anchor.bx, anchor.by, anchor.x - anchor.bx, anchor.y - anchor.by);
    }
    for (const seg of outline.segs) {
      pushOffset(samples, seg.b1x, seg.b1y, seg.c1x - seg.b1x, seg.c1y - seg.b1y);
      pushOffset(samples, seg.b2x, seg.b2y, seg.c2x - seg.b2x, seg.c2y - seg.b2y);
    }
  }
  return samples;
}

export function boundsOfContours(contours: OrigContour[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const contour of contours) {
    add(contour.p0.x, contour.p0.y);
    for (const seg of contour.segs) {
      add(seg.c1.x, seg.c1.y);
      add(seg.c2.x, seg.c2.y);
      add(seg.p1.x, seg.p1.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function computeFit(width: number, height: number, bounds: Bounds | null): Fit {
  if (!bounds || width < 20 || height < 20) return { scale: 1, tx: 0, ty: 0 };
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const margin = Math.min(width, height) * 0.1 + 36;
  const scale = Math.min((width - margin * 2) / bw, (height - margin * 2) / bh);
  return {
    scale,
    tx: (width - bw * scale) / 2 - bounds.minX * scale,
    ty: (height - bh * scale) / 2 - bounds.minY * scale,
  };
}

export function outlinePath(outlines: Outline[], fit: Fit): string {
  let d = "";
  for (const outline of outlines) {
    if (outline.anchors.length < 3 || outline.segs.length !== outline.anchors.length) continue;
    const start = project(outline.anchors[0].x, outline.anchors[0].y, fit);
    d += `M${num(start[0])} ${num(start[1])}`;
    for (let i = 0; i < outline.segs.length; i++) {
      const seg = outline.segs[i];
      const end = outline.anchors[(i + 1) % outline.anchors.length];
      const c1 = project(seg.c1x, seg.c1y, fit);
      const c2 = project(seg.c2x, seg.c2y, fit);
      const p = project(end.x, end.y, fit);
      d += `C${num(c1[0])} ${num(c1[1])} ${num(c2[0])} ${num(c2[1])} ${num(p[0])} ${num(p[1])}`;
    }
    d += "Z";
  }
  return d;
}

export function project(x: number, y: number, fit: Fit): [number, number] {
  return [x * fit.scale + fit.tx, y * fit.scale + fit.ty];
}

export function unproject(x: number, y: number, fit: Fit): [number, number] {
  return [(x - fit.tx) / fit.scale, (y - fit.ty) / fit.scale];
}

export function hitTest(
  x: number,
  y: number,
  outlines: Outline[],
  fit: Fit,
  radius = 16,
): { contour: number; anchor: number } | null {
  const limit = radius * radius;
  let best = limit;
  let hit: { contour: number; anchor: number } | null = null;
  outlines.forEach((outline, contour) => {
    outline.anchors.forEach((anchor, index) => {
      const [px, py] = project(anchor.x, anchor.y, fit);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d <= best) {
        best = d;
        hit = { contour, anchor: index };
      }
    });
  });
  return hit;
}

export function pointCount(outlines: Outline[]): number {
  return outlines.reduce((sum, outline) => sum + outline.anchors.length, 0);
}

function buildOutline(contour: OrigContour, density: number): Outline {
  const anchors: Anchor[] = [anchorAt(contour.p0)];
  const segs: Seg[] = [];
  let p0 = contour.p0;
  for (let s = 0; s < contour.segs.length; s++) {
    const seg = contour.segs[s];
    const parts = subdivideCubic({ p0, c1: seg.c1, c2: seg.c2, p1: seg.p1 }, density);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      segs.push(segFromCubics(part, part));
      const closes = s === contour.segs.length - 1 && i === parts.length - 1;
      if (!closes) anchors.push(anchorAt(part.p1));
    }
    p0 = seg.p1;
  }
  return { anchors, segs };
}

function anchorAt(p: Vec): Anchor {
  return { x: p.x, y: p.y, bx: p.x, by: p.y };
}

function segFromCubics(live: Cubic, base: Cubic): Seg {
  return {
    c1x: live.c1.x,
    c1y: live.c1.y,
    c2x: live.c2.x,
    c2y: live.c2.y,
    b1x: base.c1.x,
    b1y: base.c1.y,
    b2x: base.c2.x,
    b2y: base.c2.y,
  };
}

function subdivideCubic(cubic: Cubic, density: number): Cubic[] {
  const n = Math.max(1, Math.round(density));
  if (n === 1) return [cubic];
  const parts: Cubic[] = [];
  let rest = cubic;
  for (let i = 0; i < n - 1; i++) {
    const [left, right] = splitCubic(rest, 1 / (n - i));
    parts.push(left);
    rest = right;
  }
  parts.push(rest);
  return parts;
}

function splitCubic(cubic: Cubic, t: number): [Cubic, Cubic] {
  const p01 = lerp(cubic.p0, cubic.c1, t);
  const p12 = lerp(cubic.c1, cubic.c2, t);
  const p23 = lerp(cubic.c2, cubic.p1, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const p0123 = lerp(p012, p123, t);
  return [
    { p0: cubic.p0, c1: p01, c2: p012, p1: p0123 },
    { p0: p0123, c1: p123, c2: p23, p1: cubic.p1 },
  ];
}

function lineToCubic(p0: Vec, p1: Vec): OrigSeg {
  return {
    c1: { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 },
    c2: { x: p0.x + (2 * (p1.x - p0.x)) / 3, y: p0.y + (2 * (p1.y - p0.y)) / 3 },
    p1: { ...p1 },
  };
}

function quadToCubic(p0: Vec, control: Vec, p1: Vec): OrigSeg {
  return {
    c1: { x: p0.x + (2 / 3) * (control.x - p0.x), y: p0.y + (2 / 3) * (control.y - p0.y) },
    c2: { x: p1.x + (2 / 3) * (control.x - p1.x), y: p1.y + (2 / 3) * (control.y - p1.y) },
    p1: { ...p1 },
  };
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function dist2(a: Vec, b: Vec): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function cloneOutline(outline: Outline): Outline {
  return {
    anchors: outline.anchors.map((anchor) => ({ ...anchor })),
    segs: outline.segs.map((seg) => ({ ...seg })),
  };
}

export function upsertSample(samples: Sample[], x: number, y: number, dx: number, dy: number) {
  for (const sample of samples) {
    if ((sample.x - x) ** 2 + (sample.y - y) ** 2 <= EPS) {
      sample.dx += dx;
      sample.dy += dy;
      return;
    }
  }
  samples.push({ x, y, dx, dy });
}

function pushOffset(samples: Sample[], x: number, y: number, dx: number, dy: number) {
  if (dx * dx + dy * dy < 0.04) return;
  for (const sample of samples) {
    if ((sample.x - x) ** 2 + (sample.y - y) ** 2 <= EPS) {
      sample.dx = dx;
      sample.dy = dy;
      return;
    }
  }
  samples.push({ x, y, dx, dy });
}

export function offsetAt(x: number, y: number, samples: Sample[], radius: number): { dx: number; dy: number } {
  let nearest: Sample | null = null;
  let nearestD = Infinity;
  let wsum = 0;
  let dx = 0;
  let dy = 0;
  const r2 = radius * radius;
  for (const sample of samples) {
    const d2 = (x - sample.x) ** 2 + (y - sample.y) ** 2;
    if (d2 < nearestD) {
      nearestD = d2;
      nearest = sample;
    }
    if (d2 <= EPS || d2 >= r2) continue;
    const t = 1 - Math.sqrt(d2) / radius;
    const w = t * t * (3 - 2 * t);
    wsum += w;
    dx += w * sample.dx;
    dy += w * sample.dy;
  }
  if (nearest && nearestD <= EPS) return { dx: nearest.dx, dy: nearest.dy };
  if (wsum === 0) return { dx: 0, dy: 0 };
  return { dx: dx / wsum, dy: dy / wsum };
}

function num(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}
