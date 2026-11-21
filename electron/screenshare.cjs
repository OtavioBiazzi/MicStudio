// Salas de compartilhar tela, no estilo do Discord, entre amigos na mesma rede (Radmin VPN, Hamachi, ZeroTier,
// Tailscale ou a rede de casa). Nao existe servidor nosso: quem entra primeiro numa sala vira o host e este processo
// abre um "hub" pequeno (HTTP + WebSocket). Todos, inclusive o proprio host, conversam pelo hub: lista de quem esta
// na sala, chat, quem esta ao vivo e a sinalizacao WebRTC. O video vai direto de um PC para o outro.
//
// A sala e anunciada na rede por broadcast UDP; quem esta na aba ve as salas sozinho.

const http = require("http");
const dgram = require("dgram");
const os = require("os");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const DEFAULT_PORT = 47920;
const DISCOVERY_PORT = 47921;
const PATH_PREFIX = "/vozlab";
const WS_PATH = `${PATH_PREFIX}/ws`;
const BEACON_PREFIX = "VOZLAB-SALA2 ";
const BEACON_INTERVAL_MS = 2000;
const ROOM_EXPIRE_MS = 7000;
const MAX_MESSAGE_BYTES = 11 * 1024 * 1024; // cabe uma imagem ou um audio de ate ~7,5 MB
const MAX_ATTACHMENT_CHARS = 10.5 * 1024 * 1024; // base64
const MAX_AVATAR_CHARS = 1.4 * 1024 * 1024; // foto pode ser GIF animado (~1 MB)
const MAX_BANNER_CHARS = 3.4 * 1024 * 1024; // faixa pode ser GIF (~2,5 MB)
const MAX_ENTRY_SOUND_CHARS = 900 * 1024;
const HISTORY_MEDIA_BUDGET = 40 * 1024 * 1024; // o historico do chat guarda no maximo isso em anexos
const REACTIONS = ["🔥", "😂", "👏", "😮", "💀", "❤️", "🤡", "👀"];
const PROFILE_COLORS = ["violet", "pink", "teal", "orange", "blue", "green", "red", "gold"];
const HELLO_TIMEOUT_MS = 6000;
const PING_INTERVAL_MS = 15000;
const CHAT_HISTORY = 60;

function cleanText(value, max = 40) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function codesMatch(expected, given) {
  const a = Buffer.from(String(expected || "").trim().toUpperCase());
  const b = Buffer.from(String(given || "").trim().toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeAddress(address) {
  return String(address || "").replace(/^::ffff:/, "");
}

function isLoopback(address) {
  const value = normalizeAddress(address);
  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}

// Enderecos IPv4 desta maquina, com o do Radmin (26.x.x.x) primeiro.
function localAddresses(interfaces = os.networkInterfaces()) {
  const list = [];
  for (const [name, entries] of Object.entries(interfaces || {})) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" && entry.family !== 4) continue;
      if (entry.internal) continue;
      const lowerName = name.toLowerCase();
      const radmin = entry.address.startsWith("26.") || lowerName.includes("radmin");
      const kind = radmin ? "Radmin VPN"
        : lowerName.includes("hamachi") || entry.address.startsWith("25.") ? "Hamachi"
        : lowerName.includes("zerotier") ? "ZeroTier"
        : lowerName.includes("tailscale") || entry.address.startsWith("100.") ? "Tailscale"
        : "Rede local";
      list.push({ address: entry.address, interface: name, kind, vpn: kind !== "Rede local" });
    }
  }
  const rank = (item) => (item.kind === "Radmin VPN" ? 0 : item.vpn ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b));
}

function isValidHost(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 253) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return text.split(".").every((part) => Number(part) <= 255);
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(text);
}

function cleanRoomId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    clientId: member.clientId,
    address: member.address,
    joinedAt: member.joinedAt,
    isHost: member.isHost,
    live: member.live,
    profile: member.profile,
    hasEntrySound: Boolean(member.entrySound)
  };
}

function isDataUrl(value, prefixes, maxChars) {
  const text = String(value || "");
  return text.length <= maxChars && prefixes.some((prefix) => text.startsWith(prefix)) && /^data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+$/i.test(text);
}

// Perfil que cada um mostra na sala: so texto curto e uma foto pequena.
const IMAGE_PREFIXES = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,", "data:image/gif;base64,"];

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

