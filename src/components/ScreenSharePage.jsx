import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Monitor, AppWindow, Broadcast, Eye, Copy, ArrowClockwise, X, Check, CornersOut, SignOut, Lock, LockOpen,
  WifiHigh, WifiSlash, UserCircle, Trash, Info, StopCircle, Play
} from "@phosphor-icons/react";
import {
  SCREEN_QUALITIES, useScreenShare, isScreenShareAvailable, listScreenSources, listAddresses, startHosting, stopHosting,
  acceptViewer, rejectViewer, kickViewer, joinRoom, leaveRoom, probeRoom, readRecents, forgetRecent, readHostPrefs,
  saveHostPrefs, randomRoomCode, clearScreenShareError, clearHostNotice
} from "../screenShare";

function VideoView({ stream, muted = true, className = "", onDoubleClick, videoRef }) {
  const localRef = useRef(null);
  const ref = videoRef || localRef;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream || null;
    if (stream) video.play?.().catch(() => {});
  }, [stream, ref]);
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
          <p className="ssMuted">Sua sala é sempre a mesma. Seus amigos colam esse IP uma vez em <b>Assistir</b> e depois é só clicar na sua sala.</p>
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
      <p className="ssMuted small">Se o Windows perguntar sobre o firewall na primeira vez, marque <b>Redes públicas</b> também e clique em Permitir. A rede do Radmin costuma ser pública.</p>
      {!hasVpn && addresses.length > 0 && (
        <div className="ssWarn"><Info size={15} /> Não achei o Radmin VPN. Ele precisa estar aberto e na mesma rede dos seus amigos (se estiverem na mesma casa, não precisa).</div>
      )}
    </section>
  );
}

