import React from "react";
import { Minus, Square, X } from "@phosphor-icons/react";

export function WindowControls({ onCloseRequest }) {
  const controls = window.micfudiddo;
  return (
    <div className="windowControls">
      <button title="Minimizar" onClick={() => controls?.minimize?.()}>
        <Minus size={16} />
      </button>
      <button title="Maximizar" onClick={() => controls?.toggleMaximize?.()}>
        <Square size={13} />
      </button>
      <button className="close" title="Fechar" onClick={onCloseRequest || (() => controls?.closeWithChoice?.())}>
        <X size={16} />
      </button>
    </div>
  );
}
