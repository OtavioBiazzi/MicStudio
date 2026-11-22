// Verificacoes de audio em linguagem simples. Funcao pura: recebe o estado do app e devolve a lista de itens.
// level: "ok" (tudo certo), "warn" (vale olhar) ou "error" (a voz nao vai funcionar).

export const VB_CABLE_URL = "https://vb-audio.com/Cable/";

export function runAudioChecks(state) {
  if (!state) return [];
  const checks = [];
  const inputs = state.devices?.inputs || [];
  const outputs = state.devices?.outputs || [];
  const selected = state.selected || {};
  const controls = state.controls || {};
  const voiceOn = Boolean(state.running) && !state.monitorOnly;

  const micOk = selected.input != null && inputs.some((d) => d.index === selected.input);
  checks.push(
    micOk
      ? { id: "mic", level: "ok", title: "Microfone conectado", detail: "O app está ouvindo o microfone escolhido." }
      : {
          id: "mic",
          level: "error",
          title: "Nenhum microfone encontrado",
          detail: "O microfone escolhido foi desconectado ou não existe mais. Conecte-o de novo e atualize a lista, ou escolha outro em Configurações.",
          fix: "refresh",
          fixLabel: "Procurar microfone de novo"
        }
  );

  checks.push(
    state.virtualCableDetected
      ? { id: "cable", level: "ok", title: "Cabo virtual instalado", detail: "É ele que leva sua voz para o Discord, jogo ou chamada." }
      : {
          id: "cable",
          level: "error",
          title: "Falta o cabo virtual (VB-CABLE)",
          detail: "Sem ele, ninguém ouve sua voz modificada. Baixe e instale, reinicie o PC e abra o app de novo.",
          fix: "download-cable",
          fixLabel: "Baixar VB-CABLE"
        }
  );

  if (state.voiceProblem) {
    checks.push({
      id: "voice",
      level: "error",
      title: "A voz caiu e não voltou sozinha",
      detail: state.voiceProblem,
      fix: "voice-on",
      fixLabel: "Ligar voz"
    });
  } else if (voiceOn) {
    checks.push({ id: "voice", level: "ok", title: "Voz ligada", detail: "O voice changer está funcionando." });
  } else {
    checks.push({
      id: "voice",
      level: "warn",
      title: "A voz está desligada",
      detail: "Enquanto estiver desligada, as pessoas ouvem seu microfone normal, sem efeito. Ligue para usar o voice changer.",
      fix: "voice-on",
      fixLabel: "Ligar voz"
    });
  }

  if (controls.masterMute) {
    checks.push({
      id: "mute",
      level: "warn",
      title: "Você está no mudo",
      detail: "Com o mudo ativo ninguém ouve sua voz (os sons do soundboard continuam).",
      fix: "unmute",
      fixLabel: "Tirar o mudo"
    });
  }

  const monitorExists = selected.monitor != null && outputs.some((d) => d.index === selected.monitor);
  if (!monitorExists) {
    checks.push({
      id: "monitor",
      level: "warn",
      title: "Nenhum fone escolhido para você se ouvir",
      detail: "Sem isso você não escuta sua própria voz nem o soundboard. Escolha seu fone ou caixa de som em Configurações → Áudio.",
      fix: "go-settings",
      fixLabel: "Abrir Configurações"
    });
  } else if (controls.monitor && Number(controls.monitorVolume ?? 1) < 0.05) {
    checks.push({
      id: "monitor-volume",
      level: "warn",
      title: "Retorno da voz está com volume zero",
      detail: "O retorno está ligado, mas sem volume, então você não se ouve.",
      fix: "monitor-volume",
      fixLabel: "Colocar em 100%"
    });
  }

  return checks;
}

export function summarizeChecks(checks) {
  const errors = checks.filter((c) => c.level === "error").length;
  const warns = checks.filter((c) => c.level === "warn").length;
  return { errors, warns, ok: errors === 0 && warns === 0 };
}

// Texto para o usuario colar quando pedir ajuda: mostra o essencial, sem dados pessoais.
export function buildReport(state, appVersion = "") {
  if (!state) return "Sem estado do app.";
  const name = (list, index) => (list || []).find((d) => d.index === index)?.name || "nenhum";
  const controls = state.controls || {};
  const lines = [
    `VozLab Studio ${appVersion}`.trim(),
    `Voz ligada: ${state.running && !state.monitorOnly ? "sim" : "nao"}`,
    `Microfone: ${name(state.devices?.inputs, state.selected?.input)}`,
    `Saida (cabo virtual): ${name(state.devices?.outputs, state.selected?.output)}`,
    `Fone (retorno): ${name(state.devices?.outputs, state.selected?.monitor)}`,
    `Cabo virtual detectado: ${state.virtualCableDetected ? "sim" : "nao"}`,
    `Mudo: ${controls.masterMute ? "sim" : "nao"} | Retorno: ${controls.monitor ? "ligado" : "desligado"} (${Math.round(Number(controls.monitorVolume ?? 1) * 100)}%)`,
    `Taxa: ${state.sampleRate || "-"} Hz | Bloco: ${state.blockSize || "-"}`,
    `Status: ${state.status || "-"}`,
    `Ultimo erro: ${state.lastError || "nenhum"}`,
    `Problema da voz: ${state.voiceProblem || "nenhum"}`,
    `Aviso do audio: ${state.lastCallbackStatus || "nenhum"}`
  ];
  return lines.join("\n");
}

