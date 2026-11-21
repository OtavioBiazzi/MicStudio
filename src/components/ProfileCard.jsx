import React, { useEffect, useRef, useState } from "react";
import { Waveform, ArrowClockwise, ImageSquare, Image as ImageIcon, X, PencilSimple } from "@phosphor-icons/react";
import { renderMarkdown } from "../utils";

// Cores prontas da faixa do perfil (quando nao tem imagem).
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

// Temas do cartao inteiro (como o "Tema de perfil" do Nitro): duas cores.
export const PROFILE_THEMES = [
  { primary: "#3b82f6", accent: "#2dd4bf", label: "Oceano" },
  { primary: "#8b5cf6", accent: "#ec4899", label: "Neon" },
  { primary: "#f97316", accent: "#7c3aed", label: "Pôr do sol" },
  { primary: "#10b981", accent: "#0f172a", label: "Floresta" },
  { primary: "#ef4444", accent: "#111827", label: "Vilão" },
  { primary: "#f5d0fe", accent: "#818cf8", label: "Algodão" }
];

export function profileGradient(color) {
  const tone = PROFILE_COLORS[color] || PROFILE_COLORS.violet;
  return `linear-gradient(135deg, ${tone.from}, ${tone.to})`;
}

// Imagem com ajuste (arrastar/zoom/girar) aplicado na hora. Funciona com GIF animado sem perder a animacao.
function CroppedImage({ src, crop, position = 50 }) {
  if (!crop) return <img src={src} alt="" draggable={false} style={{ objectPosition: `center ${position}%` }} />;
  const x = Number(crop.x) || 0;
  const y = Number(crop.y) || 0;
  const zoom = Number(crop.zoom) || 1;
  const rotation = Number(crop.rotation) || 0;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{ transform: `translate(${x * 100}%, ${y * 100}%) rotate(${rotation}deg) scale(${zoom})`, transformOrigin: "center center" }}
    />
  );
}

export function ProfilePhoto({ image, position = 50, crop = null, name = "", color = "violet", size = 40, live = false, className = "" }) {
  return (
    <span
      className={`pfPhoto ${live ? "live" : ""} ${className}`}
      style={{ width: size, height: size, background: profileGradient(color), fontSize: Math.round(size * 0.42) }}
    >
      {image ? (
        <span className="pfPhotoClip"><CroppedImage src={image} crop={crop} position={position} /></span>
      ) : name ? (
        String(name).trim().charAt(0).toUpperCase()
      ) : (
        <Waveform size={Math.round(size * 0.46)} weight="fill" />
      )}
    </span>
  );
}

// Cartao de perfil. profile: { name, status, bio, readme, avatar, avatarPosition, avatarCrop, banner: {data|src, crop}, theme, color }
// onEditAvatar/onEditBanner: quando vem, passar o mouse mostra "trocar" (igual ao Discord).
const STAT_LABELS = [
  ["sounds", "Sons"],
  ["plays", "Reproduções"],
  ["favoriteVoices", "Vozes favoritas"],
  ["favoriteSounds", "Sons favoritos"],
  ["customVoices", "Vozes criadas"]
];

export function profileStatItems(stats) {
  return stats ? STAT_LABELS.map(([key, label]) => [label, stats[key] || 0]) : [];
}

