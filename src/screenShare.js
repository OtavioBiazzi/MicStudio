// Controle do "Compartilhar tela". Fica fora do React de proposito: trocar de aba no app nao pode derrubar a
// transmissao. As telas so leem o estado (useScreenShare) e chamam as acoes.
//
// Fase 1: uma pessoa assistindo por vez. Conexao direta WebRTC entre os PCs (rede do Radmin ou rede local); a
// "sinalizacao" e um unico pedido HTTP para a sala de quem transmite (electron/screenshare.cjs).

import { useSyncExternalStore } from "react";

export const SCREEN_QUALITIES = {
  leve: { id: "leve", label: "Leve", detail: "720p · 30 fps", width: 1280, height: 720, fps: 30, bitrate: 3_000_000, hint: "Pesa menos no jogo e na internet." },
  normal: { id: "normal", label: "Normal", detail: "1080p · 30 fps", width: 1920, height: 1080, fps: 30, bitrate: 6_000_000, hint: "Bom para a maioria das coisas." },
  fluida: { id: "fluida", label: "Fluida", detail: "1080p · 60 fps", width: 1920, height: 1080, fps: 60, bitrate: 10_000_000, hint: "Para jogos. Usa mais internet." }
};

const RECENTS_KEY = "vozlab.screen.recents";
const HOST_PREFS_KEY = "vozlab.screen.host";
const ICE_WAIT_MS = 2500;
const DISCONNECT_GRACE_MS = 6000;

const api = () => window.micfudiddo?.screen;

const idleState = {
  mode: "idle", // idle | hosting | joining | watching
  hosting: null, // { sourceName, quality, stream, addresses, code, viewer, requests, stats }
  watching: null, // { host, name, stream, status, stats }
  error: ""
};

let state = idleState;
const listeners = new Set();
let hostPeer = null; // { pc, channel, name, timer }
let viewerPeer = null; // { pc, channel, timer }
let statsTimer = null;
let lastBytes = { value: 0, at: 0 };
let removeJoinListener = null;

function setState(patch) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((listener) => listener());
}

function patchHosting(patch) {
  setState((current) => (current.hosting ? { hosting: { ...current.hosting, ...patch } } : {}));
}

function patchWatching(patch) {
  setState((current) => (current.watching ? { watching: { ...current.watching, ...patch } } : {}));
}

export function getScreenShareState() {
  return state;
}

