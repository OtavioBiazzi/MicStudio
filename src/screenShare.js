// Controle do "Compartilhar tela". Fica fora do React de proposito: trocar de aba no app nao pode derrubar a
// transmissao. As telas so leem o estado (useScreenShare) e chamam as acoes.
//
// Conexao direta WebRTC entre os PCs (rede do Radmin ou rede local). A "sinalizacao" e um unico pedido HTTP para a
// sala de quem transmite (electron/screenshare.cjs). Ate MAX_VIEWERS pessoas assistem ao mesmo tempo; cada uma recebe
// o video direto de quem transmite.

import { useSyncExternalStore } from "react";

export const SCREEN_QUALITIES = {
  leve: { id: "leve", label: "Leve", detail: "720p · 30 fps", width: 1280, height: 720, fps: 30, bitrate: 3_000_000, hint: "Pesa menos no jogo e na internet." },
  normal: { id: "normal", label: "Normal", detail: "1080p · 30 fps", width: 1920, height: 1080, fps: 30, bitrate: 6_000_000, hint: "Bom para a maioria das coisas." },
  fluida: { id: "fluida", label: "Fluida", detail: "1080p · 60 fps", width: 1920, height: 1080, fps: 60, bitrate: 10_000_000, hint: "Para jogos. Usa mais internet." }
};

export const MAX_VIEWERS = 4;
const RECENTS_KEY = "vozlab.screen.recents";
const HOST_PREFS_KEY = "vozlab.screen.host";
const TRUSTED_KEY = "vozlab.screen.trusted";
const CLIENT_KEY = "vozlab.screen.clientId";
const VOLUME_KEY = "vozlab.screen.volume";
const ICE_WAIT_MS = 2500;
const DISCONNECT_GRACE_MS = 6000;
const RECONNECT_WINDOW_MS = 120_000; // quem caiu nesse tempo volta sem pedir de novo
const RECONNECT_ATTEMPTS = 3;

const api = () => window.micfudiddo?.screen;

const idleState = {
  mode: "idle", // idle | hosting | joining | watching
  hosting: null, // { sourceId, sourceName, isScreen, quality, shareAudio, hasAudio, stream, addresses, code, viewers, requests, notice }
  watching: null, // { host, name, stream, status, stats, hasAudio, reconnecting }
  error: ""
};

let state = { ...idleState, rooms: [] };
const listeners = new Set();
const hostPeers = new Map(); // id -> { id, pc, channel, name, clientId, address, videoSender, audioSender, connected, stats, bytes, stopWatch }
const recentDrops = new Map(); // clientId -> quando caiu
let viewerPeer = null; // { pc, channel, stopWatch, bytes }
let viewerSession = null; // { host, code, name, attempts }
let hostStatsTimer = null;
let viewerStatsTimer = null;
let removeJoinListener = null;
let removeRoomsListener = null;
let discoveryUsers = 0;
let lastStatusSignature = "";

function reportStatus() {
  const mode = state.mode === "hosting" ? "hosting" : state.mode === "watching" || state.mode === "joining" ? "watching" : "idle";
  const viewers = state.hosting?.viewers?.length || 0;
  const label = state.watching?.name || state.watching?.host || "";
  const signature = `${mode}|${viewers}|${label}`;
  if (signature === lastStatusSignature) return;
  lastStatusSignature = signature;
  api()?.setStatus?.({ mode, viewers, label });
  if (mode === "hosting") api()?.setViewers?.(viewers);
}

function setState(patch) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((listener) => listener());
  reportStatus();
}