// Ajuste de posicao (arrastar/zoom/girar) guardado para GIFs, que nao podem ser recortados sem perder a animacao.
function cleanCrop(value) {
  if (!value || typeof value !== "object") return null;
  return {
    x: clampNumber(value.x, -1, 1, 0),
    y: clampNumber(value.y, -1, 1, 0),
    zoom: clampNumber(value.zoom, 1, 6, 1),
    rotation: [0, 90, 180, 270].includes(Number(value.rotation)) ? Number(value.rotation) : 0
  };
}

function cleanColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "";
}

function cleanProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  const banner = profile.banner && typeof profile.banner === "object" ? profile.banner : null;
  const bannerImage = banner && isDataUrl(banner.data, IMAGE_PREFIXES, MAX_BANNER_CHARS) ? banner.data : "";
  const theme = profile.theme && typeof profile.theme === "object" ? profile.theme : null;
  const primary = cleanColor(theme?.primary);
  const accent = cleanColor(theme?.accent);
  return {
    avatar: isDataUrl(profile.avatar, IMAGE_PREFIXES, MAX_AVATAR_CHARS) ? profile.avatar : "",
    avatarPosition: clampNumber(profile.avatarPosition, 0, 100, 50),
    avatarCrop: cleanCrop(profile.avatarCrop),
    banner: bannerImage ? { data: bannerImage, crop: cleanCrop(banner.crop) } : null,
    theme: primary && accent ? { primary, accent } : null,
    status: cleanText(profile.status, 60),
    bio: cleanText(profile.bio, 120),
    readme: String(profile.readme ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, 4000),
    color: PROFILE_COLORS.includes(profile.color) ? profile.color : "violet",
    stats: cleanStats(profile.stats)
  };
}

const STAT_KEYS = ["sounds", "plays", "favoriteVoices", "favoriteSounds", "customVoices"];
function cleanStats(value) {
  if (!value || typeof value !== "object") return null;
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = Math.round(clampNumber(value[key], 0, 1e9, 0));
  return stats;
}

function cleanEntrySound(value) {
  if (!value || typeof value !== "object") return null;
  if (!isDataUrl(value.data, ["data:audio/"], MAX_ENTRY_SOUND_CHARS)) return null;
  return { name: cleanText(value.name, 60) || "Som", data: value.data };
}

function cleanAttachment(value) {
  if (!value || typeof value !== "object") return null;
  const kind = value.kind === "image" ? "image" : value.kind === "sound" ? "sound" : "";
  if (!kind) return null;
  const prefixes = kind === "image" ? ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,", "data:image/gif;base64,"] : ["data:audio/"];
  if (!isDataUrl(value.data, prefixes, MAX_ATTACHMENT_CHARS)) return null;
  const duration = Number(value.duration);
  return {
    kind,
    name: cleanText(value.name, 80) || (kind === "image" ? "imagem" : "som"),
    data: value.data,
    width: Number(value.width) || 0,
    height: Number(value.height) || 0,
    duration: Number.isFinite(duration) ? Math.max(0, Math.min(3600, duration)) : 0,
    voice: kind === "sound" && value.voice === true,
    size: Math.round(value.data.length * 0.75)
  };
}

function cleanLive(value) {
  if (!value || typeof value !== "object") return null;
  return {
    title: cleanText(value.title, 60) || "Tela",
    quality: cleanText(value.quality, 24),
    audio: Boolean(value.audio)
  };
}