export function subscribeScreenShare(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useScreenShare() {
  return useSyncExternalStore(subscribeScreenShare, getScreenShareState, getScreenShareState);
}

export function isScreenShareAvailable() {
  return Boolean(api()) && typeof RTCPeerConnection !== "undefined";
}

// ---------- preferencias e salas recentes ----------
function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function readHostPrefs() {
  const saved = readJson(HOST_PREFS_KEY, {});
  return {
    quality: SCREEN_QUALITIES[saved.quality] ? saved.quality : "normal",
    askCode: saved.askCode === true,
    code: typeof saved.code === "string" && saved.code.length >= 4 ? saved.code : randomRoomCode()
  };
}

export function saveHostPrefs(prefs) {
  writeJson(HOST_PREFS_KEY, { quality: prefs.quality, askCode: Boolean(prefs.askCode), code: prefs.code });
}

export function readRecents() {
  const list = readJson(RECENTS_KEY, []);
  return Array.isArray(list) ? list.filter((item) => item && typeof item.host === "string").slice(0, 8) : [];
}

export function rememberRecent(host, name) {
  const clean = String(host).trim();
  const list = readRecents().filter((item) => item.host !== clean);
  list.unshift({ host: clean, name: String(name || "").slice(0, 40), lastUsed: Date.now() });
  writeJson(RECENTS_KEY, list.slice(0, 8));
}

export function forgetRecent(host) {
  writeJson(RECENTS_KEY, readRecents().filter((item) => item.host !== host));
}

// ---------- WebRTC ----------
function waitForIce(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, ICE_WAIT_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function preferH264(transceiver) {
  try {
    const codecs = RTCRtpReceiver.getCapabilities?.("video")?.codecs;
    if (!codecs?.length || !transceiver.setCodecPreferences) return;
    const rank = (codec) => (/h264/i.test(codec.mimeType) ? 0 : /vp8/i.test(codec.mimeType) ? 1 : 2);
    transceiver.setCodecPreferences([...codecs].sort((a, b) => rank(a) - rank(b)));
  } catch {}
}

function sendBye(channel) {
  try { if (channel?.readyState === "open") channel.send(JSON.stringify({ type: "bye" })); } catch {}
}

function watchConnection(pc, onLost) {
  let graceTimer = null;
  pc.addEventListener("connectionstatechange", () => {
    const value = pc.connectionState;
    clearTimeout(graceTimer);
    if (value === "failed" || value === "closed") onLost(value);
    else if (value === "disconnected") graceTimer = setTimeout(() => onLost("disconnected"), DISCONNECT_GRACE_MS);
  });
  return () => clearTimeout(graceTimer);
}

async function readStats(pc, direction) {
  const report = await pc.getStats();
  let rtp = null;
  let pair = null;
  report.forEach((item) => {
    if (item.type === (direction === "in" ? "inbound-rtp" : "outbound-rtp") && item.kind === "video") rtp = item;
    if (item.type === "candidate-pair" && (item.nominated || item.selected) && item.state === "succeeded") pair = item;
  });
  if (!rtp) return null;
  const bytes = direction === "in" ? rtp.bytesReceived : rtp.bytesSent;
  const now = performance.now();
  const kbps = lastBytes.at && bytes >= lastBytes.value ? Math.round(((bytes - lastBytes.value) * 8) / (now - lastBytes.at)) : 0;
  lastBytes = { value: bytes, at: now };
  return {
    fps: Math.round(rtp.framesPerSecond || 0),
    width: rtp.frameWidth || 0,
    height: rtp.frameHeight || 0,
    kbps,
    pingMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
    limitedBy: rtp.qualityLimitationReason && rtp.qualityLimitationReason !== "none" ? rtp.qualityLimitationReason : ""
  };
}

function startStats(getPc, direction, apply) {
  clearInterval(statsTimer);
  lastBytes = { value: 0, at: 0 };
  statsTimer = setInterval(async () => {
    const pc = getPc();
    if (!pc) return;
    try {
      const stats = await readStats(pc, direction);
      if (stats) apply(stats);
    } catch {}
  }, 1000);
}

function stopStats() {
  clearInterval(statsTimer);
  statsTimer = null;
}

// ---------- quem transmite ----------
export async function listScreenSources() {
  return (await api()?.sources?.()) || [];
}

export async function listAddresses() {
  return (await api()?.addresses?.()) || [];
}

function closeHostPeer({ notify = true } = {}) {
  const peer = hostPeer;
  hostPeer = null;
  stopStats();
  if (!peer) return;
  if (notify) sendBye(peer.channel);
  peer.stopWatch?.();
  try { peer.pc.close(); } catch {}
  api()?.setBusy?.(false);
}

function viewerLeft(message) {
  if (!hostPeer) return;
  const name = hostPeer.name;
  closeHostPeer({ notify: false });
  patchHosting({ viewer: null, stats: null, notice: message || `${name} saiu.` });
}

export async function startHosting({ sourceId, sourceName, quality = "normal", name, code }) {
  if (!isScreenShareAvailable()) throw new Error("Compartilhar tela só funciona no app instalado.");
  if (state.mode !== "idle") throw new Error("Pare a transmissão ou saia da sala antes.");
  const preset = SCREEN_QUALITIES[quality] || SCREEN_QUALITIES.normal;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: preset.width,
          maxHeight: preset.height,
          maxFrameRate: preset.fps
        }
      }
    });
  } catch {
    throw new Error("Não consegui capturar essa tela. Escolha outra ou tente de novo.");
  }
  const track = stream.getVideoTracks()[0];
  if (track) track.contentHint = preset.fps >= 60 ? "motion" : "detail";

  const opened = await api().hostStart({ name, code });
  if (!opened?.ok) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(opened?.reason || "Não consegui abrir a sala.");
  }
  track?.addEventListener("ended", () => {
    if (state.mode === "hosting") stopHosting("A janela que você estava transmitindo foi fechada.");
  });
  removeJoinListener?.();
  removeJoinListener = api().onJoinRequest((request) => {
    if (state.mode !== "hosting") return;
    if (hostPeer) {
      api().decide({ id: request.id, accepted: false, reason: "Já tem alguém assistindo essa sala." });
      return;
    }
    patchHosting({ requests: [...(state.hosting?.requests || []).filter((item) => item.id !== request.id), request] });
  });
  await api().setActive(true);
  setState({
    mode: "hosting",
    error: "",
    hosting: { sourceName, quality: preset.id, stream, addresses: opened.addresses || [], code: code || "", viewer: null, requests: [], stats: null, notice: "" }
  });
}

