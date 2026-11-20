import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Monitor, AppWindow, Broadcast, Eye, Copy, ArrowClockwise, X, Check, CornersOut, SignOut, Lock, LockOpen,
  WifiHigh, WifiSlash, UserCircle, Trash, Info, StopCircle, Play, SpeakerHigh, SpeakerSlash, SpeakerSimpleHigh,
  Star, ArrowsLeftRight, Question, CaretDown, ArrowSquareOut, Users
} from "@phosphor-icons/react";
import {
  SCREEN_QUALITIES, MAX_VIEWERS, useScreenShare, isScreenShareAvailable, listScreenSources, listAddresses, startHosting,
  stopHosting, changeHosting, acceptViewer, rejectViewer, kickViewer, joinRoom, leaveRoom, probeRoom, readRecents,
  forgetRecent, readHostPrefs, saveHostPrefs, randomRoomCode, clearScreenShareError, clearHostNotice, isTrusted,
  setTrusted, startDiscovery, stopDiscovery, readViewerVolume, saveViewerVolume, installScreenShareBridge
} from "../screenShare";

const RADMIN_URL = "https://www.radmin-vpn.com/br/";

function VideoView({ stream, muted = true, volume = 1, className = "", onDoubleClick, videoRef }) {
  const localRef = useRef(null);
  const ref = videoRef || localRef;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream || null;
    if (stream) video.play?.().catch(() => {});
  }, [stream, ref]);
  useEffect(() => {
    const video = ref.current;
    if (video) video.volume = Math.min(1, Math.max(0, volume));
  }, [volume, ref]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} onDoubleClick={onDoubleClick} />;
}

function StatLine({ stats }) {
  if (!stats) return <span className="ssStats muted">Medindo...</span>;
  const parts = [];
  if (stats.width) parts.push(`${stats.width}×${stats.height}`);
  parts.push(`${stats.fps} fps`);
  if (stats.kbps) parts.push(stats.kbps >= 1000 ? `${(stats.kbps / 1000).toFixed(1)} Mbps` : `${stats.kbps} kbps`);
  if (stats.pingMs != null) parts.push(`${stats.pingMs} ms`);
  return <span className="ssStats">{parts.join(" · ")}</span>;
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
            <li><b>Quem vai mostrar a tela</b> clica em <b>Transmitir</b> aqui no VozLab.</li>
            <li><b>Quem vai assistir</b> abre <b>Assistir</b>: a sala aparece sozinha em "Na rede agora". Se não aparecer, é só colar o IP do amigo.</li>
            <li>Na primeira vez o Windows pergunta sobre o firewall: marque <b>Redes públicas</b> também e clique em Permitir.</li>
          </ol>
          {onSeen && <button className="btn btn-ghost ssSmallBtn" onClick={() => { setOpen(false); onSeen(); }}><Check size={14} /> Entendi</button>}
        </>
      )}
    </section>
  );
}

