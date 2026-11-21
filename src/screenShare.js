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

// Qualidade igual a do Discord: resolucao + quadros por segundo.
export const RESOLUTIONS = [
  { id: "720", label: "720p", width: 1280, height: 720, bitrate: 2_500_000 },
  { id: "1080", label: "1080p", width: 1920, height: 1080, bitrate: 5_000_000 },
  { id: "1440", label: "1440p", width: 2560, height: 1440, bitrate: 9_000_000 },
  { id: "source", label: "Original", width: 3840, height: 2160, bitrate: 14_000_000 }
];
export const FRAME_RATES = [15, 30, 60];
export const AUDIO_MODES = {
  none: { id: "none", label: "Sem som" },
  app: { id: "app", label: "Som do app" },
  system: { id: "system", label: "Som do PC" }
};

export function streamPreset(resolution = "1080", fps = 30) {
  const res = RESOLUTIONS.find((item) => item.id === resolution) || RESOLUTIONS[1];
  const rate = FRAME_RATES.includes(Number(fps)) ? Number(fps) : 30;
  const bitrate = Math.round(res.bitrate * Math.pow(rate / 30, 0.7));
  return { ...res, resolution: res.id, fps: rate, bitrate, label: `${res.label} · ${rate} fps` };
}

export const DEFAULT_ROOM = { id: "padrao", name: "Sala da galera" };
export const MAX_WATCHERS = 6;
export const REACTIONS = ["🔥", "😂", "👏", "😮", "💀", "❤️", "🤡", "👀"];
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 180;
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
  share: null, // { stream, sourceId, sourceName, isScreen, resolution, fps, audioMode, hasAudio, audioSources, label }
  watchers: [], // ids de quem esta assistindo a minha tela
  streams: {}, // memberId -> { status, stream, stats, hasAudio }
  focus: "",
  reconnecting: false,
  reactions: [],
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
let localProfile = { name: "", status: "", bio: "", readme: "", avatar: "", avatarPosition: 50, avatarCrop: null, banner: null, theme: null, color: "violet", stats: null, showStats: false };
let preparedMedia = { avatarKey: "", avatar: "", bannerKey: "", banner: "" };

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
  if (localProfile.name.trim()) return localProfile.name.trim();
  try { return (localStorage.getItem("micfudiddo.profileName") || "").trim() || "Amigo"; } catch { return "Amigo"; }
}

export function readHostPrefs() {
  const saved = readJson(HOST_PREFS_KEY, {});
  const oldQuality = { leve: ["720", 30], normal: ["1080", 30], fluida: ["1080", 60] }[saved.quality];
  return {
    resolution: RESOLUTIONS.some((item) => item.id === saved.resolution) ? saved.resolution : oldQuality?.[0] || "1080",
    fps: FRAME_RATES.includes(Number(saved.fps)) ? Number(saved.fps) : oldQuality?.[1] || 30,
    audioMode: AUDIO_MODES[saved.audioMode] ? saved.audioMode : "system",
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
  return Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 1; // ate 1000%
}

export function saveVolume(key, value) {
  const all = readJson(VOLUMES_KEY, {});
  writeJson(VOLUMES_KEY, { ...(all && typeof all === "object" ? all : {}), [key]: Math.min(10, Math.max(0, Number(value) || 0)) });
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

export async function listScreenSources(options = {}) {
  return (await api()?.sources?.(options)) || [];
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
    ws.onopen = () => ws.send(JSON.stringify({
      t: "hello", name: who.name, clientId: who.clientId, password: password || "",
      profile: publicProfile()
    }));
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
    case "react":
      addReaction(message.from, message.emoji);
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


// ---------- perfil ----------
function publicProfile() {
  return {
    avatar: preparedMedia.avatar,
    avatarPosition: localProfile.avatarPosition,
    avatarCrop: localProfile.avatarCrop || null,
    banner: preparedMedia.banner ? { data: preparedMedia.banner, crop: localProfile.banner?.crop || null } : null,
    theme: localProfile.theme || null,
    status: localProfile.status,
    bio: localProfile.bio,
    readme: localProfile.readme,
    color: localProfile.color,
    stats: localProfile.showStats && localProfile.stats ? localProfile.stats : null
  };
}

async function fileToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    reader.readAsDataURL(blob);
  });
}

