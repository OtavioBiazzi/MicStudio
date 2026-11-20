// Salas de compartilhar tela no estilo do Discord. Fica fora do React de proposito: trocar de aba no app nao pode
// derrubar a sala nem as transmissoes. As telas so leem o estado (useScreenShare) e chamam as acoes.
//
// Como funciona:
// - Cada sala tem um id ("padrao" para a Sala da galera). Ao entrar, se alguem na rede ja tem a sala aberta, voce
//   conecta nele; se nao, este PC vira o host (o processo principal abre o hub, electron/screenshare.cjs).
// - Todos falam com o hub por WebSocket: membros, chat, quem esta ao vivo e a sinalizacao do video.
// - Quem compartilha a tela manda o video direto para cada pessoa que clicou em Assistir (WebRTC).
// - Se o host sai, o mais antigo assume e todo mundo reconecta sozinho.

import { useSyncExternalStore } from "react";

export const SCREEN_QUALITIES = {
  leve: { id: "leve", label: "Leve", detail: "720p · 30 fps", width: 1280, height: 720, fps: 30, bitrate: 3_000_000, hint: "Pesa menos no jogo e na internet." },
  normal: { id: "normal", label: "Normal", detail: "1080p · 30 fps", width: 1920, height: 1080, fps: 30, bitrate: 6_000_000, hint: "Bom para a maioria das coisas." },
  fluida: { id: "fluida", label: "Fluida", detail: "1080p · 60 fps", width: 1920, height: 1080, fps: 60, bitrate: 10_000_000, hint: "Para jogos. Usa mais internet." }
};

export const DEFAULT_ROOM = { id: "padrao", name: "Sala da galera" };
export const MAX_WATCHERS = 6;
const PORT = 47920;
const WS_PATH = "/vozlab/ws";
const HOST_PREFS_KEY = "vozlab.screen.host";
const CLIENT_KEY = "vozlab.screen.clientId";
const RECENTS_KEY = "vozlab.screen.recentHosts";
const VOLUMES_KEY = "vozlab.screen.volumes";
const DISCOVERY_WAIT_MS = 2600;
const CONNECT_TIMEOUT_MS = 6000;
const CHAT_LIMIT = 200;

const api = () => window.micfudiddo?.screen;

const lobbyState = {
  phase: "lobby", // lobby | joining | room
  joiningText: "",
  room: null, // { id, name, hasPassword, since, host, port, isHost }
  me: "",
  members: [],
  chat: [],
  unread: 0,
  share: null, // { stream, sourceId, sourceName, isScreen, quality, shareAudio, hasAudio }
  watchers: [], // ids de quem esta assistindo a minha tela
  streams: {}, // memberId -> { status, stream, stats, hasAudio }
  focus: "",
  reconnecting: false,
  error: ""
};

let state = { ...lobbyState, rooms: [] };
const listeners = new Set();
let socket = null; // WebSocket com o hub
let session = null; // { roomId, name, password, since, host, port, intentional }
let mySince = 0;
const outgoing = new Map(); // quem assiste a minha tela: memberId -> { pc, videoSender, audioSender, pendingIce }
const incoming = new Map(); // telas que eu assisto: memberId -> { pc, pendingIce, bytes, clientId }
const wantToWatch = new Set(); // clientIds que eu estava assistindo (volta sozinho depois de uma reconexao)
let statsTimer = null;
let removeRoomsListener = null;
let discoveryUsers = 0;
let lastStatusSignature = "";
let chatVisible = false;

// ---------- estado ----------
function reportStatus() {
  const inRoom = state.phase === "room" || state.phase === "joining";
  const status = { mode: inRoom ? "room" : "idle", live: Boolean(state.share), roomName: state.room?.name || "", members: state.members.length };
  const signature = JSON.stringify(status);
  if (signature === lastStatusSignature) return;
  lastStatusSignature = signature;
  api()?.setStatus?.(status);
}

function setState(patch) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((listener) => listener());
  reportStatus();
}

function patchStream(memberId, patch) {
  setState((current) => {
    if (!current.streams[memberId] && !patch) return {};
    const streams = { ...current.streams };
    if (patch === null) delete streams[memberId];
    else streams[memberId] = { ...(streams[memberId] || {}), ...patch };
    return { streams };
  });
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
  return Boolean(api()) && typeof RTCPeerConnection !== "undefined" && typeof WebSocket !== "undefined";
}

