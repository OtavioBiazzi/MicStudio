const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRoomServer, probeRoom, joinRoom, localAddresses, isValidHost, codesMatch,
  broadcastAddresses, encodeBeacon, decodeBeacon, createBeacon, createDiscovery
} = require("../electron/screenshare.cjs");

const OFFER = { type: "offer", sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n" };

async function openRoom(options = {}) {
  const room = { name: "Sala do Teste", code: "", version: "9.9.9", maxViewers: 4, busy: () => false, viewers: () => 1, ...options.room };
  const handle = createRoomServer({
    room,
    decisionTimeoutMs: options.decisionTimeoutMs ?? 2000,
    onJoinRequest: options.onJoinRequest || (() => {})
  });
  const port = await handle.listen(0, "127.0.0.1");
  return { handle, port };
}

test("a sala responde quem e e se pede codigo", async () => {
  const { handle, port } = await openRoom({ room: { code: "ABCD" } });
  try {
    const info = await probeRoom("127.0.0.1", port);
    assert.deepEqual(info, { online: true, name: "Sala do Teste", needsCode: true, busy: false, viewers: 1, maxViewers: 4 });
  } finally {
    await handle.close();
  }
});

test("pedido aceito devolve a resposta de video para quem assiste", async () => {
  let seen;
  const { handle, port } = await openRoom({
    onJoinRequest: (request) => {
      seen = request;
      setTimeout(() => handle.decide(request.id, { accepted: true, answer: { type: "answer", sdp: "v=0\r\nresposta" } }), 20);
    }
  });
  try {
    const answer = await joinRoom({ host: "127.0.0.1", port, name: "Amigo\u0007", code: "", clientId: "abc-123", offer: OFFER });
    assert.deepEqual(answer, { type: "answer", sdp: "v=0\r\nresposta" });
    assert.equal(seen.name, "Amigo", "caracteres de controle no nome sao removidos");
    assert.equal(seen.offer.sdp, OFFER.sdp);
    assert.equal(seen.clientId, "abc-123", "o id do amigo chega para quem transmite (reconexao e amigos de confianca)");
    assert.equal(handle.pendingCount(), 0);
  } finally {
    await handle.close();
  }
});

test("pedido recusado chega com o motivo", async () => {
  const { handle, port } = await openRoom({
    onJoinRequest: (request) => handle.decide(request.id, { accepted: false, reason: "Agora não." })
  });
  try {
    await assert.rejects(joinRoom({ host: "127.0.0.1", port, name: "A", offer: OFFER }), /Agora não\./);
  } finally {
    await handle.close();
  }
});

test("codigo errado nem chega em quem transmite", async () => {
  let asked = false;
  const { handle, port } = await openRoom({ room: { code: "K7QM" }, onJoinRequest: () => { asked = true; } });
  try {
    await assert.rejects(joinRoom({ host: "127.0.0.1", port, name: "A", code: "XXXX", offer: OFFER }), /Código da sala errado/);
    assert.equal(asked, false);
  } finally {
    await handle.close();
  }
});

test("codigo certo passa, sem diferenca de maiuscula", async () => {
  const { handle, port } = await openRoom({
    room: { code: "K7QM" },
    onJoinRequest: (request) => handle.decide(request.id, { accepted: true, answer: { sdp: "v=0\r\nok" } })
  });
  try {
    const answer = await joinRoom({ host: "127.0.0.1", port, name: "A", code: "k7qm", offer: OFFER });
    assert.equal(answer.sdp, "v=0\r\nok");
  } finally {
    await handle.close();
  }
});

test("sala ocupada recusa na hora", async () => {
  const { handle, port } = await openRoom({ room: { busy: () => true } });
  try {
    await assert.rejects(joinRoom({ host: "127.0.0.1", port, name: "A", offer: OFFER }), /A sala está cheia/);
    assert.equal((await probeRoom("127.0.0.1", port)).busy, true);
  } finally {
    await handle.close();
  }
});

test("sem resposta de quem transmite o pedido expira", async () => {
  const { handle, port } = await openRoom({ decisionTimeoutMs: 100 });
  try {
    await assert.rejects(joinRoom({ host: "127.0.0.1", port, name: "A", offer: OFFER }), /não respondeu a tempo/);
    assert.equal(handle.pendingCount(), 0);
  } finally {
    await handle.close();
  }
});

test("pedido sem oferta de video e recusado", async () => {
  const { handle, port } = await openRoom();
  try {
    await assert.rejects(joinRoom({ host: "127.0.0.1", port, name: "A", offer: { type: "offer", sdp: "lixo" } }), /oferta de vídeo/);
  } finally {
    await handle.close();
  }
});

test("fechar a sala libera quem estava esperando", async () => {
  const { handle, port } = await openRoom({ onJoinRequest: () => setTimeout(() => handle.close(), 30) });
  await assert.rejects(joinRoom({ host: "127.0.0.1", port, name: "A", offer: OFFER }), /fechada|conectar|transmitindo/);
});

test("ninguem transmitindo vira mensagem simples", async () => {
  const { handle, port } = await openRoom();
  await handle.close();
  const info = await probeRoom("127.0.0.1", port);
  assert.equal(info.online, false);
  assert.match(info.reason, /não está transmitindo/);
});

test("IP invalido nem tenta conectar", async () => {
  assert.equal(isValidHost("26.10.20.30"), true);
  assert.equal(isValidHost("meu-pc.local"), true);
  assert.equal(isValidHost("300.1.1.1"), false);
  assert.equal(isValidHost("http://26.1.1.1"), false);
  assert.equal(isValidHost(""), false);
  assert.equal((await probeRoom("a b c")).online, false);
});

test("o IP do Radmin aparece primeiro", () => {
  const list = localAddresses({
    Ethernet: [{ family: "IPv4", address: "192.168.0.10", internal: false }],
    "Radmin VPN": [{ family: "IPv4", address: "26.55.66.77", internal: false }],
    Loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
    Wifi6: [{ family: "IPv6", address: "fe80::1", internal: false }]
  });
  assert.deepEqual(list.map((item) => [item.address, item.kind]), [["26.55.66.77", "Radmin VPN"], ["192.168.0.10", "Rede local"]]);
});

test("comparacao de codigo", () => {
  assert.equal(codesMatch("ABCD", "abcd"), true);
  assert.equal(codesMatch("ABCD", "ABC"), false);
  assert.equal(codesMatch("ABCD", undefined), false);
});

test("o aviso da sala na rede vai e volta sem perder nada", () => {
  const decoded = decodeBeacon(encodeBeacon({ name: "Pedro", port: 47920, needsCode: true, viewers: 2, maxViewers: 4 }));
  assert.deepEqual(decoded, { name: "Pedro", port: 47920, needsCode: true, viewers: 2, maxViewers: 4 });
  assert.equal(decodeBeacon(Buffer.from("qualquer outra coisa")), null);
  assert.equal(decodeBeacon(Buffer.from("VOZLAB-SALA1 {quebrado")), null);
});

test("endereco de broadcast de cada rede", () => {
  const list = broadcastAddresses({
    "Radmin VPN": [{ family: "IPv4", address: "26.55.66.77", netmask: "255.0.0.0", internal: false }],
    Ethernet: [{ family: "IPv4", address: "192.168.0.10", netmask: "255.255.255.0", internal: false }],
    Loopback: [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", internal: true }]
  });
  assert.ok(list.includes("26.255.255.255"));
  assert.ok(list.includes("192.168.0.255"));
  assert.ok(list.includes("255.255.255.255"));
  assert.ok(!list.includes("127.255.255.255"));
});

test("a sala aparece sozinha para quem procura na rede", async () => {
  const port = 47000 + Math.floor(Math.random() * 900);
  let rooms = [];
  const discovery = createDiscovery((list) => { rooms = list; }, { port, ownAddresses: () => [] });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const beacon = createBeacon(() => ({ name: "Sala do Pedro", port: 47920, needsCode: false, viewers: 1, maxViewers: 4 }), { port, intervalMs: 100, targets: () => ["127.0.0.1"] });
  try {
    for (let i = 0; i < 30 && !rooms.length; i++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].host, "127.0.0.1");
    assert.equal(rooms[0].name, "Sala do Pedro");
    assert.equal(rooms[0].viewers, 1);
  } finally {
    beacon.stop();
    discovery.stop();
  }
});

test("a propria sala nao aparece na lista", async () => {
  const port = 47000 + Math.floor(Math.random() * 900);
  let rooms = [];
  let calls = 0;
  const discovery = createDiscovery((list) => { rooms = list; calls += 1; }, { port, ownAddresses: () => ["127.0.0.1"] });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const beacon = createBeacon(() => ({ name: "Eu", port: 47920 }), { port, intervalMs: 100, targets: () => ["127.0.0.1"] });
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(rooms.length, 0);
    assert.equal(calls, 0);
  } finally {
    beacon.stop();
    discovery.stop();
  }
});
