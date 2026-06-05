export const voicePresets = [
  {
    id: "clean", label: "Sem efeito", description: "Voz limpa, ganho normal e efeitos desligados.",
    emoji: "🎙️", category: "Humanos", gradient: "linear-gradient(135deg, #1a2a3a, #0d1820)",
    gain: 1, pitch: 0, effects: {}
  },
  {
    id: "personalizado", label: "Personalizado", description: "Controle e edite efeitos de voz livremente em tempo real.",
    emoji: "🎛️", category: "Todas", gradient: "linear-gradient(135deg, #a855f7, #06b6d4)",
    gain: 1, pitch: 0, effects: {}
  },
  // --- Reverb e Ambiência ---
  {
    id: "reverb_leve", label: "Reverb Leve", description: "Um reverb sutil para dar ar e brilho de forma polida.",
    emoji: "✨", category: "Reverb", gradient: "linear-gradient(135deg, #2a2a3a, #4a4a5a)",
    gain: 2.0, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.15 }
  },
  {
    id: "reverb_sala", label: "Reverb de Sala", description: "Simula o espaço acústico de uma sala pequena.",
    emoji: "🏠", category: "Reverb", gradient: "linear-gradient(135deg, #1a2a3a, #3a3a4a)",
    gain: 2.2, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.35 }
  },
  {
    id: "reverb_auditorio", label: "Reverb de Auditório", description: "Espaço amplo com reflexões longas e limpas.",
    emoji: "🏛️", category: "Reverb", gradient: "linear-gradient(135deg, #0d2a3a, #1a4a5a)",
    gain: 2.5, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.65 }
  },
  {
    id: "reverb_catedral", label: "Reverb de Catedral", description: "Presença enorme com reverb de caimento longo.",
    emoji: "⛪", category: "Reverb", gradient: "linear-gradient(135deg, #2a0d3a, #4a1a5a)",
    gain: 2.8, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.88 }
  },
  {
    id: "eco_simples", label: "Eco Simples", description: "Eco clássico com tempo de decaimento natural.",
    emoji: "🗣️", category: "Reverb", gradient: "linear-gradient(135deg, #1a3a2a, #2a5a3a)",
    gain: 2.0, pitch: 0, effects: { echo_enabled: true, echo_mix: 0.35 }
  },
  {
    id: "eco_profundo", label: "Eco Profundo", description: "Ecos longos e repetitivos que preenchem o ambiente.",
    emoji: "⛰️", category: "Reverb", gradient: "linear-gradient(135deg, #1a1a3a, #2a2a5a)",
    gain: 2.4, pitch: 0, effects: { echo_enabled: true, echo_mix: 0.7, reverb_enabled: true, reverb_mix: 0.35 }
  },
  {
    id: "delay_sfx", label: "Delay", description: "Delay estéreo clássico para dar dimensão à fala.",
    emoji: "⏳", category: "Reverb", gradient: "linear-gradient(135deg, #3a2a0d, #5a4a1a)",
    gain: 2.2, pitch: 0, effects: { delay_enabled: true, delay_mix: 0.55 }
  },
  // --- Voz Fina e Aguda ---
  {
    id: "voz_feminina", label: "Voz Feminina", description: "Pitch shift agudo calibrado com chorus suave.",
    emoji: "👩", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #ec4899, #f43f5e)",
    gain: 2.5, pitch: 4, effects: { chorus_enabled: true, chorus_mix: 0.18 }
  },
  {
    id: "voz_infantil", label: "Voz Infantil", description: "Voz fina, comprimida e com características infantis.",
    emoji: "👶", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    gain: 2.4, pitch: 8, effects: { compressor_enabled: true, compressor_amount: 0.35 }
  },
  {
    id: "voz_aguda_extrema", label: "Voz Aguda Extrema", description: "Agudo máximo com formante metalizado.",
    emoji: "⚡", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #f59e0b, #e11d48)",
    gain: 2.8, pitch: 16, effects: { robot_enabled: true, robot_rate_hz: 60 }
  },
  {
    id: "esquilo", label: "Esquilo", description: "Esquilo clássico super agudo e rápido.",
    emoji: "🐿️", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #b45309, #d97706)",
    gain: 2.5, pitch: 12, effects: { robot_enabled: true, robot_rate_hz: 52, bitcrush_enabled: true, bitcrush_bits: 4 }
  },
  // --- Anime ---
  {
    id: "voz_anime", label: "Voz Anime", description: "Voz super fina, fofa e brilhante no estilo anime japonês.",
    emoji: "🌸", category: "Anime", gradient: "linear-gradient(135deg, #ff9a9e, #fecfef)",
    gain: 2.8, pitch: 9, effects: { chorus_enabled: true, chorus_mix: 0.25, compressor_enabled: true, compressor_amount: 0.5, reverb_enabled: true, reverb_mix: 0.15 }
  },
  {
    id: "voz_miku", label: "Vocaloid Miku", description: "Sintetizador de voz fofo inspirado na Hatsune Miku.",
    emoji: "🎤", category: "Anime", gradient: "linear-gradient(135deg, #06b6d4, #ff79c6)",
    gain: 2.8, pitch: 10, effects: { robot_enabled: true, robot_rate_hz: 180, chorus_enabled: true, chorus_mix: 0.45, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "voz_chibi", label: "Voz Chibi", description: "Voz super aguda e infantilizada, estilo desenho animado fofo.",
    emoji: "✨", category: "Anime", gradient: "linear-gradient(135deg, #ff758c, #ff7eb3)",
    gain: 2.7, pitch: 11, effects: { chorus_enabled: true, chorus_mix: 0.2, compressor_enabled: true, compressor_amount: 0.6 }
  },
  // --- Voz Grave ---
  {
    id: "voz_masculina_profunda", label: "Masculino Profundo", description: "Um grave robusto e imponente de locução.",
    emoji: "🧔", category: "Grave", gradient: "linear-gradient(135deg, #1e293b, #0f172a)",
    gain: 2.6, pitch: -4, effects: { compressor_enabled: true, compressor_amount: 0.35 }
  },
  {
    id: "narrador", label: "Narrador de Cinema", description: "Voz de cinema cheia, profunda e comprimida.",
    emoji: "🎭", category: "Grave", gradient: "linear-gradient(135deg, #475569, #334155)",
    gain: 2.8, pitch: -3, effects: { compressor_enabled: true, compressor_amount: 0.72, chorus_enabled: true, chorus_mix: 0.14 }
  },
  {
    id: "gigante", label: "Gigante", description: "Grave extremo com reverb cavernoso de presença gigantesca.",
    emoji: "🧌", category: "Grave", gradient: "linear-gradient(135deg, #3f6212, #166534)",
    gain: 3.5, pitch: -10, effects: { demon_enabled: true, demon_drive: 3.0, reverb_enabled: true, reverb_mix: 0.38 }
  },
  {
    id: "voz_cinematografica", label: "Voz Cinematográfica", description: "Voz épica cheia de graves, ideal para trailers.",
    emoji: "🎬", category: "Grave", gradient: "linear-gradient(135deg, #111827, #1f2937)",
    gain: 3.0, pitch: -5, effects: { compressor_enabled: true, compressor_amount: 0.8, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "monstro_grave", label: "Monstro Grave", description: "Modulação bestial grave para criaturas e monstros.",
    emoji: "👹", category: "Grave", gradient: "linear-gradient(135deg, #7f1d1d, #991b1b)",
    gain: 3.8, pitch: -8, effects: { demon_enabled: true, demon_drive: 6.0, distortion_enabled: true, distortion_drive: 6 }
  },
  // --- Robótica ---
  {
    id: "robo_classico", label: "Robô Clássico", description: "Robô sci-fi clássico com modulação de frequência de 42Hz.",
    emoji: "🤖", category: "Robótica", gradient: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
    gain: 3.2, pitch: 0, effects: { robot_enabled: true, robot_rate_hz: 42, telephone_enabled: true, telephone_mix: 0.58 }
  },
  {
    id: "android", label: "Android", description: "Voz cibernética android com flanger metalizado.",
    emoji: "⚙️", category: "Robótica", gradient: "linear-gradient(135deg, #4b5563, #374151)",
    gain: 3.4, pitch: 1, effects: { robot_enabled: true, robot_rate_hz: 80, flanger_enabled: true, flanger_mix: 0.4 }
  },
  {
    id: "ia_futurista", label: "IA Futurista", description: "Voz de inteligência artificial limpa e sintetizada.",
    emoji: "🧠", category: "Robótica", gradient: "linear-gradient(135deg, #06b6d4, #0891b2)",
    gain: 3.0, pitch: 2, effects: { robot_enabled: true, robot_rate_hz: 110, chorus_enabled: true, chorus_mix: 0.3, reverb_enabled: true, reverb_mix: 0.2 }
  },
  {
    id: "cyberpunk", label: "Cyborg Cyberpunk", description: "Modulação meia máquina, meio humano estourada.",
    emoji: "🦾", category: "Robótica", gradient: "linear-gradient(135deg, #6b21a8, #7e22ce)",
    gain: 3.8, pitch: -1, effects: { radio_enabled: true, radio_mix: 0.58, flanger_enabled: true, flanger_mix: 0.28, chorus_enabled: true, chorus_mix: 0.32 }
  },
  {
    id: "radio_robotica", label: "Rádio Robótica", description: "Robô falando através de rádio militar antigo.",
    emoji: "📟", category: "Robótica", gradient: "linear-gradient(135deg, #14532d, #15803d)",
    gain: 3.6, pitch: 0, effects: { robot_enabled: true, robot_rate_hz: 35, radio_enabled: true, radio_mix: 0.8 }
  },
  // --- Beatbox e Música ---
  {
    id: "beatbox_leve", label: "Beatbox Leve", description: "EQ forte com presença de subgraves para ritmos de voz.",
    emoji: "🎙️", category: "Música", gradient: "linear-gradient(135deg, #065f46, #047857)",
    gain: 2.8, pitch: 0, effects: { equalizer_enabled: true, equalizer_tone: 0.75, compressor_enabled: true, compressor_amount: 0.6 }
  },
  {
    id: "beatbox_avancado", label: "Beatbox Avançado", description: "Comprimido e saturado para simular batida de estúdio.",
    emoji: "🥁", category: "Música", gradient: "linear-gradient(135deg, #0f766e, #115e59)",
    gain: 3.2, pitch: -2, effects: { equalizer_enabled: true, equalizer_tone: 0.85, compressor_enabled: true, compressor_amount: 0.85, distortion_enabled: true, distortion_drive: 2 }
  },
  {
    id: "beatbox_eletronico", label: "Beatbox Eletrônico", description: "Ritmo com modulação robótica que imita bateria eletrônica.",
    emoji: "🎹", category: "Música", gradient: "linear-gradient(135deg, #1e1b4b, #312e81)",
    gain: 3.2, pitch: 0, effects: { robot_enabled: true, robot_rate_hz: 90, compressor_enabled: true, compressor_amount: 0.7 }
  },
  {
    id: "autotune", label: "Auto-Tune", description: "Efeito pop-trap digital de sintonia vocal.",
    emoji: "🎵", category: "Música", gradient: "linear-gradient(135deg, #ec4899, #d946ef)",
    gain: 2.8, pitch: 2, effects: { chorus_enabled: true, chorus_mix: 0.5, reverb_enabled: true, reverb_mix: 0.35, compressor_enabled: true, compressor_amount: 0.5 }
  },
  {
    id: "cantor_pop", label: "Cantor Pop", description: "Voz ultra polida com reverb e chorus de estúdio pop.",
    emoji: "🎤", category: "Música", gradient: "linear-gradient(135deg, #ec4899, #a855f7)",
    gain: 2.8, pitch: 1, effects: { chorus_enabled: true, chorus_mix: 0.25, reverb_enabled: true, reverb_mix: 0.2, compressor_enabled: true, compressor_amount: 0.45 }
  },
  {
    id: "cantor_trap", label: "Cantor Trap", description: "Modulador forte de formante com delay ideal para trap.",
    emoji: "💸", category: "Música", gradient: "linear-gradient(135deg, #030712, #1f2937)",
    gain: 3.0, pitch: -1, effects: { robot_enabled: true, robot_rate_hz: 120, echo_enabled: true, echo_mix: 0.4, delay_enabled: true, delay_mix: 0.4 }
  },
  {
    id: "cantor_rock", label: "Cantor Rock", description: "Leve saturação e compressão para voz rock rasgada.",
    emoji: "🎸", category: "Música", gradient: "linear-gradient(135deg, #1c1917, #44403c)",
    gain: 3.0, pitch: 0, effects: { distortion_enabled: true, distortion_drive: 3.5, chorus_enabled: true, chorus_mix: 0.2, compressor_enabled: true, compressor_amount: 0.6 }
  },
  {
    id: "harmonizador", label: "Harmonizador", description: "Adiciona sub-vozes para criar harmonia estéreo.",
    emoji: "🎼", category: "Música", gradient: "linear-gradient(135deg, #0891b2, #4f46e5)",
    gain: 3.0, pitch: 0, effects: { chorus_enabled: true, chorus_mix: 0.6, flanger_enabled: true, flanger_mix: 0.3, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "coral_automatico", label: "Coral Automático", description: "Chorus extremo com reverb longo simulando coral.",
    emoji: "🏛️", category: "Música", gradient: "linear-gradient(135deg, #312e81, #4338ca)",
    gain: 3.2, pitch: 3, effects: { chorus_enabled: true, chorus_mix: 0.8, reverb_enabled: true, reverb_mix: 0.5, delay_enabled: true, delay_mix: 0.3 }
  },
  // --- Rádio e Comunicação ---
  {
    id: "radio_policial", label: "Rádio Policial", description: "Rádio com bitcrush e gate de ruído cortado.",
    emoji: "🚓", category: "Rádio", gradient: "linear-gradient(135deg, #1d4ed8, #1e40af)",
    gain: 5.0, pitch: -1, effects: { radio_enabled: true, radio_mix: 0.9, bitcrush_enabled: true, bitcrush_bits: 6, noise_gate_enabled: true, noise_gate_threshold: 0.15 }
  },
  {
    id: "walkie_talkie", label: "Walkie-Talkie", description: "Comunicação de curto alcance seca e estreita.",
    emoji: "📳", category: "Rádio", gradient: "linear-gradient(135deg, #14532d, #166534)",
    gain: 4.8, pitch: 0, effects: { radio_enabled: true, radio_mix: 0.8, telephone_enabled: true, telephone_mix: 0.7, bitcrush_enabled: true, bitcrush_bits: 7 }
  },
  {
    id: "megafone", label: "Megafone", description: "Megafone clássico de voz gritante e distorcida.",
    emoji: "📣", category: "Rádio", gradient: "linear-gradient(135deg, #7c2d12, #9a3412)",
    gain: 10.0, pitch: 1, effects: { megaphone_enabled: true, megaphone_drive: 9, distortion_enabled: true, distortion_drive: 12 }
  },
  {
    id: "radio_militar", label: "Rádio Militar", description: "Walkie militar com alta saturação e clipping.",
    emoji: "🪖", category: "Rádio", gradient: "linear-gradient(135deg, #27270a, #3f3f12)",
    gain: 5.5, pitch: -2, effects: { radio_enabled: true, radio_mix: 0.95, telephone_enabled: true, telephone_mix: 0.85, distortion_enabled: true, distortion_drive: 4 }
  },
  {
    id: "interfone", label: "Interfone", description: "Interfone telefônico de condomínio antigo.",
    emoji: "📞", category: "Rádio", gradient: "linear-gradient(135deg, #2a2a1a, #4a3a2a)",
    gain: 4.0, pitch: 0, effects: { telephone_enabled: true, telephone_mix: 0.9, bitcrush_enabled: true, bitcrush_bits: 7, compressor_enabled: true, compressor_amount: 0.48 }
  },
  // --- Humor ---
  {
    id: "helium", label: "Gás Hélio", description: "Efeito clássico de balão de hélio super agudo.",
    emoji: "🎈", category: "Humor", gradient: "linear-gradient(135deg, #f43f5e, #fda4af)",
    gain: 2.6, pitch: 14, effects: { compressor_enabled: true, compressor_amount: 0.22 }
  },
  {
    id: "voz_lenta_exagerada", label: "Voz Lenta", description: "Grave lento com tremolo de decaimento longo.",
    emoji: "🐌", category: "Humor", gradient: "linear-gradient(135deg, #78350f, #92400e)",
    gain: 2.2, pitch: -6, effects: { tremolo_enabled: true, tremolo_rate_hz: 4 }
  },
  {
    id: "voz_acelerada", label: "Voz Acelerada", description: "Voz rápida, aguda e trêmula de energia.",
    emoji: "🏃", category: "Humor", gradient: "linear-gradient(135deg, #047857, #059669)",
    gain: 2.4, pitch: 6, effects: { tremolo_enabled: true, tremolo_rate_hz: 18 }
  },
  {
    id: "voz_engracada", label: "Voz Engraçada", description: "Modulação de vibrato (wobble) para palhaçada.",
    emoji: "🤡", category: "Humor", gradient: "linear-gradient(135deg, #ea580c, #f97316)",
    gain: 2.5, pitch: 5, effects: { wobble_enabled: true, wobble_mix: 0.45, flanger_enabled: true, flanger_mix: 0.3 }
  },
  {
    id: "voz_caricata", label: "Voz Caricata", description: "Voz caricata trêmula esticada no limite.",
    emoji: "🤪", category: "Humor", gradient: "linear-gradient(135deg, #a855f7, #c084fc)",
    gain: 2.5, pitch: 7, effects: { robot_enabled: true, robot_rate_hz: 75, wobble_enabled: true, wobble_mix: 0.35 }
  },
  // --- Monstros e Fantasia ---
  {
    id: "demonio", label: "Demônio", description: "Grave de demônio com distorção e reverb.",
    emoji: "👹", category: "Monstros", gradient: "linear-gradient(135deg, #4a1a1a, #6a2a2a)",
    gain: 4.0, pitch: -9, effects: { demon_enabled: true, demon_drive: 5.8, distortion_enabled: true, distortion_drive: 5, reverb_enabled: true, reverb_mix: 0.32 }
  },
  {
    id: "ghost", label: "Fantasma", description: "Voz fria do além com eco reverso e reverb longo.",
    emoji: "👻", category: "Monstros", gradient: "linear-gradient(135deg, #1e1b4b, #312e81)",
    gain: 3.4, pitch: -2, effects: { ghost_enabled: true, ghost_mix: 0.52, reverse_enabled: true, reverse_mix: 0.24, reverb_enabled: true, reverb_mix: 0.35 }
  },
  {
    id: "dragao", label: "Dragão Ancestral", description: "Grave e rugido extremo com saturação forte.",
    emoji: "🐉", category: "Monstros", gradient: "linear-gradient(135deg, #451a03, #78350f)",
    gain: 4.2, pitch: -12, effects: { demon_enabled: true, demon_drive: 8.0, distortion_enabled: true, distortion_drive: 8, reverb_enabled: true, reverb_mix: 0.45 }
  },
  {
    id: "orc", label: "Orc Brutal", description: "Presença monstruosa e gutural rústica.",
    emoji: "🧌", category: "Monstros", gradient: "linear-gradient(135deg, #3f4911, #4d5d14)",
    gain: 3.8, pitch: -6, effects: { demon_enabled: true, demon_drive: 4.0, distortion_enabled: true, distortion_drive: 10, compressor_enabled: true, compressor_amount: 0.6 }
  },
  {
    id: "alien", label: "Alienígena", description: "Modulação espacial glitch, ideal para ficção científica.",
    emoji: "👽", category: "Monstros", gradient: "linear-gradient(135deg, #064e3b, #047857)",
    gain: 3.0, pitch: 5, effects: { alien_enabled: true, alien_rate_hz: 104, alien_glitch_enabled: true, alien_glitch_mix: 0.76, reverse_enabled: true, reverse_mix: 0.42 }
  },
  {
    id: "criatura_sombria", label: "Criatura Sombria", description: "Sussurro fantasmagórico misturado com grave demoníaco.",
    emoji: "👾", category: "Monstros", gradient: "linear-gradient(135deg, #111827, #1f2937)",
    gain: 3.8, pitch: -7, effects: { whisper_enabled: true, whisper_mix: 0.6, demon_enabled: true, demon_drive: 3.5, reverb_enabled: true, reverb_mix: 0.4 }
  },
  // --- Jogos e Streaming ---
  {
    id: "narrador_trailer", label: "Narrador de Trailer", description: "Narrador dramático de cinema de ação.",
    emoji: "🎥", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #090d16, #151c2d)",
    gain: 3.0, pitch: -4, effects: { compressor_enabled: true, compressor_amount: 0.9, reverb_enabled: true, reverb_mix: 0.2 }
  },
  {
    id: "streamer", label: "Streamer Pro", description: "Voz com muita presença, limpa e altamente comprimida.",
    emoji: "🎙️", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #111827, #0369a1)",
    gain: 2.6, pitch: -1, effects: { compressor_enabled: true, compressor_amount: 0.55, equalizer_enabled: true, equalizer_tone: 0.65, noise_gate_enabled: true, noise_gate_threshold: 0.12 }
  },
  {
    id: "npc", label: "NPC de Jogo", description: "Voz limpa e repetitiva de aldeão com chorus leve.",
    emoji: "🤖", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #78350f, #b45309)",
    gain: 2.5, pitch: 2, effects: { chorus_enabled: true, chorus_mix: 0.2, compressor_enabled: true, compressor_amount: 0.3 }
  },
  {
    id: "vilao", label: "Vilão Supremo", description: "Voz fria, ameaçadora com reverb cavernoso e grave.",
    emoji: "🦹", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #581c87, #4c1d95)",
    gain: 3.5, pitch: -5, effects: { demon_enabled: true, demon_drive: 3.5, compressor_enabled: true, compressor_amount: 0.6, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "heroi", label: "Herói Lendário", description: "Voz inspiradora com chorus brilhante e reverb leve.",
    emoji: "🦸", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #1d4ed8, #2563eb)",
    gain: 2.8, pitch: -2, effects: { compressor_enabled: true, compressor_amount: 0.5, chorus_enabled: true, chorus_mix: 0.15, reverb_enabled: true, reverb_mix: 0.1 }
  },
  {
    id: "locutor_esports", label: "Locutor de eSports", description: "Presença brilhante de EQ com compressão limpa de rádio esportivo.",
    emoji: "🎮", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #065f46, #0f766e)",
    gain: 2.8, pitch: -2, effects: { compressor_enabled: true, compressor_amount: 0.8, equalizer_enabled: true, equalizer_tone: 0.75 }
  },
  // --- Efeitos Exclusivos Cyber/Glitch ---
  {
    id: "voz_glitch", label: "Glitch Cibernético", description: "Modulação de glitch estourada com bitcrush cibernético.",
    emoji: "📟", category: "Exclusivos", gradient: "linear-gradient(135deg, #1f2937, #dc2626)",
    gain: 3.5, pitch: 2, effects: { alien_glitch_enabled: true, alien_glitch_mix: 0.9, wobble_enabled: true, wobble_mix: 0.6, bitcrush_enabled: true, bitcrush_bits: 4 }
  },
  {
    id: "voz_holografica", label: "Holograma Sci-Fi", description: "Chorus/Flanger misturado com sussurro do além.",
    emoji: "💿", category: "Exclusivos", gradient: "linear-gradient(135deg, #0891b2, #0d9488)",
    gain: 3.2, pitch: 3, effects: { flanger_enabled: true, flanger_mix: 0.5, chorus_enabled: true, chorus_mix: 0.4, reverb_enabled: true, reverb_mix: 0.4, whisper_enabled: true, whisper_mix: 0.3 }
  },
  {
    id: "voz_dimensao_paralela", label: "Dimensão Paralela", description: "Voz invertida com reverb longo e ecos fantasmagóricos.",
    emoji: "🌀", category: "Exclusivos", gradient: "linear-gradient(135deg, #312e81, #1e1b4b)",
    gain: 3.0, pitch: -3, effects: { reverse_enabled: true, reverse_mix: 0.55, ghost_enabled: true, ghost_mix: 0.45, reverb_enabled: true, reverb_mix: 0.5 }
  },
  {
    id: "voz_sonho", label: "Voz de Sonho", description: "Reverb enorme com delay modulado para ambiente etéreo.",
    emoji: "💭", category: "Exclusivos", gradient: "linear-gradient(135deg, #db2777, #c084fc)",
    gain: 2.8, pitch: 2, effects: { chorus_enabled: true, chorus_mix: 0.5, reverb_enabled: true, reverb_mix: 0.6, delay_enabled: true, delay_mix: 0.45 }
  },
  {
    id: "voz_corrompida", label: "Sistema Corrompido", description: "Distorção máxima com bitcrush analógico agressivo.",
    emoji: "⚠️", category: "Exclusivos", gradient: "linear-gradient(135deg, #7f1d1d, #450a0a)",
    gain: 5.0, pitch: -5, effects: { distortion_enabled: true, distortion_drive: 12.0, bitcrush_enabled: true, bitcrush_bits: 3, radio_enabled: true, radio_mix: 0.7 }
  },
  {
    id: "voz_fantasma_digital", label: "Fantasma Digital", description: "Eco flutuante digital modulado por robotizador.",
    emoji: "👻", category: "Exclusivos", gradient: "linear-gradient(135deg, #1e1b4b, #4f46e5)",
    gain: 3.4, pitch: 1, effects: { ghost_enabled: true, ghost_mix: 0.6, robot_enabled: true, robot_rate_hz: 95, reverb_enabled: true, reverb_mix: 0.3 }
  },
  {
    id: "voz_entidade", label: "Entidade Divina", description: "Voz demoníaca misturada com sussurro de subgraves e reverb longo.",
    emoji: "🔮", category: "Exclusivos", gradient: "linear-gradient(135deg, #090514, #1c0e35)",
    gain: 4.0, pitch: -8, effects: { demon_enabled: true, demon_drive: 6.0, whisper_enabled: true, whisper_mix: 0.4, reverb_enabled: true, reverb_mix: 0.45 }
  },
  {
    id: "voz_interestelar", label: "Interestelar", description: "Modulação de astronauta espacial com delay e flanger longo.",
    emoji: "🛸", category: "Exclusivos", gradient: "linear-gradient(135deg, #051622, #0d3856)",
    gain: 3.2, pitch: 4, effects: { alien_enabled: true, alien_rate_hz: 120, flanger_enabled: true, flanger_mix: 0.4, reverb_enabled: true, reverb_mix: 0.45, delay_enabled: true, delay_mix: 0.35 }
  },
  {
    id: "voz_retro_80s", label: "Retrô Anos 80", description: "Efeito synthpop clássico de chorus com delay modulado.",
    emoji: "📼", category: "Exclusivos", gradient: "linear-gradient(135deg, #a21caf, #f43f5e)",
    gain: 2.8, pitch: 1, effects: { chorus_enabled: true, chorus_mix: 0.7, delay_enabled: true, delay_mix: 0.4, equalizer_enabled: true, equalizer_tone: 0.45 }
  },
  {
    id: "voz_vhs", label: "VHS Desgastado", description: "Tremolo forte com rádio e bitcrush imitando fita VHS velha.",
    emoji: "📼", category: "Exclusivos", gradient: "linear-gradient(135deg, #27272a, #18181b)",
    gain: 3.2, pitch: -2, effects: { wobble_enabled: true, wobble_mix: 0.4, bitcrush_enabled: true, bitcrush_bits: 6, radio_enabled: true, radio_mix: 0.65 }
  },
  // --- Especiais e Extremos ---
  {
    id: "micfudiddo_extremo", label: "FUDIDDO TOTAL", description: "Aviso: Cuidado com os ouvidos! Todos os efeitos no absoluto talo e ganho extremo.",
    emoji: "👺", category: "Especiais", gradient: "linear-gradient(135deg, #ff0000, #ff5555)",
    gain: 100.0, pitch: 36, effects: {
      equalizer_enabled: true, equalizer_tone: 1.0,
      noise_gate_enabled: true, noise_gate_threshold: 0.4,
      echo_enabled: true, echo_mix: 0.9,
      reverb_enabled: true, reverb_mix: 0.9,
      megaphone_enabled: true, megaphone_drive: 40.0,
      distortion_enabled: true, distortion_drive: 200.0,
      robot_enabled: true, robot_rate_hz: 500.0,
      output_volume_enabled: true, output_volume: 100.0
    }
  }
];

export const visibleVoicePresets = voicePresets.filter((voice) => voice.id !== "clean");