function SourcePicker({ sources, loading, selectedId, onSelect, onRefresh }) {
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
        <span className="ssLabel">O que transmitir</span>
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

function HostSetup({ profileName, setToast }) {
  const [addresses, setAddresses] = useState([]);
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [selected, setSelected] = useState(null);
  const [prefs, setPrefs] = useState(readHostPrefs);
  const [starting, setStarting] = useState(false);

  const updatePrefs = (patch) => setPrefs((current) => { const next = { ...current, ...patch }; saveHostPrefs(next); return next; });

  const refreshAddresses = useCallback(() => { listAddresses().then(setAddresses).catch(() => {}); }, []);
  const refreshSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const list = await listScreenSources();
      setSources(list);
      setSelected((current) => list.find((item) => item.id === current?.id) || list.find((item) => item.isScreen) || list[0] || null);
    } catch {
      setSources([]);
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => { refreshAddresses(); refreshSources(); }, [refreshAddresses, refreshSources]);

  const start = async () => {
    if (!selected) return;
    setStarting(true);
    try {
      await startHosting({
        sourceId: selected.id,
        sourceName: selected.name,
        quality: prefs.quality,
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
        <SourcePicker sources={sources} loading={loadingSources} selectedId={selected?.id} onSelect={setSelected} onRefresh={refreshSources} />
      </div>
      <aside className="ssSide">
        <AddressCard addresses={addresses} setToast={setToast} onRefresh={refreshAddresses} />
        <section className="ssCard">
          <span className="ssLabel">Qualidade</span>
          <div className="ssQualities">
            {Object.values(SCREEN_QUALITIES).map((quality) => (
              <button key={quality.id} className={`ssQuality ${prefs.quality === quality.id ? "on" : ""}`} onClick={() => updatePrefs({ quality: quality.id })}>
                <strong>{quality.label}</strong>
                <small>{quality.detail}</small>
                <em>{quality.hint}</em>
              </button>
            ))}
          </div>
        </section>
        <section className="ssCard">
          <div className="ssCardHead">
            <span className="ssLabel">Quem pode entrar</span>
          </div>
          <label className="ssToggleRow">
            <span>
              <b>{prefs.askCode ? <Lock size={14} /> : <LockOpen size={14} />} Pedir código</b>
              <small>{prefs.askCode ? "Só entra quem souber o código." : "Qualquer um com seu IP pode pedir. Você sempre aceita antes."}</small>
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

function HostLive({ hosting, setToast }) {
  const quality = SCREEN_QUALITIES[hosting.quality];
  const main = hosting.addresses[0];
  return (
    <div className="ssColumns">
      <div className="ssMain">
        <section className="ssCard ssStage">
          <div className="ssVideoWrap">
            <VideoView stream={hosting.stream} className="ssVideo" />
            <span className="ssLive"><span className="ssDot" /> AO VIVO</span>
          </div>
          <div className="ssStageBar">
            <div className="ssStageInfo">
              <b>{hosting.sourceName}</b>
              <small>{quality?.label} · {quality?.detail}{hosting.code ? ` · código ${hosting.code}` : ""}</small>
            </div>
            <button className="btn ssStopBtn" onClick={() => stopHosting()}><StopCircle size={16} weight="fill" /> Parar transmissão</button>
          </div>
        </section>
      </div>
      <aside className="ssSide">
        {hosting.requests.length > 0 && (
          <section className="ssCard ssCardAccent">
            <span className="ssLabel">Pedindo para entrar</span>
            {hosting.requests.map((request) => <RequestCard key={request.id} request={request} />)}
          </section>
        )}
        <section className="ssCard">
          <span className="ssLabel">Assistindo</span>
          {hosting.viewer ? (
            <div className="ssViewer">
              <UserCircle size={30} weight="fill" />
              <div className="ssRequestText">
                <b>{hosting.viewer.name}</b>
                {hosting.viewer.connected ? <StatLine stats={hosting.stats} /> : <small>Conectando...</small>}
              </div>
              <button className="ssIconBtn" onClick={kickViewer} title="Tirar da sala" aria-label="Tirar da sala"><X size={16} /></button>
            </div>
          ) : (
            <p className="ssMuted">Ninguém ainda.{main ? <> Mande seu IP: <button className="ssInlineCopy" onClick={() => copy(main.address, setToast)}>{main.address} <Copy size={12} /></button></> : null}</p>
          )}
          {hosting.stats?.limitedBy && <p className="ssMuted small">A qualidade caiu para não travar ({hosting.stats.limitedBy === "bandwidth" ? "internet" : "processador"}).</p>}
          {hosting.notice && <div className="ssNotice" onClick={clearHostNotice}>{hosting.notice}</div>}
        </section>
        <p className="ssMuted small">Pode minimizar ou trocar de aba: a transmissão continua. Nesta versão, uma pessoa assiste por vez.</p>
      </aside>
    </div>
  );
}

function RecentRoom({ item, onJoin, onForget, disabled }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    probeRoom(item.host).then((result) => { if (alive) setStatus(result); }).catch(() => {});
    const timer = setInterval(() => probeRoom(item.host).then((result) => { if (alive) setStatus(result); }).catch(() => {}), 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [item.host]);
  const online = status?.online;
  const label = !status ? "Verificando..." : online ? (status.busy ? "Ocupada" : "Transmitindo agora") : "Offline";
  return (
    <div className={`ssRecent ${online && !status.busy ? "live" : ""}`}>
      <span className="ssRecentIcon">{online ? <WifiHigh size={18} weight="bold" /> : <WifiSlash size={18} />}</span>
      <div className="ssRequestText">
        <b>{status?.name || item.name || item.host}</b>
        <small>{item.host} · <span className="ssRecentState">{label}</span>{status?.needsCode ? " · pede código" : ""}</small>
      </div>
      <button className="ssIconBtn" onClick={() => onForget(item.host)} title="Esquecer" aria-label="Esquecer"><Trash size={15} /></button>
      <button className="btn btn-primary ssSmallBtn" disabled={disabled || !online || status?.busy} onClick={() => onJoin(item.host, status?.needsCode)}>
        <Play size={13} weight="fill" /> Assistir
      </button>
    </div>
  );
}

function ViewerSetup({ profileName, setToast }) {
  const [host, setHost] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [recents, setRecents] = useState(readRecents);
  const [busy, setBusy] = useState(false);

  const join = async (target, askCode = needsCode) => {
    const value = String(target || "").trim();
    if (!value) { setToast?.("Cole o IP de quem está transmitindo."); return; }
    setBusy(true);
    try {
      const probe = await probeRoom(value);
      if (!probe.online) { setToast?.(probe.reason || "Essa pessoa não está transmitindo agora."); return; }
      if (probe.busy) { setToast?.("Já tem alguém assistindo essa sala."); return; }
      if ((probe.needsCode || askCode) && !code.trim()) {
        setHost(value);
        setNeedsCode(true);
        setToast?.("Essa sala pede um código. Digite e clique em Assistir.");
        return;
      }
      await joinRoom({ host: value, code: code.trim(), name: profileName || "Amigo" });
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setBusy(false);
      setRecents(readRecents());
    }
  };

  return (
    <div className="ssColumns">
      <div className="ssMain">
        <section className="ssCard">
          <span className="ssLabel">Salas dos amigos</span>
          {recents.length === 0 ? (
            <p className="ssMuted">As salas em que você entrar aparecem aqui. Da próxima vez é só clicar em Assistir.</p>
          ) : (
            <div className="ssRecents">
              {recents.map((item) => (
                <RecentRoom key={item.host} item={item} disabled={busy} onJoin={join} onForget={(value) => { forgetRecent(value); setRecents(readRecents()); }} />
              ))}
            </div>
          )}
        </section>
      </div>
      <aside className="ssSide">
        <section className="ssCard">
          <span className="ssLabel">Entrar numa sala</span>
          <form className="ssJoinForm" onSubmit={(e) => { e.preventDefault(); join(host); }}>
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
          <p className="ssMuted small">Peça o IP para quem vai transmitir. Ele aparece em <b>Transmitir › Sua sala</b>. Vocês dois precisam estar na mesma rede do Radmin VPN.</p>
        </section>
      </aside>
    </div>
  );
}

function ViewerLive({ watching }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };
  const waiting = !!watching.status;
  return (
    <section className="ssCard ssStage ssWatch">
      <div className="ssVideoWrap ssWatchWrap" ref={stageRef}>
        <VideoView stream={watching.stream} className="ssVideo" videoRef={videoRef} onDoubleClick={fullscreen} />
        {waiting && (
          <div className="ssWaiting">
            <span className="ssSpinner" />
            <b>{watching.status}</b>
            <small>{watching.name || watching.host}</small>
          </div>
        )}
        <div className="ssOverlayBar">
          <div className="ssStageInfo">
            <b>{watching.name || watching.host}</b>
            {!waiting && <StatLine stats={watching.stats} />}
          </div>
          {!waiting && <button className="ssIconBtn light" onClick={fullscreen} title="Tela cheia (ou clique duas vezes no vídeo)" aria-label="Tela cheia"><CornersOut size={18} /></button>}
          <button className="btn ssStopBtn" onClick={() => leaveRoom()}><SignOut size={15} /> {waiting ? "Cancelar" : "Sair"}</button>
        </div>
      </div>
      <div className="ssStageBar">
          <div className="ssStageInfo">
            <b>{watching.name || watching.host}</b>
            {!waiting && <StatLine stats={watching.stats} />}
          </div>
          {!waiting && <button className="ssIconBtn" onClick={fullscreen} title="Tela cheia (ou clique duas vezes no vídeo)" aria-label="Tela cheia"><CornersOut size={18} /></button>}
          <button className="btn ssStopBtn" onClick={() => leaveRoom()}><SignOut size={15} /> {waiting ? "Cancelar" : "Sair"}</button>
      </div>
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

  useEffect(() => {
    if (share.error) {
      setToast?.(share.error);
      clearScreenShareError();
    }
  }, [share.error, setToast]);

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
        <ViewerSetup profileName={profileName} setToast={setToast} />
      )}
    </div>
  );
}

// Fica sempre na tela (fora da aba): mostra pedidos para entrar e um atalho de volta quando voce esta em outra aba.
export function ScreenShareFloating({ page, setPage }) {
  const share = useScreenShare();
  if (page === "tela" || share.mode === "idle") return null;
  if (share.mode === "hosting") {
    const request = share.hosting.requests[0];
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
              Transmitindo{share.hosting.viewer ? ` para ${share.hosting.viewer.name}` : ""}
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
