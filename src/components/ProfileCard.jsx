import React, { useEffect, useRef, useState } from "react";
import { Waveform, ArrowClockwise, ImageSquare, Image as ImageIcon, X } from "@phosphor-icons/react";
import { renderMarkdown } from "../utils";

// Cores do cartao de perfil (a faixa de cima, igual ao Discord).
export const PROFILE_COLORS = {
  violet: { label: "Roxo", from: "#8b5cf6", to: "#3b1d8f" },
  pink: { label: "Rosa", from: "#f472b6", to: "#831843" },
  teal: { label: "Turquesa", from: "#2dd4bf", to: "#134e4a" },
  orange: { label: "Laranja", from: "#fb923c", to: "#7c2d12" },
  blue: { label: "Azul", from: "#60a5fa", to: "#1e3a8a" },
  green: { label: "Verde", from: "#4ade80", to: "#14532d" },
  red: { label: "Vermelho", from: "#f87171", to: "#7f1d1d" },
  gold: { label: "Dourado", from: "#facc15", to: "#713f12" }
};

export function profileGradient(color) {
  const tone = PROFILE_COLORS[color] || PROFILE_COLORS.violet;
  return `linear-gradient(135deg, ${tone.from}, ${tone.to})`;
}

export function ProfilePhoto({ image, position = 50, name = "", color = "violet", size = 40, live = false, className = "" }) {
  return (
    <span
      className={`pfPhoto ${live ? "live" : ""} ${className}`}
      style={{ width: size, height: size, background: profileGradient(color), fontSize: Math.round(size * 0.42) }}
    >
      {image ? (
        <img src={image} alt="" style={{ objectPosition: `center ${position}%` }} />
      ) : name ? (
        String(name).trim().charAt(0).toUpperCase()
      ) : (
        <Waveform size={Math.round(size * 0.46)} weight="fill" />
      )}
    </span>
  );
}

// Cartao de perfil. profile: { name, status, bio, readme, avatar, avatarPosition, color }
export function ProfileCard({ profile, badges = null, stats = null, actions = null, onClose }) {
  const items = stats || [];
  return (
    <div className="pfCard">
      <div className="pfBanner" style={{ background: profileGradient(profile.color) }}>
        {onClose && <button className="pfClose" onClick={onClose} aria-label="Fechar"><X size={16} /></button>}
      </div>
      <div className="pfHead">
        <ProfilePhoto image={profile.avatar} position={profile.avatarPosition} name={profile.name} color={profile.color} size={92} className="pfBig" />
        <div className="pfActions">{actions}</div>
      </div>
      <div className="pfBody">
        <div className="pfName">
          <h2>{profile.name || "Sem nome"}</h2>
          {badges}
        </div>
        {profile.status && <div className="pfStatus"><span className="pfStatusDot" /> {profile.status}</div>}
        {profile.bio && <p className="pfBio">{profile.bio}</p>}
        {items.length > 0 && (
          <div className="pfStats">
            {items.map(([label, value]) => (
              <div key={label} className="pfStat">
                <strong>{Number(value || 0).toLocaleString("pt-BR")}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
        {profile.readme && profile.readme.trim() && (
          <div className="pfSection">
            <span className="pfSectionTitle">Sobre mim</span>
            <div className="readme-container pfReadme">{renderMarkdown(profile.readme)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Editor da foto (igual ao do Discord): arrasta, da zoom e gira ----------
const VIEW = 300; // tamanho do circulo na tela
const OUTPUT = 256; // tamanho final da foto salva

export function AvatarCropper({ src, onCancel, onApply }) {
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const downOutside = useRef(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);

  // Escala base: a foto cobre o circulo inteiro (como "cover").
  const turned = rotation % 180 !== 0;
  const naturalW = image ? (turned ? image.naturalHeight : image.naturalWidth) : 1;
  const naturalH = image ? (turned ? image.naturalWidth : image.naturalHeight) : 1;
  const base = image ? VIEW / Math.min(naturalW, naturalH) : 1;
  const scale = base * zoom;

  // Nao deixa a foto sair do circulo (sempre preenchido).
  const clamp = (next, z = zoom) => {
    const s = base * z;
    const maxX = Math.max(0, (naturalW * s - VIEW) / 2);
    const maxY = Math.max(0, (naturalH * s - VIEW) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, from: offset };
  };
  const onPointerMove = (event) => {
    if (!drag.current) return;
    const { startX, startY, from } = drag.current;
    setOffset(clamp({ x: from.x + event.clientX - startX, y: from.y + event.clientY - startY }));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (event) => {
    const next = Math.min(4, Math.max(1, zoom - event.deltaY * 0.0015));
    setZoom(next);
    setOffset((current) => clamp(current, next));
  };
  const changeZoom = (value) => {
    setZoom(value);
    setOffset((current) => clamp(current, value));
  };
  const rotate = () => {
    setRotation((value) => (value + 90) % 360);
    setOffset({ x: 0, y: 0 });
  };
  const reset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const apply = () => {
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    const k = OUTPUT / VIEW;
    ctx.translate(OUTPUT / 2, OUTPUT / 2);
    ctx.scale(k, k);
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    onApply(canvas.toDataURL("image/jpeg", 0.9));
  };

  return (
    <div
      className="modalOverlay pfCropOverlay"
      // So fecha se o clique comecou fora: arrastar a foto e soltar fora da janela nao pode cancelar a edicao.
      onMouseDown={(e) => { downOutside.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOutside.current && e.target === e.currentTarget) onCancel(); downOutside.current = false; }}
    >
      <div className="modalContent pfCrop" onClick={(e) => e.stopPropagation()}>
        <div className="pfCropHead">
          <h3>Editar imagem</h3>
          <button className="ttsIconBtn" onClick={onCancel} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div
          className="pfCropStage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {image && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="pfCropImg"
              style={{
                width: image.naturalWidth,
                height: image.naturalHeight,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`
              }}
            />
          )}
          <div className="pfCropCircle" style={{ width: VIEW, height: VIEW }} />
        </div>
        <div className="pfCropTools">
          <ImageSquare size={16} />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label="Zoom" style={{ "--fill": `${((zoom - 1) / 3) * 100}%` }} />
          <ImageIcon size={22} />
          <button className="ttsIconBtn pfRotate" onClick={rotate} title="Girar" aria-label="Girar"><ArrowClockwise size={18} /></button>
        </div>
        <p className="pfCropHint">Arraste a foto para posicionar. Use a barra (ou a rodinha do mouse) para dar zoom.</p>
        <div className="pfCropFoot">
          <button className="ssLink" onClick={reset}>Redefinir</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={apply} disabled={!image}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}
