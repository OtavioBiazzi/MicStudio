export function placeContextMenu(point, size, viewport, margin = 8) {
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(size.height, Math.max(0, viewport.height - margin * 2));
  return {
    x: Math.max(margin, Math.min(Number.isFinite(point.x) ? point.x : margin, viewport.width - width - margin)),
    y: Math.max(margin, Math.min(Number.isFinite(point.y) ? point.y : margin, viewport.height - height - margin)),
  };
}
