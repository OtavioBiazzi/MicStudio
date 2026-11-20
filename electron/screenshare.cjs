// Compartilhar tela entre amigos na mesma rede (Radmin VPN, Hamachi, ZeroTier, Tailscale ou a rede de casa).
//
// Nao existe servidor nosso: quem transmite abre uma "sala" (um servidor HTTP pequeno nesta maquina) e quem assiste
// manda um pedido direto para o IP dele. O pedido leva a oferta WebRTC; quem transmite aceita ou recusa na tela e a
// resposta volta no mesmo pedido. Depois disso o video vai direto de um PC para o outro (WebRTC, sem passar por aqui).

const http = require("http");
const os = require("os");
const crypto = require("crypto");

const DEFAULT_PORT = 47920;
const PATH_PREFIX = "/vozlab/tela";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_PENDING = 3;
const DECISION_TIMEOUT_MS = 60_000;

function cleanText(value, max = 40) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function codesMatch(expected, given) {
  const a = Buffer.from(String(expected || "").trim().toUpperCase());
  const b = Buffer.from(String(given || "").trim().toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("pedido grande demais"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("pedido invalido"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

// room: { name, code, version, busy() } ; onJoinRequest({ id, name, offer, address }) -> Promise<{ accepted, answer?, reason? }>
function createRoomServer({ room, onJoinRequest, decisionTimeoutMs = DECISION_TIMEOUT_MS }) {
  const pending = new Map();

  const server = http.createServer(async (req, res) => {
    const url = (req.url || "").split("?")[0];
    try {
      if (req.method === "GET" && url === `${PATH_PREFIX}/sala`) {
        sendJson(res, 200, {
          app: "vozlab",
          name: room.name || "Sala",
          needsCode: Boolean(room.code),
          busy: Boolean(room.busy?.()),
          version: room.version || ""
        });
        return;
      }
      if (req.method === "POST" && url === `${PATH_PREFIX}/entrar`) {
        const body = await readJson(req);
        if (room.code && !codesMatch(room.code, body.code)) {
          sendJson(res, 403, { reason: "Código da sala errado." });
          return;
        }
        if (room.busy?.()) {
          sendJson(res, 409, { reason: "Já tem alguém assistindo essa sala." });
          return;
        }
        if (pending.size >= MAX_PENDING) {
          sendJson(res, 429, { reason: "Muitos pedidos ao mesmo tempo. Tente de novo em alguns segundos." });
          return;
        }
        const offer = body.offer;
        if (!offer || offer.type !== "offer" || typeof offer.sdp !== "string" || !offer.sdp.startsWith("v=")) {
          sendJson(res, 400, { reason: "Pedido sem a oferta de vídeo." });
          return;
        }
        const id = crypto.randomUUID();
        const request = { id, name: cleanText(body.name) || "Alguém", offer: { type: "offer", sdp: offer.sdp }, address: cleanText(req.socket.remoteAddress, 64).replace(/^::ffff:/, "") };
        let finished = false;
        const decision = new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ accepted: false, reason: "Quem está transmitindo não respondeu a tempo." }), decisionTimeoutMs);
          pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); } });
        });
        req.on("close", () => {
          if (!finished && !res.writableEnded) pending.get(id)?.resolve({ accepted: false, reason: "cancelado", cancelled: true });
        });
        Promise.resolve(onJoinRequest(request)).catch(() => pending.get(id)?.resolve({ accepted: false, reason: "Erro ao abrir o pedido." }));
        const result = await decision;
        finished = true;
        pending.delete(id);
        if (result.cancelled || res.writableEnded) return;
        if (result.accepted && result.answer?.sdp) sendJson(res, 200, { answer: { type: "answer", sdp: result.answer.sdp } });
        else sendJson(res, 403, { reason: result.reason || "Quem está transmitindo recusou." });
        return;
      }
      sendJson(res, 404, { reason: "não encontrado" });
    } catch (error) {
      if (!res.headersSent) sendJson(res, error.status || 500, { reason: error.message || "erro" });
    }
  });

  return {
    server,
    listen(port = DEFAULT_PORT, host = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address().port);
        });
      });
    },
    // Resposta de quem transmite para um pedido; false se o pedido ja tinha acabado.
    decide(id, decision) {
      const entry = pending.get(id);
      if (!entry) return false;
      entry.resolve(decision);
      return true;
    },
    pendingCount: () => pending.size,
    close() {
      for (const entry of pending.values()) entry.resolve({ accepted: false, reason: "A sala foi fechada." });
      pending.clear();
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }
  };
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

function request(host, port, method, pathName, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host, port, method, path: `${PATH_PREFIX}/${pathName}`, timeout: timeoutMs,
      headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {}
    }, (res) => {
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
    if (data) req.write(data);
    req.end();
  });
}

function friendlyNetworkError(error) {
  const code = error?.code || "";
  if (code === "ECONNREFUSED") return "Essa pessoa não está transmitindo agora.";
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH") return "Não consegui chegar nesse IP. Confira se vocês estão na mesma rede do Radmin.";
  return "Não consegui conectar nesse IP.";
}

async function probeRoom(host, port = DEFAULT_PORT, timeoutMs = 2500) {
  if (!isValidHost(host)) return { online: false, reason: "IP inválido." };
  try {
    const res = await request(String(host).trim(), port, "GET", "sala", null, timeoutMs);
    if (res.status !== 200 || res.body?.app !== "vozlab") return { online: false, reason: "Não é uma sala do VozLab." };
    return { online: true, name: cleanText(res.body.name) || "Sala", needsCode: Boolean(res.body.needsCode), busy: Boolean(res.body.busy) };
  } catch (error) {
    return { online: false, reason: friendlyNetworkError(error) };
  }
}

async function joinRoom({ host, port = DEFAULT_PORT, name, code, offer }, timeoutMs = DECISION_TIMEOUT_MS + 15_000) {
  if (!isValidHost(host)) throw new Error("IP inválido.");
  let res;
  try {
    res = await request(String(host).trim(), port, "POST", "entrar", { name: cleanText(name), code: cleanText(code, 24), offer }, timeoutMs);
  } catch (error) {
    throw new Error(friendlyNetworkError(error));
  }
  if (res.status === 200 && res.body?.answer?.sdp) return { type: "answer", sdp: res.body.answer.sdp };
  throw new Error(res.body?.reason || "Não deu para entrar na sala.");
}

module.exports = { DEFAULT_PORT, createRoomServer, localAddresses, probeRoom, joinRoom, isValidHost, codesMatch };