export function ProfileCard({ profile, badges = null, stats = null, actions = null, onClose, onEditAvatar, onEditBanner }) {
  const items = stats || profileStatItems(profile.stats);
  const bannerSrc = profile.banner?.data || profile.banner?.src || "";
  const theme = profile.theme;
  const style = theme ? { "--pf-primary": theme.primary, "--pf-accent": theme.accent } : undefined;
  return (
    <div className={`pfCard ${theme ? "themed" : ""}`} style={style}>
      <div className={`pfBanner ${onEditBanner ? "editable" : ""}`} style={bannerSrc ? undefined : { background: theme ? `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` : profileGradient(profile.color) }} onClick={onEditBanner}>
        {bannerSrc && <span className="pfBannerClip"><CroppedImage src={bannerSrc} crop={profile.banner?.crop} /></span>}
        {onEditBanner && <span className="pfEditHint"><PencilSimple size={15} weight="bold" /> Trocar faixa</span>}
        {onClose && <button className="pfClose" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Fechar"><X size={16} /></button>}
      </div>
      <div className="pfHead">
        <span className={`pfAvatarWrap ${onEditAvatar ? "editable" : ""}`} onClick={onEditAvatar}>
          <ProfilePhoto image={profile.avatar} position={profile.avatarPosition} crop={profile.avatarCrop} name={profile.name} color={profile.color} size={92} className="pfBig" />
          {onEditAvatar && <span className="pfEditHint round"><PencilSimple size={16} weight="bold" /></span>}
        </span>
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

// ---------- Editor de imagem (igual ao do Discord): arrasta, da zoom e gira ----------
// shape "circle" (foto, 300x300) ou "banner" (faixa, 480x192). Imagens paradas saem recortadas;
// GIF sai inteiro com o ajuste guardado, para continuar animado.
export function ImageCropper({ src, isGif = false, shape = "circle", initialCrop = null, onCancel, onApply }) {
  const viewW = shape === "banner" ? 480 : 300;
  const viewH = shape === "banner" ? 192 : 300;
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(initialCrop?.zoom || 1);
  const [rotation, setRotation] = useState(initialCrop?.rotation || 0);
  const [offset, setOffset] = useState({ x: (initialCrop?.x || 0) * viewW, y: (initialCrop?.y || 0) * viewH });
  const drag = useRef(null);
  const downOutside = useRef(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);

  const turned = rotation % 180 !== 0;
  const naturalW = image ? (turned ? image.naturalHeight : image.naturalWidth) : 1;
  const naturalH = image ? (turned ? image.naturalWidth : image.naturalHeight) : 1;
  // "Cover" igual ao object-fit: a imagem sempre preenche a area inteira.
  const base = image ? Math.max(viewW / (image.naturalWidth || 1), viewH / (image.naturalHeight || 1)) : 1;
  const scale = base * zoom;

  const clamp = (next, z = zoom) => {
    const s = base * z;
    const maxX = Math.max(0, (naturalW * s - viewW) / 2);
    const maxY = Math.max(0, (naturalH * s - viewH) / 2);
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
    const crop = { x: offset.x / viewW, y: offset.y / viewH, zoom, rotation };
    if (isGif) {
      onApply({ data: src, crop, isGif: true });
      return;
    }
    const outW = shape === "banner" ? 1200 : 512;
    const outH = shape === "banner" ? 480 : 512;
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    const k = outW / viewW;
    ctx.translate(outW / 2, outH / 2);
    ctx.scale(k, k);
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    onApply({ data: canvas.toDataURL("image/jpeg", 0.9), crop: null, isGif: false });
  };

  return (
    <div
      className="modalOverlay pfCropOverlay"
      // So fecha se o clique comecou fora: arrastar a foto e soltar fora da janela nao pode cancelar a edicao.
      onMouseDown={(e) => { downOutside.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOutside.current && e.target === e.currentTarget) onCancel(); downOutside.current = false; }}
    >
      <div className={`modalContent pfCrop ${shape}`} onClick={(e) => e.stopPropagation()}>
        <div className="pfCropHead">
          <h3>{shape === "banner" ? "Editar faixa" : "Editar imagem"}</h3>
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
          <div className={`pfCropFrame ${shape}`} style={{ width: viewW, height: viewH }} />
        </div>
        <div className="pfCropTools">
          <ImageSquare size={16} />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label="Zoom" style={{ "--fill": `${((zoom - 1) / 3) * 100}%` }} />
          <ImageIcon size={22} />
          <button className="ttsIconBtn pfRotate" onClick={rotate} title="Girar" aria-label="Girar"><ArrowClockwise size={18} /></button>
        </div>
        <p className="pfCropHint">Arraste para posicionar. Use a barra (ou a rodinha do mouse) para dar zoom.{isGif ? " O GIF continua animado." : ""}</p>
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

// Compatibilidade: o editor de foto antigo.
export function AvatarCropper(props) {
  return <ImageCropper shape="circle" {...props} onApply={(result) => props.onApply(result.data, result)} />;
}