function patchHosting(patch) {
  setState((current) => (current.hosting ? { hosting: { ...current.hosting, ...(typeof patch === "function" ? patch(current.hosting) : patch) } } : {}));
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

// ---------- preferencias, amigos e salas recentes ----------
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

function clientId() {
  let id = "";
  try { id = localStorage.getItem(CLIENT_KEY) || ""; } catch {}
  if (!/^[a-f0-9-]{20,64}$/i.test(id)) {
    id = crypto.randomUUID();
    try { localStorage.setItem(CLIENT_KEY, id); } catch {}
  }
  return id;
}

export function readHostPrefs() {
  const saved = readJson(HOST_PREFS_KEY, {});
  return {
    quality: SCREEN_QUALITIES[saved.quality] ? saved.quality : "normal",
    askCode: saved.askCode === true,
    code: typeof saved.code === "string" && saved.code.length >= 4 ? saved.code : randomRoomCode(),
    shareAudio: saved.shareAudio === true,
    lastSourceId: typeof saved.lastSourceId === "string" ? saved.lastSourceId : "",
    guideSeen: saved.guideSeen === true
  };
}

export function saveHostPrefs(prefs) {
  writeJson(HOST_PREFS_KEY, {
    quality: prefs.quality,
    askCode: Boolean(prefs.askCode),
    code: prefs.code,
    shareAudio: Boolean(prefs.shareAudio),
    lastSourceId: prefs.lastSourceId || "",
    guideSeen: Boolean(prefs.guideSeen)
  });
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

export function readTrusted() {
  const list = readJson(TRUSTED_KEY, []);
  return Array.isArray(list) ? list.filter((item) => item && typeof item.clientId === "string" && item.clientId) : [];
}

export function isTrusted(id) {
  return Boolean(id) && readTrusted().some((item) => item.clientId === id);
}

export function setTrusted(id, name, trusted) {
  if (!id) return;
  const list = readTrusted().filter((item) => item.clientId !== id);
  if (trusted) list.unshift({ clientId: id, name: String(name || "").slice(0, 40) });
  writeJson(TRUSTED_KEY, list.slice(0, 20));
  // so para a tela atualizar o selo de "entra direto"
  if (state.hosting) patchHosting({ trustedVersion: (state.hosting.trustedVersion || 0) + 1 });
}

export function readViewerVolume() {
  const value = Number(readJson(VOLUME_KEY, 0.8));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.8;
}

export function saveViewerVolume(value) {
  writeJson(VOLUME_KEY, Math.min(1, Math.max(0, Number(value) || 0)));
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

function sendMessage(channel, message) {
  try { if (channel?.readyState === "open") channel.send(JSON.stringify(message)); } catch {}
}

function watchConnection(pc, onLost) {
  let graceTimer = null;
  const handler = () => {
    const value = pc.connectionState;
    clearTimeout(graceTimer);
    if (value === "failed" || value === "closed") onLost(value);
    else if (value === "disconnected") graceTimer = setTimeout(() => onLost("disconnected"), DISCONNECT_GRACE_MS);
  };
  pc.addEventListener("connectionstatechange", handler);
  return () => {
    clearTimeout(graceTimer);
    pc.removeEventListener("connectionstatechange", handler);
  };
}

async function readStats(pc, direction, bytes) {
  const report = await pc.getStats();
  let rtp = null;
  let pair = null;
  report.forEach((item) => {
    if (item.type === (direction === "in" ? "inbound-rtp" : "outbound-rtp") && item.kind === "video") rtp = item;
    if (item.type === "candidate-pair" && (item.nominated || item.selected) && item.state === "succeeded") pair = item;
  });
  if (!rtp) return null;
  const total = direction === "in" ? rtp.bytesReceived : rtp.bytesSent;
  const now = performance.now();
  const kbps = bytes.at && total >= bytes.value ? Math.round(((total - bytes.value) * 8) / (now - bytes.at)) : 0;
  bytes.value = total;
  bytes.at = now;
  return {
    fps: Math.round(rtp.framesPerSecond || 0),
    width: rtp.frameWidth || 0,
    height: rtp.frameHeight || 0,
    kbps,
    pingMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
    limitedBy: rtp.qualityLimitationReason && rtp.qualityLimitationReason !== "none" ? rtp.qualityLimitationReason : ""
  };
}

// ---------- quem transmite ----------
export async function listScreenSources() {
  return (await api()?.sources?.()) || [];
}

export async function listAddresses() {
  return (await api()?.addresses?.()) || [];
}

async function captureSource(sourceId, preset, shareAudio) {
  const video = {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      maxWidth: preset.width,
      maxHeight: preset.height,
      maxFrameRate: preset.fps
    }
  };
  let stream = null;
  let audioFailed = false;
  if (shareAudio) {
    try {
      // No Windows isto pega o som que sai no PC (o mesmo que voce ouve).
      stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "desktop" } }, video });
    } catch {
      audioFailed = true;
    }
  }
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    } catch {
      throw new Error("Não consegui capturar essa tela. Escolha outra ou tente de novo.");
    }
  }
  const track = stream.getVideoTracks()[0];
  if (track) track.contentHint = preset.fps >= 60 ? "motion" : "detail";
  return { stream, audioFailed };
}