export async function acceptViewer(requestId) {
  const hosting = state.hosting;
  const request = hosting?.requests.find((item) => item.id === requestId);
  if (!hosting || !request) return;
  patchHosting({ requests: hosting.requests.filter((item) => item.id !== requestId) });
  if (hostPeer) {
    await api().decide({ id: requestId, accepted: false, reason: "Já tem alguém assistindo essa sala." });
    return;
  }
  const preset = SCREEN_QUALITIES[hosting.quality] || SCREEN_QUALITIES.normal;
  const pc = new RTCPeerConnection({ iceServers: [] });
  // Os avisos do WebRTC (canal aberto, conectado) podem chegar a qualquer momento: escuta tudo antes de negociar.
  const peer = { pc, channel: null, name: request.name };
  hostPeer = peer;
  const markConnected = () => {
    if (hostPeer === peer && pc.connectionState === "connected" && !state.hosting?.viewer?.connected) patchHosting({ viewer: { name: request.name, address: request.address, connected: true } });
  };
  pc.addEventListener("datachannel", (event) => {
    peer.channel = event.channel;
    event.channel.addEventListener("message", (msg) => {
      try { if (JSON.parse(msg.data)?.type === "bye" && hostPeer === peer) viewerLeft(); } catch {}
    });
  });
  pc.addEventListener("connectionstatechange", markConnected);
  peer.stopWatch = watchConnection(pc, () => { if (hostPeer === peer) viewerLeft(`A conexão com ${request.name} caiu.`); });
  api().setBusy(true);
  patchHosting({ viewer: { name: request.name, address: request.address, connected: false }, notice: "" });
  try {
    await pc.setRemoteDescription(request.offer);
    const track = hosting.stream.getVideoTracks()[0];
    const transceiver = pc.getTransceivers().find((item) => item.receiver?.track?.kind === "video");
    if (!transceiver || !track) throw new Error("sem video");
    await transceiver.sender.replaceTrack(track);
    transceiver.direction = "sendonly";
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    if (hostPeer !== peer) throw new Error("cancelado");
    const delivered = await api().decide({ id: requestId, accepted: true, answer: { type: "answer", sdp: pc.localDescription.sdp } });
    if (!delivered) throw new Error("O pedido expirou.");
    try {
      const params = transceiver.sender.getParameters();
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = preset.bitrate;
      params.encodings[0].maxFramerate = preset.fps;
      params.degradationPreference = preset.fps >= 60 ? "maintain-framerate" : "balanced";
      await transceiver.sender.setParameters(params);
    } catch {}
  } catch {
    api().decide({ id: requestId, accepted: false, reason: "Deu erro ao abrir o vídeo. Peça para tentar de novo." });
    if (hostPeer === peer) {
      closeHostPeer({ notify: false });
      patchHosting({ viewer: null, stats: null, notice: `Não consegui conectar com ${request.name}.` });
    }
    return;
  }
  markConnected();
  startStats(() => (hostPeer === peer ? pc : null), "out", (stats) => {
    patchHosting({ stats });
    markConnected();
  });
}

export function rejectViewer(requestId) {
  const hosting = state.hosting;
  if (!hosting) return;
  patchHosting({ requests: hosting.requests.filter((item) => item.id !== requestId) });
  api()?.decide({ id: requestId, accepted: false, reason: "Quem está transmitindo recusou." });
}

export function kickViewer() {
  if (!hostPeer) return;
  viewerLeft(`Você tirou ${hostPeer.name} da sala.`);
}

