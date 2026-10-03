const test = require("node:test");
const assert = require("node:assert/strict");
const { backendFailure, waitUntilReady } = require("../electron/backend-status.cjs");

test("missing executable is a repairable failure, not an endless wait", () => {
  const failure = backendFailure({ code: "ENOENT", message: "missing" }, "backend.exe");
  assert.equal(failure.phase, "error");
  assert.equal(failure.repairRequired, true);
  assert.match(failure.detail, /backend.exe/);
});
test("permission failures do not assume antivirus involvement", () => {
  const failure = backendFailure({ code: "EACCES" });
  assert.equal(failure.repairRequired, false);
  assert.match(failure.message, /Windows/);
});
test("readiness can recover after initialization", async () => {
  let attempts = 0;
  assert.equal(await waitUntilReady(async () => ++attempts === 3, { sleep: async () => {} }), true);
  assert.equal(attempts, 3);
});
test("terminal spawn errors interrupt the health wait", async () => {
  let failed = false;
  let attempts = 0;
  const ready = await waitUntilReady(async () => { attempts++; failed = true; return false; }, { cancelled: () => failed });
  assert.equal(ready, false);
  assert.equal(attempts, 1);
});
test("timeout does not report readiness", async () => {
  assert.equal(await waitUntilReady(async () => false, { timeoutMs: 1, sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)) }), false);
});
