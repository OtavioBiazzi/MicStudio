const fs = require("node:fs/promises");
const path = require("node:path");

const INTRO_URL = "https://www.youtube.com/watch?v=YIkJsHZbfis";

function createSessionGate() {
  let claimed = false;
  return () => {
    if (claimed) return false;
    claimed = true;
    return true;
  };
}

function createIntroOpener(markerPath, openExternal) {
  let pending;
  return () => {
    if (pending) return pending;
    pending = (async () => {
      try {
        await fs.access(markerPath);
        return false;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await fs.mkdir(path.dirname(markerPath), { recursive: true });
      // Reserve the one-time action before opening the browser, including upgrades.
      await fs.writeFile(markerPath, JSON.stringify({ introVideo: 1 }), { flag: "wx" });
      try {
        await openExternal(INTRO_URL);
      } catch (error) {
        await fs.unlink(markerPath).catch(() => {});
        throw error;
      }
      return true;
    })();
    return pending;
  };
}

module.exports = { INTRO_URL, createIntroOpener, createSessionGate };
