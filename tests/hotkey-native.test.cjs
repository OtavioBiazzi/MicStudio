const test = require("node:test");
const assert = require("node:assert/strict");
const { isNativeAction, runHotkeyNatively } = require("../electron/hotkey-native.cjs");

function fakeBackend(runtime) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, json: async () => runtime };
  };
  return { calls, fetchImpl };
}

const api = "http://x";

test("so atalhos simples rodam sem a interface", () => {
  assert.equal(isNativeAction("mute_mic"), true);
  assert.equal(isNativeAction("toggle_voicechanger"), true);
  assert.equal(isNativeAction("record_pc"), false);
  assert.equal(isNativeAction("toggle_bypass"), false);
});

test("acao que precisa da interface devolve null e nao chama o backend", async () => {
  const { calls, fetchImpl } = fakeBackend({});
  assert.equal(await runHotkeyNatively("record_pc", { api, fetchImpl }), null);
  assert.equal(calls.length, 0);
});

test("mutar liga o mudo quando esta desligado", async () => {
  const { calls, fetchImpl } = fakeBackend({ controls: { masterMute: false } });
  const text = await runHotkeyNatively("mute_mic", { api, fetchImpl });
  assert.equal(text, "Microfone mutado");
  assert.deepEqual(calls[1].body, { controls: { masterMute: true } });
});

test("mutar tira o mudo quando esta ligado", async () => {
  const { calls, fetchImpl } = fakeBackend({ controls: { masterMute: true } });
  assert.equal(await runHotkeyNatively("mute_mic", { api, fetchImpl }), "Microfone desmutado");
  assert.deepEqual(calls[1].body, { controls: { masterMute: false } });
});

test("voice changer liga quando esta desligado", async () => {
  const { calls, fetchImpl } = fakeBackend({ running: false, monitorOnly: false, virtualMode: false, controls: {} });
  assert.equal(await runHotkeyNatively("toggle_voicechanger", { api, fetchImpl }), "Voice changer ativado");
  assert.equal(calls[1].url, "http://x/api/virtual/start");
});

test("voice changer desliga quando esta ligado", async () => {
  const { calls, fetchImpl } = fakeBackend({ running: true, monitorOnly: false, virtualMode: true, controls: {} });
  assert.equal(await runHotkeyNatively("toggle_voicechanger", { api, fetchImpl }), "Voice changer desativado");
  assert.equal(calls[1].url, "http://x/api/stop");
});

test("monitorOnly nao conta como voz ligada", async () => {
  const { calls, fetchImpl } = fakeBackend({ running: true, monitorOnly: true, virtualMode: false, controls: {} });
  await runHotkeyNatively("toggle_voicechanger", { api, fetchImpl });
  assert.equal(calls[1].url, "http://x/api/virtual/start");
});

test("falha do backend vira erro", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(() => runHotkeyNatively("mute_mic", { api, fetchImpl }));
});
