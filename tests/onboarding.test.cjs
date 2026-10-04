const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { INTRO_URL, createIntroOpener, createSessionGate } = require("../electron/onboarding.cjs");

test("update checks are claimed once per app process, not per renderer", () => {
  const claim = createSessionGate();
  assert.equal(claim(), true);
  assert.equal(claim(), false);
  assert.equal(claim(), false);
  assert.equal(createSessionGate()(), true);
});

test("video opens once per version, including upgrades and concurrent renderer loads", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mic-intro-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const opened = [];
  const open = async (url) => opened.push(url);
  const marker = path.join(root, "intro-video-1.4.3.json");
  const first = createIntroOpener(marker, open);
  await Promise.all([first(), first()]);
  assert.deepEqual(opened, [INTRO_URL]);
  assert.equal(await createIntroOpener(marker, open)(), false);
  await createIntroOpener(path.join(root, "intro-video-1.4.4.json"), open)();
  assert.deepEqual(opened, [INTRO_URL, INTRO_URL]);
});

test("browser failure can retry next launch without claiming a completed video", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mic-intro-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const marker = path.join(root, "intro-video-1.4.3.json");
  await assert.rejects(createIntroOpener(marker, async () => { throw Error("browser unavailable"); })());
  assert.equal(await createIntroOpener(marker, async () => {})(), true);
});