// room: { id, name, password, hostName, since } ; hostAddress(): IP deste PC na rede (para os outros acharem o host)
function createRoomHub({ room, maxMembers = 10, hostAddress = () => localAddresses()[0]?.address || "", version = "" }) {
  const info = {
    id: cleanRoomId(room.id) || "sala",
    name: cleanText(room.name) || "Sala",
    password: String(room.password || "").slice(0, 32),
    hostName: cleanText(room.hostName) || "Host",
    since: Number(room.since) || Date.now()
  };
  const members = new Map();
  const chat = [];
  let closingSent = false;

  const list = () => [...members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const summary = () => ({
    roomId: info.id,
    name: info.name,
    hostName: info.hostName,
    hasPassword: Boolean(info.password),
    members: members.size,
    live: list().filter((member) => member.live).length,
    since: info.since,
    names: list().slice(0, 6).map((member) => member.name)
  });

  const send = (member, message) => {
    if (member?.ws?.readyState === 1) {
      try { member.ws.send(JSON.stringify(message)); } catch (_) {}
    }
  };
  const broadcast = (message, exceptId) => {
    for (const member of members.values()) if (member.id !== exceptId) send(member, message);
  };

  const server = http.createServer((req, res) => {
    const url = (req.url || "").split("?")[0];
    if (req.method === "GET" && url === `${PATH_PREFIX}/sala`) {
      sendJson(res, 200, { app: "vozlab", kind: "sala", version, ...summary() });
      return;
    }
    sendJson(res, 404, { reason: "não encontrado" });
  });

  const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: MAX_MESSAGE_BYTES });

  wss.on("connection", (ws, req) => {
    const remote = normalizeAddress(req.socket.remoteAddress);
    const local = isLoopback(remote);
    let member = null;
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    const helloTimer = setTimeout(() => { if (!member) ws.close(4000, "sem hello"); }, HELLO_TIMEOUT_MS);

    ws.on("message", (raw) => {
      let message;
      try { message = JSON.parse(raw.toString("utf8")); } catch { return; }
      if (!message || typeof message.t !== "string") return;

      if (!member) {
        if (message.t !== "hello") return;
        clearTimeout(helloTimer);
        if (info.password && !local && !codesMatch(info.password, message.password)) {
          ws.send(JSON.stringify({ t: "error", code: "password", reason: "Senha da sala errada." }));
          ws.close(4001, "senha");
          return;
        }
        const clientId = cleanText(message.clientId, 64);
        const previous = clientId ? list().find((item) => item.clientId === clientId) : null;
        if (previous) {
          // A mesma pessoa voltou (a conexao antiga caiu): a nova substitui sem duplicar.
          members.delete(previous.id);
          try { previous.ws.close(4002, "substituido"); } catch (_) {}
          broadcast({ t: "leave", id: previous.id, replaced: true });
        }
        if (members.size >= maxMembers) {
          ws.send(JSON.stringify({ t: "error", code: "full", reason: "A sala está cheia." }));
          ws.close(4003, "cheia");
          return;
        }
        const isHost = local && !list().some((item) => item.isHost);
        member = {
          id: crypto.randomUUID(),
          ws,
          name: cleanText(message.name) || "Amigo",
          clientId,
          address: local ? hostAddress() : remote,
          joinedAt: Date.now(),
          isHost,
          live: null,
          profile: cleanProfile(message.profile),
          entrySound: cleanEntrySound(message.entrySound)
        };
        members.set(member.id, member);
        send(member, {
          t: "welcome",
          you: member.id,
          room: { id: info.id, name: info.name, hasPassword: Boolean(info.password), since: info.since },
          members: list().map(publicMember),
          chat: chat.slice(-CHAT_HISTORY)
        });
        broadcast({ t: "join", member: publicMember(member) }, member.id);
        if (member.entrySound && !previous) broadcast({ t: "entry", from: member.id, sound: member.entrySound }, member.id);
        return;
      }

      switch (message.t) {
        case "chat": {
          const text = String(message.text ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, 500);
          const attachment = cleanAttachment(message.attachment);
          if (!text && !attachment) return;
          const entry = { id: crypto.randomUUID(), from: member.id, name: member.name, text, at: Date.now(), ...(attachment ? { attachment } : {}) };
          chat.push(entry);
          if (chat.length > CHAT_HISTORY) chat.shift();
          trimHistoryMedia();
          broadcast({ t: "chat", message: entry });
          return;
        }
        case "profile": {
          member.profile = cleanProfile(message.profile);
          if ("entrySound" in message) member.entrySound = cleanEntrySound(message.entrySound);
          broadcast({ t: "member", member: publicMember(member) });
          return;
        }
        case "react": {
          if (!REACTIONS.includes(message.emoji)) return;
          const now = Date.now();
          if (now - (member.lastReact || 0) < 250) return; // sem spam
          member.lastReact = now;
          broadcast({ t: "react", from: member.id, emoji: message.emoji });
          return;
        }
        case "state": {
          member.live = cleanLive(message.live);
          broadcast({ t: "member", member: publicMember(member) });
          return;
        }
        case "signal": {
          const target = members.get(String(message.to || ""));
          if (!target || target.id === member.id) return;
          send(target, { t: "signal", from: member.id, data: message.data });
          return;
        }
        case "kick": {
          if (!member.isHost) return;
          const target = members.get(String(message.id || ""));
          if (!target || target.id === member.id) return;
          send(target, { t: "kicked", reason: `${member.name} tirou você da sala.` });
          members.delete(target.id);
          try { target.ws.close(4004, "expulso"); } catch (_) {}
          broadcast({ t: "leave", id: target.id, kicked: true });
          return;
        }
        case "closing": {
          if (member.isHost) announceClosing();
          return;
        }
        case "moveto": {
          // Duas pessoas abriram a mesma sala ao mesmo tempo: o host desta manda todos para a outra.
          const address = normalizeAddress(message.address);
          if (member.isHost && isValidHost(address)) {
            closingSent = true;
            broadcast({ t: "moveto", address, port: Number(message.port) || DEFAULT_PORT });
          }
          return;
        }
        default:
      }
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (member && members.get(member.id) === member) {
        members.delete(member.id);
        broadcast({ t: "leave", id: member.id });
      }
    });
    ws.on("error", () => {});
  });

  const pingTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) { client.terminate(); continue; }
      client.isAlive = false;
      try { client.ping(); } catch (_) {}
    }
  }, PING_INTERVAL_MS);

  // Anexos antigos saem do historico (so o arquivo; a mensagem fica) para a memoria nao crescer sem fim.
  function trimHistoryMedia() {
    let total = 0;
    for (let i = chat.length - 1; i >= 0; i--) {
      const attachment = chat[i].attachment;
      if (!attachment?.data) continue;
      total += attachment.data.length;
      if (total > HISTORY_MEDIA_BUDGET) chat[i] = { ...chat[i], attachment: { ...attachment, data: "", expired: true } };
    }
  }

  // O host vai sair: avisa quem assume (o mais antigo na sala) para a sala continuar.
  function announceClosing() {
    if (closingSent) return;
    closingSent = true;
    const next = list().find((item) => !item.isHost);
    broadcast({ t: "closing", nextId: next?.id || "", nextAddress: next?.address || "" });
  }

  return {
    info,
    server,
    summary,
    members: () => list().map(publicMember),
    listen(port = DEFAULT_PORT, host = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address().port);
        });
      });
    },
    close({ announce = true } = {}) {
      if (announce) announceClosing();
      clearInterval(pingTimer);
      return new Promise((resolve) => {
        setTimeout(() => {
          for (const client of wss.clients) { try { client.close(1001, "sala fechada"); } catch (_) {} }
          wss.close(() => {});
          server.close(() => resolve());
          server.closeAllConnections?.();
        }, announce ? 120 : 0);
      });
    }
  };
}

