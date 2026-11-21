import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Monitor, AppWindow, Broadcast, Copy, ArrowClockwise, X, CornersOut, SignOut, Lock, WifiHigh, WifiSlash, Trash,
  Info, StopCircle, SpeakerHigh, SpeakerSlash, SpeakerSimpleHigh, ArrowsLeftRight, Question, CaretDown, ArrowSquareOut,
  Users, Crown, Hash, PaperPlaneRight, Plus, Eye, EyeSlash, Screencast, ChatsCircle, UsersThree, SignIn,
  Play, Stop, Check, DownloadSimple, MusicNotes, MagnifyingGlass, ImageSquare, PlusCircle, Microphone, FileAudio,
  PictureInPicture, UserCircle
} from "@phosphor-icons/react";
import { ProfileCard, ProfilePhoto } from "./ProfileCard";
import {
  RESOLUTIONS, FRAME_RATES, MAX_VOICE_SECONDS, DEFAULT_ROOM, useScreenShare, isScreenShareAvailable, listScreenSources, listAddresses, enterRoom,
  leaveRoom, createRoomId, startDiscovery, stopDiscovery, probeRoom, readRecentHosts, forgetRecentHost, readHostPrefs,
  saveHostPrefs, startShare, stopShare, watch, unwatch, setFocus, sendChat, setChatVisible, kickMember, readVolume,
  saveVolume, clearScreenShareError, installScreenShareBridge, REACTIONS, react, sendImage, sendSound, saveSoundToDisk,
  saveImageToDisk, sendAudioBlob
} from "../screenShare";

const RADMIN_URL = "https://www.radmin-vpn.com/br/";
const AVATAR_COLORS = ["#7c5cff", "#ff6b9d", "#2ec4b6", "#ff9f1c", "#4d96ff", "#e056fd", "#6ab04c", "#f0932b"];

