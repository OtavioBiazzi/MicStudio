import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeContextMenu } from "../menuPosition";

export function ContextMenu({ x, y, onClose, children }) {
  const menuRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const reposition = () => {
      const next = placeContextMenu({ x, y }, menu.getBoundingClientRect(), {
        width: window.innerWidth, height: window.innerHeight,
      });
      setPosition((prev) => prev?.x === next.x && prev?.y === next.y ? prev : next);
    };
    const outside = (event) => {
      if (!menu.contains(event.target)) closeRef.current();
    };
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
    };
    const scroll = (event) => {
      if (!menu.contains(event.target)) closeRef.current();
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(menu);
    window.addEventListener("resize", reposition);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", keydown);
    window.addEventListener("scroll", scroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [x, y]);

  return createPortal(
    <div ref={menuRef} className="contextMenu adaptiveContextMenu" aria-label="Opcoes"
      style={{ left: position?.x ?? x, top: position?.y ?? y, visibility: position ? "visible" : "hidden" }}
      onClick={(event) => event.stopPropagation()}>
      {children}
    </div>, document.body
  );
}