// ---------- consultar uma sala pelo IP ----------
function request(host, port, pathName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, method: "GET", path: `${PATH_PREFIX}/${pathName}`, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

function friendlyNetworkError(error) {
  const code = error?.code || "";
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return "Não tem sala aberta nesse PC agora.";
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH") return "Não consegui chegar nesse IP. Confira se vocês estão na mesma rede do Radmin.";
  return "Não consegui conectar nesse IP.";
}

function roomFromBody(body) {
  return {
    roomId: cleanRoomId(body.roomId),
    name: cleanText(body.name) || "Sala",
    hostName: cleanText(body.hostName) || "",
    hasPassword: Boolean(body.hasPassword),
    members: Number(body.members) || 0,
    live: Number(body.live) || 0,
    since: Number(body.since) || 0,
    names: Array.isArray(body.names) ? body.names.slice(0, 6).map((name) => cleanText(name)).filter(Boolean) : []
  };
}

async function probeRoom(host, port = DEFAULT_PORT, timeoutMs = 2500) {
  if (!isValidHost(host)) return { online: false, reason: "IP inválido." };
  try {
    const res = await request(String(host).trim(), port, "sala", timeoutMs);
    if (res.status !== 200 || res.body?.app !== "vozlab" || res.body?.kind !== "sala") return { online: false, reason: "Não é uma sala do VozLab (ou é uma versão antiga)." };
    return { online: true, host: String(host).trim(), port, ...roomFromBody(res.body) };
  } catch (error) {
    return { online: false, reason: friendlyNetworkError(error) };
  }
}

// ---------- descoberta de salas na rede ----------
// O host avisa a rede (broadcast UDP) a cada 2 s; quem esta na aba escuta e mostra as salas.
// O Radmin VPN repassa broadcast como uma rede de casa, por isso a sala do amigo aparece sozinha.
function ipToInt(ip) {
  return ip.split(".").reduce((acc, part) => ((acc << 8) | (Number(part) & 255)) >>> 0, 0);
}

function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function broadcastAddresses(interfaces = os.networkInterfaces()) {
  const list = new Set(["255.255.255.255"]);
  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      if ((entry.family !== "IPv4" && entry.family !== 4) || entry.internal || !entry.netmask) continue;
      const ip = ipToInt(entry.address);
      const mask = ipToInt(entry.netmask);
      list.add(intToIp((ip | (~mask >>> 0)) >>> 0));
    }
  }
  return [...list];
}

