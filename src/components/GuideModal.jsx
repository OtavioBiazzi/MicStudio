import React, { useState } from "react";
import { VB_CABLE_URL } from "../audioChecks.js";

const FIRST_STEPS = [
  { title: "1. Instale o cabo virtual", text: "O VB-CABLE leva sua voz modificada até o Discord ou jogo. Baixe, instale, reinicie o PC e abra o app de novo. Se já instalou, pode pular.", link: { label: "Baixar VB-CABLE", href: VB_CABLE_URL } },
  { title: "2. Escolha o microfone e o CABLE Input", text: "Em Configurações → Áudio: no campo 1, seu microfone de verdade. No campo 2, escolha \"CABLE Input (VB-Audio Virtual Cable)\", que é por onde a sua voz modificada sai." },
  { title: "3. Escolha seu fone", text: "No campo 3, escolha seu fone ou caixa de som. É por ele que você se ouve. Não use o CABLE aqui." },
  { title: "4. Ligue a voz", text: "Clique em \"VOZ OFF\" no dock (a barra flutuante) para virar \"VOZ ON\". Depois escolha uma voz na aba Vozes." },
  { title: "5. Ouça sua voz", text: "Clique no ícone de alto-falante do dock para se ouvir. Se algo não funcionar, use \"Problemas de áudio?\" em Configurações." }
];

const PROGRAMS = [
  { title: "Discord", text: "Configurações de voz → Dispositivo de entrada: escolha \"CABLE Output (VB-Audio Virtual Cable)\". Desligue o cancelamento de ruído se a voz sair cortada." },
  { title: "OBS / streams", text: "Em Áudio, adicione \"Captura de entrada de áudio\" e escolha \"CABLE Output\"." },
  { title: "Jogos (Valorant, CS, Fortnite...)", text: "Nas opções de áudio do jogo, escolha \"CABLE Output\" como microfone / dispositivo de entrada de voz." },
  { title: "Zoom, Meet, Teams", text: "Nas configurações de áudio da chamada, escolha \"CABLE Output\" como microfone." },
  { title: "Ninguém me ouve?", text: "Confira: voz em VOZ ON, sem mudo, e o programa usando \"CABLE Output\". Ainda assim? Abra \"Problemas de áudio?\" e use \"Arrumar tudo automaticamente\"." }
];

export function GuideModal({ initialTab = "first", onClose }) {
  const [tab, setTab] = useState(initialTab);
  const items = tab === "first" ? FIRST_STEPS : PROGRAMS;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, padding: 24 }}>
        <h3 className="modalTitle" style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>
          {tab === "first" ? "👋 Bem-vindo! Primeiros passos" : "🎮 Usar nos seus programas"}
        </h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button className={`btn ${tab === "first" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("first")}>Primeiros passos</button>
          <button className={`btn ${tab === "programs" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("programs")}>Discord, OBS e jogos</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
          {items.map((item) => (
            <div key={item.title} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-input)" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 2 }}>{item.text}</div>
              {item.link && (
                <a href={item.link.href} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: "inline-block", marginTop: 8, padding: "5px 10px", fontSize: 11, textDecoration: "none" }}>
                  {item.link.label}
                </a>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