async function applyEncoding(sender, preset) {
  if (!sender) return;
  try {
    const params = sender.getParameters();
    params.encodings = params.encodings?.length ? params.encodings : [{}];
    params.encodings[0].maxBitrate = preset.bitrate;
    params.encodings[0].maxFramerate = preset.fps;
    params.degradationPreference = preset.fps >= 60 ? "maintain-framerate" : "balanced";
    await sender.setParameters(params);
  } catch {}
}

function viewerList() {
  return [...hostPeers.values()].map((peer) => ({
    id: peer.id, name: peer.name, address: peer.address, clientId: peer.clientId, connected: peer.connected, stats: peer.stats
  }));
}

function syncViewers(extra = {}) {
  patchHosting({ viewers: viewerList(), ...extra });
}

function startHostStats() {
  clearInterval(hostStatsTimer);
  hostStatsTimer = setInterval(async () => {
    if (!hostPeers.size) return;
    let changed = false;
    for (const peer of hostPeers.values()) {
      try {
        const stats = await readStats(peer.pc, "out", peer.bytes);
        if (stats) { peer.stats = stats; changed = true; }
        if (!peer.connected && peer.pc.connectionState === "connected") { peer.connected = true; changed = true; }
      } catch {}
    }
    if (changed && state.hosting) syncViewers();
  }, 1000);
}

function closePeer(peer, message) {
  if (!peer) return;
  hostPeers.delete(peer.id);
  if (message) sendMessage(peer.channel, message);
  peer.stopWatch?.();
  setTimeout(() => { try { peer.pc.close(); } catch {} }, message ? 150 : 0);
}

function viewerLeft(peerId, notice, { dropped = false } = {}) {
  const peer = hostPeers.get(peerId);
  if (!peer) return;
  closePeer(peer);
  if (dropped && peer.clientId) recentDrops.set(peer.clientId, Date.now());
  syncViewers({ notice: notice ?? `${peer.name} saiu.` });
}

function wantsAutoAccept(request) {
  if (!request.clientId) return false;
  if ([...hostPeers.values()].some((peer) => peer.clientId === request.clientId)) return true; // voltando de uma queda
  const droppedAt = recentDrops.get(request.clientId);
  if (droppedAt && Date.now() - droppedAt < RECONNECT_WINDOW_MS) return true;
  return isTrusted(request.clientId);
}

function handleJoinRequest(request) {
  if (state.mode !== "hosting") return;
  const sameClient = request.clientId ? [...hostPeers.values()].find((peer) => peer.clientId === request.clientId) : null;
  if (sameClient) closePeer(sameClient); // a conexao antiga dessa pessoa morreu; a nova substitui
  if (hostPeers.size >= MAX_VIEWERS) {
    api().decide({ id: request.id, accepted: false, reason: "A sala está cheia." });
    return;
  }
  const auto = wantsAutoAccept(request) || Boolean(sameClient);
  patchHosting((hosting) => ({ requests: [...hosting.requests.filter((item) => item.id !== request.id), request] }));
  if (auto) acceptViewer(request.id, { auto: true });
}

