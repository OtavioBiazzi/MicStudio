import { test } from "node:test";
import assert from "node:assert/strict";
import { placeContextMenu } from "../src/menuPosition.js";
import { runtimeRefreshDelay } from "../src/runtimePolicy.js";

test("menus clamp measured dimensions at the bottom and right edges", () => {
  assert.deepEqual(placeContextMenu({ x: 1090, y: 750 }, { width: 280, height: 520 }, { width: 1100, height: 760 }), { x: 812, y: 232 });
  assert.deepEqual(placeContextMenu({ x: 10, y: 20 }, { width: 180, height: 100 }, { width: 1100, height: 760 }), { x: 10, y: 20 });
});

test("oversized menus stay inside small viewports with scrollable constrained size", () => {
  assert.deepEqual(placeContextMenu({ x: 390, y: 230 }, { width: 600, height: 700 }, { width: 390, height: 240 }), { x: 8, y: 8 });
});

test("startup stays responsive; hidden and unfocused runtime polling is reduced", () => {
  assert.equal(runtimeRefreshDelay({ ready: false, hidden: true, focused: false }), 1200);
  assert.equal(runtimeRefreshDelay({ ready: true, hidden: false, focused: true }), 1200);
  assert.equal(runtimeRefreshDelay({ ready: true, hidden: false, focused: false }), 10000);
  assert.equal(runtimeRefreshDelay({ ready: true, hidden: true, focused: true }), 10000);
});
