import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Monitor, AppWindow, Broadcast, Copy, ArrowClockwise, X, CornersOut, SignOut, Lock, WifiHigh, WifiSlash, Trash,
  Info, StopCircle, SpeakerHigh, SpeakerSlash, SpeakerSimpleHigh, ArrowsLeftRight, Question, CaretDown, ArrowSquareOut,
  Users, Crown, Hash, PaperPlaneRight, Plus, Eye, EyeSlash, Screencast, ChatsCircle, UsersThree, SignIn
} from "@phosphor-icons/react";
import {
  SCREEN_QUALITIES, DEFAULT_ROOM, useScreenShare, isScreenShareAvailable, listScreenSources, listAddresses, enterRoom,
  leaveRoom, createRoomId, startDiscovery, stopDiscovery, probeRoom, readRecentHosts, forgetRecentHost, readHostPrefs,
  saveHostPrefs, startShare, stopShare, watch, unwatch, setFocus, sendChat, setChatVisible, kickMember, readVolume,
  saveVolume, clearScreenShareError, installScreenShareBridge
} from "../screenShare";

const RADMIN_URL = "https://www.radmin-vpn.com/br/";
const AVATAR_COLORS = ["#7c5cff", "#ff6b9d", "#2ec4b6", "#ff9f1c", "#4d96ff", "#e056fd", "#6ab04c", "#f0932b"];

