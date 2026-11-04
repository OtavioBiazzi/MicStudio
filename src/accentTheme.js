// Tema de cor (acento): a partir de uma cor primaria calcula todas as variaveis que o app usa,
// para botoes, destaques, brilhos, logo e bordas mudarem juntos.

function parseHex(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [139, 92, 246];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

// mistura `rgb` com branco (amount 0..1)
export function lighten(rgb, amount) {
  return rgb.map((v) => v + (255 - v) * amount);
}

// luminancia relativa (0..1): decide se o texto sobre o acento deve ser claro ou escuro
export function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function accentVariables(palette) {
  const primary = parseHex(palette.primary);
  const hover = parseHex(palette.hover);
  const dim = parseHex(palette.dim);
  const lighter = lighten(hover, 0.35);
  const onAccent = luminance(primary) > 0.42 ? "#0a0a0f" : "#ffffff";
  const rgb = primary.join(", ");
  return {
    "--purple": palette.primary,
    "--purple-hover": palette.hover,
    "--purple-dim": palette.dim,
    "--purple-glow": palette.glow,
    "--purple-soft": palette.soft,
    "--purple-bg": palette.bg,
    "--border-hover": palette.borderHover,
    "--border-active": palette.borderActive,
    "--accent-rgb": rgb,
    "--accent-light-rgb": hover.join(", "),
    "--accent-lighter": toHex(lighter),
    "--on-accent": onAccent,
    // destaques que antes eram um indigo fixo
    "--cyan": toHex(lighten(hover, 0.18)),
    "--cyan-glow": `rgba(${hover.join(", ")}, .18)`,
    "--cyan-soft": `rgba(${hover.join(", ")}, .08)`,
    // logo da barra lateral
    "--logo-1a": toHex(lighter),
    "--logo-1b": palette.primary,
    "--logo-2a": palette.hover,
    "--logo-2b": palette.dim,
    "--shadow-glow-purple": `0 0 24px rgba(${rgb}, .22)`,
    "--shadow-glow-cyan": `0 0 24px rgba(${hover.join(", ")}, .14)`
  };
}