export async function startHosting({ sourceId, sourceName, isScreen = true, quality = "normal", shareAudio = false, name, code }) {
  if (!isScreenShareAvailable()) throw new Error("Compartilhar tela só funciona no app instalado.");
  if (state.mode !== "idle") throw new Error("Pare a transmissão ou saia da sala antes.");
  const preset = SCREEN_QUALITIES[quality] || SCREEN_QUALITIES.normal;
  const { stream, audioFailed } = await captureSource(sourceId, preset, shareAudio);

  const opened = await api().hostStart({ name, code, maxViewers: MAX_VIEWERS });
  if (!opened?.ok) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(opened?.reason || "Não consegui abrir a sala.");
  }
  watchTrackEnd(stream);
  removeJoinListener?.();
  removeJoinListener = api().onJoinRequest(handleJoinRequest);
  recentDrops.clear();
  saveHostPrefs({ ...readHostPrefs(), quality: preset.id, shareAudio, lastSourceId: sourceId });
  setState({
    mode: "hosting",
    error: "",
    hosting: {
      sourceId, sourceName, isScreen, quality: preset.id, shareAudio,
      hasAudio: stream.getAudioTracks().length > 0,
      stream, addresses: opened.addresses || [], code: code || "", viewers: [], requests: [],
      notice: audioFailed ? "Não deu para pegar o som do PC; transmitindo só a imagem." : ""
    }
  });
  startHostStats();
}

function watchTrackEnd(stream) {
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (state.mode === "hosting" && state.hosting?.stream === stream) stopHosting("A janela que você estava transmitindo foi fechada.");
  });
}

// Troca a tela, a qualidade ou o som sem derrubar quem esta assistindo.
export async function changeHosting({ sourceId, sourceName, isScreen, quality, shareAudio }) {
  const hosting = state.hosting;
  if (!hosting) return;
  const next = {
    sourceId: sourceId ?? hosting.sourceId,
    sourceName: sourceName ?? hosting.sourceName,
    isScreen: isScreen ?? hosting.isScreen,
    quality: quality ?? hosting.quality,
    shareAudio: shareAudio ?? hosting.shareAudio
  };
  const preset = SCREEN_QUALITIES[next.quality] || SCREEN_QUALITIES.normal;
  const { stream, audioFailed } = await captureSource(next.sourceId, preset, next.shareAudio);
  if (state.hosting !== hosting && state.hosting?.stream !== hosting.stream) {
    stream.getTracks().forEach((t) => t.stop());
    return; // parou de transmitir enquanto capturava
  }
  const video = stream.getVideoTracks()[0] || null;
  const audio = stream.getAudioTracks()[0] || null;
  for (const peer of hostPeers.values()) {
    try { await peer.videoSender?.replaceTrack(video); } catch {}
    try { await peer.audioSender?.replaceTrack(audio); } catch {}
    await applyEncoding(peer.videoSender, preset);
  }
  const old = state.hosting.stream;
  watchTrackEnd(stream);
  old?.getTracks().forEach((t) => t.stop());
  saveHostPrefs({ ...readHostPrefs(), quality: preset.id, shareAudio: next.shareAudio, lastSourceId: next.sourceId });
  patchHosting({
    ...next,
    quality: preset.id,
    stream,
    hasAudio: Boolean(audio),
    notice: audioFailed ? "Não deu para pegar o som do PC; transmitindo só a imagem." : ""
  });
}