function AddressCard({ addresses, setToast, onRefresh }) {
  const main = addresses[0];
  const hasVpn = addresses.some((item) => item.vpn);
  return (
    <section className="ssCard">
      <div className="ssCardHead">
        <span className="ssLabel">Sua sala</span>
        <button className="ssLink" onClick={onRefresh}><ArrowClockwise size={13} /> Atualizar</button>
      </div>
      {main ? (
        <>
          <div className="ssIpRow">
            <div>
              <span className="ssIp">{main.address}</span>
              <span className="ssIpKind">{main.kind}</span>
            </div>
            <button className="btn btn-ghost ssSmallBtn" onClick={() => copy(main.address, setToast)}><Copy size={14} /> Copiar IP</button>
          </div>
          <p className="ssMuted">Sua sala é sempre a mesma. Na rede do Radmin ela aparece sozinha para os amigos; se não aparecer, eles colam esse IP uma vez.</p>
          {addresses.length > 1 && (
            <div className="ssOtherIps">
              {addresses.slice(1).map((item) => (
                <button key={item.address} className="ssChip" onClick={() => copy(item.address, setToast)} title="Copiar">
                  {item.address} <em>{item.kind}</em>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="ssMuted">Não achei nenhuma rede. Conecte o PC na internet e abra o Radmin VPN.</p>
      )}
      {!hasVpn && addresses.length > 0 && (
        <div className="ssWarn"><Info size={15} /> Não achei o Radmin VPN. Ele precisa estar aberto e na mesma rede dos seus amigos (se estiverem na mesma casa, não precisa).</div>
      )}
    </section>
  );
}

function SourcePicker({ sources, loading, selectedId, onSelect, onRefresh, title = "O que transmitir" }) {
  const screens = sources.filter((item) => item.isScreen);
  const windows = sources.filter((item) => !item.isScreen);
  const renderItem = (item) => (
    <button key={item.id} className={`ssSource ${selectedId === item.id ? "on" : ""}`} onClick={() => onSelect(item)} title={item.name}>
      <span className="ssThumb">{item.thumbnail ? <img src={item.thumbnail} alt="" /> : item.isScreen ? <Monitor size={28} /> : <AppWindow size={28} />}</span>
      <span className="ssSourceName">{item.isScreen ? <Monitor size={13} /> : <AppWindow size={13} />}{item.name}</span>
    </button>
  );
  return (
    <section className="ssCard">
      <div className="ssCardHead">
        <span className="ssLabel">{title}</span>
        <button className="ssLink" onClick={onRefresh} disabled={loading}><ArrowClockwise size={13} /> {loading ? "Procurando..." : "Atualizar"}</button>
      </div>
      {screens.length > 0 && <div className="ssSources">{screens.map(renderItem)}</div>}
      {windows.length > 0 && (
        <>
          <span className="ssSubLabel">Janelas abertas</span>
          <div className="ssSources">{windows.map(renderItem)}</div>
        </>
      )}
      {!loading && sources.length === 0 && <p className="ssMuted">Nada encontrado. Clique em Atualizar.</p>}
    </section>
  );
}

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

function QualityPicker({ value, onChange }) {
  return (
    <div className="ssQualities">
      {Object.values(SCREEN_QUALITIES).map((quality) => (
        <button key={quality.id} className={`ssQuality ${value === quality.id ? "on" : ""}`} onClick={() => onChange(quality.id)}>
          <strong>{quality.label}</strong>
          <small>{quality.detail}</small>
          <em>{quality.hint}</em>
        </button>
      ))}
    </div>
  );
}

function AudioToggle({ checked, onChange, disabled }) {
  return (
    <label className={`ssToggleRow ${disabled ? "disabled" : ""}`}>
      <span>
        <b>{checked ? <SpeakerHigh size={14} /> : <SpeakerSlash size={14} />} Mandar o som do PC</b>
        <small>Vai junto tudo o que toca no seu PC, inclusive as vozes do Discord. Se vocês estiverem em call, os amigos ouvem eco: deixe desligado.</small>
      </span>
      <span className="toggleSwitch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggleTrack" />
      </span>
    </label>
  );
}

function HostSetup({ profileName, setToast }) {
  const [addresses, setAddresses] = useState([]);
  const { sources, loading, refresh } = useSources();
  const [selected, setSelected] = useState(null);
  const [prefs, setPrefs] = useState(readHostPrefs);
  const [starting, setStarting] = useState(false);

  const updatePrefs = (patch) => setPrefs((current) => { const next = { ...current, ...patch }; saveHostPrefs(next); return next; });
  const refreshAddresses = useCallback(() => { listAddresses().then(setAddresses).catch(() => {}); }, []);
  const refreshSources = useCallback(async () => {
    const list = await refresh();
    setSelected((current) => list.find((item) => item.id === current?.id) || list.find((item) => item.id === readHostPrefs().lastSourceId) || list.find((item) => item.isScreen) || list[0] || null);
  }, [refresh]);

  useEffect(() => { refreshAddresses(); refreshSources(); }, [refreshAddresses, refreshSources]);

  const start = async () => {
    if (!selected) return;
    setStarting(true);
    try {
      await startHosting({
        sourceId: selected.id,
        sourceName: selected.name,
        isScreen: selected.isScreen,
        quality: prefs.quality,
        shareAudio: prefs.shareAudio,
        name: profileName || "Sala",
        code: prefs.askCode ? prefs.code : ""
      });
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="ssColumns">
      <div className="ssMain">
        {!prefs.guideSeen && <Guide startOpen onSeen={() => updatePrefs({ guideSeen: true })} />}
        <SourcePicker sources={sources} loading={loading} selectedId={selected?.id} onSelect={setSelected} onRefresh={refreshSources} />
        {prefs.guideSeen && <Guide />}
      </div>
      <aside className="ssSide">
        <AddressCard addresses={addresses} setToast={setToast} onRefresh={refreshAddresses} />
        <section className="ssCard">
          <span className="ssLabel">Qualidade</span>
          <QualityPicker value={prefs.quality} onChange={(quality) => updatePrefs({ quality })} />
          <AudioToggle checked={prefs.shareAudio} onChange={(shareAudio) => updatePrefs({ shareAudio })} />
        </section>
        <section className="ssCard">
          <span className="ssLabel">Quem pode entrar</span>
          <label className="ssToggleRow">
            <span>
              <b>{prefs.askCode ? <Lock size={14} /> : <LockOpen size={14} />} Pedir código</b>
              <small>{prefs.askCode ? "Só entra quem souber o código." : "Qualquer um com seu IP pode pedir. Você aceita antes (ou marca o amigo para entrar direto)."}</small>
            </span>
            <span className="toggleSwitch">
              <input type="checkbox" checked={prefs.askCode} onChange={(e) => updatePrefs({ askCode: e.target.checked })} />
              <span className="toggleTrack" />
            </span>
          </label>
          {prefs.askCode && (
            <div className="ssCodeRow">
              <span className="ssCode">{prefs.code}</span>
              <button className="ssLink" onClick={() => copy(prefs.code, setToast)}><Copy size={13} /> Copiar</button>
              <button className="ssLink" onClick={() => updatePrefs({ code: randomRoomCode() })}><ArrowClockwise size={13} /> Trocar</button>
            </div>
          )}
        </section>
        <button className="btn btn-primary ssBigBtn" onClick={start} disabled={!selected || starting}>
          <Broadcast size={18} weight="fill" /> {starting ? "Abrindo a sala..." : "Começar a transmitir"}
        </button>
        <p className="ssMuted small">Dá para pôr um atalho para começar e parar em Configurações › Atalhos. Até {MAX_VIEWERS} amigos assistem ao mesmo tempo.</p>
      </aside>
    </div>
  );
}

function RequestCard({ request }) {
  return (
    <div className="ssRequest">
      <UserCircle size={30} weight="fill" />
      <div className="ssRequestText">
        <b>{request.name}</b>
        <small>quer assistir · {request.address}</small>
      </div>
      <button className="btn btn-ghost ssSmallBtn" onClick={() => rejectViewer(request.id)}><X size={14} /> Recusar</button>
      <button className="btn btn-primary ssSmallBtn" onClick={() => acceptViewer(request.id)}><Check size={14} weight="bold" /> Aceitar</button>
    </div>
  );
}

function ViewerRow({ viewer }) {
  const trusted = isTrusted(viewer.clientId);
  return (
    <div className="ssViewer">
      <UserCircle size={30} weight="fill" />
      <div className="ssRequestText">
        <b>{viewer.name}</b>
        {viewer.connected ? <StatLine stats={viewer.stats} /> : <small>Conectando...</small>}
      </div>
      {viewer.clientId && (
        <button
          className={`ssIconBtn ${trusted ? "starred" : ""}`}
          onClick={() => setTrusted(viewer.clientId, viewer.name, !trusted)}
          title={trusted ? "Entra direto (clique para voltar a pedir)" : "Deixar entrar direto da próxima vez"}
          aria-label={trusted ? "Parar de aceitar direto" : "Aceitar direto da próxima vez"}
        >
          <Star size={16} weight={trusted ? "fill" : "regular"} />
        </button>
      )}
      <button className="ssIconBtn" onClick={() => kickViewer(viewer.id)} title="Tirar da sala" aria-label="Tirar da sala"><X size={16} /></button>
    </div>
  );
}

function ChangePanel({ hosting, setToast, onClose }) {
  const { sources, loading, refresh } = useSources();
  const [busy, setBusy] = useState(false);
  useEffect(() => { refresh(); }, [refresh]);
  const apply = async (patch) => {
    setBusy(true);
    try {
      await changeHosting(patch);
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`ssChange ${busy ? "busy" : ""}`}>
      <div className="ssCardHead">
        <span className="ssLabel">Trocar sem derrubar ninguém</span>
        <button className="ssIconBtn" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>
      <SourcePicker
        title="Tela ou janela"
        sources={sources}
        loading={loading}
        selectedId={hosting.sourceId}
        onSelect={(item) => item.id !== hosting.sourceId && apply({ sourceId: item.id, sourceName: item.name, isScreen: item.isScreen })}
        onRefresh={refresh}
      />
      <section className="ssCard">
        <span className="ssLabel">Qualidade</span>
        <QualityPicker value={hosting.quality} onChange={(quality) => quality !== hosting.quality && apply({ quality })} />
        <AudioToggle checked={hosting.shareAudio} disabled={busy} onChange={(shareAudio) => apply({ shareAudio })} />
      </section>
    </div>
  );
}

function HostLive({ hosting, setToast }) {
  const [changing, setChanging] = useState(false);
  const quality = SCREEN_QUALITIES[hosting.quality];
  const main = hosting.addresses[0];
  return (
    <div className="ssColumns">
      <div className="ssMain">
        <section className="ssCard ssStage">
          <div className="ssVideoWrap">
            <VideoView stream={hosting.stream} className="ssVideo" />
            <span className="ssLive"><span className="ssDot" /> AO VIVO</span>
            {hosting.hasAudio && <span className="ssAudioBadge"><SpeakerHigh size={13} weight="fill" /> com som</span>}
          </div>
          <div className="ssStageBar">
            <div className="ssStageInfo">
              <b>{hosting.sourceName}</b>
              <small>{quality?.label} · {quality?.detail}{hosting.code ? ` · código ${hosting.code}` : ""}</small>
            </div>
            <button className="btn btn-ghost ssSmallBtn" onClick={() => setChanging((value) => !value)}><ArrowsLeftRight size={15} /> Trocar</button>
            <button className="btn ssStopBtn" onClick={() => stopHosting()}><StopCircle size={16} weight="fill" /> Parar</button>
          </div>
        </section>
        {changing && <ChangePanel hosting={hosting} setToast={setToast} onClose={() => setChanging(false)} />}
      </div>
      <aside className="ssSide">
        {hosting.requests.length > 0 && (
          <section className="ssCard ssCardAccent">
            <span className="ssLabel">Pedindo para entrar</span>
            {hosting.requests.map((request) => <RequestCard key={request.id} request={request} />)}
          </section>
        )}
        <section className="ssCard">
          <div className="ssCardHead">
            <span className="ssLabel">Assistindo</span>
            <span className="ssCount"><Users size={13} /> {hosting.viewers.length}/{MAX_VIEWERS}</span>
          </div>
          {hosting.viewers.length > 0 ? (
            <div className="ssViewers">
              {hosting.viewers.map((viewer) => <ViewerRow key={viewer.id} viewer={viewer} />)}
            </div>
          ) : (
            <p className="ssMuted">Ninguém ainda.{main ? <> Seu IP: <button className="ssInlineCopy" onClick={() => copy(main.address, setToast)}>{main.address} <Copy size={12} /></button></> : null}</p>
          )}
          {hosting.viewers.some((viewer) => viewer.stats?.limitedBy) && <p className="ssMuted small">A qualidade caiu um pouco para não travar.</p>}
          {hosting.viewers.length > 0 && <p className="ssMuted small"><Star size={11} weight="fill" /> na pessoa = ela entra direto da próxima vez, sem você aceitar.</p>}
          {hosting.notice && <div className="ssNotice" onClick={clearHostNotice}>{hosting.notice}</div>}
        </section>
        <p className="ssMuted small">Pode minimizar ou trocar de aba: a transmissão continua. Para parar pela bandeja, clique com o botão direito no ícone do VozLab.</p>
      </aside>
    </div>
  );
}

function RoomRow({ room, status, onJoin, onForget, disabled }) {
  const online = status?.online;
  const full = status?.busy;
  const label = !status ? "Verificando..." : online ? (full ? "Sala cheia" : "Transmitindo agora") : "Offline";
  const count = online && status.maxViewers > 1 ? ` · ${status.viewers || 0}/${status.maxViewers} assistindo` : "";
  return (
    <div className={`ssRecent ${online && !full ? "live" : ""}`}>
      <span className="ssRecentIcon">{online ? <WifiHigh size={18} weight="bold" /> : <WifiSlash size={18} />}</span>
      <div className="ssRequestText">
        <b>{status?.name || room.name || room.host}</b>
        <small>{room.host} · <span className="ssRecentState">{label}</span>{count}{status?.needsCode ? " · pede código" : ""}</small>
      </div>
      {onForget && <button className="ssIconBtn" onClick={() => onForget(room.host)} title="Esquecer" aria-label="Esquecer"><Trash size={15} /></button>}
      <button className="btn btn-primary ssSmallBtn" disabled={disabled || !online || full} onClick={() => onJoin(room.host, status?.needsCode)}>
        <Play size={13} weight="fill" /> Assistir
      </button>
    </div>
  );
}

function RecentRoom({ item, discovered, ...props }) {
  const [probed, setProbed] = useState(null);
  useEffect(() => {
    if (discovered) return undefined;
    let alive = true;
    const check = () => probeRoom(item.host).then((result) => { if (alive) setProbed(result); }).catch(() => {});
    check();
    const timer = setInterval(check, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [item.host, discovered]);
  const status = discovered ? { online: true, name: discovered.name, needsCode: discovered.needsCode, busy: discovered.viewers >= discovered.maxViewers, viewers: discovered.viewers, maxViewers: discovered.maxViewers } : probed;
  return <RoomRow room={item} status={status} {...props} />;
}

function ViewerSetup({ profileName, setToast, rooms }) {
  const [host, setHost] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [recents, setRecents] = useState(readRecents);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    startDiscovery();
    return () => stopDiscovery();
  }, []);

  const join = async (target, askCode = false) => {
    const value = String(target || "").trim();
    if (!value) { setToast?.("Cole o IP de quem está transmitindo."); return; }
    setBusy(true);
    try {
      const probe = await probeRoom(value);
      if (!probe.online) { setToast?.(probe.reason || "Essa pessoa não está transmitindo agora."); return; }
      if (probe.busy) { setToast?.("A sala está cheia."); return; }
      if ((probe.needsCode || askCode) && !(value === host.trim() && code.trim())) {
        setHost(value);
        setNeedsCode(true);
        setToast?.("Essa sala pede um código. Digite e clique em Assistir.");
        return;
      }
      await joinRoom({ host: value, code: value === host.trim() ? code.trim() : "", name: profileName || "Amigo" });
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setBusy(false);
      setRecents(readRecents());
    }
  };

  const discoveredByHost = useMemo(() => new Map((rooms || []).map((room) => [room.host, room])), [rooms]);
  const newRooms = (rooms || []).filter((room) => !recents.some((item) => item.host === room.host));

  return (
    <div className="ssColumns">
      <div className="ssMain">
        <section className="ssCard">
          <div className="ssCardHead">
            <span className="ssLabel">Na rede agora</span>
            <span className="ssScanning"><span className="ssScanDot" /> procurando salas</span>
          </div>
          {newRooms.length === 0 && recents.length === 0 && (
            <p className="ssMuted">Nenhuma sala ainda. Quando um amigo na mesma rede do Radmin clicar em Transmitir, ela aparece aqui sozinha.</p>
          )}
          {newRooms.length === 0 && recents.length > 0 && <p className="ssMuted">Nenhuma sala nova. As dos amigos que você já assistiu estão logo abaixo.</p>}
          {newRooms.length > 0 && (
            <div className="ssRecents">
              {newRooms.map((room) => (
                <RecentRoom key={room.host} item={{ host: room.host, name: room.name }} discovered={room} disabled={busy} onJoin={join} />
              ))}
            </div>
          )}
        </section>
        {recents.length > 0 && (
          <section className="ssCard">
            <span className="ssLabel">Salas dos amigos</span>
            <div className="ssRecents">
              {recents.map((item) => (
                <RecentRoom
                  key={item.host}
                  item={item}
                  discovered={discoveredByHost.get(item.host)}
                  disabled={busy}
                  onJoin={join}
                  onForget={(value) => { forgetRecent(value); setRecents(readRecents()); }}
                />
              ))}
            </div>
          </section>
        )}
        <Guide />
      </div>
      <aside className="ssSide">
        <section className="ssCard">
          <span className="ssLabel">Entrar pelo IP</span>
          <form className="ssJoinForm" onSubmit={(e) => { e.preventDefault(); join(host, needsCode); }}>
            <label className="ssField">
              <span>IP de quem transmite</span>
              <input value={host} onChange={(e) => { setHost(e.target.value); setNeedsCode(false); }} placeholder="Ex: 26.123.45.67" inputMode="decimal" disabled={busy} />
            </label>
            {needsCode && (
              <label className="ssField">
                <span>Código da sala</span>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex: K7QM" maxLength={24} autoFocus disabled={busy} />
              </label>
            )}
            <button className="btn btn-primary ssBigBtn" type="submit" disabled={busy || !host.trim()}>
              <Eye size={18} weight="fill" /> {busy ? "Conectando..." : "Assistir"}
            </button>
          </form>
          <p className="ssMuted small">Só precisa disso se a sala não aparecer sozinha. O IP fica em <b>Transmitir › Sua sala</b> no PC de quem transmite.</p>
        </section>
      </aside>
    </div>
  );
}

function ViewerLive({ watching }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const [volume, setVolume] = useState(readViewerVolume);
  const [muted, setMuted] = useState(false);
  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };
  const changeVolume = (value) => {
    setVolume(value);
    setMuted(false);
    saveViewerVolume(value);
  };
  const waiting = !!watching.status;
  const controls = (light) => (
    <>
      <div className="ssStageInfo">
        <b>{watching.name || watching.host}</b>
        {!waiting && <StatLine stats={watching.stats} />}
      </div>
      {!waiting && watching.hasAudio && (
        <div className="ssVolume">
          <button className={`ssIconBtn ${light ? "light" : ""}`} onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ligar o som" : "Tirar o som"}>
            {muted || volume === 0 ? <SpeakerSlash size={17} /> : <SpeakerSimpleHigh size={17} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" style={{ "--fill": `${(muted ? 0 : volume) * 100}%` }} />
        </div>
      )}
      {!waiting && <button className={`ssIconBtn ${light ? "light" : ""}`} onClick={fullscreen} title="Tela cheia (ou clique duas vezes no vídeo)" aria-label="Tela cheia"><CornersOut size={18} /></button>}
      <button className="btn ssStopBtn" onClick={() => leaveRoom()}><SignOut size={15} /> {waiting && watching.status !== "Reconectando..." ? "Cancelar" : "Sair"}</button>
    </>
  );
  return (
    <section className="ssCard ssStage ssWatch">
      <div className="ssVideoWrap ssWatchWrap" ref={stageRef}>
        <VideoView stream={watching.stream} className="ssVideo" videoRef={videoRef} onDoubleClick={fullscreen} muted={muted || !watching.hasAudio} volume={volume} />
        {waiting && (
          <div className="ssWaiting">
            <span className="ssSpinner" />
            <b>{watching.status}</b>
            <small>{watching.name || watching.host}</small>
          </div>
        )}
        <div className="ssOverlayBar">{controls(true)}</div>
      </div>
      <div className="ssStageBar">{controls(false)}</div>
    </section>
  );
}

export function ScreenSharePage({ profileName, setToast }) {
  const share = useScreenShare();
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("vozlab.screen.tab") === "assistir" ? "assistir" : "transmitir"; } catch { return "transmitir"; }
  });
  const pickTab = (value) => { setTab(value); try { localStorage.setItem("vozlab.screen.tab", value); } catch {} };
  const available = isScreenShareAvailable();

  const activeTab = share.mode === "hosting" ? "transmitir" : share.mode === "joining" || share.mode === "watching" ? "assistir" : tab;
  const locked = share.mode !== "idle";

  return (
    <div className="ssPage">
      <header className="ssHeader">
        <div>
          <h1>Compartilhar tela</h1>
          <p>Transmita para os amigos direto pelo Radmin VPN, sem servidor e sem abrir outro app.</p>
        </div>
        <div className="ssTabs" role="tablist">
          <button role="tab" aria-selected={activeTab === "transmitir"} className={activeTab === "transmitir" ? "on" : ""} disabled={locked && activeTab !== "transmitir"} onClick={() => pickTab("transmitir")}>
            <Broadcast size={15} weight={activeTab === "transmitir" ? "fill" : "regular"} /> Transmitir
          </button>
          <button role="tab" aria-selected={activeTab === "assistir"} className={activeTab === "assistir" ? "on" : ""} disabled={locked && activeTab !== "assistir"} onClick={() => pickTab("assistir")}>
            <Eye size={15} weight={activeTab === "assistir" ? "fill" : "regular"} /> Assistir
          </button>
        </div>
      </header>

      {!available ? (
        <section className="ssCard"><p className="ssMuted">Compartilhar tela só funciona no app instalado (não no navegador).</p></section>
      ) : share.mode === "hosting" ? (
        <HostLive hosting={share.hosting} setToast={setToast} />
      ) : share.mode === "joining" || share.mode === "watching" ? (
        <ViewerLive watching={share.watching} />
      ) : activeTab === "transmitir" ? (
        <HostSetup profileName={profileName} setToast={setToast} />
      ) : (
        <ViewerSetup profileName={profileName} setToast={setToast} rooms={share.rooms} />
      )}
    </div>
  );
}

// Fica sempre montado: liga o atalho global e o menu da bandeja, mostra os avisos e, fora da aba, os pedidos para
// entrar e um atalho de volta.
export function ScreenShareFloating({ page, setPage, setToast }) {
  const share = useScreenShare();

  useEffect(() => installScreenShareBridge(), []);
  useEffect(() => {
    if (share.error) {
      setToast?.(share.error);
      clearScreenShareError();
    }
  }, [share.error, setToast]);

  if (page === "tela" || share.mode === "idle") return null;
  if (share.mode === "hosting") {
    const request = share.hosting.requests[0];
    const viewers = share.hosting.viewers.length;
    return (
      <div className="ssFloat">
        {request ? (
          <>
            <UserCircle size={22} weight="fill" />
            <span><b>{request.name}</b> quer assistir</span>
            <button className="btn btn-ghost ssSmallBtn" onClick={() => rejectViewer(request.id)}>Recusar</button>
            <button className="btn btn-primary ssSmallBtn" onClick={() => acceptViewer(request.id)}>Aceitar</button>
          </>
        ) : (
          <>
            <span className="ssDot" />
            <button className="ssFloatMain" onClick={() => setPage("tela")}>
              Transmitindo{viewers ? ` para ${viewers === 1 ? share.hosting.viewers[0].name : `${viewers} pessoas`}` : ""}
            </button>
            <button className="ssIconBtn" onClick={() => stopHosting()} title="Parar transmissão" aria-label="Parar transmissão"><StopCircle size={18} weight="fill" /></button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="ssFloat">
      <Eye size={18} weight="fill" />
      <button className="ssFloatMain" onClick={() => setPage("tela")}>
        {share.mode === "joining" ? "Esperando entrar na sala..." : `Assistindo ${share.watching?.name || ""}`}
      </button>
      <button className="ssIconBtn" onClick={() => leaveRoom()} title="Sair" aria-label="Sair"><SignOut size={16} /></button>
    </div>
  );
}