function avatarColor(seed) {
  let hash = 0;
  for (const char of String(seed || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ name, seed, size = 32, live = false }) {
  return (
    <span className={`rmAvatar ${live ? "live" : ""}`} style={{ width: size, height: size, background: avatarColor(seed || name), fontSize: size * 0.42 }}>
      {String(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function copy(text, setToast) {
  const done = () => setToast?.("Copiado!");
  if (window.micfudiddo?.copyText) window.micfudiddo.copyText(text).then(done).catch(() => {});
  else navigator.clipboard?.writeText(text).then(done).catch(() => {});
}

function openRadmin() {
  if (window.micfudiddo?.openExternal) window.micfudiddo.openExternal(RADMIN_URL);
  else window.open(RADMIN_URL, "_blank", "noopener");
}

function VideoView({ stream, muted = true, volume = 1, className = "", onDoubleClick }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream || null;
    if (stream) video.play?.().catch(() => {});
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} onDoubleClick={onDoubleClick} />;
}

function statText(stats) {
  if (!stats) return "Conectando...";
  const parts = [];
  if (stats.width) parts.push(`${stats.width}×${stats.height}`);
  parts.push(`${stats.fps} fps`);
  if (stats.pingMs != null) parts.push(`${stats.pingMs} ms`);
  return parts.join(" · ");
}

// ---------- guia ----------
function Guide({ startOpen = false, onSeen }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section className={`ssCard ssGuide ${open ? "open" : ""}`}>
      <button className="ssGuideHead" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Question size={17} weight="fill" />
        <span>Como usar com os amigos (Radmin VPN)</span>
        <CaretDown size={14} className="ssGuideCaret" />
      </button>
      {open && (
        <>
          <ol className="ssSteps">
            <li><b>Todo mundo instala o Radmin VPN</b> (é grátis). <button className="ssLink inline" onClick={openRadmin}>Baixar <ArrowSquareOut size={12} /></button></li>
            <li><b>Um de vocês cria uma rede</b> no Radmin (Rede › Criar rede) e os outros entram com o nome e a senha dela.</li>
            <li>Todos clicam em <b>Entrar</b> na <b>Sala da galera</b>. Quem entrar primeiro abre a sala; os outros caem nela sozinhos.</li>
            <li>Lá dentro, clique em <b>Compartilhar tela</b>. Os amigos clicam em <b>Assistir</b> no seu nome.</li>
            <li>Na primeira vez o Windows pergunta sobre o firewall: marque <b>Redes públicas</b> também e clique em Permitir.</li>
          </ol>
          {onSeen && <button className="btn btn-ghost ssSmallBtn" onClick={() => { setOpen(false); onSeen(); }}>Entendi</button>}
        </>
      )}
    </section>
  );
}

// ---------- lobby ----------
function RoomCard({ title, subtitle, room, featured = false, onEnter, busy }) {
  const names = room?.names || [];
  const live = room?.live || 0;
  return (
    <div className={`rmRoomCard ${featured ? "featured" : ""} ${room ? "active" : ""}`}>
      <div className="rmRoomIcon">{featured ? <UsersThree size={26} weight="fill" /> : <Hash size={24} weight="bold" />}</div>
      <div className="rmRoomInfo">
        <div className="rmRoomTitle">
          <b>{title}</b>
          {room?.hasPassword && <Lock size={13} weight="fill" title="Pede senha" />}
          {live > 0 && <span className="rmLivePill"><span className="ssDot" /> {live} ao vivo</span>}
        </div>
        <small>{subtitle}</small>
        {names.length > 0 && (
          <div className="rmAvatarStack">
            {names.map((name, index) => <Avatar key={`${name}-${index}`} name={name} size={24} />)}
            <span>{names.join(", ")}</span>
          </div>
        )}
      </div>
      <button className="btn btn-primary rmEnterBtn" onClick={onEnter} disabled={busy}>
        <SignIn size={16} weight="bold" /> Entrar
      </button>
    </div>
  );
}

function RecentHost({ item, onEnter, onForget, busy }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    const check = () => probeRoom(item.host).then((result) => { if (alive) setStatus(result); }).catch(() => {});
    check();
    const timer = setInterval(check, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [item.host]);
  const online = status?.online;
  return (
    <div className={`ssRecent ${online ? "live" : ""}`}>
      <span className="ssRecentIcon">{online ? <WifiHigh size={18} weight="bold" /> : <WifiSlash size={18} />}</span>
      <div className="ssRequestText">
        <b>{online ? status.name : item.name || item.host}</b>
        <small>{item.host} · <span className="ssRecentState">{!status ? "Verificando..." : online ? `${status.members} na sala` : "Sem sala aberta"}</span></small>
      </div>
      <button className="ssIconBtn" onClick={() => onForget(item.host)} title="Esquecer" aria-label="Esquecer"><Trash size={15} /></button>
      <button className="btn btn-primary ssSmallBtn" disabled={busy || !online} onClick={() => onEnter(status)}>Entrar</button>
    </div>
  );
}

function PasswordPrompt({ room, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  return (
    <div className="modalOverlay" onClick={onCancel}>
      <form className="modalContent rmModal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (password.trim()) onSubmit(password.trim()); }}>
        <div className="rmModalHead"><Lock size={18} weight="fill" /> <b>{room.name}</b> pede senha</div>
        <label className="ssField">
          <span>Senha da sala</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} autoFocus maxLength={32} />
        </label>
        <div className="rmModalActions">
          <button type="button" className="btn btn-ghost ssSmallBtn" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary ssSmallBtn" disabled={!password.trim()}>Entrar</button>
        </div>
      </form>
    </div>
  );
}

function CreateRoomModal({ onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="modalOverlay" onClick={onCancel}>
      <form className="modalContent rmModal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim(), password.trim()); }}>
        <div className="rmModalHead"><Plus size={18} weight="bold" /> <b>Criar uma sala</b></div>
        <label className="ssField">
          <span>Nome da sala</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Minecraft da noite" maxLength={40} autoFocus />
        </label>
        <label className="ssField">
          <span>Senha (opcional)</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Deixe vazio para qualquer um da rede entrar" maxLength={32} />
        </label>
        <p className="ssMuted small">A sala aparece para todo mundo na mesma rede do Radmin enquanto tiver alguém dentro.</p>
        <div className="rmModalActions">
          <button type="button" className="btn btn-ghost ssSmallBtn" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary ssSmallBtn" disabled={!name.trim()}>Criar e entrar</button>
        </div>
      </form>
    </div>
  );
}

function Lobby({ share, setToast }) {
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [recents, setRecents] = useState(readRecentHosts);
  const [passwordFor, setPasswordFor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [prefs, setPrefs] = useState(readHostPrefs);

  useEffect(() => {
    startDiscovery();
    listAddresses().then(setAddresses).catch(() => {});
    return () => stopDiscovery();
  }, []);

  useEffect(() => {
    if (share.needsPassword) setPasswordFor(share.needsPassword);
  }, [share.needsPassword]);

  const go = async (options) => {
    setBusy(true);
    try {
      await enterRoom(options);
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setBusy(false);
      setRecents(readRecentHosts());
    }
  };

  const tryEnter = (options, hasPassword) => {
    if (hasPassword) setPasswordFor(options);
    else go(options);
  };

  const rooms = share.rooms || [];
  const defaultRoom = rooms.find((room) => room.roomId === DEFAULT_ROOM.id && !room.own) || rooms.find((room) => room.roomId === DEFAULT_ROOM.id);
  const otherRooms = rooms.filter((room) => room.roomId !== DEFAULT_ROOM.id);
  const main = addresses[0];
  const hasVpn = addresses.some((item) => item.vpn);

  const defaultSubtitle = defaultRoom
    ? `${defaultRoom.own ? "Aberta neste PC" : `Host: ${defaultRoom.hostName || defaultRoom.host}`} · ${defaultRoom.members} na sala`
    : "Vazia agora. Quem entrar primeiro abre a sala para todo mundo.";

  return (
    <div className="ssColumns">
      <div className="ssMain">
        {!prefs.guideSeen && <Guide startOpen onSeen={() => { saveHostPrefs({ guideSeen: true }); setPrefs(readHostPrefs()); }} />}
        <section className="ssCard">
          <div className="ssCardHead">
            <span className="ssLabel">Salas</span>
            <span className="ssScanning"><span className="ssScanDot" /> procurando na rede</span>
          </div>
          <RoomCard
            featured
            title={DEFAULT_ROOM.name}
            subtitle={defaultSubtitle}
            room={defaultRoom}
            busy={busy}
            onEnter={() => go({ roomId: DEFAULT_ROOM.id, name: DEFAULT_ROOM.name })}
          />
          {otherRooms.map((room) => (
            <RoomCard
              key={`${room.host}-${room.roomId}`}
              title={room.name}
              subtitle={`${room.own ? "Aberta neste PC" : `Host: ${room.hostName || room.host}`} · ${room.members} na sala`}
              room={room}
              busy={busy}
              onEnter={() => tryEnter({ roomId: room.roomId, name: room.name, host: room.own ? "127.0.0.1" : room.host, port: room.port }, room.hasPassword && !room.own)}
            />
          ))}
          <button className="rmCreateCard" onClick={() => setCreating(true)} disabled={busy}>
            <Plus size={18} weight="bold" /> Criar outra sala
          </button>
        </section>
        {prefs.guideSeen && <Guide />}
      </div>
      <aside className="ssSide">
        <section className="ssCard">
          <span className="ssLabel">Seu IP na rede</span>
          {main ? (
            <div className="ssIpRow">
              <div>
                <span className="ssIp">{main.address}</span>
                <span className="ssIpKind">{main.kind}</span>
              </div>
              <button className="btn btn-ghost ssSmallBtn" onClick={() => copy(main.address, setToast)}><Copy size={14} /> Copiar</button>
            </div>
          ) : <p className="ssMuted">Não achei nenhuma rede. Abra o Radmin VPN.</p>}
          {!hasVpn && addresses.length > 0 && (
            <div className="ssWarn"><Info size={15} /> Não achei o Radmin VPN. Ele precisa estar aberto e na mesma rede dos seus amigos.</div>
          )}
        </section>
        <section className="ssCard">
          <span className="ssLabel">A sala não apareceu?</span>
          <form className="ssJoinForm" onSubmit={(e) => { e.preventDefault(); if (ip.trim()) go({ host: ip.trim(), roomId: "", name: "" }); }}>
            <label className="ssField">
              <span>IP de quem está na sala</span>
              <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="Ex: 26.123.45.67" inputMode="decimal" disabled={busy} />
            </label>
            <button className="btn btn-primary ssBigBtn" type="submit" disabled={busy || !ip.trim()}><SignIn size={18} weight="bold" /> Entrar pelo IP</button>
          </form>
          {recents.length > 0 && (
            <div className="ssRecents">
              {recents.map((item) => (
                <RecentHost
                  key={item.host}
                  item={item}
                  busy={busy}
                  onEnter={(status) => tryEnter({ host: item.host, roomId: status.roomId, name: status.name }, status.hasPassword)}
                  onForget={(host) => { forgetRecentHost(host); setRecents(readRecentHosts()); }}
                />
              ))}
            </div>
          )}
        </section>
      </aside>
      {passwordFor && (
        <PasswordPrompt
          room={passwordFor}
          onCancel={() => { setPasswordFor(null); clearScreenShareError(); }}
          onSubmit={(password) => { const options = { ...passwordFor, password }; setPasswordFor(null); clearScreenShareError(); go(options); }}
        />
      )}
      {creating && (
        <CreateRoomModal
          onCancel={() => setCreating(false)}
          onCreate={(name, password) => { setCreating(false); go({ roomId: createRoomId(name), name, password }); }}
        />
      )}
    </div>
  );
}

// ---------- dentro da sala ----------
function useSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listScreenSources();
      setSources(list);
      return list;
    } catch {
      setSources([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);
  return { sources, loading, refresh };
}

function SharePicker({ current, onClose, setToast }) {
  const { sources, loading, refresh } = useSources();
  const prefs = readHostPrefs();
  const [selected, setSelected] = useState(null);
  const [quality, setQuality] = useState(current?.quality || prefs.quality);
  const [shareAudio, setShareAudio] = useState(current ? current.shareAudio : prefs.shareAudio);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh().then((list) => {
      setSelected(list.find((item) => item.id === current?.sourceId) || list.find((item) => item.id === prefs.lastSourceId) || list.find((item) => item.isScreen) || list[0] || null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await startShare({ sourceId: selected.id, sourceName: selected.name, isScreen: selected.isScreen, quality, shareAudio });
      onClose();
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  const screens = sources.filter((item) => item.isScreen);
  const windows = sources.filter((item) => !item.isScreen);
  const renderItem = (item) => (
    <button key={item.id} className={`ssSource ${selected?.id === item.id ? "on" : ""}`} onClick={() => setSelected(item)} title={item.name}>
      <span className="ssThumb">{item.thumbnail ? <img src={item.thumbnail} alt="" /> : item.isScreen ? <Monitor size={28} /> : <AppWindow size={28} />}</span>
      <span className="ssSourceName">{item.isScreen ? <Monitor size={13} /> : <AppWindow size={13} />}{item.name}</span>
    </button>
  );

  return (
    <div className="modalOverlay" onClick={() => !busy && onClose()}>
      <div className="modalContent rmPicker" onClick={(e) => e.stopPropagation()}>
        <div className="rmPickerHead">
          <span className="ttsHeadIcon"><Screencast size={20} weight="fill" /></span>
          <div className="ttsHeadText">
            <h3>{current ? "Trocar o que você compartilha" : "Compartilhar tela"}</h3>
            <p>Escolha uma tela inteira ou uma janela.</p>
          </div>
          <button className="ttsIconBtn" onClick={refresh} disabled={loading} title="Atualizar" aria-label="Atualizar"><ArrowClockwise size={17} /></button>
          <button className="ttsIconBtn" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="rmPickerBody">
          {loading && sources.length === 0 && <p className="ssMuted">Procurando telas e janelas...</p>}
          {screens.length > 0 && <><span className="ssSubLabel">Telas</span><div className="ssSources">{screens.map(renderItem)}</div></>}
          {windows.length > 0 && <><span className="ssSubLabel">Janelas abertas</span><div className="ssSources">{windows.map(renderItem)}</div></>}
          <div className="rmPickerOptions">
            <div>
              <span className="ssSubLabel">Qualidade</span>
              <div className="rmSegment">
                {Object.values(SCREEN_QUALITIES).map((item) => (
                  <button key={item.id} className={quality === item.id ? "on" : ""} onClick={() => setQuality(item.id)} title={item.hint}>
                    <b>{item.label}</b><small>{item.detail}</small>
                  </button>
                ))}
              </div>
            </div>
            <label className="ssToggleRow">
              <span>
                <b>{shareAudio ? <SpeakerHigh size={14} /> : <SpeakerSlash size={14} />} Mandar o som do PC</b>
                <small>Vai junto tudo o que toca no seu PC, inclusive o Discord. Em call, deixe desligado para não dar eco.</small>
              </span>
              <span className="toggleSwitch">
                <input type="checkbox" checked={shareAudio} onChange={(e) => setShareAudio(e.target.checked)} />
                <span className="toggleTrack" />
              </span>
            </label>
          </div>
        </div>
        <div className="ttsFoot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary ttsAct" onClick={go} disabled={!selected || busy}>
            <Broadcast size={16} weight="fill" /> {busy ? "Abrindo..." : current ? "Trocar" : "Ficar ao vivo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, me, isHostView, watching, onWatch }) {
  const isMe = member.id === me;
  return (
    <div className={`rmMember ${member.live ? "live" : ""} ${watching ? "watching" : ""}`}>
      <Avatar name={member.name} seed={member.clientId} size={34} live={Boolean(member.live)} />
      <div className="rmMemberText">
        <b>{member.name}{isMe && <em> (você)</em>}{member.isHost && <Crown size={13} weight="fill" className="rmCrown" title="Host da sala" />}</b>
        <small>{member.live ? member.live.title : member.isHost ? "Host da sala" : "Na sala"}</small>
      </div>
      {member.live && !isMe && (
        <button className={`rmLiveBtn ${watching ? "on" : ""}`} onClick={() => onWatch(member.id)} title={watching ? "Parar de assistir" : "Assistir"}>
          {watching ? <EyeSlash size={14} /> : <Eye size={14} />} {watching ? "Parar" : "Assistir"}
        </button>
      )}
      {member.live && isMe && <span className="rmLivePill small"><span className="ssDot" /> AO VIVO</span>}
      {isHostView && !isMe && (
        <button className="ssIconBtn rmKick" onClick={() => kickMember(member.id)} title="Tirar da sala" aria-label={`Tirar ${member.name} da sala`}><X size={14} /></button>
      )}
    </div>
  );
}

function StreamTile({ member, stream, focused, onFocus, own = false, watchers = 0 }) {
  const tileRef = useRef(null);
  const volumeKey = member.clientId || member.id;
  const [volume, setVolume] = useState(() => readVolume(volumeKey));
  const [muted, setMuted] = useState(false);
  const fullscreen = () => {
    const el = tileRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };
  const changeVolume = (value) => {
    setVolume(value);
    setMuted(false);
    saveVolume(volumeKey, value);
  };
  const status = own ? "live" : stream?.status;
  return (
    <div ref={tileRef} className={`rmTile ${focused ? "focused" : ""}`} onClick={() => !focused && onFocus(member.id)}>
      {(own ? stream?.stream : stream?.stream) && <VideoView stream={stream.stream} className="rmVideo" muted={own || muted || !member.live?.audio} volume={volume} onDoubleClick={fullscreen} />}
      {status === "connecting" && <div className="rmTileWait"><span className="ssSpinner" /> Abrindo a tela de {member.name}...</div>}
      {status === "error" && <div className="rmTileWait error">{stream.error}</div>}
      <div className="rmTileBar" onClick={(e) => e.stopPropagation()}>
        <span className="rmTileName">
          <span className="rmLivePill small"><span className="ssDot" /> AO VIVO</span>
          <b>{own ? "Você" : member.name}</b>
          <small>{own ? `${watchers} assistindo` : statText(stream?.stats)}</small>
        </span>
        {!own && member.live?.audio && (
          <span className="ssVolume">
            <button className="ssIconBtn light" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ligar o som" : "Tirar o som"}>
              {muted || volume === 0 ? <SpeakerSlash size={16} /> : <SpeakerSimpleHigh size={16} />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" style={{ "--fill": `${(muted ? 0 : volume) * 100}%` }} />
          </span>
        )}
        <button className="ssIconBtn light" onClick={fullscreen} title="Tela cheia (ou clique duas vezes)" aria-label="Tela cheia"><CornersOut size={17} /></button>
        {!own && <button className="ssIconBtn light" onClick={() => unwatch(member.id)} title="Parar de assistir" aria-label="Parar de assistir"><X size={16} /></button>}
      </div>
    </div>
  );
}

function Stage({ share, setToast, onShare }) {
  const me = share.me;
  const members = share.members;
  const watchedIds = Object.keys(share.streams);
  const liveOthers = members.filter((member) => member.live && member.id !== me);
  const notWatched = liveOthers.filter((member) => !share.streams[member.id]);
  const tiles = [
    ...watchedIds.map((id) => members.find((member) => member.id === id)).filter(Boolean).map((member) => ({ member, stream: share.streams[member.id], own: false })),
    ...(share.share ? [{ member: members.find((member) => member.id === me) || { id: me, name: "Você" }, stream: { stream: share.share.stream, hasAudio: false, status: "live" }, own: true }] : [])
  ];
  const focusId = tiles.some((tile) => tile.member.id === share.focus) ? share.focus : tiles[0]?.member.id;
  const focused = tiles.find((tile) => tile.member.id === focusId);
  const others = tiles.filter((tile) => tile !== focused);

  return (
    <div className="rmStage">
      {tiles.length === 0 ? (
        <div className="rmEmpty">
          <Screencast size={46} weight="duotone" />
          {liveOthers.length > 0 ? (
            <>
              <b>{liveOthers.length === 1 ? `${liveOthers[0].name} está ao vivo` : `${liveOthers.length} pessoas ao vivo`}</b>
              <div className="rmLiveCards">
                {liveOthers.map((member) => (
                  <button key={member.id} className="rmLiveCard" onClick={() => watch(member.id)}>
                    <Avatar name={member.name} seed={member.clientId} size={40} live />
                    <span><b>{member.name}</b><small>{member.live.title}{member.live.audio ? " · com som" : ""}</small></span>
                    <span className="rmLiveCardBtn"><Eye size={15} /> Assistir</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <b>Ninguém está compartilhando a tela</b>
              <small>Clique em <b>Compartilhar tela</b> para mostrar a sua. Quem estiver na sala vê você ao vivo.</small>
              <button className="btn btn-primary rmShareCta" onClick={onShare}><Broadcast size={17} weight="fill" /> Compartilhar tela</button>
            </>
          )}
        </div>
      ) : (
        <>
          {focused && <StreamTile key={`f-${focused.member.id}`} member={focused.member} stream={focused.stream} own={focused.own} focused watchers={share.watchers.length} onFocus={setFocus} />}
          {(others.length > 0 || notWatched.length > 0) && (
            <div className="rmStrip">
              {others.map((tile) => (
                <StreamTile key={`s-${tile.member.id}`} member={tile.member} stream={tile.stream} own={tile.own} watchers={share.watchers.length} onFocus={setFocus} />
              ))}
              {notWatched.map((member) => (
                <button key={`n-${member.id}`} className="rmStripLive" onClick={() => watch(member.id)}>
                  <Avatar name={member.name} seed={member.clientId} size={30} live />
                  <span><b>{member.name}</b><small>{member.live.title}</small></span>
                  <Eye size={15} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChatPanel({ share }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  useEffect(() => {
    setChatVisible(true);
    return () => setChatVisible(false);
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [share.chat.length]);
  const membersById = useMemo(() => new Map(share.members.map((member) => [member.id, member])), [share.members]);
  return (
    <aside className="rmChat">
      <div className="rmColHead"><ChatsCircle size={15} weight="fill" /> Chat da sala</div>
      <div className="rmChatList" ref={listRef}>
        {share.chat.length === 0 && <p className="ssMuted small rmChatEmpty">Ninguém falou nada ainda.</p>}
        {share.chat.map((message) => message.system ? (
          <div key={message.id} className="rmChatSystem">{message.text}</div>
        ) : (
          <div key={message.id} className={`rmChatMsg ${message.from === share.me ? "mine" : ""}`}>
            <Avatar name={message.name} seed={membersById.get(message.from)?.clientId || message.name} size={26} />
            <div>
              <span className="rmChatMeta"><b>{message.name}</b> <time>{new Date(message.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></span>
              <p>{message.text}</p>
            </div>
          </div>
        ))}
      </div>
      <form className="rmChatInput" onSubmit={(e) => { e.preventDefault(); sendChat(text); setText(""); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Conversar na ${share.room?.name || "sala"}`} maxLength={500} />
        <button type="submit" className="ssIconBtn" disabled={!text.trim()} aria-label="Enviar"><PaperPlaneRight size={17} weight="fill" /></button>
      </form>
    </aside>
  );
}

function RoomView({ share, setToast }) {
  const [picker, setPicker] = useState(false);
  const room = share.room;
  const meMember = share.members.find((member) => member.id === share.me);
  const hostMember = share.members.find((member) => member.isHost);
  const inviteIp = hostMember?.address || room.host;
  const live = share.members.filter((member) => member.live);
  const idle = share.members.filter((member) => !member.live);

  useEffect(() => {
    // Na sala a descoberta continua ligada: se dois PCs abriram a mesma sala ao mesmo tempo, elas se juntam sozinhas.
    startDiscovery();
    return () => stopDiscovery();
  }, []);

  const toggleWatch = (id) => (share.streams[id] ? unwatch(id) : watch(id));

  return (
    <div className="rmRoom">
      <header className="rmTop">
        <div className="rmTopTitle">
          <Hash size={20} weight="bold" />
          <b>{room.name}</b>
          {hostMember && <span className="rmHostTag"><Crown size={12} weight="fill" /> {hostMember.id === share.me ? "Você é o host" : `Host: ${hostMember.name}`}</span>}
          {share.reconnecting && <span className="rmReconnecting"><span className="ssSpinner tiny" /> Reconectando...</span>}
        </div>
        {inviteIp && inviteIp !== "127.0.0.1" && (
          <button className="rmInvite" onClick={() => copy(inviteIp, setToast)} title="Copiar o IP para quem não vê a sala sozinho">
            <Copy size={13} /> {inviteIp}
          </button>
        )}
        <button className="btn ssStopBtn" onClick={() => leaveRoom()}><SignOut size={15} /> Sair da sala</button>
      </header>

      <div className="rmBody">
        <aside className="rmMembers">
          {live.length > 0 && (
            <>
              <div className="rmColHead">Ao vivo — {live.length}</div>
              {live.map((member) => (
                <MemberRow key={member.id} member={member} me={share.me} isHostView={room.isHost} watching={Boolean(share.streams[member.id])} onWatch={toggleWatch} />
              ))}
            </>
          )}
          <div className="rmColHead"><Users size={13} /> Na sala — {idle.length}</div>
          {idle.map((member) => (
            <MemberRow key={member.id} member={member} me={share.me} isHostView={room.isHost} watching={false} onWatch={toggleWatch} />
          ))}
        </aside>

        <div className="rmCenter">
          <Stage share={share} setToast={setToast} onShare={() => setPicker(true)} />
          <div className="rmControls">
            {share.share ? (
              <>
                <span className="rmLiveInfo">
                  <span className="rmLivePill"><span className="ssDot" /> AO VIVO</span>
                  <b>{share.share.sourceName}</b>
                  <small>{SCREEN_QUALITIES[share.share.quality]?.label} · {share.watchers.length} assistindo{share.share.hasAudio ? " · com som" : ""}</small>
                </span>
                <button className="btn btn-ghost ssSmallBtn" onClick={() => setPicker(true)}><ArrowsLeftRight size={15} /> Trocar</button>
                <button className="btn ssStopBtn" onClick={() => stopShare()}><StopCircle size={16} weight="fill" /> Parar de compartilhar</button>
              </>
            ) : (
              <>
                <span className="rmLiveInfo"><b>{meMember?.name || "Você"}</b><small>{share.members.length} {share.members.length === 1 ? "pessoa" : "pessoas"} na sala</small></span>
                <button className="btn btn-primary rmShareBtn" onClick={() => setPicker(true)}><Screencast size={18} weight="fill" /> Compartilhar tela</button>
              </>
            )}
          </div>
        </div>

        <ChatPanel share={share} />
      </div>

      {picker && <SharePicker current={share.share} onClose={() => setPicker(false)} setToast={setToast} />}
    </div>
  );
}

export function ScreenSharePage({ setToast }) {
  const share = useScreenShare();
  const available = isScreenShareAvailable();

  if (!available) {
    return (
      <div className="ssPage">
        <header className="ssHeader"><div><h1>Salas</h1><p>Compartilhe a tela com os amigos pelo Radmin VPN.</p></div></header>
        <section className="ssCard"><p className="ssMuted">As salas só funcionam no app instalado (não no navegador).</p></section>
      </div>
    );
  }

  if (share.phase === "room" && share.room) return <RoomView share={share} setToast={setToast} />;

  return (
    <div className="ssPage">
      <header className="ssHeader">
        <div>
          <h1>Salas</h1>
          <p>Igual a uma call do Discord, mas só para compartilhar a tela: entre na sala e quem quiser mostra a tela para os outros.</p>
        </div>
      </header>
      {share.phase === "joining" ? (
        <section className="ssCard rmJoining">
          <span className="ssSpinner" />
          <b>{share.joiningText || "Entrando..."}</b>
          <button className="btn btn-ghost ssSmallBtn" onClick={() => leaveRoom()}>Cancelar</button>
        </section>
      ) : (
        <Lobby share={share} setToast={setToast} />
      )}
    </div>
  );
}

// Fica sempre montado: liga o atalho global e o menu da bandeja, mostra os avisos e, fora da aba, um atalho de volta.
export function ScreenShareFloating({ page, setPage, setToast }) {
  const share = useScreenShare();

  useEffect(() => installScreenShareBridge(), []);
  useEffect(() => {
    if (share.error) {
      setToast?.(share.error);
      clearScreenShareError();
    }
  }, [share.error, setToast]);

  if (page === "tela" || share.phase === "lobby") return null;
  const liveCount = share.members.filter((member) => member.live).length;
  return (
    <div className="ssFloat">
      {share.share ? <span className="ssDot" /> : <UsersThree size={18} weight="fill" />}
      <button className="ssFloatMain" onClick={() => setPage("tela")}>
        {share.phase === "joining" ? "Entrando na sala..." : `${share.room?.name} · ${share.members.length} ${share.members.length === 1 ? "pessoa" : "pessoas"}${liveCount ? ` · ${liveCount} ao vivo` : ""}`}
      </button>
      {share.unread > 0 && <span className="rmUnread">{share.unread}</span>}
      <button className="ssIconBtn" onClick={() => leaveRoom()} title="Sair da sala" aria-label="Sair da sala"><SignOut size={16} /></button>
    </div>
  );
}
