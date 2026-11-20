const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const {
  createRoomHub, probeRoom, localAddresses, isValidHost, codesMatch, cleanRoomId, WS_PATH,
  broadcastAddresses, encodeBeacon, decodeBeacon, createBeacon, createDiscovery
} = require("../electron/screenshare.cjs");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openHub(room = {}, options = {}) {
  const hub = createRoomHub({ room: { id: "padrao", name: "Sala da galera", hostName: "Ana", ...room }, hostAddress: () => "26.1.1.1", ...options });
  const port = await hub.listen(0, "127.0.0.1");
  return { hub, port };
}

// Cliente de teste: guarda tudo o que chega e deixa esperar por um tipo de mensagem.
function connect(port, hello, { host = "127.0.0.1", headers } = {}) {
  const ws = new WebSocket(`ws://${host}:${port}${WS_PATH}`, { headers });
  const inbox = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    inbox.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.match(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  const next = (type, filter = () => true, timeout = 2000) => {
    const found = inbox.find((message) => message.t === type && filter(message) && !message.__seen);
    if (found) { found.__seen = true; return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`sem ${type}`)), timeout);
      waiters.push({ match: (m) => m.t === type && filter(m), resolve: (m) => { clearTimeout(timer); m.__seen = true; resolve(m); } });
    });
  };
  const closed = new Promise((resolve) => ws.on("close", (code) => resolve(code)));
  const opened = new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
  const client = {
    ws, inbox, next, closed,
    send: (message) => ws.send(JSON.stringify(message)),
    close: () => ws.close()
  };
  return opened.then(() => { if (hello) client.send({ t: "hello", ...hello }); return client; });
}