export async function acceptViewer(requestId, { auto = false } = {}) {
  const hosting = state.hosting;
  const request = hosting?.requests.find((item) => item.id === requestId);
  if (!hosting || !request) return;
  patchHosting((current) => ({ requests: current.requests.filter((item) => item.id !== requestId) }));
  if (hostPeers.size >= MAX_VIEWERS) {
    await api().decide({ id: requestId, accepted: false, reason: "A sala está cheia." });
    return;
  }
  const preset = SCREEN_QUALITIES[hosting.quality] || SCREEN_QUALITIES.normal;
  const pc = new RTCPeerConnection({ iceServers: [] });
  // Os avisos do WebRTC (canal aberto, conectado) podem chegar a qualquer momento: escuta tudo antes de negociar.
  const peer = {
    id: requestId, pc, channel: null, name: request.name, clientId: request.clientId || "", address: request.address,
    videoSender: null, audioSender: null, connected: false, stats: null, bytes: { value: 0, at: 0 }
  };
  hostPeers.set(peer.id, peer);
  pc.addEventListener("datachannel", (event) => {
    peer.channel = event.channel;
    event.channel.addEventListener("message", (msg) => {
      try { if (JSON.parse(msg.data)?.type === "bye" && hostPeers.get(peer.id) === peer) viewerLeft(peer.id); } catch {}
    });
  });
  pc.addEventListener("connectionstatechange", () => {
    if (hostPeers.get(peer.id) === peer && pc.connectionState === "connected" && !peer.connected) {
      peer.connected = true;
      if (peer.clientId) recentDrops.delete(peer.clientId);
      syncViewers();
    }
  });
  peer.stopWatch = watchConnection(pc, () => {
    if (hostPeers.get(peer.id) === peer) viewerLeft(peer.id, `A conexão com ${peer.name} caiu.`, { dropped: true });
  });
  syncViewers({ notice: auto ? `${request.name} entrou direto.` : "" });
  try {
    await pc.setRemoteDescription(request.offer);
    const stream = state.hosting?.stream;
    const video = stream?.getVideoTracks()[0];
    const audio = stream?.getAudioTracks()[0] || null;
    const videoTransceiver = pc.getTransceivers().find((item) => item.receiver?.track?.kind === "video");
    const audioTransceiver = pc.getTransceivers().find((item) => item.receiver?.track?.kind === "audio");
    if (!videoTransceiver || !video) throw new Error("sem video");
    await videoTransceiver.sender.replaceTrack(video);
    videoTransceiver.direction = "sendonly";
    peer.videoSender = videoTransceiver.sender;
    if (audioTransceiver) {
      // Mesmo sem som agora, deixa o canal pronto: ligar o som depois nao precisa reconectar.
      await audioTransceiver.sender.replaceTrack(audio);
      audioTransceiver.direction = "sendonly";
      peer.audioSender = audioTransceiver.sender;
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    if (hostPeers.get(peer.id) !== peer) throw new Error("cancelado");
    const delivered = await api().decide({ id: requestId, accepted: true, answer: { type: "answer", sdp: pc.localDescription.sdp } });
    if (!delivered) throw new Error("O pedido expirou.");
    await applyEncoding(peer.videoSender, SCREEN_QUALITIES[state.hosting?.quality] || preset);
  } catch {
    api().decide({ id: requestId, accepted: false, reason: "Deu erro ao abrir o vídeo. Peça para tentar de novo." });
    if (hostPeers.get(peer.id) === peer) {
      closePeer(peer);
      syncViewers({ notice: `Não consegui conectar com ${request.name}.` });
    }
  }
}

export function rejectViewer(requestId) {
  const hosting = state.hosting;
  if (!hosting) return;
  patchHosting({ requests: hosting.requests.filter((item) => item.id !== requestId) });
  api()?.decide({ id: requestId, accepted: false, reason: "Quem está transmitindo recusou." });
}

export function kickViewer(peerId) {
  const peer = hostPeers.get(peerId);
  if (!peer) return;
  if (peer.clientId) recentDrops.delete(peer.clientId);
  closePeer(peer, { type: "bye", reason: "kick" });
  syncViewers({ notice: `Você tirou ${peer.name} da sala.` });
}

export async function stopHosting(reason = "") {
  const hosting = state.hosting;
  clearInterval(hostStatsTimer);
  hostStatsTimer = null;
  for (const peer of [...hostPeers.values()]) closePeer(peer, { type: "bye", reason: "end" });
  recentDrops.clear();
  removeJoinListener?.();
  removeJoinListener = null;
  for (const request of hosting?.requests || []) api()?.decide({ id: request.id, accepted: false, reason: "A transmissão acabou." });
  hosting?.stream?.getTracks().forEach((track) => track.stop());
  await api()?.hostStop?.();
  setState({ ...idleState, rooms: state.rooms, error: reason });
}

// ---------- descoberta de salas na rede ----------
export function startDiscovery() {
  discoveryUsers += 1;
  if (discoveryUsers > 1 || !api()?.discoverStart) return;
  removeRoomsListener = api().onRooms?.((rooms) => setState({ rooms: Array.isArray(rooms) ? rooms : [] }));
  api().discoverStart();
}

export function stopDiscovery() {
  discoveryUsers = Math.max(0, discoveryUsers - 1);
  if (discoveryUsers > 0) return;
  removeRoomsListener?.();
  removeRoomsListener = null;
  api()?.discoverStop?.();
  setState({ rooms: [] });
}

// ---------- quem assiste ----------
export function probeRoom(host) {
  return api()?.probe?.(host) || Promise.resolve({ online: false, reason: "Indisponível." });
}

function closeViewerPeer({ notify = true } = {}) {
  const peer = viewerPeer;
  viewerPeer = null;
  clearInterval(viewerStatsTimer);
  viewerStatsTimer = null;
  if (!peer) return;
  if (notify) sendMessage(peer.channel, { type: "bye" });
  peer.stopWatch?.();
  setTimeout(() => { try { peer.pc.close(); } catch {} }, notify ? 150 : 0);
}

async function connectViewer() {
  const session = viewerSession;
  if (!session) return;
  const pc = new RTCPeerConnection({ iceServers: [] });
  const videoTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  preferH264(videoTransceiver);
  const channel = pc.createDataChannel("vozlab");
  const peer = { pc, channel, bytes: { value: 0, at: 0 } };
  viewerPeer = peer;
  const stream = new MediaStream();
  pc.addEventListener("track", (event) => {
    if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
    if (event.track.kind === "audio") patchWatching({ hasAudio: true });
  });
  channel.addEventListener("message", (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (data?.type === "bye" && viewerPeer === peer) leaveRoom(data.reason === "kick" ? "Quem está transmitindo tirou você da sala." : "A transmissão acabou.", { notify: false });
    } catch {}
  });
  setState((current) => ({
    mode: current.mode === "watching" ? "watching" : "joining",
    watching: { ...(current.watching || {}), host: session.host, name: current.watching?.name || "", stream, stats: null, hasAudio: false, status: session.attempts ? "Reconectando..." : "Pedindo para entrar..." }
  }));

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    if (viewerPeer !== peer) return;
    if (!session.attempts) patchWatching({ status: "Esperando aceitarem seu pedido..." });
    const result = await api().join({ host: session.host, name: session.name, code: session.code, clientId: clientId(), offer: { type: "offer", sdp: pc.localDescription.sdp } });
    if (viewerPeer !== peer) return; // cancelou enquanto esperava
    if (!result?.ok) throw new Error(result?.reason || "Não deu para entrar na sala.");
    await pc.setRemoteDescription(result.answer);
  } catch (error) {
    if (viewerPeer === peer) await leaveRoom(error.message || "Não deu para entrar na sala.", { notify: false });
    return;
  }

  if (!state.watching?.name) {
    const probe = await probeRoom(session.host).catch(() => null);
    if (viewerPeer !== peer) return;
    const roomName = probe?.name || session.host;
    rememberRecent(session.host, roomName);
    patchWatching({ name: roomName });
  }
  peer.stopWatch = watchConnection(pc, () => {
    if (viewerPeer !== peer) return;
    if (session.attempts < RECONNECT_ATTEMPTS && viewerSession === session) {
      session.attempts += 1;
      closeViewerPeer({ notify: false });
      patchWatching({ status: "Reconectando...", stats: null });
      setTimeout(() => { if (viewerSession === session) connectViewer(); }, 1500);
    } else {
      leaveRoom("A conexão caiu. Confira o Radmin e tente entrar de novo.", { notify: false });
    }
  });
  const markConnected = () => {
    if (viewerPeer === peer && pc.connectionState === "connected") {
      session.attempts = 0;
      patchWatching({ status: "" });
    }
  };
  pc.addEventListener("connectionstatechange", markConnected);
  setState((current) => ({ mode: "watching", watching: { ...current.watching, status: current.watching?.status === "" ? "" : "Conectando o vídeo..." } }));
  markConnected();
  clearInterval(viewerStatsTimer);
  viewerStatsTimer = setInterval(async () => {
    if (viewerPeer !== peer) return;
    try {
      const stats = await readStats(pc, "in", peer.bytes);
      if (stats) patchWatching(pc.connectionState === "connected" && state.watching?.status ? { stats, status: "" } : { stats });
    } catch {}
  }, 1000);
}

