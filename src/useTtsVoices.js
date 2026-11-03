import { useEffect, useState } from "react";
import { API } from "./apiClient";

const fallbackVoices = [
  { id: "pt-BR-AntonioNeural", name: "Antonio (Masculina - pt-BR)", lang: "pt-BR" },
  { id: "pt-BR-FranciscaNeural", name: "Francisca (Feminina - pt-BR)", lang: "pt-BR" }
];

let cachedVoices = null;

// Lista de vozes vem do backend (edge-tts); enquanto carrega usa um conjunto minimo.
export function useTtsVoices() {
  const [voices, setVoices] = useState(cachedVoices || fallbackVoices);

  useEffect(() => {
    if (cachedVoices) return undefined;
    let cancelled = false;
    fetch(`${API}/api/tts/voices`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data?.voices) || !data.voices.length) return;
        cachedVoices = data.voices;
        setVoices(data.voices);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return voices;
}
