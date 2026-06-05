import React from "react";
import { Star, ArrowClockwise, MusicNotes, Flask } from "@phosphor-icons/react";
import { VoiceCard } from "./VozesPage";
import { visibleVoicePresets } from "../voicePresets";
import { formatTime, isVoicePresetActive } from "../utils";

export function FavoritosPage({
  state,
  call,
  favorites,
  toggleFavorite,
  updateControls,
  applyVoicePreset,
  selectedVoice,
  setSelectedVoice,
  setSelectedSound,
  setPage,
  customVoices,
  activePreset
}) {
  const allVoices = [...visibleVoicePresets, ...customVoices];
  const favoriteVoices = allVoices.filter((v) => favorites.includes(v.id));
  const recentSounds = [...(state.sounds || [])]
    .sort((a, b) => Number(b.last_played_at || 0) - Number(a.last_played_at || 0))
    .slice(0, 8);
  const customList = customVoices;

  return (
    <div>
      <div className="labHeader">
        <h2>⭐ Favoritos</h2>
        <p>Suas vozes e sons favoritos em um só lugar</p>
      </div>

      {/* Favorite voices */}
      <div className="favSection">
        <div className="favSectionTitle">
          <Star size={18} weight="fill" color="var(--purple)" /> Vozes Favoritas
        </div>
        {favoriteVoices.length > 0 ? (
          <div className="voiceGrid">
            {favoriteVoices.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                isActive={activePreset?.id === voice.id}
                isFavorite={true}
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
          <div className="favEmpty">Nenhuma voz favorita. Marque vozes como favorita na página de Vozes.</div>
        )}
      </div>

      {/* Recent sounds */}
      <div className="favSection">
        <div className="favSectionTitle">
          <ArrowClockwise size={18} color="var(--cyan)" /> Recentes
        </div>
        {recentSounds.length > 0 ? (
          <div className="soundGrid">
            {recentSounds.map((sound) => (
              <div
                key={sound.id}
                className="soundCard"
                onClick={() => call("/api/sounds/play", { id: sound.id }).catch(() => {})}
              >
                <div className="soundCover" style={{ background: `color-mix(in srgb, ${sound.color || "#8B5CF6"} 20%, var(--bg-card-secondary))` }}>
                  {sound.coverUrl ? <img src={sound.coverUrl} alt="" /> : <MusicNotes size={18} />}
                </div>
                <div className="soundName">{sound.name.replace(/\.[^/.]+$/, "")}</div>
                <div className="soundCategory">
                  {sound.category || ""} • {formatTime(sound.duration)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="favEmpty">Nenhum som reproduzido recentemente.</div>
        )}
      </div>

      {/* Custom voices */}
      {customList.length > 0 && (
        <div className="favSection">
          <div className="favSectionTitle">
            <Flask size={18} color="var(--green)" /> Vozes Personalizadas
          </div>
          <div className="voiceGrid">
            {customList.map((voice) => (
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
        </div>
      )}
    </div>
  );
}