function fileUrl(filePath) {
  if (/^(file|data|blob|https?):/i.test(String(filePath))) return String(filePath);
  return "file:///" + String(filePath).replace(/\\/g, "/");
}

const AUDIO_TYPES = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm", flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4", opus: "audio/ogg" };

async function readSoundFile(filePath, maxBytes) {
  const response = await fetch(fileUrl(filePath));
  if (!response.ok) throw new Error("Não achei o arquivo desse som.");
  const blob = await response.blob();
  if (blob.size > maxBytes) throw new Error(`Esse som é grande demais (máximo ${Math.round(maxBytes / 1024 / 1024 * 10) / 10} MB).`);
  const ext = String(filePath).split(".").pop().toLowerCase();
  const type = blob.type && blob.type.startsWith("audio/") ? blob.type : AUDIO_TYPES[ext] || "audio/mpeg";
  return fileToDataUrl(new Blob([blob], { type }));
}

// A foto e a faixa vao para os amigos como data URL. Imagens paradas grandes sao reduzidas; GIF vai inteiro se couber
// (senao vai so o primeiro quadro). Isso tambem conserta fotos antigas gigantes que a sala recusava.
async function prepareMedia(src, { maxSide, maxGifBytes, maxStaticBytes }) {
  if (!src) return "";
  try {
    const response = await fetch(fileUrl(src));
    const blob = await response.blob();
    const isGif = blob.type === "image/gif" || /\.gif($|\?)/i.test(src) || String(src).startsWith("data:image/gif");
    if (isGif && blob.size <= maxGifBytes) return fileToDataUrl(new Blob([blob], { type: "image/gif" }));
    if (!isGif && blob.size <= maxStaticBytes && /^image\/(jpeg|png|webp)$/.test(blob.type)) return fileToDataUrl(blob);
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.88);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return "";
  }
}

// Chamado pelo app sempre que voce muda o perfil. Na sala, os outros veem na hora.
export async function setLocalProfile(profile) {
  const before = JSON.stringify(publicProfile());
  localProfile = { ...localProfile, ...profile };
  const avatarKey = String(localProfile.avatar || "");
  if (avatarKey !== preparedMedia.avatarKey) {
    preparedMedia.avatarKey = avatarKey;
    const prepared = await prepareMedia(avatarKey, { maxSide: 512, maxGifBytes: 1000 * 1024, maxStaticBytes: 300 * 1024 });
    if (preparedMedia.avatarKey === avatarKey) preparedMedia.avatar = prepared;
  }
  const bannerKey = String(localProfile.banner?.src || "");
  if (bannerKey !== preparedMedia.bannerKey) {
    preparedMedia.bannerKey = bannerKey;
    const prepared = await prepareMedia(bannerKey, { maxSide: 1280, maxGifBytes: 2500 * 1024, maxStaticBytes: 600 * 1024 });
    if (preparedMedia.bannerKey === bannerKey) preparedMedia.banner = prepared;
  }
  const after = JSON.stringify(publicProfile());
  if (before !== after && state.phase === "room") send({ t: "profile", profile: publicProfile() });
}

// ---------- reacoes ----------
export function react(emoji) {
  if (REACTIONS.includes(emoji)) send({ t: "react", emoji });
}

function addReaction(from, emoji) {
  if (!REACTIONS.includes(emoji)) return;
  const id = `${Date.now()}-${Math.random()}`;
  const member = memberById(from);
  const reaction = { id, emoji, name: member?.name || "", x: 8 + Math.random() * 84 };
  setState((current) => ({ reactions: [...current.reactions.slice(-24), reaction] }));
  setTimeout(() => setState((current) => ({ reactions: current.reactions.filter((item) => item.id !== id) })), 2800);
}

