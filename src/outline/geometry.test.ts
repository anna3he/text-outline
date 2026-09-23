import assert from "node:assert/strict";
import {
  anchorsInRect,
  applyWarp,
  boundsOfContours,
  commandsToContours,
  contoursToOutline,
  moveAnchor,
  offsetAt,
  outlinePath,
  pointCount,
  refineOutline,
  upsertSample,
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

console.log("geometry ok");