export async function joinRoom({ host, code, name }) {
  if (!isScreenShareAvailable()) throw new Error("Assistir só funciona no app instalado.");
  if (state.mode !== "idle") throw new Error("Pare a transmissão ou saia da sala antes.");
  viewerSession = { host: String(host || "").trim(), code: String(code || "").trim(), name: name || "Amigo", attempts: 0 };
  await connectViewer();
}

export async function leaveRoom(reason = "", { notify = true } = {}) {
  viewerSession = null;
  const stream = state.watching?.stream;
  closeViewerPeer({ notify });
  stream?.getTracks().forEach((track) => track.stop());
  setState({ ...idleState, rooms: state.rooms, error: reason });
}

export function clearScreenShareError() {
  if (state.error) setState({ error: "" });
}

export function clearHostNotice() {
  if (state.hosting?.notice) patchHosting({ notice: "" });
}

// ---------- atalho global e menu da bandeja ----------
function profileName() {
  try { return localStorage.getItem("micfudiddo.profileName") || "Sala"; } catch { return "Sala"; }
}

async function toggleFromShortcut() {
  if (state.mode === "hosting") {
    await stopHosting();
    api()?.notify?.("Transmissão de tela parada.");
    return;
  }
  if (state.mode !== "idle") return;
  const prefs = readHostPrefs();
  try {
    const sources = await listScreenSources();
    const source = sources.find((item) => item.id === prefs.lastSourceId) || sources.find((item) => item.isScreen) || sources[0];
    if (!source) throw new Error("Não achei nenhuma tela para transmitir.");
    await startHosting({
      sourceId: source.id,
      sourceName: source.name,
      isScreen: source.isScreen,
      quality: prefs.quality,
      shareAudio: prefs.shareAudio,
      name: profileName(),
      code: prefs.askCode ? prefs.code : ""
    });
    api()?.notify?.(`Transmitindo ${source.name}. Seus amigos já podem entrar.`);
  } catch (error) {
    setState({ error: error.message });
    api()?.notify?.(error.message);
  }
}

function runCommand(command) {
  if (!command?.type) return;
  if (command.type === "toggle") toggleFromShortcut();
  else if (command.type === "stop") {
    if (state.mode === "hosting") stopHosting();
    else if (state.mode !== "idle") leaveRoom();
  }
}

let bridgeInstalled = false;
export function installScreenShareBridge() {
  if (bridgeInstalled || !api()?.onCommand) return () => {};
  bridgeInstalled = true;
  const remove = api().onCommand(runCommand);
  api().takeCommand?.().then(runCommand).catch(() => {});
  return () => {
    bridgeInstalled = false;
    remove?.();
  };
}