// ---------- anexos do chat ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não consegui abrir essa imagem."));
    image.src = src;
  });
}

async function prepareImage(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Escolha uma imagem (PNG, JPG, WEBP ou GIF).");
  if (file.type === "image/gif") {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("GIF grande demais (máximo 6 MB).");
    const data = await fileToDataUrl(file);
    const image = await loadImage(data);
    return { data, width: image.naturalWidth, height: image.naturalHeight };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    // PNG pequeno continua PNG (prints ficam nitidos); o resto vira JPEG leve.
    let data = file.type === "image/png" && file.size < 1.5 * 1024 * 1024 ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.86);
    if (data.length * 0.75 > MAX_ATTACHMENT_BYTES) data = canvas.toDataURL("image/jpeg", 0.7);
    return { data, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sendImage(file, text = "") {
  if (state.phase !== "room") throw new Error("Entre numa sala primeiro.");
  const { data, width, height } = await prepareImage(file);
  send({ t: "chat", text: String(text || "").slice(0, 500), attachment: { kind: "image", name: file.name || "imagem", data, width, height } });
}

// Som do soundboard no chat: o backend converte para um MP3 leve de ate 3 minutos (WAVs grandes cabem).
export async function sendSound(sound, call) {
  if (state.phase !== "room") throw new Error("Entre numa sala primeiro.");
  if (!sound?.path) throw new Error("Esse som não tem arquivo.");
  let filePath = sound.path;
  let duration = Number(sound.duration) || 0;
  let trimmed = false;
  if (call && sound.id) {
    try {
      const prepared = await call("/api/sounds/chat-export", { id: sound.id });
      if (prepared?.path) {
        filePath = prepared.path;
        duration = Number(prepared.duration) || duration;
        trimmed = Boolean(prepared.trimmed);
      }
    } catch {
      // backend antigo ou falha na conversao: tenta mandar o arquivo original
    }
  }
  const data = await readSoundFile(filePath, MAX_ATTACHMENT_BYTES);
  send({ t: "chat", text: "", attachment: { kind: "sound", name: sound.name || "som", data, duration: Math.min(duration, MAX_VOICE_SECONDS) } });
  return { trimmed };
}

function audioDuration(src) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (value) => { audio.src = ""; resolve(value); };
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) done(audio.duration);
      else {
        // webm gravado no navegador nao traz a duracao: pula para o fim para descobrir.
        audio.currentTime = 1e7;
        audio.ontimeupdate = () => { audio.ontimeupdate = null; done(audio.duration || 0); };
      }
    };
    audio.onerror = () => done(0);
    setTimeout(() => done(0), 4000);
    audio.src = src;
  });
}

// Audio gravado na hora (mensagem de voz) ou arquivo de audio do PC: ate 3 minutos.
export async function sendAudioBlob(blob, { name = "audio", voice = false, duration = 0 } = {}) {
  if (state.phase !== "room") throw new Error("Entre numa sala primeiro.");
  if (!blob?.type?.startsWith("audio/") && !voice) throw new Error("Escolha um arquivo de áudio.");
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error("Áudio grande demais (máximo 6 MB). Use MP3, OGG ou M4A.");
  const data = await fileToDataUrl(blob.type ? blob : new Blob([blob], { type: "audio/webm" }));
  const seconds = duration || (await audioDuration(data));
  if (seconds > MAX_VOICE_SECONDS + 1) throw new Error("Áudio longo demais (máximo 3 minutos).");
  send({ t: "chat", text: "", attachment: { kind: "sound", name, data, duration: seconds, voice } });
}

export async function saveSoundToDisk(attachment) {
  if (!attachment?.data) throw new Error("Esse som não está mais disponível.");
  return api().saveSound({ name: attachment.name, data: attachment.data });
}