function avatarColor(seed) {
  let hash = 0;
  for (const char of String(seed || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ name, seed, size = 32, live = false, profile = null }) {
  if (profile) return <ProfilePhoto image={profile.avatar} position={profile.avatarPosition} crop={profile.avatarCrop} name={name} color={profile.color} size={size} live={live} />;
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
// Lista de telas e apps: primeiro rapido (nome + icone), depois as miniaturas chegam.
function useSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const run = ++generation.current;
    setLoading(true);
    let quick = [];
    try {
      quick = await listScreenSources({ thumbnails: false });
      if (run === generation.current) setSources(quick);
    } catch {}
    try {
      const full = await listScreenSources({ thumbnails: true });
      if (run !== generation.current) return quick;
      const icons = new Map(quick.map((item) => [item.id, item.icon]));
      const merged = full.map((item) => ({ ...item, icon: item.icon || icons.get(item.id) || "" }));
      setSources(merged);
      return merged;
    } catch {
      return quick;
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, []);
  return { sources, loading, refresh };
}

// Escolher o que compartilhar, igual ao Discord: abas Aplicativos/Telas e depois resolucao, FPS e som.
function SharePicker({ current, onClose, setToast }) {
  const { sources, loading, refresh } = useSources();
  const prefs = useMemo(() => readHostPrefs(), []);
  const [tab, setTab] = useState(current ? (current.isScreen ? "screens" : "apps") : "apps");
  const [selectedId, setSelectedId] = useState(current?.sourceId || "");
  const [resolution, setResolution] = useState(current?.resolution || prefs.resolution);
  const [fps, setFps] = useState(current?.fps || prefs.fps);
  const [audioMode, setAudioMode] = useState(current?.audioMode || prefs.audioMode);
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const apps = sources.filter((item) => !item.isScreen);
  const screens = sources.filter((item) => item.isScreen);
  const list = tab === "apps" ? apps : screens;
  const selected = sources.find((item) => item.id === selectedId) || null;
  const mode = selected?.isScreen && audioMode === "app" ? "system" : audioMode;

  const select = (item) => {
    setSelectedId(item.id);
    if (item.isScreen && audioMode === "app") setAudioMode("system");
  };

  const go = async (item = selected) => {
    if (!item) return;
    setBusy(true);
    try {
      const chosenMode = item.isScreen && audioMode === "app" ? "system" : audioMode;
      await startShare({ sourceId: item.id, sourceName: item.name, isScreen: item.isScreen, resolution, fps, audioMode: chosenMode });
      onClose();
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modalOverlay" onClick={() => !busy && onClose()}>
      <div className="modalContent dsPicker" onClick={(e) => e.stopPropagation()}>
        <div className="dsHead">
          <div>
            <h3>{current ? "Trocar o que você compartilha" : "Compartilhar tela"}</h3>
            <p>Escolha um aplicativo ou uma tela inteira.</p>
          </div>
          <button className="ttsIconBtn" onClick={refresh} disabled={loading} title="Atualizar" aria-label="Atualizar"><ArrowClockwise size={17} className={loading ? "dsSpin" : ""} /></button>
          <button className="ttsIconBtn" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="dsTabs" role="tablist">
          <button role="tab" aria-selected={tab === "apps"} className={tab === "apps" ? "on" : ""} onClick={() => setTab("apps")}><AppWindow size={16} /> Aplicativos <em>{apps.length}</em></button>
          <button role="tab" aria-selected={tab === "screens"} className={tab === "screens" ? "on" : ""} onClick={() => setTab("screens")}><Monitor size={16} /> Telas <em>{screens.length}</em></button>
        </div>
        <div className="dsGrid">
          {list.length === 0 && (
            <div className="dsEmpty">{loading ? <><span className="ssSpinner" /> Procurando...</> : tab === "apps" ? "Nenhum aplicativo aberto." : "Nenhuma tela encontrada."}</div>
          )}
          {list.map((item) => (
            <button
              key={item.id}
              className={`dsCard ${selectedId === item.id ? "on" : ""}`}
              onClick={() => select(item)}
              onDoubleClick={() => go(item)}
              title={item.name}
            >
              <span className={`dsThumb ${item.thumbnail ? "" : "loading"}`}>
                {item.thumbnail ? <img src={item.thumbnail} alt="" /> : item.icon ? <img className="dsBigIcon" src={item.icon} alt="" /> : item.isScreen ? <Monitor size={34} /> : <AppWindow size={34} />}
              </span>
              <span className="dsName">
                {item.icon ? <img src={item.icon} alt="" /> : item.isScreen ? <Monitor size={14} /> : <AppWindow size={14} />}
                <span>{item.name}</span>
              </span>
            </button>
          ))}
        </div>
        <div className={`dsOptions ${selected ? "" : "disabled"}`}>
          <div className="dsOption">
            <span className="dsLabel">Resolução</span>
            <div className="dsSegment">
              {RESOLUTIONS.map((item) => (
                <button key={item.id} className={resolution === item.id ? "on" : ""} onClick={() => setResolution(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div className="dsOption">
            <span className="dsLabel">Taxa de quadros</span>
            <div className="dsSegment">
              {FRAME_RATES.map((rate) => (
                <button key={rate} className={fps === rate ? "on" : ""} onClick={() => setFps(rate)}>{rate} FPS</button>
              ))}
            </div>
          </div>
          <div className="dsOption">
            <span className="dsLabel">Som</span>
            <div className="dsSegment">
              <button className={mode === "none" ? "on" : ""} onClick={() => setAudioMode("none")}><SpeakerSlash size={14} /> Sem som</button>
              <button className={mode === "app" ? "on" : ""} disabled={selected?.isScreen} onClick={() => setAudioMode("app")} title={selected?.isScreen ? "Escolha um aplicativo para mandar só o som dele" : "Só o som desse aplicativo"}><AppWindow size={14} /> Só deste app</button>
              <button className={mode === "system" ? "on" : ""} onClick={() => setAudioMode("system")}><SpeakerHigh size={14} /> PC inteiro</button>
            </div>
          </div>
        </div>
        <div className="dsFoot">
          <small className="dsNote"><Info size={14} /> O som do Discord e do VozLab nunca vai junto: ninguém ouve eco nem a sua voz.</small>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary dsGo" onClick={() => go()} disabled={!selected || busy}>
            <Broadcast size={16} weight="fill" /> {busy ? "Abrindo..." : current ? "Trocar" : "Ao vivo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, me, isHostView, watching, onWatch, onOpen }) {
  const isMe = member.id === me;
  return (
    <div className={`rmMember ${member.live ? "live" : ""} ${watching ? "watching" : ""}`}>
      <button className="rmMemberOpen" onClick={onOpen} title={`Ver o perfil de ${member.name}`}>
        <Avatar name={member.name} seed={member.clientId} profile={member.profile} size={34} live={Boolean(member.live)} />
        <span className="rmMemberText">
          <b>{member.name}{isMe && <em> (você)</em>}{member.isHost && <Crown size={13} weight="fill" className="rmCrown" title="Host da sala" />}</b>
          <small>{member.live ? member.live.title : member.profile?.status || (member.isHost ? "Host da sala" : "Na sala")}</small>
        </span>
      </button>
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

// ---------- som das telas: volume de 0 a 1000% (WebAudio) ----------
let playbackContext = null;
function getPlaybackContext() {
  if (!playbackContext || playbackContext.state === "closed") playbackContext = new AudioContext({ latencyHint: "interactive" });
  if (playbackContext.state === "suspended") playbackContext.resume().catch(() => {});
  return playbackContext;
}

function useStreamGain(stream, enabled, gainValue) {
  const gainRef = useRef(null);
  const audioCount = stream?.getAudioTracks?.().length || 0;
  useEffect(() => {
    if (!enabled || !stream || !audioCount) return undefined;
    const ctx = getPlaybackContext();
    let source;
    try {
      source = ctx.createMediaStreamSource(stream);
    } catch {
      return undefined;
    }
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(gain).connect(ctx.destination);
    gainRef.current = gain;
    return () => {
      try { source.disconnect(); gain.disconnect(); } catch {}
      if (gainRef.current === gain) gainRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, enabled, audioCount]);
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.setTargetAtTime(gainValue, gainRef.current.context.currentTime, 0.02);
  }, [gainValue]);
}

// ---------- janela fixa (sempre por cima) ----------
const popouts = new Map();
const POPOUT_ICONS = {
  top: '<path d="M216 168h-9.29L176 85.07V40a8 8 0 0 0 0-16H80a8 8 0 0 0 0 16v45.07L49.29 168H40a8 8 0 0 0 0 16h80v48a8 8 0 0 0 16 0v-48h80a8 8 0 0 0 0-16Z"/>',
  fullscreen: '<path d="M216 48v48a8 8 0 0 1-16 0V56h-40a8 8 0 0 1 0-16h48a8 8 0 0 1 8 8ZM96 200H56v-40a8 8 0 0 0-16 0v48a8 8 0 0 0 8 8h48a8 8 0 0 0 0-16Zm112-48a8 8 0 0 0-8 8v40h-40a8 8 0 0 0 0 16h48a8 8 0 0 0 8-8v-48a8 8 0 0 0-8-8ZM96 40H48a8 8 0 0 0-8 8v48a8 8 0 0 0 16 0V56h40a8 8 0 0 0 0-16Z"/>',
  left: '<path d="M216 40H40a16 16 0 0 0-16 16v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16ZM40 56h80v144H40Z"/>',
  right: '<path d="M216 40H40a16 16 0 0 0-16 16v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16Zm0 160h-80V56h80Z"/>',
  corner: '<path d="M216 40H40a16 16 0 0 0-16 16v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16Zm0 160H136v-56h80Z"/>',
  "next-display": '<path d="M208 40H48a24 24 0 0 0-24 24v112a24 24 0 0 0 24 24h72v16H96a8 8 0 0 0 0 16h64a8 8 0 0 0 0-16h-24v-16h72a24 24 0 0 0 24-24V64a24 24 0 0 0-24-24Zm-38.34 93.66-32 32a8 8 0 0 1-11.32-11.32L144.69 136H88a8 8 0 0 1 0-16h56.69l-18.35-18.34a8 8 0 0 1 11.32-11.32l32 32a8 8 0 0 1 0 11.32Z"/>',
  close: '<path d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"/>'
};

const POPOUT_CSS = `
  html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:"Segoe UI",sans-serif;user-select:none}
  video{width:100vw;height:100vh;object-fit:contain;background:#000;display:block}
  body.idle{cursor:none}
  .bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:6px;border-radius:14px;background:rgba(17,17,24,.88);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.5);transition:opacity .3s}
  .who{position:fixed;left:12px;top:12px;display:flex;align-items:center;gap:8px;padding:5px 12px 5px 6px;border-radius:999px;background:rgba(17,17,24,.8);color:#fff;font-size:13px;font-weight:700;transition:opacity .3s}
  .who i{width:8px;height:8px;border-radius:50%;background:#ff4d4f;box-shadow:0 0 0 3px rgba(255,77,79,.25)}
  body.idle .bar, body.idle .who{opacity:0;pointer-events:none}
  button{width:38px;height:38px;display:grid;place-items:center;border:none;border-radius:10px;background:transparent;color:#d4d4dc;cursor:pointer;position:relative}
  button:hover{background:rgba(139,92,246,.25);color:#fff}
  button.on{color:#a78bfa;background:rgba(139,92,246,.18)}
  button.close:hover{background:rgba(255,77,79,.3)}
  button svg{width:19px;height:19px;fill:currentColor}
  button[data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:46px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:5px 9px;border-radius:8px;background:#000;color:#fff;font-size:12px;font-weight:600}
  .sep{width:1px;height:22px;background:rgba(255,255,255,.12);margin:0 4px}
`;

// Janela fixa: um mini player da tela de alguem, com barra que some quando o mouse para.
function openPopout(member, stream) {
  const key = member.clientId || member.id;
  const existing = popouts.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }
  const name = `vozlab-popout-${key}`;
  const win = window.open("", name);
  if (!win) return;
  popouts.set(key, win);
  const run = (action) => window.micfudiddo?.screen?.popout?.(name, action);
  const doc = win.document;
  doc.title = `${member.name} - VozLab`;
  doc.head.innerHTML = `<style>${POPOUT_CSS}</style>`;
  doc.body.innerHTML = "";
  const video = doc.createElement("video");
  video.autoplay = true;
  video.muted = true; // o som continua tocando pela janela principal (com o volume escolhido)
  video.playsInline = true;
  video.srcObject = stream;
  doc.body.appendChild(video);

  const who = doc.createElement("div");
  who.className = "who";
  who.innerHTML = "<i></i>";
  who.appendChild(doc.createTextNode(member.name));
  doc.body.appendChild(who);

  const bar = doc.createElement("div");
  bar.className = "bar";
  const buttons = {};
  const add = (action, tip, extraClass = "") => {
    const button = doc.createElement("button");
    button.dataset.tip = tip;
    if (extraClass) button.className = extraClass;
    button.innerHTML = `<svg viewBox="0 0 256 256">${POPOUT_ICONS[action]}</svg>`;
    button.onclick = async () => {
      const result = await run(action);
      if (result) apply(result);
    };
    bar.appendChild(button);
    buttons[action] = button;
  };
  const sep = () => { const div = doc.createElement("div"); div.className = "sep"; bar.appendChild(div); };
  add("top", "Fixar por cima de tudo", "on");
  add("fullscreen", "Tela cheia (ou clique duas vezes)");
  sep();
  add("left", "Encaixar à esquerda");
  add("right", "Encaixar à direita");
  add("corner", "Cantinho (mini)");
  add("next-display", "Mandar para o outro monitor");
  sep();
  add("close", "Fechar", "close");
  doc.body.appendChild(bar);

  const apply = (status) => {
    buttons.top.classList.toggle("on", Boolean(status.alwaysOnTop));
    buttons.top.dataset.tip = status.alwaysOnTop ? "Por cima de tudo (clique para soltar)" : "Fixar por cima de tudo";
    buttons.fullscreen.dataset.tip = status.fullscreen ? "Sair da tela cheia" : "Tela cheia (ou clique duas vezes)";
    buttons["next-display"].style.display = status.displays > 1 ? "" : "none";
  };
  run("status").then((status) => status && apply(status)).catch(() => {});

  video.ondblclick = async () => { const result = await run("fullscreen"); if (result) apply(result); };
  win.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") { const result = await run("status"); if (result?.fullscreen) apply(await run("fullscreen")); }
    if (event.key === "f" || event.key === "F") apply(await run("fullscreen"));
  });
  // Mouse parado: tudo some para ver a tela limpa.
  let idleTimer = null;
  const wake = () => {
    doc.body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!bar.matches(":hover")) doc.body.classList.add("idle"); }, 2500);
  };
  win.addEventListener("mousemove", wake);
  wake();
  video.play().catch(() => {});
}

function closePopout(member) {
  const key = member.clientId || member.id;
  const win = popouts.get(key);
  popouts.delete(key);
  try { win?.close(); } catch {}
}

function TileMenu({ x, y, member, own, live, volume, muted, onVolume, onMute, onFullscreen, onPopout, onProfile, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) onClose(); };
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 330);
  const percent = Math.round(volume * 100);
  return (
    <div ref={ref} className="rmMenu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      <div className="rmMenuHead">
        <Avatar name={member.name} seed={member.clientId} profile={member.profile} size={26} />
        <b>{own ? "Sua tela" : member.name}</b>
      </div>
      {!own && live?.audio && (
        <div className="rmMenuVolume">
          <span>Volume da tela <em>{muted ? "mudo" : `${percent}%`}</em></span>
          <input type="range" min={0} max={10} step={0.05} value={muted ? 0 : volume} onChange={(e) => onVolume(Number(e.target.value))} aria-label="Volume da tela" style={{ "--fill": `${((muted ? 0 : volume) / 10) * 100}%` }} />
          <div className="rmMenuMarks"><span>0%</span><span>100%</span><span>1000%</span></div>
        </div>
      )}
      {!own && live?.audio && <button onClick={onMute}>{muted ? <SpeakerSimpleHigh size={15} /> : <SpeakerSlash size={15} />} {muted ? "Ativar o som" : "Silenciar"}</button>}
      <button onClick={onFullscreen}><CornersOut size={15} /> Tela cheia</button>
      <button onClick={onPopout}><PictureInPicture size={15} /> Abrir em janela fixa</button>
      {!own && <button onClick={onProfile}><UserCircle size={15} /> Ver perfil</button>}
      {own ? (
        <button className="danger" onClick={() => { stopShare(); onClose(); }}><StopCircle size={15} /> Parar de compartilhar</button>
      ) : (
        <button className="danger" onClick={() => { unwatch(member.id); onClose(); }}><X size={15} /> Parar de assistir</button>
      )}
    </div>
  );
}

function StreamTile({ member, stream, focused, onFocus, own = false, watchers = 0, audioSources = [], onOpenProfile }) {
  const tileRef = useRef(null);
  const volumeKey = member.clientId || member.id;
  const [volume, setVolume] = useState(() => readVolume(volumeKey));
  const [muted, setMuted] = useState(false);
  const [menu, setMenu] = useState(null);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(null);
  const mediaStream = stream?.stream || null;
  // Igual ao Discord: com o mouse parado em cima da tela, os botoes e o cursor somem.
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  const hasAudio = !own && Boolean(member.live?.audio);
  useStreamGain(mediaStream, hasAudio, muted ? 0 : volume);
  useEffect(() => () => { if (!own) closePopout(member); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div
      ref={tileRef}
      className={`rmTile ${focused ? "focused" : ""} ${idle && !menu ? "idle" : ""}`}
      onClick={() => !focused && onFocus(member.id)}
      onMouseMove={wake}
      onMouseEnter={wake}
      onMouseLeave={() => { clearTimeout(idleTimer.current); setIdle(false); }}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {mediaStream && <VideoView stream={mediaStream} className="rmVideo" muted onDoubleClick={fullscreen} />}
      {status === "connecting" && <div className="rmTileWait"><span className="ssSpinner" /> Abrindo a tela de {member.name}...</div>}
      {status === "error" && <div className="rmTileWait error">{stream.error}</div>}
      <div className="rmTileBar" onClick={(e) => e.stopPropagation()}>
        <span className="rmTileName">
          <span className="rmLivePill small"><span className="ssDot" /> AO VIVO</span>
          <b>{own ? "Você" : member.name}</b>
          <small>{own ? `${watchers} assistindo${audioSources.length ? ` · som: ${audioSources.join(", ")}` : ""}` : statText(stream?.stats)}</small>
        </span>
        {hasAudio && (
          <span className="ssVolume">
            <button className="ssIconBtn light" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ligar o som" : "Tirar o som"}>
              {muted || volume === 0 ? <SpeakerSlash size={16} /> : <SpeakerSimpleHigh size={16} />}
            </button>
            <input type="range" min={0} max={2} step={0.05} value={muted ? 0 : Math.min(2, volume)} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" title="Até 200% aqui; clique com o botão direito para ir até 1000%" style={{ "--fill": `${((muted ? 0 : Math.min(2, volume)) / 2) * 100}%` }} />
          </span>
        )}
        <button className="ssIconBtn light" onClick={() => openPopout(member, mediaStream)} title="Abrir em janela fixa" aria-label="Abrir em janela fixa"><PictureInPicture size={17} /></button>
        <button className="ssIconBtn light" onClick={fullscreen} title="Tela cheia (ou clique duas vezes)" aria-label="Tela cheia"><CornersOut size={17} /></button>
        {!own && <button className="ssIconBtn light" onClick={() => unwatch(member.id)} title="Parar de assistir" aria-label="Parar de assistir"><X size={16} /></button>}
      </div>
      {menu && (
        <TileMenu
          x={menu.x}
          y={menu.y}
          member={member}
          own={own}
          live={member.live}
          volume={volume}
          muted={muted}
          onVolume={changeVolume}
          onMute={() => setMuted((value) => !value)}
          onFullscreen={() => { setMenu(null); fullscreen(); }}
          onPopout={() => { setMenu(null); if (mediaStream) openPopout(member, mediaStream); }}
          onProfile={() => { setMenu(null); onOpenProfile?.(member); }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function Stage({ share, setToast, onShare, onOpenProfile }) {
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
  const tileProps = (tile) => ({
    member: tile.member,
    stream: tile.stream,
    own: tile.own,
    watchers: share.watchers.length,
    audioSources: tile.own ? share.share?.audioSources || [] : [],
    onFocus: setFocus,
    onOpenProfile
  });

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
                    <Avatar name={member.name} seed={member.clientId} profile={member.profile} size={40} live />
                    <span><b>{member.name}</b><small>{member.live.title}{member.live.quality ? ` · ${member.live.quality}` : ""}{member.live.audio ? " · com som" : ""}</small></span>
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
          {focused && <StreamTile key={`f-${focused.member.id}`} {...tileProps(focused)} focused />}
          {(others.length > 0 || notWatched.length > 0) && (
            <div className="rmStrip">
              {others.map((tile) => <StreamTile key={`s-${tile.member.id}`} {...tileProps(tile)} />)}
              {notWatched.map((member) => (
                <button key={`n-${member.id}`} className="rmStripLive" onClick={() => watch(member.id)}>
                  <Avatar name={member.name} seed={member.clientId} profile={member.profile} size={30} live />
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

function formatBytes(bytes) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Som mandado no chat: ouve aqui mesmo e salva no seu soundboard com um clique.
function SoundAttachment({ attachment, mine, setToast, call }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => () => audioRef.current?.pause(), []);
  const toggle = () => {
    if (!attachment.data) return;
    if (playing) {
      audioRef.current?.pause();
      return;
    }
    const audio = audioRef.current || new Audio(attachment.data);
    audioRef.current = audio;
    audio.volume = 0.8;
    audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    audio.onended = () => { setPlaying(false); setProgress(0); };
    audio.onpause = () => setPlaying(false);
    audio.play().then(() => setPlaying(true)).catch(() => setToast?.("Não consegui tocar esse som."));
  };
  const save = async () => {
    setSaving(true);
    try {
      const filePath = await saveSoundToDisk(attachment);
      await call?.("/api/sounds/add", { paths: [filePath] });
      setSaved(true);
      setToast?.(`"${attachment.name}" foi para o seu soundboard!`);
    } catch (error) {
      setToast?.(error.message || "Não consegui salvar o som.");
    } finally {
      setSaving(false);
    }
  };
  if (attachment.expired || !attachment.data) return <div className="rmAttach expired">Som que não está mais disponível.</div>;
  return (
    <div className={`rmSound ${attachment.voice ? "voice" : ""}`}>
      <button className={`rmSoundPlay ${playing ? "on" : ""}`} onClick={toggle} aria-label={playing ? "Parar" : "Ouvir"}>
        {playing ? <Stop size={15} weight="fill" /> : <Play size={15} weight="fill" />}
      </button>
      <div className="rmSoundInfo">
        <b>{attachment.voice ? <><Microphone size={12} weight="fill" /> Mensagem de voz</> : attachment.name}</b>
        <span className="rmSoundBar"><span style={{ width: `${progress * 100}%` }} /></span>
        <small>{[formatDuration(attachment.duration), formatBytes(attachment.size)].filter(Boolean).join(" · ")}</small>
      </div>
      {!mine && (
        <button className="btn btn-ghost ssSmallBtn rmSoundSave" onClick={save} disabled={saving || saved} title="Baixar para o seu soundboard">
          {saved ? <Check size={14} weight="bold" /> : <DownloadSimple size={14} weight="bold" />} {saved ? "Salvo" : saving ? "Salvando..." : "Salvar"}
        </button>
      )}
    </div>
  );
}

function ImageAttachment({ attachment, onOpen }) {
  if (attachment.expired || !attachment.data) return <div className="rmAttach expired">Imagem que não está mais disponível.</div>;
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 16 / 9;
  return (
    <button className="rmImage" onClick={() => onOpen(attachment)} style={{ aspectRatio: String(Math.min(2.4, Math.max(0.5, ratio))) }} title="Abrir">
      <img src={attachment.data} alt={attachment.name} loading="lazy" />
    </button>
  );
}

function Lightbox({ attachment, onClose, setToast }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = async () => {
    try {
      const saved = await saveImageToDisk(attachment);
      if (saved) setToast?.("Imagem salva!");
    } catch (error) {
      setToast?.(error.message);
    }
  };
  return (
    <div className="rmLightbox" onClick={onClose}>
      <img src={attachment.data} alt={attachment.name} onClick={(e) => e.stopPropagation()} />
      <div className="rmLightboxBar" onClick={(e) => e.stopPropagation()}>
        <span>{attachment.name}</span>
        <button className="btn btn-ghost ssSmallBtn" onClick={save}><DownloadSimple size={14} /> Salvar imagem</button>
        <button className="ssIconBtn light" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </div>
    </div>
  );
}

function SoundPicker({ sounds, onClose, setToast, call }) {
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState("");
  const previewRef = useRef(null);
  useEffect(() => () => previewRef.current?.pause(), []);
  const list = (sounds || []).filter((sound) => sound.path && (!query.trim() || String(sound.name || "").toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 80);
  const preview = (sound) => {
    previewRef.current?.pause();
    const audio = new Audio("file:///" + String(sound.path).replace(/\\/g, "/"));
    audio.volume = 0.6;
    previewRef.current = audio;
    audio.play().catch(() => {});
  };
  const send = async (sound) => {
    setSending(sound.id);
    try {
      previewRef.current?.pause();
      const result = await sendSound(sound, call);
      if (result?.trimmed) setToast?.("Esse som passa de 5 minutos: foram só os 5 primeiros.");
      onClose();
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setSending("");
    }
  };
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent rmModal rmSoundPicker" onClick={(e) => e.stopPropagation()}>
        <div className="rmModalHead"><MusicNotes size={18} weight="fill" /> <b>Mandar um som no chat</b></div>
        <p className="ssMuted small">Os amigos ouvem no chat e podem salvar no soundboard deles. Sons de até 5 minutos (os mais longos vão só com os 5 primeiros).</p>
        <label className="ssSearch rmSoundSearch">
          <MagnifyingGlass size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar no seu soundboard" autoFocus />
        </label>
        <div className="rmSoundList">
          {list.length === 0 && <p className="ssMuted small">Nenhum som encontrado.</p>}
          {list.map((sound) => (
            <div key={sound.id} className="rmSoundRow">
              <button className="ssIconBtn" onClick={() => preview(sound)} aria-label="Ouvir"><Play size={13} weight="fill" /></button>
              <span>{sound.name}</span>
              {Number(sound.duration) > 0 && <small className="rmSoundLen">{formatDuration(Math.min(Number(sound.duration), 600))}{Number(sound.duration) > MAX_VOICE_SECONDS ? " · vai até 5:00" : ""}</small>}
              <button className="btn btn-primary ssSmallBtn" disabled={Boolean(sending)} onClick={() => send(sound)}>
                {sending === sound.id ? "Enviando..." : <><PaperPlaneRight size={13} weight="fill" /> Mandar</>}
              </button>
            </div>
          ))}
        </div>
        <div className="rmModalActions"><button className="btn btn-ghost ssSmallBtn" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}

// Grava uma mensagem de voz (ate 5 minutos) com o microfone padrao do Windows.
function VoiceRecorder({ onCancel, onSend, setToast }) {
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const media = useRef(null);
  const sendOnStop = useRef(false);
  const startedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let meterCtx = null;
    let raf = 0;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        media.current = stream;
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
        recorder.current = rec;
        rec.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const duration = (performance.now() - startedAt.current) / 1000;
          if (sendOnStop.current) onSend(new Blob(chunks.current, { type: "audio/webm" }), Math.min(MAX_VOICE_SECONDS, duration));
        };
        startedAt.current = performance.now();
        rec.start(250);
        timer = setInterval(() => {
          const elapsed = (performance.now() - startedAt.current) / 1000;
          setSeconds(elapsed);
          if (elapsed >= MAX_VOICE_SECONDS && rec.state === "recording") {
            sendOnStop.current = true;
            rec.stop();
          }
        }, 200);
        // medidor de volume para mostrar que esta captando
        meterCtx = new AudioContext();
        const analyser = meterCtx.createAnalyser();
        analyser.fftSize = 512;
        meterCtx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
          setLevel(peak / 128);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setToast?.("Não consegui usar o microfone para gravar.");
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(timer);
      cancelAnimationFrame(raf);
      try { meterCtx?.close(); } catch {}
      if (recorder.current?.state === "recording") {
        sendOnStop.current = false;
        recorder.current.stop();
      }
      media.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (recorder.current?.state === "recording") {
      sendOnStop.current = true;
      recorder.current.stop();
    }
  };

  return (
    <div className="rmRecorder">
      <span className="rmRecDot" style={{ transform: `scale(${1 + level * 1.4})` }} />
      <span className="rmRecTime">{formatDuration(seconds) || "0:00"}</span>
      <span className="rmRecLimit">/ 5:00</span>
      <span className="rmRecBar"><span style={{ width: `${Math.min(100, (seconds / MAX_VOICE_SECONDS) * 100)}%` }} /></span>
      <button type="button" className="ssIconBtn" onClick={onCancel} title="Cancelar" aria-label="Cancelar gravação"><Trash size={16} /></button>
      <button type="button" className="rmRecSend" onClick={finish} title="Enviar" aria-label="Enviar gravação"><PaperPlaneRight size={16} weight="fill" /></button>
    </div>
  );
}

function ChatPanel({ share, sounds, setToast, call, onOpenProfile }) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [soundPicker, setSoundPicker] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const audioFileRef = useRef(null);

  const sendAudio = async (blob, options) => {
    setSending(true);
    try {
      await sendAudioBlob(blob, options);
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setSending(false);
    }
  };
  useEffect(() => {
    setChatVisible(true);
    return () => setChatVisible(false);
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [share.chat.length]);
  const membersById = useMemo(() => new Map(share.members.map((member) => [member.id, member])), [share.members]);

  const sendImages = async (files) => {
    const images = [...(files || [])].filter((file) => file.type?.startsWith("image/")).slice(0, 4);
    if (!images.length) return;
    setSending(true);
    try {
      for (const file of images) await sendImage(file);
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setSending(false);
    }
  };

  const onPaste = (event) => {
    const files = [...(event.clipboardData?.files || [])];
    if (files.some((file) => file.type?.startsWith("image/"))) {
      event.preventDefault();
      sendImages(files);
    }
  };

  return (
    <aside
      className={`rmChat ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); sendImages(e.dataTransfer.files); }}
    >
      <div className="rmColHead"><ChatsCircle size={15} weight="fill" /> Chat da sala</div>
      <div className="rmChatList" ref={listRef}>
        {share.chat.length === 0 && <p className="ssMuted small rmChatEmpty">Ninguém falou nada ainda. Mande uma mensagem, uma imagem ou um som!</p>}
        {share.chat.map((message) => {
          if (message.system) return <div key={message.id} className="rmChatSystem">{message.text}</div>;
          const author = membersById.get(message.from);
          const mine = message.from === share.me;
          return (
            <div key={message.id} className={`rmChatMsg ${mine ? "mine" : ""}`}>
              <button className="rmChatAvatar" onClick={() => author && onOpenProfile(author)} disabled={!author} aria-label={`Perfil de ${message.name}`}>
                <Avatar name={message.name} seed={author?.clientId || message.name} profile={author?.profile} size={28} />
              </button>
              <div className="rmChatContent">
                <span className="rmChatMeta"><b>{message.name}</b> <time>{new Date(message.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></span>
                {message.text && <p>{message.text}</p>}
                {message.attachment?.kind === "image" && <ImageAttachment attachment={message.attachment} onOpen={setLightbox} />}
                {message.attachment?.kind === "sound" && <SoundAttachment attachment={message.attachment} mine={mine} setToast={setToast} call={call} />}
              </div>
            </div>
          );
        })}
      </div>
      {dragging && <div className="rmDropHint"><ImageSquare size={30} /> Solte a imagem para mandar</div>}
      <form className="rmChatInput" onSubmit={(e) => { e.preventDefault(); sendChat(text); setText(""); }}>
        <div className="rmAttachWrap">
          <button type="button" className="ssIconBtn" onClick={() => setMenu((value) => !value)} aria-label="Anexar" title="Mandar imagem ou som" disabled={sending}>
            {sending ? <span className="ssSpinner tiny" /> : <PlusCircle size={19} weight="fill" />}
          </button>
          {menu && (
            <div className="rmAttachMenu" onMouseLeave={() => setMenu(false)}>
              <button type="button" onClick={() => { setMenu(false); fileRef.current?.click(); }}><ImageSquare size={16} /> Imagem</button>
              <button type="button" onClick={() => { setMenu(false); setSoundPicker(true); }}><MusicNotes size={16} /> Som do soundboard</button>
              <button type="button" onClick={() => { setMenu(false); audioFileRef.current?.click(); }}><FileAudio size={16} /> Arquivo de áudio (até 5 min)</button>
              <button type="button" onClick={() => { setMenu(false); setRecording(true); }}><Microphone size={16} /> Gravar mensagem de voz</button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { sendImages(e.target.files); e.target.value = ""; }} />
          <input
            ref={audioFileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) sendAudio(file, { name: file.name.replace(/\.[^.]+$/, "") }); }}
          />
        </div>
        {recording ? (
          <VoiceRecorder
            setToast={setToast}
            onCancel={() => setRecording(false)}
            onSend={(blob, duration) => { setRecording(false); sendAudio(blob, { name: "Mensagem de voz", voice: true, duration }); }}
          />
        ) : (
          <>
            <input value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} placeholder={`Conversar na ${share.room?.name || "sala"}`} maxLength={500} />
            {text.trim() ? (
              <button type="submit" className="ssIconBtn" aria-label="Enviar"><PaperPlaneRight size={17} weight="fill" /></button>
            ) : (
              <>
                <button type="button" className="ssIconBtn" onClick={() => setSoundPicker(true)} title="Mandar um som do seu soundboard (até 5 min)" aria-label="Mandar som do soundboard" disabled={sending}><MusicNotes size={17} weight="fill" /></button>
                <button type="button" className="ssIconBtn" onClick={() => setRecording(true)} title="Gravar mensagem de voz (até 5 min)" aria-label="Gravar mensagem de voz" disabled={sending}><Microphone size={17} weight="fill" /></button>
              </>
            )}
          </>
        )}
      </form>
      {soundPicker && <SoundPicker sounds={sounds} onClose={() => setSoundPicker(false)} setToast={setToast} call={call} />}
      {lightbox && <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} setToast={setToast} />}
    </aside>
  );
}

function MemberProfileModal({ member, share, onClose }) {
  const isMe = member.id === share.me;
  const watching = Boolean(share.streams[member.id]);
  const profile = { ...(member.profile || {}), name: member.name };
  const badges = (
    <>
      {member.isHost && <span className="pfBadge gold"><Crown size={12} weight="fill" /> Host</span>}
      {member.live && <span className="rmLivePill"><span className="ssDot" /> AO VIVO</span>}
      {isMe && <span className="pfBadge">você</span>}
    </>
  );
  const actions = (
    <>
      {member.live && !isMe && (
        <button className="btn btn-primary ssSmallBtn" onClick={() => { if (watching) unwatch(member.id); else watch(member.id); onClose(); }}>
          {watching ? <><EyeSlash size={14} /> Parar de assistir</> : <><Eye size={14} /> Assistir a tela</>}
        </button>
      )}
      {share.room?.isHost && !isMe && (
        <button className="btn btn-ghost ssSmallBtn danger" onClick={() => { kickMember(member.id); onClose(); }}><X size={14} /> Tirar da sala</button>
      )}
    </>
  );
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent pfModal" onClick={(e) => e.stopPropagation()}>
        <ProfileCard profile={profile} badges={badges} actions={actions} onClose={onClose} />
      </div>
    </div>
  );
}

function Reactions({ reactions }) {
  return (
    <div className="rmReactions" aria-hidden="true">
      {reactions.map((reaction) => (
        <span key={reaction.id} className="rmReaction" style={{ left: `${reaction.x}%` }}>
          <span className="rmReactionEmoji">{reaction.emoji}</span>
          {reaction.name && <small>{reaction.name}</small>}
        </span>
      ))}
    </div>
  );
}

function RoomView({ share, setToast, sounds, call }) {
  const [picker, setPicker] = useState(false);
  const [profileOf, setProfileOf] = useState(null);
  const room = share.room;
  const meMember = share.members.find((member) => member.id === share.me);
  const hostMember = share.members.find((member) => member.isHost);
  const inviteIp = hostMember?.address || room.host;
  const live = share.members.filter((member) => member.live);
  const idle = share.members.filter((member) => !member.live);
  const profileMember = profileOf ? share.members.find((member) => member.id === profileOf) : null;

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
                <MemberRow key={member.id} member={member} me={share.me} isHostView={room.isHost} watching={Boolean(share.streams[member.id])} onWatch={toggleWatch} onOpen={() => setProfileOf(member.id)} />
              ))}
            </>
          )}
          <div className="rmColHead"><Users size={13} /> Na sala — {idle.length}</div>
          {idle.map((member) => (
            <MemberRow key={member.id} member={member} me={share.me} isHostView={room.isHost} watching={false} onWatch={toggleWatch} onOpen={() => setProfileOf(member.id)} />
          ))}
        </aside>

        <div className="rmCenter">
          <div className="rmStageWrap">
            <Stage share={share} setToast={setToast} onShare={() => setPicker(true)} onOpenProfile={(member) => setProfileOf(member.id)} />
            <Reactions reactions={share.reactions || []} />
          </div>
          <div className="rmControls">
            {share.share ? (
              <>
                <span className="rmLiveInfo">
                  <span className="rmLivePill"><span className="ssDot" /> AO VIVO</span>
                  <b>{share.share.sourceName}</b>
                  <small>{share.share.label} · {share.watchers.length} assistindo{share.share.hasAudio ? ` · som: ${share.share.audioSources?.length ? share.share.audioSources.join(", ") : share.share.audioMode === "app" ? "do app" : "do PC"}` : " · sem som"}</small>
                </span>
              </>
            ) : (
              <span className="rmLiveInfo">
                <button className="rmMeChip" onClick={() => meMember && setProfileOf(meMember.id)} title="Ver o meu perfil na sala">
                  <Avatar name={meMember?.name || "Você"} seed={meMember?.clientId} profile={meMember?.profile} size={28} />
                  <span><b>{meMember?.name || "Você"}</b><small>{share.members.length} {share.members.length === 1 ? "pessoa" : "pessoas"} na sala</small></span>
                </button>
              </span>
            )}
            <div className="rmReactBar" role="group" aria-label="Reagir">
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => react(emoji)} title="Reagir para a sala">{emoji}</button>
              ))}
            </div>
            {share.share ? (
              <>
                <button className="btn btn-ghost ssSmallBtn" onClick={() => setPicker(true)}><ArrowsLeftRight size={15} /> Trocar</button>
                <button className="btn ssStopBtn" onClick={() => stopShare()}><StopCircle size={16} weight="fill" /> Parar</button>
              </>
            ) : (
              <button className="btn btn-primary rmShareBtn" onClick={() => setPicker(true)}><Screencast size={18} weight="fill" /> Compartilhar tela</button>
            )}
          </div>
        </div>

        <ChatPanel share={share} sounds={sounds} setToast={setToast} call={call} onOpenProfile={(member) => setProfileOf(member.id)} />
      </div>

      {picker && <SharePicker current={share.share} onClose={() => setPicker(false)} setToast={setToast} />}
      {profileMember && <MemberProfileModal member={profileMember} share={share} onClose={() => setProfileOf(null)} />}
    </div>
  );
}

export function ScreenSharePage({ setToast, sounds = [], call }) {

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

  if (share.phase === "room" && share.room) return <RoomView share={share} setToast={setToast} sounds={sounds} call={call} />;

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