function encodeBeacon(info) {
  return Buffer.from(BEACON_PREFIX + JSON.stringify({ port: Number(info.port) || DEFAULT_PORT, ...roomFromBody(info) }));
}

function decodeBeacon(buffer) {
  const text = buffer.toString("utf8");
  if (!text.startsWith(BEACON_PREFIX) || text.length > 4096) return null;
  try {
    const data = JSON.parse(text.slice(BEACON_PREFIX.length));
    const room = roomFromBody(data);
    if (!room.roomId) return null;
    return { port: Number.isInteger(data.port) && data.port > 0 && data.port < 65536 ? data.port : DEFAULT_PORT, ...room };
  } catch {
    return null;
  }
}

// getInfo() -> { port, roomId, name, hostName, hasPassword, members, live, since, names }
function createBeacon(getInfo, { port = DISCOVERY_PORT, intervalMs = BEACON_INTERVAL_MS, targets = broadcastAddresses } = {}) {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  let timer = null;
  let closed = false;
  socket.on("error", () => {});
  const send = () => {
    if (closed) return;
    const message = encodeBeacon(getInfo());
    for (const address of targets()) socket.send(message, port, address, () => {});
  };
  socket.bind(0, () => {
    try { socket.setBroadcast(true); } catch (_) {}
    send();
    timer = setInterval(send, intervalMs);
  });
  return {
    sendNow: send,
    stop() {
      closed = true;
      clearInterval(timer);
      try { socket.close(); } catch (_) {}
    }
  };
}

// onRooms(list) e chamado quando a lista muda. ownAddresses: IPs desta maquina (a propria sala vem marcada "own").
function createDiscovery(onRooms, { port = DISCOVERY_PORT, ownAddresses = () => localAddresses().map((item) => item.address), expireMs = ROOM_EXPIRE_MS } = {}) {
  const rooms = new Map();
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  let lastSignature = "";
  const current = () => [...rooms.values()].map(({ seenAt, ...room }) => room).sort((a, b) => a.name.localeCompare(b.name));
  const publish = () => {
    const now = Date.now();
    for (const [key, room] of rooms) if (now - room.seenAt > expireMs) rooms.delete(key);
    const list = current();
    const signature = JSON.stringify(list);
    if (signature !== lastSignature) {
      lastSignature = signature;
      onRooms(list);
    }
  };
  socket.on("error", () => {});
  socket.on("message", (buffer, rinfo) => {
    const info = decodeBeacon(buffer);
    if (!info) return;
    const host = normalizeAddress(rinfo.address);
    const own = ownAddresses().includes(host) || isLoopback(host);
    rooms.set(`${host}:${info.port}`, { host, own, ...info, seenAt: Date.now() });
    publish();
  });
  socket.bind(port, () => {});
  const timer = setInterval(publish, 1500);
  return {
    rooms: current,
    stop() {
      clearInterval(timer);
      try { socket.close(); } catch (_) {}
    }
  };
}

module.exports = {
  REACTIONS, PROFILE_COLORS, cleanProfile, cleanAttachment,
  DEFAULT_PORT, DISCOVERY_PORT, WS_PATH, createRoomHub, localAddresses, probeRoom, isValidHost, codesMatch, cleanRoomId,
  broadcastAddresses, encodeBeacon, decodeBeacon, createBeacon, createDiscovery
};
