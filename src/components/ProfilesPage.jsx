import React, { useMemo, useRef, useState } from "react";
import {
  Plus, Check, DotsThreeVertical, Trash, PencilSimple, ArrowsClockwise, Export, UploadSimple, Keyboard, AppWindow
} from "@phosphor-icons/react";
import { voicePresets } from "../voicePresets";
import { ContextMenu } from "./ContextMenu";
import { postAPI } from "../apiClient";

const EMOJIS = ["🎙️", "🎮", "💬", "📺", "🎧", "🤖", "👹", "🎤", "🔥", "🌙"];

function describeProfile(profile, voiceName) {
  const effects = Object.entries(profile.controls?.effects || {}).filter(([key, value]) => key.endsWith("_enabled") && value).length;
  const parts = [voiceName];
  if (effects) parts.push(`${effects} efeito${effects > 1 ? "s" : ""}`);
  if (profile.controls?.masterMute) parts.push("mudo");
  return parts.join(" • ");
}

export function ProfilesPage({ state, call, setToast, customVoices = [] }) {
  const profiles = state.audioProfiles || [];
  const activeId = state.activeAudioProfileId || "";
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", emoji: EMOJIS[0], applyDevices: false });
  const [editingId, setEditingId] = useState(null);
  const [menu, setMenu] = useState(null);
  const importRef = useRef(null);

  const voiceNames = useMemo(() => {
    const map = new Map();
    for (const voice of [...voicePresets, ...customVoices]) map.set(voice.id, voice.label || voice.name || voice.id);
    return map;
  }, [customVoices]);

  const run = async (path, body, success) => {
    try {
      await call(path, body);
      if (success) setToast(success);
      return true;
    } catch (error) {
      setToast(error.message);
      return false;
    }
  };

  const createProfile = async () => {
    if (!draft.name.trim()) {
      setToast("Dê um nome para o perfil.");
      return;
    }
    const ok = await run("/api/profiles/create", { ...draft, name: draft.name.trim() }, `Perfil "${draft.name.trim()}" salvo com a voz e os ajustes de agora.`);
    if (ok) {
      setCreating(false);
      setDraft({ name: "", emoji: EMOJIS[0], applyDevices: false });
    }
  };

  const exportProfiles = () => {
    const blob = new Blob([JSON.stringify({ app: "micfudiddo", version: 1, profiles }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "perfis-micfudiddo.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    setToast("Perfis exportados.");
  };

  const importProfiles = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      setToast("Arquivo grande demais para ser de perfis.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.profiles;
      await run("/api/profiles/import", { profiles: list }, "Perfis importados.");
    } catch {
      setToast("Esse arquivo não parece ser de perfis do MicFudiddo.");
    }
  };

  return (
    <div className="profilesPage">
      <div className="profilesHeader">
        <div>
          <h1>Perfis</h1>
          <p>Guarde sua voz, efeitos, volumes e até microfone e fone. Troque com um clique, por atalho ou automaticamente quando abrir o Discord, um jogo ou o OBS.</p>
        </div>
        <div className="profilesActions">
          <button className="btn btn-primary" onClick={() => setCreating((open) => !open)}>
            <Plus size={14} weight="bold" /> Salvar estado atual
          </button>
          <button className="btn btn-ghost" onClick={() => importRef.current?.click()}><UploadSimple size={14} /> Importar</button>
          <button className="btn btn-ghost" onClick={exportProfiles} disabled={!profiles.length}><Export size={14} /> Exportar</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importProfiles} />
        </div>
      </div>

      {creating && (
        <div className="profileCreate">
          <div className="profileEmojis">
            {EMOJIS.map((emoji) => (
              <button key={emoji} className={draft.emoji === emoji ? "active" : ""} onClick={() => setDraft({ ...draft, emoji })} aria-label={`Ícone ${emoji}`}>{emoji}</button>
            ))}
          </div>
          <input
            autoFocus
            value={draft.name}
            maxLength={40}
            placeholder="Nome do perfil (ex.: Discord, Jogo, Stream)"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            onKeyDown={(event) => { if (event.key === "Enter") createProfile(); }}
          />
          <label className="profileCheck">
            <input type="checkbox" checked={draft.applyDevices} onChange={(event) => setDraft({ ...draft, applyDevices: event.target.checked })} />
            Também trocar microfone e fone ao aplicar
          </label>
          <div className="profileCreateActions">
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={createProfile}><Check size={14} weight="bold" /> Salvar perfil</button>
          </div>
          <small>Vai guardar a voz e os ajustes que estão ativos agora.</small>
        </div>
      )}

      {!profiles.length && !creating && (
        <div className="profilesEmpty">
          <div className="profilesEmptyIcon">🎛️</div>
          <h3>Nenhum perfil ainda</h3>
          <p>Ajuste sua voz do jeito que quiser (na aba Vozes ou no Voice Lab) e clique em <strong>Salvar estado atual</strong>. Depois é só aplicar quando precisar.</p>
        </div>
      )}

      <div className="profilesGrid">
        {profiles.map((profile) => {
          const isActive = profile.id === activeId;
          return (
            <div key={profile.id} className={`profileCard ${isActive ? "active" : ""}`}>
              <div className="profileCardTop">
                <span className="profileEmoji">{profile.emoji}</span>
                <div className="profileInfo">
                  <div className="profileName">{profile.name}</div>
                  <div className="profileMeta">{describeProfile(profile, voiceNames.get(profile.voiceId) || "Voz personalizada")}</div>
                </div>
                <button
                  className="profileMore"
                  aria-label={`Mais opções de ${profile.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({ x: rect.left, y: rect.bottom, profile });
                  }}
                >
                  <DotsThreeVertical size={18} weight="bold" />
                </button>
              </div>

              <div className="profileTags">
                {profile.processes?.length > 0 && <span title={profile.processes.join(", ")}><AppWindow size={12} /> Automático: {profile.processes.slice(0, 2).join(", ")}{profile.processes.length > 2 ? "…" : ""}</span>}
                {profile.hotkey && <span><Keyboard size={12} /> {profile.hotkey}</span>}
                {profile.applyDevices && <span>Troca dispositivos</span>}
              </div>

              <button
                className={`btn ${isActive ? "btn-ghost" : "btn-primary"} profileApply`}
                onClick={() => run("/api/profiles/apply", { id: profile.id })}
              >
                {isActive ? <><Check size={14} weight="bold" /> Em uso</> : "Aplicar"}
              </button>
            </div>
          );
        })}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <button onClick={() => { setEditingId(menu.profile.id); setMenu(null); }}>
            <PencilSimple size={14} /> Editar nome, programas e atalho
          </button>
          <button onClick={() => { run("/api/profiles/update", { id: menu.profile.id, patch: { capture: true } }, "Perfil atualizado com o estado atual."); setMenu(null); }}>
            <ArrowsClockwise size={14} /> Atualizar com o estado atual
          </button>
          <div className="menuSep" role="separator" />
          <button className="danger" onClick={() => { if (confirm(`Excluir o perfil "${menu.profile.name}"?`)) run("/api/profiles/delete", { id: menu.profile.id }, "Perfil excluído."); setMenu(null); }}>
            <Trash size={14} /> Excluir perfil
          </button>
        </ContextMenu>
      )}

      {editingId && (
        <ProfileEditor
          profile={profiles.find((p) => p.id === editingId)}
          call={call}
          setToast={setToast}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function ProfileEditor({ profile, call, setToast, onClose }) {
  const [name, setName] = useState(profile?.name || "");
  const [emoji, setEmoji] = useState(profile?.emoji || EMOJIS[0]);
  const [processes, setProcesses] = useState((profile?.processes || []).join(", "));
  const [hotkey, setHotkey] = useState(profile?.hotkey || "");
  const [applyDevices, setApplyDevices] = useState(Boolean(profile?.applyDevices));
  const [detecting, setDetecting] = useState(false);
  if (!profile) return null;

  const captureHotkey = (event) => {
    event.preventDefault();
    const keys = [];
    if (event.ctrlKey) keys.push("Ctrl");
    if (event.shiftKey) keys.push("Shift");
    if (event.altKey) keys.push("Alt");
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    if (!["Control", "Shift", "Alt", "Meta"].includes(key)) keys.push(key);
    if (keys.length > 1 || /^F\d+$/.test(key)) setHotkey(keys.join("+"));
  };

  // O usuario troca para o programa e o app anota qual era, sem precisar digitar nome de .exe.
  const detectProgram = async () => {
    setDetecting(true);
    setToast("Troque para o programa que quer detectar. Você tem 5 segundos...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const result = await postAPI("/api/profiles/foreground");
      const exe = result?.process;
      if (!exe || exe.includes("micfudiddo")) {
        setToast("Não consegui detectar. Tente de novo trocando para o programa.");
      } else {
        setProcesses((current) => Array.from(new Set([...current.split(",").map((item) => item.trim()).filter(Boolean), exe])).join(", "));
        setToast(`Detectado: ${exe}`);
      }
    } catch (error) {
      setToast(error.message);
    } finally {
      setDetecting(false);
    }
  };

  const save = async () => {
    try {
      await call("/api/profiles/update", {
        id: profile.id,
        patch: {
          name,
          emoji,
          hotkey,
          applyDevices,
          processes: processes.split(",").map((item) => item.trim()).filter(Boolean)
        }
      });
      setToast("Perfil salvo.");
      onClose();
    } catch (error) {
      setToast(error.message);
    }
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 480, padding: 24 }}>
        <h3 className="modalTitle" style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 800 }}>Editar perfil</h3>
        <div className="profileEmojis">
          {EMOJIS.map((item) => (
            <button key={item} className={emoji === item ? "active" : ""} onClick={() => setEmoji(item)}>{item}</button>
          ))}
        </div>
        <div className="labField">
          <label>Nome</label>
          <input type="text" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="labField">
          <label>Aplicar automaticamente quando estes programas estiverem em uso</label>
          <input type="text" value={processes} placeholder="Ex.: discord.exe, valorant.exe" onChange={(event) => setProcesses(event.target.value)} />
          <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={detectProgram} disabled={detecting}>
            {detecting ? "Detectando..." : "Detectar o programa que eu abrir"}
          </button>
        </div>
        <div className="labField">
          <label>Atalho para aplicar este perfil</label>
          <input type="text" value={hotkey} readOnly placeholder="Clique aqui e aperte as teclas" onKeyDown={captureHotkey} />
          {hotkey && <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setHotkey("")}>Remover atalho</button>}
        </div>
        <label className="profileCheck">
          <input type="checkbox" checked={applyDevices} onChange={(event) => setApplyDevices(event.target.checked)} />
          Também trocar microfone e fone ao aplicar
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