test("quem entra pelo proprio PC vira o host e recebe a sala", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "ana-1" });
    const welcome = await ana.next("welcome");
    assert.equal(welcome.room.name, "Sala da galera");
    assert.equal(welcome.members.length, 1);
    assert.equal(welcome.members[0].isHost, true);
    assert.equal(welcome.members[0].address, "26.1.1.1", "o host aparece com o IP da rede, nao 127.0.0.1");
    assert.equal(welcome.you, welcome.members[0].id);
    ana.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("todo mundo ve quem entra, quem sai e o chat", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "ana-1" });
    await ana.next("welcome");
    const bruno = await connect(port, { name: "Bruno", clientId: "bruno-1" });
    const welcome = await bruno.next("welcome");
    assert.deepEqual(welcome.members.map((m) => m.name), ["Ana", "Bruno"]);
    const joined = await ana.next("join");
    assert.equal(joined.member.name, "Bruno");
    assert.equal(joined.member.isHost, false, "so o primeiro do proprio PC e host");

    bruno.send({ t: "chat", text: "  salve  " });
    const atAna = await ana.next("chat");
    const atBruno = await bruno.next("chat");
    assert.equal(atAna.message.text, "salve");
    assert.equal(atAna.message.name, "Bruno");
    assert.equal(atBruno.message.id, atAna.message.id);

    // quem entra depois recebe o historico do chat
    const caio = await connect(port, { name: "Caio", clientId: "caio-1" });
    const late = await caio.next("welcome");
    assert.equal(late.chat.at(-1).text, "salve");

    bruno.close();
    const left = await ana.next("leave");
    assert.equal(left.id, joined.member.id);
    ana.close(); caio.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("ao vivo e sinalizacao do video passam so para quem deve", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    const anaId = (await ana.next("welcome")).you;
    const bruno = await connect(port, { name: "Bruno", clientId: "b" });
    const brunoId = (await bruno.next("welcome")).you;
    const caio = await connect(port, { name: "Caio", clientId: "c" });
    await caio.next("welcome");

    ana.send({ t: "state", live: { title: "Minecraft", quality: "fluida", audio: true, extra: "x" } });
    const update = await bruno.next("member", (m) => m.member.id === anaId);
    assert.deepEqual(update.member.live, { title: "Minecraft", quality: "fluida", audio: true });
    assert.equal(hub.summary().live, 1);

    bruno.send({ t: "signal", to: anaId, data: { kind: "watch" } });
    const signal = await ana.next("signal");
    assert.equal(signal.from, brunoId);
    assert.deepEqual(signal.data, { kind: "watch" });
    await wait(80);
    assert.equal(caio.inbox.some((m) => m.t === "signal"), false, "o sinal nao vaza para os outros");
    ana.close(); bruno.close(); caio.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("sala com senha barra quem nao sabe", async (t) => {
  assert.equal(codesMatch("K7QM", "k7qm"), true);
  assert.equal(codesMatch("K7QM", "XXXX"), false);
  // Quem vem de outro PC precisa da senha; para simular, conecta pelo IP de rede desta maquina (nao 127.0.0.1).
  const lan = localAddresses()[0]?.address;
  if (!lan) { t.skip("sem IP de rede nesta maquina"); return; }
  const hub = createRoomHub({ room: { id: "padrao", name: "Sala", password: "K7QM" }, hostAddress: () => lan });
  const port = await hub.listen(0, "0.0.0.0");
  try {
    const host = await connect(port, { name: "Ana", clientId: "a" });
    await host.next("welcome");
    const wrong = await connect(port, { name: "Bruno", clientId: "b", password: "nada" }, { host: lan });
    const error = await wrong.next("error");
    assert.equal(error.code, "password");
    const right = await connect(port, { name: "Bruno", clientId: "b", password: "k7qm" }, { host: lan });
    const welcome = await right.next("welcome");
    assert.equal(welcome.members.length, 2);
    assert.equal(welcome.members[1].address, lan);
    host.close(); right.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("so o host pode tirar alguem da sala", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    await ana.next("welcome");
    const bruno = await connect(port, { name: "Bruno", clientId: "b" });
    const brunoId = (await bruno.next("welcome")).you;
    const caio = await connect(port, { name: "Caio", clientId: "c" });
    const caioId = (await caio.next("welcome")).you;

    bruno.send({ t: "kick", id: caioId }); // Bruno nao e host: nada acontece
    await wait(100);
    assert.equal(hub.members().length, 3);

    ana.send({ t: "kick", id: brunoId });
    const kicked = await bruno.next("kicked");
    assert.match(kicked.reason, /Ana tirou você/);
    const left = await caio.next("leave");
    assert.equal(left.id, brunoId);
    assert.equal(left.kicked, true);
    ana.close(); caio.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("a mesma pessoa reconectando nao fica duplicada", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    await ana.next("welcome");
    const first = await connect(port, { name: "Bruno", clientId: "b" });
    const oldId = (await first.next("welcome")).you;
    const second = await connect(port, { name: "Bruno", clientId: "b" });
    await second.next("welcome");
    const left = await ana.next("leave", (m) => m.id === oldId);
    assert.equal(left.replaced, true);
    assert.deepEqual(hub.members().map((m) => m.name), ["Ana", "Bruno"]);
    ana.close(); second.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("quando o host sai, o mais antigo assume a sala", async () => {
  const { hub, port } = await openHub();
  const ana = await connect(port, { name: "Ana", clientId: "a" });
  await ana.next("welcome");
  const bruno = await connect(port, { name: "Bruno", clientId: "b" });
  const brunoId = (await bruno.next("welcome")).you;
  const caio = await connect(port, { name: "Caio", clientId: "c" });
  await caio.next("welcome");
  await hub.close();
  const closing = await caio.next("closing");
  assert.equal(closing.nextId, brunoId);
  assert.equal(closing.nextAddress, "26.1.1.1", "quem assume e achado pelo IP dele na rede");
  await bruno.closed;
});

test("sala cheia recusa", async () => {
  const { hub, port } = await openHub({}, { maxMembers: 1 });
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    await ana.next("welcome");
    const bruno = await connect(port, { name: "Bruno", clientId: "b" });
    const error = await bruno.next("error");
    assert.equal(error.code, "full");
    ana.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("a sala responde quem e pelo IP", async () => {
  const { hub, port } = await openHub({ password: "x" });
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    await ana.next("welcome");
    const info = await probeRoom("127.0.0.1", port);
    assert.equal(info.online, true);
    assert.equal(info.roomId, "padrao");
    assert.equal(info.name, "Sala da galera");
    assert.equal(info.hasPassword, true);
    assert.equal(info.members, 1);
    assert.deepEqual(info.names, ["Ana"]);
    ana.close();
  } finally {
    await hub.close({ announce: false });
  }
  const off = await probeRoom("127.0.0.1", port);
  assert.equal(off.online, false);
  assert.match(off.reason, /Não tem sala aberta/);
});

test("IP invalido nem tenta conectar", async () => {
  assert.equal(isValidHost("26.10.20.30"), true);
  assert.equal(isValidHost("300.1.1.1"), false);
  assert.equal(isValidHost("http://26.1.1.1"), false);
  assert.equal((await probeRoom("a b c")).online, false);
  assert.equal(cleanRoomId("Sala Legal!"), "salalegal");
});

test("o IP do Radmin aparece primeiro", () => {
  const list = localAddresses({
    Ethernet: [{ family: "IPv4", address: "192.168.0.10", internal: false }],
    "Radmin VPN": [{ family: "IPv4", address: "26.55.66.77", internal: false }],
    Loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }]
  });
  assert.deepEqual(list.map((item) => [item.address, item.kind]), [["26.55.66.77", "Radmin VPN"], ["192.168.0.10", "Rede local"]]);
});

test("o aviso da sala na rede vai e volta sem perder nada", () => {
  const decoded = decodeBeacon(encodeBeacon({ port: 47920, roomId: "padrao", name: "Sala da galera", hostName: "Ana", hasPassword: false, members: 2, live: 1, since: 5, names: ["Ana", "Bruno"] }));
  assert.deepEqual(decoded, { port: 47920, roomId: "padrao", name: "Sala da galera", hostName: "Ana", hasPassword: false, members: 2, live: 1, since: 5, names: ["Ana", "Bruno"] });
  assert.equal(decodeBeacon(Buffer.from("qualquer outra coisa")), null);
  assert.equal(decodeBeacon(Buffer.from("VOZLAB-SALA2 {quebrado")), null);
  assert.equal(decodeBeacon(Buffer.from('VOZLAB-SALA2 {"name":"sem id"}')), null);
});

test("endereco de broadcast de cada rede", () => {
  const list = broadcastAddresses({
    "Radmin VPN": [{ family: "IPv4", address: "26.55.66.77", netmask: "255.0.0.0", internal: false }],
    Ethernet: [{ family: "IPv4", address: "192.168.0.10", netmask: "255.255.255.0", internal: false }],
    Loopback: [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", internal: true }]
  });
  assert.ok(list.includes("26.255.255.255"));
  assert.ok(list.includes("192.168.0.255"));
  assert.ok(!list.includes("127.255.255.255"));
});

test("a sala aparece sozinha para quem procura na rede", async () => {
  const port = 46000 + Math.floor(Math.random() * 900);
  let rooms = [];
  const discovery = createDiscovery((list) => { rooms = list; }, { port, ownAddresses: () => [] });
  await wait(150);
  const beacon = createBeacon(() => ({ port: 47920, roomId: "padrao", name: "Sala da galera", hostName: "Pedro", members: 1 }), { port, intervalMs: 100, targets: () => ["127.0.0.1"] });
  try {
    for (let i = 0; i < 30 && !rooms.length; i++) await wait(50);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].roomId, "padrao");
    assert.equal(rooms[0].hostName, "Pedro");
    assert.equal(rooms[0].host, "127.0.0.1");
    assert.equal(rooms[0].own, true, "a sala aberta neste PC vem marcada");
  } finally {
    beacon.stop();
    discovery.stop();
  }
});

const TINY_JPEG = "data:image/jpeg;base64," + Buffer.from("foto").toString("base64");
const TINY_MP3 = "data:audio/mpeg;base64," + Buffer.from("som").toString("base64");

test("o perfil de cada um aparece na sala e muda na hora", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a", profile: { avatar: TINY_JPEG, status: "Jogando Valorant", bio: "oi", readme: "# eu", color: "pink", lixo: "x" } });
    const welcome = await ana.next("welcome");
    assert.deepEqual(welcome.members[0].profile, { avatar: TINY_JPEG, avatarPosition: 50, status: "Jogando Valorant", bio: "oi", readme: "# eu", color: "pink" });
    const bruno = await connect(port, { name: "Bruno", clientId: "b", profile: { avatar: "javascript:alert(1)", color: "nao-existe" } });
    const seen = await bruno.next("welcome");
    const brunoProfile = seen.members.find((m) => m.name === "Bruno").profile;
    assert.equal(brunoProfile.avatar, "", "foto que nao e imagem e descartada");
    assert.equal(brunoProfile.color, "violet");
    ana.send({ t: "profile", profile: { status: "Ausente", color: "gold" } });
    const update = await bruno.next("member", (m) => m.member.name === "Ana");
    assert.equal(update.member.profile.status, "Ausente");
    assert.equal(update.member.profile.color, "gold");
    ana.close(); bruno.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("imagem e som no chat chegam para todos; arquivo invalido e barrado", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    await ana.next("welcome");
    const bruno = await connect(port, { name: "Bruno", clientId: "b" });
    await bruno.next("welcome");
    ana.send({ t: "chat", text: "olha", attachment: { kind: "image", name: "print.jpg", data: TINY_JPEG, width: 10, height: 5 } });
    const image = await bruno.next("chat");
    assert.equal(image.message.attachment.kind, "image");
    assert.equal(image.message.attachment.data, TINY_JPEG);
    assert.equal(image.message.text, "olha");
    ana.send({ t: "chat", attachment: { kind: "sound", name: "risada", data: TINY_MP3, duration: 2.5 } });
    const sound = await bruno.next("chat", (m) => m.message.attachment?.kind === "sound");
    assert.equal(sound.message.attachment.name, "risada");
    assert.equal(sound.message.attachment.duration, 2.5);
    ana.send({ t: "chat", attachment: { kind: "image", data: "data:text/html;base64,PGI+" } });
    ana.send({ t: "chat", attachment: { kind: "sound", data: TINY_JPEG } });
    await wait(120);
    assert.equal(bruno.inbox.filter((m) => m.t === "chat").length, 2, "arquivos que nao sao imagem/som nao passam");
    // quem entra depois ve o historico com os anexos
    const caio = await connect(port, { name: "Caio", clientId: "c" });
    const late = await caio.next("welcome");
    assert.equal(late.chat.filter((m) => m.attachment).length, 2);
    ana.close(); bruno.close(); caio.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("reacoes vao para todos e emoji estranho nao passa", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    const anaId = (await ana.next("welcome")).you;
    const bruno = await connect(port, { name: "Bruno", clientId: "b" });
    await bruno.next("welcome");
    ana.send({ t: "react", emoji: "🔥" });
    const reaction = await bruno.next("react");
    assert.equal(reaction.emoji, "🔥");
    assert.equal(reaction.from, anaId);
    await wait(300);
    ana.send({ t: "react", emoji: "<script>" });
    await wait(120);
    assert.equal(bruno.inbox.filter((m) => m.t === "react").length, 1);
    ana.close(); bruno.close();
  } finally {
    await hub.close({ announce: false });
  }
});

test("som de entrada toca para quem ja esta na sala", async () => {
  const { hub, port } = await openHub();
  try {
    const ana = await connect(port, { name: "Ana", clientId: "a" });
    await ana.next("welcome");
    const bruno = await connect(port, { name: "Bruno", clientId: "b", entrySound: { name: "tchan", data: TINY_MP3 } });
    const brunoId = (await bruno.next("welcome")).you;
    const entry = await ana.next("entry");
    assert.equal(entry.from, brunoId);
    assert.equal(entry.sound.name, "tchan");
    const joined = ana.inbox.find((m) => m.t === "join");
    assert.equal(joined.member.hasEntrySound, true);
    assert.equal("entrySound" in joined.member, false, "o arquivo do som nao vai junto na lista de membros");
    ana.close(); bruno.close();
  } finally {
    await hub.close({ announce: false });
  }
});