export async function saveImageToDisk(attachment) {
  if (!attachment?.data) throw new Error("Essa imagem não está mais disponível.");
  return api().saveImage({ name: attachment.name, data: attachment.data });
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
    await applyEncoding(peer.videoSender, streamPreset(share.resolution, share.fps));
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

async function applyEncoding(sender, preset = streamPreset()) {
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

async function captureVideo(sourceId, preset) {
  const video = {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      maxWidth: preset.width,
      maxHeight: preset.height,
      maxFrameRate: preset.fps,
      minFrameRate: Math.min(15, preset.fps)
    }
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  } catch {
    throw new Error("Não consegui capturar essa tela. Escolha outra ou tente de novo.");
  }
  const track = stream.getVideoTracks()[0];
  if (track) track.contentHint = preset.fps >= 60 ? "motion" : "detail";
  return stream;
}

// Recebe o PCM do VozLabAudioTap (processo principal) e vira uma faixa de audio para o WebRTC.
const TAP_WORKLET = `
class VozLabTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 48000 * 2;
    this.buf = new Float32Array(this.size);
    this.r = 0; this.w = 0; this.n = 0; this.primed = false;
    this.port.onmessage = (event) => {
      const samples = new Int16Array(event.data);
      for (let i = 0; i < samples.length; i++) {
        this.buf[this.w] = samples[i] / 32768;
        this.w = (this.w + 1) % this.size;
        if (this.n < this.size) this.n++; else this.r = (this.r + 1) % this.size;
      }
      const tooMuch = 48000 * 2 * 0.25;
      if (this.n > tooMuch) {
        let drop = this.n - Math.round(48000 * 2 * 0.06);
        drop -= drop % 2;
        this.r = (this.r + drop) % this.size;
        this.n -= drop;
      }
    };
  }
  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    if (!this.primed) {
      if (this.n >= 48000 * 2 * 0.06) this.primed = true;
      else { left.fill(0); right.fill(0); return true; }
    }
    for (let i = 0; i < left.length; i++) {
      if (this.n >= 2) {
        left[i] = this.buf[this.r]; this.r = (this.r + 1) % this.size;
        right[i] = this.buf[this.r]; this.r = (this.r + 1) % this.size;
        this.n -= 2;
      } else {
        left[i] = 0; right[i] = 0; this.primed = false;
      }
    }
    return true;
  }
}
registerProcessor("vozlab-tap", VozLabTap);
`;

let tapSession = null;

function stopTapAudio() {
  const session = tapSession;
  tapSession = null;
  if (!session) return;
  session.removeData?.();
  session.removeEvent?.();
  try { session.track?.stop(); } catch {}
  try { session.ctx.close(); } catch {}
  api()?.audioStop?.();
}

async function startTapAudio(mode, sourceId) {
  stopTapAudio();
  if (!api()?.audioStart) return { track: null, reason: "O som separado só funciona no app instalado." };
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  const moduleUrl = URL.createObjectURL(new Blob([TAP_WORKLET], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  const node = new AudioWorkletNode(ctx, "vozlab-tap", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  const dest = ctx.createMediaStreamDestination();
  node.connect(dest);
  const session = { ctx, node, track: dest.stream.getAudioTracks()[0], leftover: null };
  let settle;
  const outcome = new Promise((resolve) => { settle = resolve; });
  session.removeData = api().onAudioData((chunk) => {
    let bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    if (session.leftover) {
      const joined = new Uint8Array(session.leftover.length + bytes.length);
      joined.set(session.leftover);
      joined.set(bytes, session.leftover.length);
      bytes = joined;
      session.leftover = null;
    }
    const even = bytes.length - (bytes.length % 2);
    if (even < bytes.length) session.leftover = bytes.slice(even);
    if (!even) return;
    const copy = bytes.slice(0, even).buffer;
    node.port.postMessage(copy, [copy]);
  });
  session.removeEvent = api().onAudioEvent((message) => {
    if (!message) return;
    if (message.type === "ready") settle({ ok: true });
    else if (message.type === "error") settle({ ok: false, reason: message.message || "Não deu para pegar o som." });
    else if (message.type === "sources") {
      session.sources = message.names || [];
      if (state.share && tapSession === session) setState({ share: { ...state.share, audioSources: session.sources } });
    }
    else if (message.type === "exit" && tapSession === session) {
      settle({ ok: false, reason: "O ajudante de som fechou." });
      if (state.share?.hasAudio) systemNotice("O som da sua transmissão parou. Troque a tela para tentar de novo.");
    }
  });
  tapSession = session;
  const started = await api().audioStart({ mode, sourceId });
  if (!started?.ok) {
    stopTapAudio();
    return { track: null, reason: started?.reason || "Não deu para pegar o som." };
  }
  const result = await Promise.race([outcome, sleep(4000).then(() => ({ ok: true }))]);
  if (!result.ok) {
    stopTapAudio();
    return { track: null, reason: result.reason };
  }
  return { track: session.track };
}

function announceShare() {
  const share = state.share;
  send({ t: "state", live: share ? { title: share.sourceName, quality: share.label, audio: share.hasAudio } : null });
}

function watchTrackEnd(stream) {
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (state.share?.stream === stream) stopShare({ reason: "A janela que você estava compartilhando foi fechada." });
  });
}

// Compartilhar a tela na sala (ou trocar a tela/qualidade/som sem derrubar quem esta assistindo).
// audioMode: "none" | "app" (so o app da janela) | "system" (PC inteiro). Discord e VozLab nunca vao junto.
export async function startShare({ sourceId, sourceName, isScreen = true, resolution = "1080", fps = 30, audioMode = "none" }) {
  if (state.phase !== "room") throw new Error("Entre numa sala primeiro.");
  const preset = streamPreset(resolution, fps);
  const mode = audioMode === "app" && isScreen ? "system" : AUDIO_MODES[audioMode] ? audioMode : "none";
  const videoStream = await captureVideo(sourceId, preset);
  if (state.phase !== "room") {
    videoStream.getTracks().forEach((track) => track.stop());
    return;
  }
  let audio = null;
  let audioProblem = "";
  if (mode !== "none") {
    const tap = await startTapAudio(mode, sourceId);
    audio = tap.track;
    audioProblem = tap.reason || "";
  } else {
    stopTapAudio();
  }
  const video = videoStream.getVideoTracks()[0] || null;
  const stream = new MediaStream([video, ...(audio ? [audio] : [])].filter(Boolean));
  const old = state.share?.stream;
  for (const peer of outgoing.values()) {
    try { await peer.videoSender?.replaceTrack(video); } catch {}
    try { await peer.audioSender?.replaceTrack(audio); } catch {}
    await applyEncoding(peer.videoSender, preset);
  }
  watchTrackEnd(stream);
  old?.getVideoTracks().forEach((track) => track.stop());
  saveHostPrefs({ resolution: preset.resolution, fps: preset.fps, audioMode: mode === "system" && audioMode === "app" ? "app" : mode, lastSourceId: sourceId });
  setState({
    share: {
      stream, sourceId, sourceName, isScreen, resolution: preset.resolution, fps: preset.fps, label: preset.label,
      audioMode: mode, hasAudio: Boolean(audio), audioSources: audio ? tapSession?.sources || [] : []
    }
  });
  announceShare();
  if (audioProblem) systemNotice(`${audioProblem} Compartilhando só a imagem.`);
  ensureStats();
}

export async function stopShare({ silent = false, reason = "" } = {}) {
  const share = state.share;
  if (!share) return;
  for (const id of [...outgoing.keys()]) closeOutgoing(id, { notify: true });
  stopTapAudio();
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
    await startShare({ sourceId: source.id, sourceName: source.name, isScreen: source.isScreen, resolution: prefs.resolution, fps: prefs.fps, audioMode: source.isScreen && prefs.audioMode === "app" ? "system" : prefs.audioMode });
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
