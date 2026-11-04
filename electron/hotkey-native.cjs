// Atalhos globais que funcionam sem a interface aberta (janela liberada na bandeja).
// Cada funcao fala direto com o backend de audio e devolve o texto do aviso, ou null se a acao precisa da interface.

const NATIVE_ACTIONS = new Set(["mute_mic", "toggle_soundboard", "toggle_voicechanger"]);

function isNativeAction(action) {
  return NATIVE_ACTIONS.has(action);
}

async function runHotkeyNatively(action, { api, fetchImpl = fetch }) {
  if (!isNativeAction(action)) return null;

  const getRuntime = async () => {
    const response = await fetchImpl(`${api}/api/runtime`);
    if (!response.ok) throw new Error(`runtime ${response.status}`);
    return response.json();
  };
  const post = async (path, body = {}) => {
    const response = await fetchImpl(`${api}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`${path} ${response.status}`);
  };

  const runtime = await getRuntime();
  const controls = runtime.controls || {};

  if (action === "mute_mic") {
    const muted = !controls.masterMute;
    await post("/api/controls", { controls: { masterMute: muted } });
    return muted ? "Microfone mutado" : "Microfone desmutado";
  }
  if (action === "toggle_soundboard") {
    const enabled = !controls.soundboardMonitor;
    await post("/api/controls", { controls: { soundboardMonitor: enabled } });
    return enabled ? "Som do soundboard ativado" : "Som do soundboard mutado";
  }
  const active = (runtime.running && !runtime.monitorOnly) || runtime.virtualMode;
  await post(active ? "/api/stop" : "/api/virtual/start");
  return active ? "Voice changer desativado" : "Voice changer ativado";
}

// O Windows repete o evento do atalho enquanto a tecla esta segurada. Sem isto, segurar "mutar" alternava o
// microfone dezenas de vezes por segundo. A mesma acao so vale de novo depois de uma pausa curta.
function createRepeatGuard(windowMs = 450, now = () => Date.now()) {
  const last = new Map();
  return function allow(action) {
    const t = now();
    const previous = last.get(action);
    last.set(action, t);
    // Enquanto a tecla segura gera repeticoes, a janela e renovada: so passa o primeiro disparo.
    return previous === undefined || t - previous >= windowMs;
  };
}

module.exports = { isNativeAction, runHotkeyNatively, createRepeatGuard };
