import test from "node:test";
import assert from "node:assert/strict";
import { accentVariables, lighten, luminance } from "../src/accentTheme.js";

const violet = { primary: "#8B5CF6", hover: "#A78BFA", dim: "#6D42D9", glow: "g", soft: "s", bg: "b", borderHover: "bh", borderActive: "ba" };
const gold = { primary: "#F59E0B", hover: "#FBBF24", dim: "#D97706", glow: "g", soft: "s", bg: "b", borderHover: "bh", borderActive: "ba" };
const ruby = { primary: "#EF4444", hover: "#F87171", dim: "#DC2626", glow: "g", soft: "s", bg: "b", borderHover: "bh", borderActive: "ba" };

test("o tema define o rgb do acento para uso em rgba()", () => {
  assert.equal(accentVariables(violet)["--accent-rgb"], "139, 92, 246");
  assert.equal(accentVariables(ruby)["--accent-rgb"], "239, 68, 68");
});

test("o logo segue as cores do tema", () => {
  const vars = accentVariables(ruby);
  assert.equal(vars["--logo-1b"], "#EF4444");
  assert.equal(vars["--logo-2a"], "#F87171");
  assert.equal(vars["--logo-2b"], "#DC2626");
  assert.notEqual(vars["--logo-1a"], accentVariables(violet)["--logo-1a"]);
});

test("texto sobre o acento fica legivel: escuro em cores claras, claro em cores escuras", () => {
  assert.equal(accentVariables(gold)["--on-accent"], "#0a0a0f");
  assert.equal(accentVariables(violet)["--on-accent"], "#ffffff");
  assert.equal(accentVariables(ruby)["--on-accent"], "#ffffff");
});

test("destaques que eram indigo fixo agora derivam do tema", () => {
  const cyanViolet = accentVariables(violet)["--cyan"];
  const cyanRuby = accentVariables(ruby)["--cyan"];
  assert.notEqual(cyanViolet, "#a5b4fc");
  assert.notEqual(cyanViolet, cyanRuby);
});

test("aceita hex curto e invalido sem quebrar", () => {
  const short = accentVariables({ ...violet, primary: "#f00", hover: "#f55", dim: "#a00" });
  assert.equal(short["--accent-rgb"], "255, 0, 0");
  const invalid = accentVariables({ ...violet, primary: "nao-e-cor", hover: "x", dim: "y" });
  assert.match(invalid["--accent-rgb"], /^\d+, \d+, \d+$/);
});

test("lighten e luminance se comportam", () => {
  assert.deepEqual(lighten([0, 0, 0], 1), [255, 255, 255]);
  assert.ok(luminance([255, 255, 255]) > 0.99);
  assert.ok(luminance([0, 0, 0]) < 0.001);
});
