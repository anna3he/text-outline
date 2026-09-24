import assert from "node:assert/strict";
import {
  anchorsInRect,
  applyWarp,
  boundsOfContours,
  commandsToContours,
  computeFit,
  contoursToOutline,
  curvesInRect,
  hitCurve,
  moveAnchor,
  offsetAt,
  composeView,
  IDENTITY_VIEW,
  outlinePath,
  pinCurvePoints,
  pointCount,
  pointsAlong,
  refineOutline,
  snapBoxToGrid,
  svgDocument,
  upsertSample,
  zoomView,
  type Sample,
} from "./geometry.ts";

const square = commandsToContours([
  { type: "M", x: 0, y: 0 },
  { type: "L", x: 100, y: 0 },
  { type: "L", x: 100, y: 40 },
  { type: "L", x: 0, y: 40 },
  { type: "Z" },
]);

assert.equal(square.length, 1);
assert.equal(square[0].segs.length, 4);

const coarse = contoursToOutline(square, 1);
assert.equal(coarse[0].anchors.length, 4);
assert.equal(coarse[0].segs.length, 4);

const fine = contoursToOutline(square, 4);
assert.equal(fine[0].anchors.length, 16);
assert.equal(pointCount(fine), 16);

const refined = refineOutline(coarse[0], 2);
assert.equal(refined.anchors.length, 8);
assert.equal(refined.segs.length, 8);

const samples: Sample[] = [];
moveAnchor(coarse[0], 1, 0, -20, samples);
assert.equal(coarse[0].anchors[1].y, -20);
assert.ok(samples.length >= 1);

const rebuilt = applyWarp(contoursToOutline(square, 1)[0], samples, 30);
const moved = rebuilt.anchors.find((anchor) => Math.abs(anchor.bx - 100) < 0.01 && Math.abs(anchor.by) < 0.01);
assert.ok(moved);
assert.ok(Math.abs(moved.y - -20) < 0.01);

const far = offsetAt(0, 40, samples, 30);
assert.equal(far.dx, 0);
assert.equal(far.dy, 0);

upsertSample(samples, 100, 0, 5, 0);
const again = samples.find((sample) => sample.x === 100 && sample.y === 0);
assert.ok(again);
assert.equal(again.dx, 5);

const hole = commandsToContours([
  { type: "M", x: 0, y: 0 },
  { type: "C", x1: 10, y1: 0, x2: 20, y2: 10, x: 20, y: 20 },
  { type: "Q", x1: 20, y1: 30, x: 0, y: 20 },
  { type: "Z" },
  { type: "M", x: 4, y: 8 },
  { type: "L", x: 8, y: 8 },
  { type: "L", x: 6, y: 14 },
  { type: "Z" },
]);
assert.equal(hole.length, 2);

const bounds = boundsOfContours(square);
assert.deepEqual(bounds, { minX: 0, minY: 0, maxX: 100, maxY: 40 });

const path = outlinePath(coarse, { scale: 1, tx: 0, ty: 0 });
assert.match(path, /^M/);
assert.match(path, /Z$/);

const fresh = contoursToOutline(square, 1);
const inside = anchorsInRect(fresh, { scale: 1, tx: 0, ty: 0 }, { x0: 90, y0: -10, x1: 110, y1: 10 });
assert.equal(inside.length, 1);
assert.equal(inside[0].anchor, 1);

const master = contoursToOutline(square, 1);
const before = outlinePath(master, { scale: 1, tx: 0, ty: 0 });
const sparse = pointsAlong(master, 1);
const full = pointsAlong(master, 8);
const dense = pointsAlong(master, 15);
const midstep = pointsAlong(master, 9);
assert.equal(full.length, 4);
assert.equal(sparse.length, 1);
assert.equal(dense.length, 32);
assert.equal(midstep.length, 8);
assert.ok(midstep.some((point) => Math.abs(point.x - 50) < 0.05 && Math.abs(point.y) < 0.05 && Math.abs(point.t - 0.5) < 0.001));
assert.ok(sparse.length < full.length);
assert.ok(full.length < dense.length);
assert.equal(outlinePath(master, { scale: 1, tx: 0, ty: 0 }), before);
assert.equal(sparse[0]?.t, 0);

const hit = hitCurve(0, 0, full, { scale: 1, tx: 0, ty: 0 }, 8);
assert.equal(hit?.t, 0);
assert.equal(hit?.seg, 0);

const boxed = curvesInRect(full, { scale: 1, tx: 0, ty: 0 }, { x0: 90, y0: -10, x1: 110, y1: 10 });
assert.equal(boxed.length, 1);

const editable = contoursToOutline(square, 1);
const pinned = pinCurvePoints(editable, [
  { contour: 0, seg: 0, t: 0.25, x: 25, y: 0 },
  { contour: 0, seg: 0, t: 0.75, x: 75, y: 0 },
]);
assert.equal(pinned.length, 2);
assert.equal(editable[0].anchors.length, 6);
assert.ok(editable[0].anchors.some((anchor) => Math.abs(anchor.x - 25) < 0.05 && Math.abs(anchor.y) < 0.05));
assert.ok(editable[0].anchors.some((anchor) => Math.abs(anchor.x - 75) < 0.05 && Math.abs(anchor.y) < 0.05));
assert.equal(outlinePath(contoursToOutline(square, 1), { scale: 1, tx: 0, ty: 0 }), before);

const svg = svgDocument(contoursToOutline(square, 1), "#c9c9c5");
assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
assert.match(svg, /<path d="M/);

const centered = computeFit(1440, 900, { minX: 0, minY: -100, maxX: 200, maxY: 0 });
assert.ok(Math.abs(100 * centered.scale + centered.tx - 720) < 0.01);
assert.ok(Math.abs(-50 * centered.scale + centered.ty - 450) < 0.01);

const baseFit = { scale: 2, tx: 10, ty: 20 };
assert.deepEqual(composeView(baseFit, IDENTITY_VIEW, 400, 200), baseFit);
const zoomed = zoomView(IDENTITY_VIEW, baseFit, 400, 200, 80, 40, 2);
const zoomedFit = composeView(baseFit, zoomed, 400, 200);
const [fx, fy] = [(80 - baseFit.tx) / baseFit.scale, (40 - baseFit.ty) / baseFit.scale];
assert.ok(Math.abs(fx * zoomedFit.scale + zoomedFit.tx - 80) < 0.01);
assert.ok(Math.abs(fy * zoomedFit.scale + zoomedFit.ty - 40) < 0.01);

const pointSnap = snapBoxToGrid({ minX: 733, minY: 468, maxX: 733, maxY: 468 }, 1440, 900, 40, 1, 0, 0);
assert.equal(pointSnap.x, 720 - 733);
assert.equal(pointSnap.y, 450 - 468);
const edgeSnap = snapBoxToGrid({ minX: 700, minY: 420, maxX: 760, maxY: 450 }, 1440, 900, 40, 1, 0, 0);
assert.equal(edgeSnap.x, 0);
assert.equal(edgeSnap.y, 0);

console.log("geometry ok");
