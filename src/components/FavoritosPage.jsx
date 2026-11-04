import React, { useMemo, useRef } from "react";
import { Star, Heart, ArrowClockwise, Flask, MusicNotes, MicrophoneStage } from "@phosphor-icons/react";
import { VoiceCard } from "./VozesPage";
import { SoundCard } from "./SoundboardPage";
import { visibleVoicePresets } from "../voicePresets";
import { isVoicePresetActive } from "../utils";

function Section({ icon, title, count, children }) {
  return (
    <section className="favSection">
      <div className="favSectionTitle">
        {icon} <span>{title}</span>
        {typeof count === "number" && <em className="favCount">{count}</em>}
      </div>
      {children}
    </section>
  );
}

function Empty({ text, action, onAction }) {
  return (
    <div className="favEmpty">
      <span>{text}</span>
      {action && <button className="btn btn-ghost" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function FavoritosPage({
  state,
  call,
  setToast,
  favorites,
  toggleFavorite,
  applyVoicePreset,
  setSelectedVoice,
  setSelectedSound,
  setPage,
  customVoices,
  activePreset,
  soundboardFavorites = [],
  toggleSoundboardFavorite
}) {
  const sounds = state.sounds || [];
  const allVoices = useMemo(() => [...visibleVoicePresets, ...customVoices], [customVoices]);
  const favoriteVoices = allVoices.filter((voice) => favorites.includes(voice.id));
  const favoriteSounds = sounds.filter((sound) => soundboardFavorites.includes(sound.id));
  const recentSounds = useMemo(
    () => sounds
      .filter((sound) => Number(sound.last_played_at || 0) > 0)
      .sort((a, b) => Number(b.last_played_at || 0) - Number(a.last_played_at || 0))
      .slice(0, 8),
    [sounds]
  );

  const playerBySound = useMemo(() => {
    const map = {};
    for (const player of state.players || []) map[player.soundId] = player;
    return map;
  }, [state.players]);

  // Os cards de som sao os mesmos do Soundboard; aqui clicar leva ao som la, e o botao da capa toca/para.
  const actionsRef = useRef({});
  actionsRef.current = {
    call,
    setToast,
    setSelectedSound: (id) => { setSelectedSound(id); setPage("soundboard"); },
    setContextMenu: () => {},
    toggleSoundboardFavorite
  };

  const renderSound = (sound) => {
    const player = playerBySound[sound.id];
    return (
      <SoundCard
        key={sound.id}
        sound={sound}
        isActive={false}
        isPlaying={player?.state === "playing"}
        playbackId={player?.playbackId || ""}
        isFav={soundboardFavorites.includes(sound.id)}
        actions={actionsRef}
      />
    );
  };

  const nothingYet = favoriteVoices.length === 0 && favoriteSounds.length === 0 && recentSounds.length === 0 && customVoices.length === 0;

  return (
    <div className="favPage">
      <header className="favHeader">
        <h1>Favoritos</h1>
        <p>
          {favoriteVoices.length} {favoriteVoices.length === 1 ? "voz" : "vozes"} e {favoriteSounds.length} {favoriteSounds.length === 1 ? "som" : "sons"} favoritos.
          Marque a estrela numa voz ou o coração num som para ele aparecer aqui.
        </p>
      </header>

      {nothingYet && (
        <div className="favHero">
          <Heart size={36} weight="duotone" />
          <h3>Seus favoritos ficam aqui</h3>
          <p>Use a estrela nas vozes e o coração nos sons para montar o seu atalho pessoal.</p>
          <div className="favHeroActions">
            <button className="btn btn-primary" onClick={() => setPage("vozes")}><MicrophoneStage size={14} /> Ver vozes</button>
            <button className="btn btn-ghost" onClick={() => setPage("soundboard")}><MusicNotes size={14} /> Ver soundboard</button>
          </div>
        </div>
      )}

      {!nothingYet && (
        <>
          <Section icon={<Star size={18} weight="fill" color="var(--purple)" />} title="Vozes favoritas" count={favoriteVoices.length}>
            {favoriteVoices.length > 0 ? (
              <div className="voiceGrid">
                {favoriteVoices.map((voice) => (
                  <VoiceCard
                    key={voice.id}
                    voice={voice}
                    isActive={activePreset?.id === voice.id}
                    isFavorite
                    onSelect={() => {
                      setSelectedVoice(voice.id);
                      applyVoicePreset(voice);
                      setPage("vozes");
                    }}
                    onToggleFavorite={() => toggleFavorite(voice.id)}
                  />
                ))}
              </div>
            ) : (
              <Empty text="Nenhuma voz favorita ainda." action="Escolher vozes" onAction={() => setPage("vozes")} />
            )}
          </Section>

          <Section icon={<Heart size={18} weight="fill" color="var(--danger)" />} title="Sons favoritos" count={favoriteSounds.length}>
            {favoriteSounds.length > 0 ? (
              <div className="soundboardPage favSounds"><div className="soundGrid">{favoriteSounds.map(renderSound)}</div></div>
            ) : (
              <Empty text="Nenhum som favorito ainda." action="Abrir o soundboard" onAction={() => setPage("soundboard")} />
            )}
          </Section>

          {recentSounds.length > 0 && (
            <Section icon={<ArrowClockwise size={18} color="var(--cyan)" />} title="Tocados recentemente" count={recentSounds.length}>
              <div className="soundboardPage favSounds"><div className="soundGrid">{recentSounds.map(renderSound)}</div></div>
            </Section>
          )}

          {customVoices.length > 0 && (
            <Section icon={<Flask size={18} color="var(--green)" />} title="Minhas vozes (Voice Lab)" count={customVoices.length}>
              <div className="voiceGrid">
                {customVoices.map((voice) => (
                  <VoiceCard
                    key={voice.id}
                    voice={voice}
                    isActive={isVoicePresetActive(state?.controls, voice)}
                    isFavorite={favorites.includes(voice.id)}
                    onSelect={() => {
                      applyVoicePreset(voice);
                      setPage("vozes");
                    }}
                    onToggleFavorite={() => toggleFavorite(voice.id)}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
