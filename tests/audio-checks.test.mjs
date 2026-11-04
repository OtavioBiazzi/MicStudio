import test from "node:test";
import assert from "node:assert/strict";
import { runAudioChecks, summarizeChecks } from "../src/audioChecks.js";

const base = () => ({
  running: true,
  monitorOnly: false,
  virtualCableDetected: true,
  selected: { input: 1, output: 2, monitor: 3 },
  devices: { inputs: [{ index: 1 }], outputs: [{ index: 2 }, { index: 3 }] },
  controls: { masterMute: false, monitor: true, monitorVolume: 1 }
});
const ids = (s) => runAudioChecks(s).filter((c) => c.level !== "ok").map((c) => c.id);

test("tudo certo nao tem problemas", () => {
  assert.equal(summarizeChecks(runAudioChecks(base())).ok, true);
});
test("microfone sumiu vira erro com acao de procurar", () => {
  const s = base(); s.devices.inputs = [];
  const mic = runAudioChecks(s).find((c) => c.id === "mic");
  assert.equal(mic.level, "error");
  assert.equal(mic.fix, "refresh");
});
test("sem cabo virtual", () => {
  const s = base(); s.virtualCableDetected = false;
  assert.deepEqual(ids(s), ["cable"]);
});
test("voz desligada, mudo e retorno zerado", () => {
  const s = base(); s.running = false; s.controls.masterMute = true; s.controls.monitorVolume = 0;
  assert.deepEqual(ids(s), ["voice", "mute", "monitor-volume"]);
});
test("voz que caiu mostra o motivo", () => {
  const s = base(); s.running = false; s.voiceProblem = "sem microfone";
  const v = runAudioChecks(s).find((c) => c.id === "voice");
  assert.equal(v.level, "error");
  assert.match(v.detail, /sem microfone/);
});