// ---------- preferencias ----------
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

function clientId() {
  let id = "";
  try { id = localStorage.getItem(CLIENT_KEY) || ""; } catch {}
  if (!/^[a-f0-9-]{20,64}$/i.test(id)) {
    id = crypto.randomUUID();
    try { localStorage.setItem(CLIENT_KEY, id); } catch {}
  }
  return id;
}

function profileName() {
  try { return (localStorage.getItem("micfudiddo.profileName") || "").trim() || "Amigo"; } catch { return "Amigo"; }
}

export function readHostPrefs() {
  const saved = readJson(HOST_PREFS_KEY, {});
  return {
    quality: SCREEN_QUALITIES[saved.quality] ? saved.quality : "normal",
    shareAudio: saved.shareAudio === true,
    lastSourceId: typeof saved.lastSourceId === "string" ? saved.lastSourceId : "",
    guideSeen: saved.guideSeen === true
  };
}

export function saveHostPrefs(patch) {
  writeJson(HOST_PREFS_KEY, { ...readHostPrefs(), ...patch });
}

export function readRecentHosts() {
  const list = readJson(RECENTS_KEY, []);
  return Array.isArray(list) ? list.filter((item) => item && typeof item.host === "string").slice(0, 6) : [];
}

function rememberHost(host, name) {
  if (!host || host === "127.0.0.1") return;
  const list = readRecentHosts().filter((item) => item.host !== host);
  list.unshift({ host, name: String(name || "").slice(0, 40), at: Date.now() });
  writeJson(RECENTS_KEY, list.slice(0, 6));
}

export function forgetRecentHost(host) {
  writeJson(RECENTS_KEY, readRecentHosts().filter((item) => item.host !== host));
}

export function readVolume(key) {
  const all = readJson(VOLUMES_KEY, {});
  const value = Number(all?.[key]);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.8;
}

export function saveVolume(key, value) {
  const all = readJson(VOLUMES_KEY, {});
  writeJson(VOLUMES_KEY, { ...(all && typeof all === "object" ? all : {}), [key]: Math.min(1, Math.max(0, Number(value) || 0)) });
}

// ---------- descoberta de salas ----------
export function startDiscovery() {
  discoveryUsers += 1;
  if (discoveryUsers > 1 || !api()?.discoverStart) return;
  removeRoomsListener = api().onRooms?.((rooms) => {
    setState({ rooms: Array.isArray(rooms) ? rooms : [] });
    checkDuplicateHost();
  });
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

export function probeRoom(host) {
  return api()?.probe?.(host) || Promise.resolve({ online: false, reason: "Indisponível." });
}

export async function listScreenSources() {
  return (await api()?.sources?.()) || [];
}

export async function listAddresses() {
  return (await api()?.addresses?.()) || [];
}

function findRemoteRoom(roomId) {
  return state.rooms.find((room) => room.roomId === roomId && !room.own) || null;
}

function waitForRoom(roomId, ms) {
  const found = findRemoteRoom(roomId);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const stop = subscribeScreenShare(() => {
      const room = findRemoteRoom(roomId);
      if (room) { clearTimeout(timer); stop(); resolve(room); }
    });
    const timer = setTimeout(() => { stop(); resolve(null); }, ms);
  });
}

// ---------- conexao com o hub ----------
function send(message) {
  if (socket?.readyState === 1) {
    try { socket.send(JSON.stringify(message)); } catch {}
  }
}

function signal(to, data) {
  send({ t: "signal", to, data });
}

function memberById(id) {
  return state.members.find((member) => member.id === id) || null;
}

function openSocket(host, port, password) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let ws;
    try {
      ws = new WebSocket(`ws://${host}:${port}${WS_PATH}`);
    } catch {
      reject(new Error("Não consegui conectar nesse IP."));
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error("A sala não respondeu. Confira se vocês estão na mesma rede do Radmin."));
    }, CONNECT_TIMEOUT_MS);
    const who = session?.identity || { name: profileName(), clientId: clientId() };
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", name: who.name, clientId: who.clientId, password: password || "" }));
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!settled) {
        if (message.t === "welcome") {
          settled = true;
          clearTimeout(timer);
          resolve({ ws, welcome: message });
        } else if (message.t === "error") {
          settled = true;
          clearTimeout(timer);
          reject(Object.assign(new Error(message.reason || "Não deu para entrar."), { code: message.code }));
        }
        return;
      }
      if (socket === ws) handleMessage(message);
    };
    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Não consegui conectar na sala."));
    };
    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("A sala fechou a conexão."));
        return;
      }
      if (socket === ws) handleDisconnect();
    };
  });
}