// Pedido completo para colar numa IA agentica (Claude Code, Cursor, ChatGPT com acesso ao PC...): explica como o
// app funciona, o diagnostico, o estado atual, os dispositivos e os registros recentes.
export function buildAiPrompt(state, appVersion = "", logs = {}) {
  const checks = runAudioChecks(state);
  const devices = state?.devices || {};
  const selected = state?.selected || {};
  const settings = state?.settings || {};
  const controls = state?.controls || {};
  const listDevices = (list) => (list || []).map((d) => `  - [${d.index}] ${d.name}${d.hostapi ? ` (${d.hostapi})` : ""}${d.index === selected.input || d.index === selected.output || d.index === selected.monitor ? "  <- em uso" : ""}`).join("\n") || "  - nenhum";
  const pick = (keys) => keys.map((key) => `  - ${key}: ${JSON.stringify(settings[key])}`).join("\n");
  const tail = (text, lines = 120) => String(text || "").split(/\r?\n/).slice(-lines).join("\n").trim() || "(vazio)";
  return `Você é um agente de IA ajudando a resolver um problema de áudio no **VozLab Studio** (app para Windows que modifica a voz e tem soundboard). Código-fonte: https://github.com/OtavioBiazzi/MicStudio

## O problema (o usuário escreve aqui)
- (descreva com suas palavras: ex. "meus amigos não ouvem os sons do soundboard", "o Discord não pega minha voz", "o app parou de funcionar")

## Como o app funciona
- Interface em Electron; o áudio roda num backend Python local em http://127.0.0.1:38717 (endpoints /api/state e /api/runtime mostram o estado).
- O backend captura o microfone escolhido, aplica os efeitos e manda para a saída "CABLE Input (VB-Audio Virtual Cable)". O Discord/jogo deve usar "CABLE Output" como microfone.
- Ao ligar a voz, o app troca o microfone padrão do Windows para o CABLE Output e devolve o original ao fechar (arquivo de segurança %APPDATA%\\MicFudiddo\\temp_capture_defaults.json enquanto a voz está ligada).
- Os sons do soundboard tocam no CABLE (para os outros ouvirem) e no fone escolhido (retorno), conforme a rota configurada.
- Configurações: %APPDATA%\\MicFudiddo\\ (app_settings.json, profile.json, soundboard.json — todos têm um .bak). Registros: %APPDATA%\\micfudiddo-studio\\logs\\.

## Diagnóstico automático do app
${checks.map((check) => `- [${check.level.toUpperCase()}] ${check.title}: ${check.detail}`).join("\n") || "- (sem dados)"}

## Estado atual
- Versão: VozLab Studio ${appVersion || "?"} | Windows: ${navigator.userAgent.match(/Windows NT [\d.]+/)?.[0] || "?"}
- Voz ligada: ${state?.running && !state?.monitorOnly ? "sim" : "não"} | Só monitor: ${state?.monitorOnly ? "sim" : "não"} | Mudo: ${controls.masterMute ? "sim" : "não"}
- Retorno da voz: ${controls.monitor ? "ligado" : "desligado"} (${Math.round(Number(controls.monitorVolume ?? 1) * 100)}%) | Retorno do soundboard: ${controls.soundboardMonitor === false ? "desligado" : "ligado"}
- Taxa: ${state?.sampleRate || "-"} Hz | Bloco: ${state?.blockSize || "-"} | Cabo virtual detectado: ${state?.virtualCableDetected ? "sim" : "não"}
- Status: ${state?.status || "-"}
- Último erro: ${state?.lastError || "nenhum"}
- Problema da voz: ${state?.voiceProblem || "nenhum"}
- Aviso do áudio: ${state?.lastCallbackStatus || "nenhum"}

## Dispositivos
Entradas (microfones):
${listDevices(devices.inputs)}
Saídas:
${listDevices(devices.outputs)}
Microfones do Windows (para o padrão):
${(state?.windowsCaptureEndpoints || []).map((ep) => `  - ${ep.name} (${ep.id})`).join("\n") || "  - nenhum"}

## Configurações relevantes
${pick(["autoStartVirtual", "restoreOnDisable", "defaultMicOnClose", "defaultMicOnCloseName", "onlinePlaybackRoute", "audioSampleRate", "audioBufferSize", "inputChannels", "allowMultipleSounds", "maxSoundVolume"])}

## Registros recentes do backend
\`\`\`
${tail(logs.backend)}
\`\`\`

## Registros recentes do áudio (runtime)
\`\`\`
${tail(logs.runtime, 60)}
\`\`\`

## O que eu quero
1. Descubra a causa provável com base nas informações acima e explique em português simples.
2. Me guie passo a passo para resolver (ou, se você tiver acesso ao PC, rode os comandos você mesmo).
3. Cuidados: feche o VozLab antes de editar arquivos de configuração e faça uma cópia antes; nunca apague sons, perfis ou o soundboard.json; não desinstale drivers sem me perguntar.
4. Comandos úteis no PowerShell: \`Get-PnpDevice -Class AudioEndpoint | Format-Table -AutoSize\`, \`Get-CimInstance Win32_SoundDevice\`, e para ver o estado do app: \`Invoke-RestMethod http://127.0.0.1:38717/api/state\`.
`;
}