export async function stopHosting(reason = "") {
  const hosting = state.hosting;
  closeHostPeer();
  removeJoinListener?.();
  removeJoinListener = null;
  for (const request of hosting?.requests || []) api()?.decide({ id: request.id, accepted: false, reason: "A transmissão acabou." });
  hosting?.stream?.getTracks().forEach((track) => track.stop());
  await api()?.hostStop?.();
  await api()?.setActive?.(false);
  setState({ ...idleState, error: reason });
}

// ---------- quem assiste ----------
export function probeRoom(host) {
  return api()?.probe?.(host) || Promise.resolve({ online: false, reason: "Indisponível." });
}

function closeViewerPeer({ notify = true } = {}) {
  const peer = viewerPeer;
  viewerPeer = null;
  stopStats();
  if (!peer) return;
  if (notify) sendBye(peer.channel);
  peer.stopWatch?.();
  try { peer.pc.close(); } catch {}
}

export async function joinRoom({ host, code, name }) {
  if (!isScreenShareAvailable()) throw new Error("Assistir só funciona no app instalado.");
  if (state.mode !== "idle") throw new Error("Pare a transmissão ou saia da sala antes.");
  const target = String(host || "").trim();
  const pc = new RTCPeerConnection({ iceServers: [] });
  const transceiver = pc.addTransceiver("video", { direction: "recvonly" });
  preferH264(transceiver);
  const channel = pc.createDataChannel("vozlab");
  viewerPeer = { pc, channel };
  const stream = new MediaStream();
  pc.addEventListener("track", (event) => {
    if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
  });
  channel.addEventListener("message", (msg) => {
    try { if (JSON.parse(msg.data)?.type === "bye" && viewerPeer?.pc === pc) leaveRoom("A transmissão acabou."); } catch {}
  });
  await api().setActive(true);
  setState({ mode: "joining", error: "", watching: { host: target, name: "", stream, status: "Pedindo para entrar...", stats: null } });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    if (viewerPeer?.pc !== pc) return;
    patchWatching({ status: "Esperando aceitarem seu pedido..." });
    const result = await api().join({ host: target, name, code, offer: { type: "offer", sdp: pc.localDescription.sdp } });
    if (viewerPeer?.pc !== pc) return; // cancelou enquanto esperava
    if (!result?.ok) throw new Error(result?.reason || "Não deu para entrar na sala.");
    await pc.setRemoteDescription(result.answer);
  } catch (error) {
    if (viewerPeer?.pc === pc) await leaveRoom(error.message || "Não deu para entrar na sala.");
    return;
  }

  const probe = await probeRoom(target).catch(() => null);
  if (viewerPeer?.pc !== pc) return; // saiu enquanto perguntava o nome da sala
  const roomName = probe?.name || target;
  rememberRecent(target, roomName);
  viewerPeer.stopWatch = watchConnection(pc, (why) => {
    if (viewerPeer?.pc === pc) leaveRoom(why === "failed" ? "Não deu para fechar a conexão de vídeo. Confira o Radmin e o firewall." : "A conexão caiu.");
  });
  pc.addEventListener("connectionstatechange", () => {
    if (viewerPeer?.pc === pc && pc.connectionState === "connected") patchWatching({ status: "" });
  });
  setState((current) => ({ mode: "watching", watching: { ...current.watching, name: roomName, status: "Conectando o vídeo..." } }));
  if (pc.connectionState === "connected") patchWatching({ status: "" });
  startStats(() => (viewerPeer?.pc === pc ? pc : null), "in", (stats) => {
    patchWatching(pc.connectionState === "connected" && state.watching?.status ? { stats, status: "" } : { stats });
  });
}

export async function leaveRoom(reason = "") {
  closeViewerPeer();
  state.watching?.stream?.getTracks().forEach((track) => track.stop());
  await api()?.setActive?.(false);
  setState({ ...idleState, error: reason });
}

export function clearScreenShareError() {
  if (state.error) setState({ error: "" });
}

export function clearHostNotice() {
  if (state.hosting?.notice) patchHosting({ notice: "" });
}