async function connectTo(host, port = PORT) {
  const { ws, welcome } = await openSocket(host, port, session?.password);
  const previous = socket;
  socket = ws;
  if (previous && previous !== ws) { try { previous.close(); } catch {} }
  const isHost = welcome.members.find((member) => member.id === welcome.you)?.isHost === true;
  session = { ...session, host, port, since: welcome.room.since };
  if (!isHost) rememberHost(host, welcome.room.name);
  closeAllPeers();
  setState((current) => ({
    phase: "room",
    joiningText: "",
    reconnecting: false,
    error: "",
    room: { id: welcome.room.id, name: welcome.room.name, hasPassword: welcome.room.hasPassword, since: welcome.room.since, host, port, isHost },
    me: welcome.you,
    members: welcome.members,
    chat: mergeChat(current.room?.id === welcome.room.id ? current.chat : [], welcome.chat || []),
    streams: {},
    focus: "",
    watchers: []
  }));
  if (state.share) announceShare();
  rewatchAfterReconnect();
}

function mergeChat(existing, incomingList) {
  const seen = new Set(existing.map((message) => message.id));
  const merged = [...existing, ...incomingList.filter((message) => !seen.has(message.id))];
  return merged.slice(-CHAT_LIMIT);
}

function isMine(message) {
  return message.from === state.me;
}

function handleMessage(message) {
  switch (message.t) {
    case "join":
      setState((current) => ({ members: [...current.members.filter((member) => member.id !== message.member.id), message.member] }));
      if (!message.member.isHost) systemNotice(`${message.member.name} entrou na sala.`);
      return;
    case "leave": {
      const member = memberById(message.id);
      closeOutgoing(message.id, { notify: false });
      closeIncoming(message.id);
      setState((current) => ({
        members: current.members.filter((item) => item.id !== message.id),
        focus: current.focus === message.id ? "" : current.focus
      }));
      if (member && !message.replaced) systemNotice(message.kicked ? `${member.name} foi tirado da sala.` : `${member.name} saiu da sala.`);
      return;
    }
    case "member": {
      const before = memberById(message.member.id);
      setState((current) => ({ members: current.members.map((item) => (item.id === message.member.id ? message.member : item)) }));
      if (!message.member.live && before?.live) {
        closeIncoming(message.member.id);
      }
      if (message.member.live && !before?.live && message.member.id !== state.me) {
        systemNotice(`${message.member.name} está ao vivo: ${message.member.live.title}`);
        api()?.notify?.(`${message.member.name} começou a compartilhar a tela na ${state.room?.name || "sala"}.`);
        if (wantToWatch.has(message.member.clientId)) watch(message.member.id);
      }
      return;
    }
    case "chat":
      setState((current) => ({
        chat: mergeChat(current.chat, [message.message]),
        unread: !chatVisible && !isMine(message.message) ? current.unread + 1 : current.unread
      }));
      if (!isMine(message.message)) api()?.notify?.(`${message.message.name}: ${message.message.text}`);
      return;
    case "signal":
      handleSignal(message.from, message.data);
      return;
    case "kicked":
      session = { ...session, intentional: true };
      leaveRoom(message.reason || "Você foi tirado da sala.");
      return;
    case "closing":
      session = { ...session, closing: { nextId: message.nextId, nextAddress: message.nextAddress } };
      return;
    case "moveto":
      session = { ...session, moveTo: { address: message.address, port: message.port || PORT } };
      return;
    default:
  }
}

function systemNotice(text) {
  setState((current) => ({ chat: mergeChat(current.chat, [{ id: `sys-${Date.now()}-${Math.random()}`, system: true, text, at: Date.now() }]) }));
}

