import { useEffect, useRef } from "react";

// Faixa rolavel na horizontal: roda do mouse rola para o lado e arrastar com o mouse tambem.
// Um clique normal continua funcionando; so um arrasto de verdade cancela o clique do botao.
export function useDragScroll() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;

    const onWheel = (event) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    const onDown = (event) => {
      if (event.button !== 0) return;
      down = true;
      moved = false;
      startX = event.clientX;
      startLeft = el.scrollLeft;
    };
    const onMove = (event) => {
      if (!down) return;
      const delta = event.clientX - startX;
      if (!moved && Math.abs(delta) > 5) {
        moved = true;
        el.classList.add("dragScrolling");
      }
      if (moved) el.scrollLeft = startLeft - delta;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      el.classList.remove("dragScrolling");
    };
    const onClickCapture = (event) => {
      if (moved) {
        event.stopPropagation();
        event.preventDefault();
        moved = false;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClickCapture, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return ref;
}
