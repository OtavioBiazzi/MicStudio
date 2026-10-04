export function runtimeRefreshDelay({ ready, hidden, focused }) {
  if (!ready) return 1200;
  return hidden || !focused ? 10000 : 1200;
}