// A conexao com o hub caiu. Decide quem assume a sala e reconecta todo mundo sozinho.
async function handleDisconnect() {
  const current = session;
  socket = null;
  closeAllPeers();
  if (!current || current.intentional || state.phase === "lobby") return;
  const members = state.members;
  const me = state.me;
  const wasHost = state.room?.isHost;
  setState({ reconnecting: true, streams: {}, watchers: [] });

  try {
    if (current.moveTo) {
      if (wasHost) await api()?.hostStop?.({ announce: false });
      session = { ...current, moveTo: null };
      await retryConnect(current.moveTo.address, current.moveTo.port);
      return;
    }
    let next = null;
    if (current.closing?.nextId) {
      next = { id: current.closing.nextId, address: current.closing.nextAddress };
    } else {
      // O host sumiu sem avisar: o mais antigo que sobrou assume.
      const candidate = members.filter((member) => !member.isHost).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (candidate) next = { id: candidate.id, address: candidate.address };
    }
    session = { ...current, closing: null };
    if (!next || next.id === me) {
      await becomeHost({ roomId: state.room.id, name: state.room.name, password: current.password, since: state.room.since });
      return;
    }
    await sleep(1200); // da tempo para quem assume abrir a sala
    try {
      await retryConnect(next.address, PORT);
    } catch {
      // Quem devia assumir nao abriu: procura de novo ou abre aqui.
      const found = await waitForRoom(state.room.id, DISCOVERY_WAIT_MS);
      if (found) await retryConnect(found.host, found.port);
      else await becomeHost({ roomId: state.room.id, name: state.room.name, password: current.password, since: state.room.since });
    }
  } catch (error) {
    if (state.phase !== "lobby") leaveRoom(error.message || "A conexão com a sala caiu.");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryConnect(host, port, attempts = 5) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    if (!session || session.intentional) return;
    try {
      await connectTo(host, port);
      return;
    } catch (error) {
      lastError = error;
      if (error.code === "password" || error.code === "full") throw error;
      await sleep(1000);
    }
  }
  throw lastError || new Error("Não consegui voltar para a sala.");
}

async function becomeHost({ roomId, name, password, since }) {
  mySince = since || Date.now();
  const opened = await api().hostStart({ roomId, name, password, hostName: session?.identity?.name || profileName(), since: mySince });
  if (!opened?.ok) throw new Error(opened?.reason || "Não consegui abrir a sala.");
  await connectTo("127.0.0.1", opened.port || PORT);
}

// Duas pessoas abriram a mesma sala ao mesmo tempo: a mais nova manda todo mundo para a mais antiga.
function checkDuplicateHost() {
  if (state.phase !== "room" || !state.room?.isHost) return;
  const other = findRemoteRoom(state.room.id);
  if (!other) return;
  const mine = state.room.since || mySince;
  const otherWins = other.since < mine || (other.since === mine && other.host < (state.members.find((m) => m.id === state.me)?.address || ""));
  if (!otherWins) return;
  send({ t: "moveto", address: other.host, port: other.port || PORT });
  session = { ...session, moveTo: { address: other.host, port: other.port || PORT } };
  setTimeout(() => api()?.hostStop?.({ announce: false }), 400);
}

// Entra numa sala. Se ninguem tem a sala aberta na rede, este PC vira o host.
export async function enterRoom({ roomId = DEFAULT_ROOM.id, name = DEFAULT_ROOM.name, password = "", host = "", port = PORT } = {}) {
  if (!isScreenShareAvailable()) throw new Error("As salas só funcionam no app instalado.");
  if (state.phase !== "lobby") {
    if (state.room?.id === roomId) return;
    await leaveRoom();
  }
  // Nome e id ficam fixos durante a sala: as reconexoes se apresentam do mesmo jeito.
  session = { roomId, name, password, host, port, intentional: false, identity: { name: profileName(), clientId: clientId() } };
  setState({ phase: "joining", joiningText: host ? "Conectando..." : "Procurando a sala na rede...", error: "" });
  startDiscovery();
  try {
    if (host) {
      await connectTo(host, port);
      return;
    }
    const own = state.rooms.find((room) => room.roomId === roomId && room.own);
    if (own) {
      await connectTo("127.0.0.1", own.port || PORT);
      return;
    }
    const remote = await waitForRoom(roomId, DISCOVERY_WAIT_MS);
    if (session?.intentional) return;
    if (remote) {
      setState({ joiningText: `Entrando na sala de ${remote.hostName || remote.host}...` });
      await connectTo(remote.host, remote.port || PORT);
      return;
    }
    setState({ joiningText: "Ninguém aqui ainda: abrindo a sala no seu PC..." });
    await api()?.hostStop?.({ announce: false });
    await becomeHost({ roomId, name, password, since: Date.now() });
  } catch (error) {
    if (session && !session.intentional) {
      session = null;
      socket = null;
      setState({ ...lobbyState, rooms: state.rooms, error: error.message || "Não deu para entrar na sala.", needsPassword: error.code === "password" ? { roomId, name, host, port } : null });
    }
  } finally {
    stopDiscovery();
  }
}

