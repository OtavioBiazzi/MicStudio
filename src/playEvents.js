// Tocar um som nao deve refazer a biblioteca inteira na interface. O backend manda eventos curtos
// ({seq, id, plays, at}) e aqui atualizamos so os cards dos sons que foram tocados.

export function newestSeq(events) {
  return (events || []).reduce((highest, event) => Math.max(highest, Number(event.seq) || 0), 0);
}

// Eventos novos (ainda nao aplicados), em ordem.
export function freshEvents(events, lastSeq) {
  return (events || []).filter((event) => Number(event.seq) > lastSeq).sort((a, b) => a.seq - b.seq);
}

// Devolve a mesma lista, trocando apenas os sons tocados (os outros mantem a mesma referencia,
// o que deixa os cards memoizados sem refazer).
export function patchSoundsWithPlays(sounds, events) {
  if (!Array.isArray(sounds) || !events?.length) return sounds;
  const latest = new Map();
  for (const event of events) latest.set(event.id, event);
  let changed = false;
  const next = sounds.map((sound) => {
    const event = latest.get(sound.id);
    if (!event) return sound;
    changed = true;
    return { ...sound, plays: event.plays, play_count: event.plays, last_played_at: event.at };
  });
  return changed ? next : sounds;
}
