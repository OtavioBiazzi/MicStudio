export function runtimeRefreshDelay({ ready, hidden, focused, playing = false }) {
  if (!ready) return 400;
  if (hidden || !focused) return 10000;
  // com som tocando, a barra de progresso e o botao de parar acompanham de perto
  return playing ? 400 : 1200;
}