export function createRoomId(name) {
  const base = String(name || "sala").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "sala";
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `${base}-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function leaveRoom(reason = "") {
  const wasHost = state.room?.isHost;
  if (session) session = { ...session, intentional: true };
  if (state.share) await stopShare({ silent: true });
  closeAllPeers();
  wantToWatch.clear();
  const ws = socket;
  socket = null;
  if (wasHost) await api()?.hostStop?.({ announce: true });
  try { ws?.close(); } catch {}
  session = null;
  setState({ ...lobbyState, rooms: state.rooms, error: reason });
}

export function sendChat(text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  send({ t: "chat", text: clean.slice(0, 500) });
}

export function setChatVisible(visible) {
  chatVisible = Boolean(visible);
  if (chatVisible && state.unread) setState({ unread: 0 });
}

export function kickMember(memberId) {
  if (state.room?.isHost) send({ t: "kick", id: memberId });
}

export function setFocus(memberId) {
  setState({ focus: memberId || "" });
}

export function clearScreenShareError() {
  if (state.error || state.needsPassword) setState({ error: "", needsPassword: null });
}

// ---------- WebRTC ----------
function preferH264(transceiver) {
  try {
    const codecs = RTCRtpReceiver.getCapabilities?.("video")?.codecs;
    if (!codecs?.length || !transceiver.setCodecPreferences) return;
    const rank = (codec) => (/h264/i.test(codec.mimeType) ? 0 : /vp8/i.test(codec.mimeType) ? 1 : 2);
    transceiver.setCodecPreferences([...codecs].sort((a, b) => rank(a) - rank(b)));
  } catch {}
}

async function addRemoteIce(peer, candidate) {
  if (!candidate) return;
  if (!peer.pc.remoteDescription) {
    peer.pendingIce.push(candidate);
    return;
  }
  try { await peer.pc.addIceCandidate(candidate); } catch {}
}

async function flushIce(peer) {
  const list = peer.pendingIce.splice(0);
  for (const candidate of list) {
    try { await peer.pc.addIceCandidate(candidate); } catch {}
  }
}

function handleSignal(from, data) {
  if (!data || typeof data.kind !== "string") return;
  if (data.kind === "offer") answerWatcher(from, data);
  else if (data.kind === "answer") {
    const peer = incoming.get(from);
    if (!peer) return;
    peer.pc.setRemoteDescription({ type: "answer", sdp: data.sdp }).then(() => flushIce(peer)).catch(() => closeIncoming(from, "Não deu para abrir essa tela."));
  } else if (data.kind === "ice") {
    const peer = data.to === "watcher" ? incoming.get(from) : outgoing.get(from);
    if (peer) addRemoteIce(peer, data.candidate);
  } else if (data.kind === "stop") closeOutgoing(from, { notify: false });
  else if (data.kind === "ended") closeIncoming(from);
  else if (data.kind === "busy") closeIncoming(from, data.reason || "Essa tela está cheia.");
}

// Quem assiste: pede a tela de alguem que esta ao vivo.
export async function watch(memberId) {
  const member = memberById(memberId);
  if (!member?.live || memberId === state.me || incoming.has(memberId)) return;
  wantToWatch.add(member.clientId);
  const pc = new RTCPeerConnection({ iceServers: [] });
  const videoTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  preferH264(videoTransceiver);
  const stream = new MediaStream();
  const peer = { pc, pendingIce: [], bytes: { value: 0, at: 0 }, clientId: member.clientId };
  incoming.set(memberId, peer);
  patchStream(memberId, { status: "connecting", stream, stats: null, hasAudio: false });
  pc.ontrack = (event) => {
    if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
    if (event.track.kind === "audio") patchStream(memberId, { hasAudio: true });
  };
  pc.onicecandidate = (event) => { if (event.candidate) signal(memberId, { kind: "ice", to: "sharer", candidate: event.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => {
    if (incoming.get(memberId) !== peer) return;
    if (pc.connectionState === "connected") patchStream(memberId, { status: "live" });
    if (pc.connectionState === "failed") closeIncoming(memberId, "A conexão com essa tela falhou. Confira o Radmin e o firewall.");
  };
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal(memberId, { kind: "offer", sdp: pc.localDescription.sdp });
  } catch {
    closeIncoming(memberId, "Não deu para abrir essa tela.");
  }
  if (!state.focus) setFocus(memberId);
  ensureStats();
}

export function unwatch(memberId) {
  const member = memberById(memberId);
  if (member) wantToWatch.delete(member.clientId);
  if (incoming.has(memberId)) signal(memberId, { kind: "stop" });
  closeIncoming(memberId);
}

function closeIncoming(memberId, error = "") {
  const peer = incoming.get(memberId);
  incoming.delete(memberId);
  if (peer) {
    try { peer.pc.close(); } catch {}
    state.streams[memberId]?.stream?.getTracks().forEach((track) => track.stop());
  }
  if (error) patchStream(memberId, { status: "error", error, stream: null });
  else if (state.streams[memberId]) patchStream(memberId, null);
  if (state.focus === memberId && !error) {
    const nextFocus = Object.keys(state.streams).find((id) => id !== memberId) || "";
    setState({ focus: nextFocus });
  }
}

function rewatchAfterReconnect() {
  for (const member of state.members) {
    if (member.live && member.id !== state.me && wantToWatch.has(member.clientId)) watch(member.id);
  }
}

// Quem compartilha: responde quem pediu para assistir.
async function answerWatcher(from, data) {
  const share = state.share;
  if (!share) {
    signal(from, { kind: "ended" });
    return;
  }
  closeOutgoing(from, { notify: false });
  if (outgoing.size >= MAX_WATCHERS) {
    signal(from, { kind: "busy", reason: `Essa tela já tem ${MAX_WATCHERS} pessoas assistindo.` });
    return;
  }
  const pc = new RTCPeerConnection({ iceServers: [] });
  const peer = { pc, videoSender: null, audioSender: null, pendingIce: [] };
  outgoing.set(from, peer);
  pc.onicecandidate = (event) => { if (event.candidate) signal(from, { kind: "ice", to: "watcher", candidate: event.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => {
    if (outgoing.get(from) !== peer) return;
    if (pc.connectionState === "failed" || pc.connectionState === "closed") closeOutgoing(from, { notify: false });
    syncWatchers();
  };
  try {
    await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
    await flushIce(peer);
    const video = share.stream.getVideoTracks()[0] || null;
    const audio = share.stream.getAudioTracks()[0] || null;
    for (const transceiver of pc.getTransceivers()) {
      const kind = transceiver.receiver?.track?.kind;
      if (kind === "video") {
        await transceiver.sender.replaceTrack(video);
        transceiver.direction = "sendonly";
        peer.videoSender = transceiver.sender;
      } else if (kind === "audio") {
        // Mesmo sem som agora, o canal fica pronto: ligar o som depois nao precisa reconectar.
        await transceiver.sender.replaceTrack(audio);
        transceiver.direction = "sendonly";
        peer.audioSender = transceiver.sender;
      }
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signal(from, { kind: "answer", sdp: pc.localDescription.sdp });
    await applyEncoding(peer.videoSender, SCREEN_QUALITIES[share.quality]);
  } catch {
    closeOutgoing(from);
    return;
  }
  syncWatchers();
}

function closeOutgoing(memberId, { notify = true } = {}) {
  const peer = outgoing.get(memberId);
  if (!peer) return;
  outgoing.delete(memberId);
  if (notify) signal(memberId, { kind: "ended" });
  try { peer.pc.close(); } catch {}
  syncWatchers();
}

function syncWatchers() {
  const ids = [...outgoing.entries()].filter(([, peer]) => peer.pc.connectionState !== "closed").map(([id]) => id);
  if (ids.join() !== state.watchers.join()) setState({ watchers: ids });
}

function closeAllPeers() {
  for (const id of [...outgoing.keys()]) closeOutgoing(id, { notify: false });
  for (const id of [...incoming.keys()]) {
    const peer = incoming.get(id);
    incoming.delete(id);
    try { peer.pc.close(); } catch {}
  }
}

async function applyEncoding(sender, preset = SCREEN_QUALITIES.normal) {
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

function announceShare() {
  const share = state.share;
  send({ t: "state", live: share ? { title: share.sourceName, quality: share.quality, audio: share.hasAudio } : null });
}

function watchTrackEnd(stream) {
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (state.share?.stream === stream) stopShare({ reason: "A janela que você estava compartilhando foi fechada." });
  });
}

// Compartilhar a tela na sala (ou trocar a tela/qualidade/som sem derrubar quem esta assistindo).
export async function startShare({ sourceId, sourceName, isScreen = true, quality = "normal", shareAudio = false }) {
  if (state.phase !== "room") throw new Error("Entre numa sala primeiro.");
  const preset = SCREEN_QUALITIES[quality] || SCREEN_QUALITIES.normal;
  const { stream, audioFailed } = await captureSource(sourceId, preset, shareAudio);
  if (state.phase !== "room") {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  const old = state.share?.stream;
  const video = stream.getVideoTracks()[0] || null;
  const audio = stream.getAudioTracks()[0] || null;
  for (const peer of outgoing.values()) {
    try { await peer.videoSender?.replaceTrack(video); } catch {}
    try { await peer.audioSender?.replaceTrack(audio); } catch {}
    await applyEncoding(peer.videoSender, preset);
  }
  watchTrackEnd(stream);
  old?.getTracks().forEach((track) => track.stop());
  saveHostPrefs({ quality: preset.id, shareAudio, lastSourceId: sourceId });
  setState({ share: { stream, sourceId, sourceName, isScreen, quality: preset.id, shareAudio, hasAudio: Boolean(audio) } });
  announceShare();
  if (audioFailed) systemNotice("Não deu para pegar o som do PC; compartilhando só a imagem.");
  ensureStats();
}

export async function stopShare({ silent = false, reason = "" } = {}) {
  const share = state.share;
  if (!share) return;
  for (const id of [...outgoing.keys()]) closeOutgoing(id, { notify: true });
  share.stream.getTracks().forEach((track) => track.stop());
  setState({ share: null, watchers: [], ...(reason ? { error: reason } : {}) });
  if (!silent) announceShare();
}

// ---------- estatisticas ----------
async function readStats(pc, bytes) {
  const report = await pc.getStats();
  let rtp = null;
  let pair = null;
  report.forEach((item) => {
    if (item.type === "inbound-rtp" && item.kind === "video") rtp = item;
    if (item.type === "candidate-pair" && (item.nominated || item.selected) && item.state === "succeeded") pair = item;
  });
  if (!rtp) return null;
  const now = performance.now();
  const kbps = bytes.at && rtp.bytesReceived >= bytes.value ? Math.round(((rtp.bytesReceived - bytes.value) * 8) / (now - bytes.at)) : 0;
  bytes.value = rtp.bytesReceived;
  bytes.at = now;
  return {
    fps: Math.round(rtp.framesPerSecond || 0),
    width: rtp.frameWidth || 0,
    height: rtp.frameHeight || 0,
    kbps,
    pingMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null
  };
}

function ensureStats() {
  if (statsTimer) return;
  statsTimer = setInterval(async () => {
    if (state.phase === "lobby") {
      clearInterval(statsTimer);
      statsTimer = null;
      return;
    }
    for (const [id, peer] of incoming) {
      try {
        const stats = await readStats(peer.pc, peer.bytes);
        if (stats && incoming.get(id) === peer) patchStream(id, peer.pc.connectionState === "connected" ? { stats, status: "live" } : { stats });
      } catch {}
    }
    syncWatchers();
  }, 1000);
}

// ---------- atalho global e menu da bandeja ----------
async function toggleShareFromShortcut() {
  try {
    if (state.share) {
      await stopShare();
      api()?.notify?.("Você parou de compartilhar a tela.");
      return;
    }
    if (state.phase === "lobby") await enterRoom(DEFAULT_ROOM);
    if (state.phase !== "room") return;
    const prefs = readHostPrefs();
    const sources = await listScreenSources();
    const source = sources.find((item) => item.id === prefs.lastSourceId) || sources.find((item) => item.isScreen) || sources[0];
    if (!source) throw new Error("Não achei nenhuma tela para compartilhar.");
    await startShare({ sourceId: source.id, sourceName: source.name, isScreen: source.isScreen, quality: prefs.quality, shareAudio: prefs.shareAudio });
    api()?.notify?.(`Ao vivo na ${state.room?.name}: ${source.name}.`);
  } catch (error) {
    setState({ error: error.message });
    api()?.notify?.(error.message);
  }
}

function runCommand(command) {
  if (!command?.type) return;
  if (command.type === "toggle") toggleShareFromShortcut();
  else if (command.type === "stop-share") stopShare();
  else if (command.type === "leave") leaveRoom();
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
