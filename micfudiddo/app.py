from __future__ import annotations

from pathlib import Path
import math
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox

import customtkinter as ctk

from .devices import (
    AudioDevice,
    choose_input_device,
    choose_monitor_output_device,
    choose_virtual_output_device,
    input_devices,
    likely_recording_pair_name,
    output_devices,
    query_audio_devices,
)
from .engine import AudioEngine, AudioEngineError, EngineConfig
from .processing import EffectsSettings
from .recording import MultiDeviceRecorder, RecordDevice, query_record_devices
from .soundboard import (
    SUPPORTED_AUDIO_TYPES,
    SoundDefaults,
    SoundItem,
    SoundLibrary,
    load_audio_mono,
    render_sound_for_playback,
)
from .windows_audio import (
    find_virtual_microphone_endpoint,
    get_default_capture_ids,
    restore_default_capture_ids,
    set_default_capture_id,
)


NO_VIRTUAL_LABEL = "Nenhum (somente monitor)"
ROOT_DIR = Path(__file__).resolve().parents[1]
ICON_PATH = ROOT_DIR / "assets" / "micfudiddo.ico"
PNG_ICON_PATH = ROOT_DIR / "assets" / "micfudiddo.png"

BG = "#0b0c0e"
SIDEBAR = "#0b0c0e"
CARD = "#13151a"
CARD_ALT = "#1a1d24"
BORDER = "#22262e"
TEXT = "#f3f4f6"
MUTED = "#9ca3af"
SOFT = "#6b7280"
ACCENT = "#d97706"
ACCENT_DARK = "#b45309"
DANGER = "#be4b57"

DEFAULTS = {
    "gain": 1.0,
    "pitch": 0.0,
    "output_volume": 2.0,
    "distortion_drive": 4.0,
    "robot_rate": 35.0,
    "echo_mix": 25.0,
    "tremolo_rate": 8.0,
    "bitcrush_bits": 8.0,
}


class MicFudiddoApp(ctk.CTk):
    def __init__(self, enable_startup_automation: bool = True) -> None:
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.title("MicFudiddo")
        self.geometry("1240x840")
        self.minsize(1040, 720)
        self.configure(fg_color=BG)
        if ICON_PATH.exists():
            try:
                self.iconbitmap(str(ICON_PATH))
            except tk.TclError:
                pass

        self.engine = AudioEngine()
        self.library = SoundLibrary()
        self.pc_recorder = MultiDeviceRecorder(self.library.base_dir / "pc_recordings")

        self.devices: list[AudioDevice] = []
        self.device_by_label: dict[str, AudioDevice] = {}
        self.record_devices: list[RecordDevice] = []
        self.sound_cache: dict[str, tuple[float, object]] = {}
        self.selected_sound_id: str | None = None
        self.hotkey_handles: list[object] = []
        self.capturing_shortcut = False
        self._syncing_gain = False
        self._saved_default_capture_ids: dict[int, str] = {}
        self._virtual_mode_active = False
        self._really_quit = False
        self.tray_icon = None
        self.enable_startup_automation = enable_startup_automation

        self.input_var = tk.StringVar()
        self.virtual_output_var = tk.StringVar(value=NO_VIRTUAL_LABEL)
        self.monitor_output_var = tk.StringVar()

        self.gain_var = tk.DoubleVar(value=DEFAULTS["gain"])
        self.gain_text_var = tk.StringVar(value="1.00")
        self.pitch_var = tk.DoubleVar(value=DEFAULTS["pitch"])
        self.pitch_label_var = tk.StringVar(value="+0.0 semitons")
        self.output_volume_enabled_var = tk.BooleanVar(value=False)
        self.output_volume_var = tk.DoubleVar(value=DEFAULTS["output_volume"])
        self.output_volume_label_var = tk.StringVar(value="2.0x")

        self.distortion_enabled_var = tk.BooleanVar(value=False)
        self.distortion_drive_var = tk.DoubleVar(value=DEFAULTS["distortion_drive"])
        self.distortion_label_var = tk.StringVar(value="4.0x")
        self.robot_enabled_var = tk.BooleanVar(value=False)
        self.robot_rate_var = tk.DoubleVar(value=DEFAULTS["robot_rate"])
        self.robot_label_var = tk.StringVar(value="35 Hz")
        self.echo_enabled_var = tk.BooleanVar(value=False)
        self.echo_mix_var = tk.DoubleVar(value=DEFAULTS["echo_mix"])
        self.echo_label_var = tk.StringVar(value="25%")
        self.tremolo_enabled_var = tk.BooleanVar(value=False)
        self.tremolo_rate_var = tk.DoubleVar(value=DEFAULTS["tremolo_rate"])
        self.tremolo_label_var = tk.StringVar(value="8 Hz")
        self.bitcrush_enabled_var = tk.BooleanVar(value=False)
        self.bitcrush_bits_var = tk.DoubleVar(value=DEFAULTS["bitcrush_bits"])
        self.bitcrush_label_var = tk.StringVar(value="8 bits")

        self.monitor_var = tk.BooleanVar(value=False)
        self.status_var = tk.StringVar(value="Processamento desligado")
        self.route_var = tk.StringVar(value="")
        self.voice_record_var = tk.StringVar(value="Gravador de voz pronto")
        self.pc_record_var = tk.StringVar(value="Gravador do PC pronto")

        self._build_ui()
        self.refresh_devices()
        self.refresh_record_devices()
        self.refresh_sound_list()
        self.register_hotkeys()
        self.show_page("painel")
        if self.enable_startup_automation:
            self._create_tray_icon()

        self.bind_all("<KeyPress>", self._on_keypress)
        self.protocol("WM_DELETE_WINDOW", self.hide_to_tray if self.enable_startup_automation else self._on_close)
        if self.enable_startup_automation:
            self.after(900, self.activate_virtual_mode)
        self.after(120, self._poll_engine)

    def _build_ui(self) -> None:
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self.sidebar = ctk.CTkFrame(self, width=220, fg_color=SIDEBAR, corner_radius=0)
        self.sidebar.grid(row=0, column=0, sticky="nsew")
        self.sidebar.grid_propagate(False)
        self.sidebar.grid_rowconfigure(8, weight=1)

        brand = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        brand.grid(row=0, column=0, sticky="ew", padx=22, pady=(24, 20))
        ctk.CTkLabel(brand, text="MicFudiddo", text_color=TEXT, font=ctk.CTkFont(size=23, weight="bold")).pack(anchor="w")
        ctk.CTkLabel(brand, text="voice lab", text_color=ACCENT, font=ctk.CTkFont(size=12)).pack(anchor="w", pady=(2, 0))

        self.nav_buttons: dict[str, ctk.CTkButton] = {}
        nav = [
            ("painel", "Painel"),
            ("efeitos", "Efeitos"),
            ("soundboard", "Soundboard"),
            ("dispositivos", "Dispositivos"),
            ("gravador", "Gravador"),
            ("presets", "Presets"),
        ]
        for index, (key, label) in enumerate(nav, start=1):
            button = ctk.CTkButton(
                self.sidebar,
                text=label,
                anchor="w",
                height=46,
                corner_radius=12,
                fg_color="transparent",
                hover_color="#102b42",
                text_color=MUTED,
                font=ctk.CTkFont(size=15, weight="bold" if key == "painel" else "normal"),
                command=lambda page=key: self.show_page(page),
            )
            button.grid(row=index, column=0, sticky="ew", padx=18, pady=4)
            self.nav_buttons[key] = button

        ctk.CTkLabel(
            self.sidebar,
            text="MicFudiddo\nv0.3.0",
            text_color=MUTED,
            justify="left",
            font=ctk.CTkFont(size=13),
        ).grid(row=9, column=0, sticky="sw", padx=26, pady=28)

        self.main = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        self.main.grid(row=0, column=1, sticky="nsew")
        self.main.grid_rowconfigure(1, weight=1)
        self.main.grid_columnconfigure(0, weight=1)

        topbar = ctk.CTkFrame(self.main, height=74, fg_color="#081521", corner_radius=0)
        topbar.grid(row=0, column=0, sticky="ew")
        topbar.grid_propagate(False)
        topbar.grid_columnconfigure(0, weight=1)
        ctk.CTkButton(
            topbar,
            text="Atualizar dispositivos",
            height=40,
            corner_radius=10,
            fg_color="transparent",
            border_width=1,
            border_color=ACCENT,
            text_color=ACCENT,
            hover_color="#102d44",
            command=self.refresh_devices,
        ).grid(row=0, column=1, padx=22, pady=16)
        ctk.CTkButton(
            topbar,
            text="Restaurar padrão",
            height=40,
            corner_radius=10,
            fg_color=CARD_ALT,
            hover_color="#1b354e",
            command=self.reset_defaults,
        ).grid(row=0, column=2, padx=(0, 28), pady=16)

        self.content = ctk.CTkFrame(self.main, fg_color=BG, corner_radius=0)
        self.content.grid(row=1, column=0, sticky="nsew", padx=28, pady=24)
        self.content.grid_columnconfigure(0, weight=1)
        self.content.grid_rowconfigure(0, weight=1)

        self.pages: dict[str, ctk.CTkFrame] = {}
        self._build_panel_page()
        self._build_effects_page()
        self._build_soundboard_page()
        self._build_devices_page()
        self._build_recorder_page()
        self._build_presets_page()

    def card(self, parent, **grid):
        frame = ctk.CTkFrame(parent, fg_color=CARD, corner_radius=16, border_width=1, border_color=BORDER)
        if grid:
            frame.grid(**grid)
        return frame

    def page(self, key: str) -> ctk.CTkFrame:
        frame = ctk.CTkFrame(self.content, fg_color=BG, corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)
        self.pages[key] = frame
        return frame

    def show_page(self, key: str) -> None:
        for page in self.pages.values():
            page.grid_forget()
        self.pages[key].grid(row=0, column=0, sticky="nsew")
        for name, button in self.nav_buttons.items():
            selected = name == key
            button.configure(
                fg_color="#0f4774" if selected else "transparent",
                text_color=TEXT if selected else MUTED,
                font=ctk.CTkFont(size=15, weight="bold" if selected else "normal"),
            )

    def page_title(self, parent, title: str, subtitle: str = "") -> None:
        ctk.CTkLabel(parent, text=title, text_color=TEXT, font=ctk.CTkFont(size=24, weight="bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 4)
        )
        if subtitle:
            ctk.CTkLabel(parent, text=subtitle, text_color=MUTED, font=ctk.CTkFont(size=13)).grid(
                row=1, column=0, sticky="w", pady=(0, 16)
            )

    def _build_panel_page(self) -> None:
        page = self.page("painel")
        self.page_title(page, "Painel", "Controle rápido da voz, rota de áudio e sons principais.")

        status = self.card(page)
        status.grid(row=2, column=0, sticky="ew", pady=(0, 18))
        status.grid_columnconfigure(1, weight=1)
        self.power_button = ctk.CTkButton(
            status,
            text="",
            width=84,
            height=84,
            corner_radius=42,
            fg_color="#0d2843",
            border_width=1,
            border_color=ACCENT_DARK,
            hover_color="#12395d",
            command=self.toggle_engine,
        )
        self.power_button.grid(row=0, column=0, rowspan=3, padx=20, pady=20)
        ctk.CTkLabel(status, textvariable=self.status_var, text_color=TEXT, font=ctk.CTkFont(size=20, weight="bold")).grid(
            row=0, column=1, sticky="w", padx=(0, 18), pady=(22, 0)
        )
        ctk.CTkLabel(status, textvariable=self.route_var, text_color=MUTED, justify="left", wraplength=780).grid(
            row=1, column=1, sticky="w", padx=(0, 18), pady=(6, 0)
        )
        self.level_bar = ctk.CTkProgressBar(status, height=10, progress_color=ACCENT)
        self.level_bar.set(0)
        self.level_bar.grid(row=2, column=1, sticky="ew", padx=(0, 24), pady=(14, 22))

        actions = ctk.CTkFrame(page, fg_color="transparent")
        actions.grid(row=3, column=0, sticky="ew", pady=(0, 18))
        self.process_button = ctk.CTkButton(
            actions,
            text="Ativar processamento",
            width=240,
            height=52,
            corner_radius=12,
            fg_color=ACCENT_DARK,
            hover_color=ACCENT,
            command=self.toggle_engine,
        )
        self.process_button.pack(side="left")
        ctk.CTkCheckBox(
            actions,
            text="Ouvir minha voz",
            variable=self.monitor_var,
            command=self._on_monitor_toggle,
            fg_color=ACCENT,
            border_color=BORDER,
            hover_color="#1b486c",
        ).pack(side="left", padx=22)

        controls = self.card(page)
        controls.grid(row=4, column=0, sticky="ew", pady=(0, 18))
        controls.grid_columnconfigure(1, weight=1)
        self.slider_row(controls, 0, "Ganho", self.gain_var, 0, 100, self.gain_text_var, self._on_gain_scale, entry=True)
        self.slider_row(controls, 1, "Pitch", self.pitch_var, -12, 12, self.pitch_label_var, self._on_pitch_scale)
        self.effect_slider_row(
            controls,
            2,
            "Volume do mic",
            self.output_volume_enabled_var,
            self.output_volume_var,
            1,
            10,
            self.output_volume_label_var,
        )

        quick = self.card(page)
        quick.grid(row=5, column=0, sticky="ew")
        ctk.CTkLabel(quick, text="Soundboard rápido", text_color=TEXT, font=ctk.CTkFont(size=18, weight="bold")).pack(
            anchor="w", padx=18, pady=(16, 4)
        )
        self.quick_sounds_frame = ctk.CTkFrame(quick, fg_color="transparent")
        self.quick_sounds_frame.pack(fill="x", padx=18, pady=(8, 18))

    def _build_effects_page(self) -> None:
        page = self.page("efeitos")
        self.page_title(page, "Efeitos", "Todos vêm desligados por padrão e só entram quando marcados.")
        effects = self.card(page)
        effects.grid(row=2, column=0, sticky="ew")
        effects.grid_columnconfigure(1, weight=1)
        rows = (
            ("Distorção", self.distortion_enabled_var, self.distortion_drive_var, 1, 30, self.distortion_label_var),
            ("Robô", self.robot_enabled_var, self.robot_rate_var, 5, 120, self.robot_label_var),
            ("Eco curto", self.echo_enabled_var, self.echo_mix_var, 0, 90, self.echo_label_var),
            ("Tremolo", self.tremolo_enabled_var, self.tremolo_rate_var, 1, 30, self.tremolo_label_var),
            ("Bitcrush", self.bitcrush_enabled_var, self.bitcrush_bits_var, 3, 12, self.bitcrush_label_var),
        )
        for row, values in enumerate(rows):
            self.effect_slider_row(effects, row, *values)

    def _build_soundboard_page(self) -> None:
        page = self.page("soundboard")
        page.grid_rowconfigure(3, weight=1)
        self.page_title(page, "Soundboard", "Dê duplo clique em um som para tocar. Atalhos globais são registrados quando possível.")

        toolbar = ctk.CTkFrame(page, fg_color="transparent")
        toolbar.grid(row=2, column=0, sticky="ew", pady=(0, 14))
        ctk.CTkButton(toolbar, text="Adicionar som", width=150, height=42, corner_radius=10, command=self.add_sound).pack(side="left")
        ctk.CTkButton(toolbar, text="Tocar", width=100, height=42, corner_radius=10, fg_color=CARD_ALT, command=self.play_selected_sound).pack(
            side="left", padx=10
        )
        ctk.CTkButton(toolbar, text="Parar sons", width=120, height=42, corner_radius=10, fg_color=CARD_ALT, command=self.engine.stop_sounds).pack(
            side="left"
        )
        ctk.CTkButton(toolbar, text="Remover", width=110, height=42, corner_radius=10, fg_color=DANGER, command=self.remove_selected_sound).pack(
            side="right"
        )

        body = ctk.CTkFrame(page, fg_color="transparent")
        body.grid(row=3, column=0, sticky="nsew")
        body.grid_columnconfigure(0, weight=1)
        body.grid_columnconfigure(1, weight=1)
        body.grid_rowconfigure(0, weight=1)

        list_card = self.card(body)
        list_card.grid(row=0, column=0, sticky="nsew", padx=(0, 9))
        ctk.CTkLabel(list_card, text="Seus sons", text_color=TEXT, font=ctk.CTkFont(size=17, weight="bold")).pack(
            anchor="w", padx=16, pady=(16, 10)
        )
        self.sound_list = tk.Listbox(
            list_card,
            bg="#0b1622",
            fg=TEXT,
            selectbackground="#155987",
            selectforeground=TEXT,
            highlightthickness=1,
            highlightbackground=BORDER,
            bd=0,
            activestyle="none",
            font=("Segoe UI", 11),
        )
        self.sound_list.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.sound_list.bind("<<ListboxSelect>>", self._on_sound_select)
        self.sound_list.bind("<Double-Button-1>", lambda _event: self.play_selected_sound())

        edit = self.card(body)
        edit.grid(row=0, column=1, sticky="nsew", padx=(9, 0))
        edit.grid_columnconfigure(1, weight=1)
        ctk.CTkLabel(edit, text="Editar som", text_color=TEXT, font=ctk.CTkFont(size=17, weight="bold")).grid(
            row=0, column=0, columnspan=3, sticky="w", padx=16, pady=(16, 8)
        )
        self.sound_name_var = tk.StringVar()
        self.sound_volume_var = tk.DoubleVar(value=1.0)
        self.sound_pitch_var = tk.DoubleVar(value=0.0)
        self.sound_repeats_var = tk.DoubleVar(value=1.0)
        self.sound_shortcut_var = tk.StringVar()
        self.sound_volume_label_var = tk.StringVar(value="1.0x")
        self.sound_pitch_label_var = tk.StringVar(value="+0.0")
        self.sound_repeats_label_var = tk.StringVar(value="1x")
        self.entry_row(edit, 1, "Nome", self.sound_name_var)
        self.slider_row(edit, 2, "Volume", self.sound_volume_var, 0, 5, self.sound_volume_label_var, self._on_sound_param_scale)
        self.slider_row(edit, 3, "Pitch", self.sound_pitch_var, -12, 12, self.sound_pitch_label_var, self._on_sound_param_scale)
        self.slider_row(edit, 4, "Repetições", self.sound_repeats_var, 1, 10, self.sound_repeats_label_var, self._on_sound_param_scale)
        self.entry_row(edit, 5, "Atalho", self.sound_shortcut_var, capture=True)
        ctk.CTkButton(edit, text="Salvar som", height=42, corner_radius=10, command=self.save_selected_sound).grid(
            row=6, column=0, columnspan=3, sticky="ew", padx=16, pady=(14, 8)
        )
        ctk.CTkLabel(
            edit,
            text="Clique no campo Atalho e pressione uma combinação, como Ctrl+Alt+1 ou F8.",
            text_color=SOFT,
            wraplength=430,
            justify="left",
        ).grid(row=7, column=0, columnspan=3, sticky="w", padx=16, pady=(0, 16))

    def _build_devices_page(self) -> None:
        page = self.page("dispositivos")
        self.page_title(page, "Dispositivos", "O app não altera drivers nem configurações profundas do Windows.")
        card = self.card(page)
        card.grid(row=2, column=0, sticky="ew")
        card.grid_columnconfigure(1, weight=1)
        self.combo_row(card, 0, "Entrada (microfone)", "input_combo", self.input_var)
        self.combo_row(card, 1, "Saída processada (virtual)", "virtual_combo", self.virtual_output_var)
        self.combo_row(card, 2, "Monitor", "monitor_combo", self.monitor_output_var)

    def _build_recorder_page(self) -> None:
        page = self.page("gravador")
        page.grid_rowconfigure(3, weight=1)
        self.page_title(page, "Gravador", "Grave a própria voz processada ou fontes de áudio do PC via WASAPI loopback.")

        voice = self.card(page)
        voice.grid(row=2, column=0, sticky="ew", pady=(0, 14))
        ctk.CTkLabel(voice, text="Própria voz", text_color=TEXT, font=ctk.CTkFont(size=17, weight="bold")).pack(
            anchor="w", padx=16, pady=(16, 4)
        )
        ctk.CTkLabel(voice, textvariable=self.voice_record_var, text_color=MUTED).pack(anchor="w", padx=16)
        self.voice_record_button = ctk.CTkButton(
            voice,
            text="Começar gravação da voz",
            height=42,
            corner_radius=10,
            command=self.toggle_voice_recording,
        )
        self.voice_record_button.pack(anchor="w", padx=16, pady=16)

        pc = self.card(page)
        pc.grid(row=3, column=0, sticky="nsew")
        pc.grid_columnconfigure(0, weight=1)
        pc.grid_rowconfigure(2, weight=1)
        ctk.CTkLabel(pc, text="Áudio do PC", text_color=TEXT, font=ctk.CTkFont(size=17, weight="bold")).grid(
            row=0, column=0, sticky="w", padx=16, pady=(16, 4)
        )
        ctk.CTkLabel(pc, textvariable=self.pc_record_var, text_color=MUTED).grid(row=1, column=0, sticky="w", padx=16)
        self.record_device_list = tk.Listbox(
            pc,
            selectmode=tk.MULTIPLE,
            bg="#0b1622",
            fg=TEXT,
            selectbackground="#155987",
            selectforeground=TEXT,
            highlightthickness=1,
            highlightbackground=BORDER,
            bd=0,
            activestyle="none",
            font=("Segoe UI", 10),
        )
        self.record_device_list.grid(row=2, column=0, sticky="nsew", padx=16, pady=12)
        row = ctk.CTkFrame(pc, fg_color="transparent")
        row.grid(row=3, column=0, sticky="ew", padx=16, pady=(0, 16))
        ctk.CTkButton(row, text="Atualizar fontes", fg_color=CARD_ALT, command=self.refresh_record_devices).pack(side="left")
        self.pc_record_button = ctk.CTkButton(row, text="Gravar fontes selecionadas", command=self.toggle_pc_recording)
        self.pc_record_button.pack(side="left", padx=10)

    def _build_presets_page(self) -> None:
        page = self.page("presets")
        self.page_title(page, "Presets", "Defina como novos sons entram no soundboard.")
        card = self.card(page)
        card.grid(row=2, column=0, sticky="ew")
        card.grid_columnconfigure(1, weight=1)
        self.default_sound_volume_var = tk.DoubleVar(value=self.library.defaults.volume)
        self.default_sound_pitch_var = tk.DoubleVar(value=self.library.defaults.pitch_semitones)
        self.default_sound_repeats_var = tk.DoubleVar(value=self.library.defaults.repeats)
        self.default_sound_volume_label_var = tk.StringVar(value=f"{self.library.defaults.volume:.1f}x")
        self.default_sound_pitch_label_var = tk.StringVar(value=f"{self.library.defaults.pitch_semitones:+.1f}")
        self.default_sound_repeats_label_var = tk.StringVar(value=f"{self.library.defaults.repeats}x")
        self.slider_row(card, 0, "Volume padrão", self.default_sound_volume_var, 0, 5, self.default_sound_volume_label_var, self._on_default_sound_scale)
        self.slider_row(card, 1, "Pitch padrão", self.default_sound_pitch_var, -12, 12, self.default_sound_pitch_label_var, self._on_default_sound_scale)
        self.slider_row(card, 2, "Repetições padrão", self.default_sound_repeats_var, 1, 10, self.default_sound_repeats_label_var, self._on_default_sound_scale)
        ctk.CTkButton(card, text="Salvar preset do soundboard", height=42, corner_radius=10, command=self.save_sound_defaults).grid(
            row=3, column=0, columnspan=3, sticky="ew", padx=16, pady=(8, 16)
        )

    def slider_row(self, parent, row, name, variable, start, end, label_var, command, entry: bool = False) -> None:
        ctk.CTkLabel(parent, text=name, text_color=TEXT, anchor="w").grid(row=row, column=0, sticky="w", padx=(16, 10), pady=12)
        ctk.CTkSlider(parent, from_=start, to=end, variable=variable, command=command, progress_color=ACCENT).grid(
            row=row, column=1, sticky="ew", padx=10, pady=12
        )
        if entry:
            entry_widget = ctk.CTkEntry(parent, textvariable=label_var, width=92, justify="right", fg_color="#f6f8fb", text_color="#101820")
            entry_widget.grid(row=row, column=2, sticky="e", padx=(10, 16), pady=12)
            entry_widget.bind("<Return>", self._apply_gain_entry)
            entry_widget.bind("<FocusOut>", self._apply_gain_entry)
        else:
            ctk.CTkLabel(parent, textvariable=label_var, width=112, fg_color=CARD_ALT, corner_radius=8, text_color=TEXT).grid(
                row=row, column=2, sticky="e", padx=(10, 16), pady=12
            )

    def effect_slider_row(self, parent, row, name, enabled_var, value_var, start, end, label_var) -> None:
        ctk.CTkCheckBox(
            parent,
            text=name,
            variable=enabled_var,
            command=self._apply_controls,
            fg_color=ACCENT,
            hover_color="#1b486c",
            border_color=BORDER,
        ).grid(row=row, column=0, sticky="w", padx=(16, 10), pady=14)
        ctk.CTkSlider(parent, from_=start, to=end, variable=value_var, command=lambda _value: self._on_effect_scale(), progress_color=ACCENT).grid(
            row=row, column=1, sticky="ew", padx=10, pady=14
        )
        ctk.CTkLabel(parent, textvariable=label_var, width=112, fg_color=CARD_ALT, corner_radius=8, text_color=TEXT).grid(
            row=row, column=2, sticky="e", padx=(10, 16), pady=14
        )

    def entry_row(self, parent, row: int, label: str, var: tk.StringVar, capture: bool = False) -> None:
        ctk.CTkLabel(parent, text=label, text_color=MUTED, anchor="w").grid(row=row, column=0, sticky="w", padx=(16, 10), pady=10)
        entry = ctk.CTkEntry(parent, textvariable=var, fg_color="#132436", border_color=BORDER)
        entry.grid(row=row, column=1, columnspan=2, sticky="ew", padx=(10, 16), pady=10)
        if capture:
            entry.bind("<FocusIn>", lambda _event: self._begin_shortcut_capture())
        else:
            entry.bind("<Return>", lambda _event: self.save_selected_sound())
            entry.bind("<FocusOut>", lambda _event: self.save_selected_sound())

    def combo_row(self, parent, row: int, label: str, attr_name: str, var: tk.StringVar) -> None:
        ctk.CTkLabel(parent, text=label, text_color=MUTED, anchor="w").grid(row=row, column=0, sticky="w", padx=16, pady=12)
        combo = ctk.CTkComboBox(parent, variable=var, values=[], fg_color="#132436", border_color=BORDER, command=lambda _value: self._update_route_text())
        combo.grid(row=row, column=1, sticky="ew", padx=(10, 16), pady=12)
        setattr(self, attr_name, combo)

    def refresh_devices(self) -> None:
        try:
            self.devices = query_audio_devices()
        except Exception as exc:
            messagebox.showerror("Audio", str(exc))
            self.status_var.set("Dependencias de audio ausentes")
            return

        self.device_by_label = {device.label: device for device in self.devices}
        inputs = input_devices(self.devices)
        outputs = output_devices(self.devices)
        self.input_combo.configure(values=[device.label for device in inputs])
        self.virtual_combo.configure(values=[NO_VIRTUAL_LABEL] + [device.label for device in outputs])
        self.monitor_combo.configure(values=[device.label for device in outputs])

        selected_input = choose_input_device(self.devices)
        selected_virtual = choose_virtual_output_device(self.devices)
        selected_monitor = choose_monitor_output_device(self.devices, selected_virtual.index if selected_virtual else None)
        if selected_input:
            self.input_var.set(selected_input.label)
        self.virtual_output_var.set(selected_virtual.label if selected_virtual else NO_VIRTUAL_LABEL)
        if selected_monitor:
            self.monitor_output_var.set(selected_monitor.label)
        self.status_var.set("Pronto" if selected_virtual else "Saída virtual não encontrada")
        self._update_route_text()

    def refresh_record_devices(self) -> None:
        try:
            self.record_devices = query_record_devices(include_inputs=True, include_loopback=True)
        except Exception as exc:
            self.record_devices = []
            self.pc_record_var.set(f"Falha ao listar fontes: {exc}")
            return
        if hasattr(self, "record_device_list"):
            self.record_device_list.delete(0, tk.END)
            for device in self.record_devices:
                self.record_device_list.insert(tk.END, device.label)

    def activate_virtual_mode(self) -> None:
        if self._virtual_mode_active:
            return
        try:
            self._saved_default_capture_ids = get_default_capture_ids()
            endpoint = find_virtual_microphone_endpoint()
            if endpoint is None:
                self.status_var.set("CABLE Output não encontrado para definir como microfone padrão")
            else:
                set_default_capture_id(endpoint.id)
                self._virtual_mode_active = True
                self.status_var.set("Microfone padrão do Windows definido para CABLE Output")
        except Exception as exc:
            self.status_var.set(f"Não consegui mudar o microfone padrão: {exc}")

        if not self.engine.running:
            self.start_processing(show_errors=False)

    def deactivate_virtual_mode(self) -> None:
        self.engine.stop()
        if self._virtual_mode_active or self._saved_default_capture_ids:
            restore_default_capture_ids(self._saved_default_capture_ids)
        self._virtual_mode_active = False
        self._saved_default_capture_ids = {}

    def toggle_engine(self) -> None:
        if self.engine.running:
            self.engine.stop()
            self.status_var.set("Processamento desligado")
            self.process_button.configure(text="Ativar processamento", fg_color=ACCENT_DARK)
            self.power_button.configure(fg_color="#0d2843")
            return
        self.start_processing(show_errors=True)

    def start_processing(self, show_errors: bool = False) -> bool:
        try:
            self.engine.start(self._build_engine_config())
        except Exception as exc:
            if show_errors:
                messagebox.showerror("Audio", str(exc))
            self.status_var.set("Falha ao iniciar áudio")
            return False
        self.status_var.set(f"Processando em {self.engine.sample_rate} Hz")
        self.process_button.configure(text="Desativar processamento", fg_color=DANGER)
        self.power_button.configure(fg_color="#145f92")
        return True

    def _build_engine_config(self) -> EngineConfig:
        input_device = self._selected_device(self.input_var.get())
        if input_device is None:
            raise AudioEngineError("Selecione um microfone.")
        return EngineConfig(
            input_device=input_device,
            processed_output_device=self._selected_device(self.virtual_output_var.get()),
            monitor_output_device=self._selected_device(self.monitor_output_var.get()),
            gain=self._read_gain_text(),
            pitch_semitones=float(self.pitch_var.get()),
            effects=self._read_effects(),
            monitor_enabled=bool(self.monitor_var.get()),
        )

    def _selected_device(self, label: str) -> AudioDevice | None:
        if label == NO_VIRTUAL_LABEL:
            return None
        return self.device_by_label.get(label)

    def _update_route_text(self) -> None:
        input_device = self._selected_device(self.input_var.get())
        output_device = self._selected_device(self.virtual_output_var.get())
        if not input_device:
            self.route_var.set("")
            return
        if not output_device:
            self.route_var.set(f"Entrada: {input_device.name}\nSem saída virtual selecionada.")
            return
        self.route_var.set(
            f"Entrada: {input_device.name}\nSaída processada: {output_device.name}\nNo Discord use: {likely_recording_pair_name(output_device.name)}."
        )

    def reset_defaults(self) -> None:
        self.gain_var.set(DEFAULTS["gain"])
        self.gain_text_var.set("1.00")
        self.pitch_var.set(DEFAULTS["pitch"])
        self.pitch_label_var.set("+0.0 semitons")
        self.output_volume_enabled_var.set(False)
        self.output_volume_var.set(DEFAULTS["output_volume"])
        self.distortion_enabled_var.set(False)
        self.robot_enabled_var.set(False)
        self.echo_enabled_var.set(False)
        self.tremolo_enabled_var.set(False)
        self.bitcrush_enabled_var.set(False)
        self.distortion_drive_var.set(DEFAULTS["distortion_drive"])
        self.robot_rate_var.set(DEFAULTS["robot_rate"])
        self.echo_mix_var.set(DEFAULTS["echo_mix"])
        self.tremolo_rate_var.set(DEFAULTS["tremolo_rate"])
        self.bitcrush_bits_var.set(DEFAULTS["bitcrush_bits"])
        self.monitor_var.set(False)
        self._on_effect_scale()
        self._apply_controls()
        if self.engine.running:
            self.engine.set_monitor(False)
        self.status_var.set("Padrão restaurado")

    def _on_gain_scale(self, value: float) -> None:
        if self._syncing_gain:
            return
        self.gain_text_var.set(f"{float(value):.2f}")
        self._apply_controls()

    def _apply_gain_entry(self, _event=None) -> None:
        try:
            gain = self._read_gain_text()
        except ValueError:
            self.gain_text_var.set(f"{self.gain_var.get():.2f}")
            return
        self.gain_text_var.set(f"{gain:.2f}")
        self._syncing_gain = True
        self.gain_var.set(min(100.0, gain))
        self._syncing_gain = False
        self._apply_controls()

    def _read_gain_text(self) -> float:
        value = float(self.gain_text_var.get().strip().replace(",", "."))
        if not math.isfinite(value):
            raise ValueError("invalid gain")
        return max(0.0, value)

    def _on_pitch_scale(self, value: float) -> None:
        pitch = round(float(value) * 2.0) / 2.0
        self.pitch_var.set(pitch)
        self.pitch_label_var.set(f"{pitch:+.1f} semitons")
        self._apply_controls()

    def _on_effect_scale(self) -> None:
        self.output_volume_label_var.set(f"{self.output_volume_var.get():.1f}x")
        self.distortion_label_var.set(f"{self.distortion_drive_var.get():.1f}x")
        self.robot_label_var.set(f"{self.robot_rate_var.get():.0f} Hz")
        self.echo_label_var.set(f"{self.echo_mix_var.get():.0f}%")
        self.tremolo_label_var.set(f"{self.tremolo_rate_var.get():.0f} Hz")
        self.bitcrush_bits_var.set(round(self.bitcrush_bits_var.get()))
        self.bitcrush_label_var.set(f"{self.bitcrush_bits_var.get():.0f} bits")
        self._apply_controls()

    def _read_effects(self) -> EffectsSettings:
        return EffectsSettings(
            output_volume_enabled=bool(self.output_volume_enabled_var.get()),
            output_volume=float(self.output_volume_var.get()),
            distortion_enabled=bool(self.distortion_enabled_var.get()),
            distortion_drive=float(self.distortion_drive_var.get()),
            robot_enabled=bool(self.robot_enabled_var.get()),
            robot_rate_hz=float(self.robot_rate_var.get()),
            echo_enabled=bool(self.echo_enabled_var.get()),
            echo_mix=float(self.echo_mix_var.get()) / 100.0,
            tremolo_enabled=bool(self.tremolo_enabled_var.get()),
            tremolo_rate_hz=float(self.tremolo_rate_var.get()),
            bitcrush_enabled=bool(self.bitcrush_enabled_var.get()),
            bitcrush_bits=int(round(self.bitcrush_bits_var.get())),
        )

    def _apply_controls(self) -> None:
        try:
            gain = self._read_gain_text()
        except ValueError:
            return
        self.engine.set_controls(gain, float(self.pitch_var.get()), self._read_effects())

    def _on_monitor_toggle(self) -> None:
        try:
            self.engine.set_monitor(self.monitor_var.get(), self._selected_device(self.monitor_output_var.get()))
        except AudioEngineError as exc:
            self.monitor_var.set(False)
            messagebox.showerror("Monitor", str(exc))

    def refresh_sound_list(self) -> None:
        if not hasattr(self, "sound_list"):
            return
        self.sound_list.delete(0, tk.END)
        for item in self.library.items:
            suffix = f"  [{item.shortcut}]" if item.shortcut else ""
            self.sound_list.insert(tk.END, f"{item.name}{suffix}")
        self.render_quick_sounds()

    def render_quick_sounds(self) -> None:
        if not hasattr(self, "quick_sounds_frame"):
            return
        for child in self.quick_sounds_frame.winfo_children():
            child.destroy()
        if not self.library.items:
            ctk.CTkLabel(self.quick_sounds_frame, text="Adicione sons na aba Soundboard.", text_color=SOFT).pack(anchor="w")
            return
        for item in self.library.items[:6]:
            ctk.CTkButton(
                self.quick_sounds_frame,
                text=item.name[:16],
                height=38,
                corner_radius=10,
                fg_color=CARD_ALT,
                command=lambda item_id=item.id: self.play_sound(item_id),
            ).pack(side="left", padx=(0, 8), pady=4)

    def add_sound(self) -> None:
        paths = filedialog.askopenfilenames(title="Adicionar sons", filetypes=SUPPORTED_AUDIO_TYPES)
        added = None
        for path in paths:
            try:
                added = self.library.add_file(path)
            except OSError as exc:
                messagebox.showerror("Soundboard", f"Não foi possível adicionar {path}: {exc}")
        self.refresh_sound_list()
        if added:
            self.select_sound(added.id)

    def select_sound(self, item_id: str) -> None:
        for index, item in enumerate(self.library.items):
            if item.id == item_id:
                self.sound_list.selection_clear(0, tk.END)
                self.sound_list.selection_set(index)
                self.sound_list.see(index)
                self.load_sound_editor(item)

    def _on_sound_select(self, _event=None) -> None:
        selection = self.sound_list.curselection()
        if not selection:
            return
        index = int(selection[0])
        if 0 <= index < len(self.library.items):
            self.load_sound_editor(self.library.items[index])

    def load_sound_editor(self, item: SoundItem) -> None:
        self.selected_sound_id = item.id
        self.sound_name_var.set(item.name)
        self.sound_volume_var.set(item.volume)
        self.sound_pitch_var.set(item.pitch_semitones)
        self.sound_repeats_var.set(item.repeats)
        self.sound_shortcut_var.set(item.shortcut)
        self._on_sound_param_scale(0)

    def _on_sound_param_scale(self, _value: float) -> None:
        self.sound_volume_label_var.set(f"{self.sound_volume_var.get():.1f}x")
        pitch = round(self.sound_pitch_var.get() * 2.0) / 2.0
        self.sound_pitch_var.set(pitch)
        self.sound_pitch_label_var.set(f"{pitch:+.1f}")
        self.sound_repeats_var.set(round(self.sound_repeats_var.get()))
        self.sound_repeats_label_var.set(f"{self.sound_repeats_var.get():.0f}x")

    def save_selected_sound(self) -> None:
        if not self.selected_sound_id:
            return
        item = self.library.by_id(self.selected_sound_id)
        if not item:
            return
        item.name = self.sound_name_var.get().strip() or item.name
        item.volume = max(0.0, float(self.sound_volume_var.get()))
        item.pitch_semitones = float(self.sound_pitch_var.get())
        item.repeats = max(1, min(20, int(round(self.sound_repeats_var.get()))))
        item.shortcut = self.normalize_hotkey(self.sound_shortcut_var.get())
        self.sound_shortcut_var.set(item.shortcut)
        self.library.update(item)
        self.refresh_sound_list()
        self.select_sound(item.id)
        self.register_hotkeys()

    def remove_selected_sound(self) -> None:
        if not self.selected_sound_id:
            return
        self.library.remove(self.selected_sound_id)
        self.selected_sound_id = None
        self.refresh_sound_list()
        self.register_hotkeys()

    def play_selected_sound(self) -> None:
        if self.selected_sound_id:
            self.play_sound(self.selected_sound_id)

    def play_sound(self, item_id: str) -> None:
        item = self.library.by_id(item_id)
        if not item:
            return
        if not self.engine.running:
            self.after(0, lambda: messagebox.showinfo("Soundboard", "Ative o processamento antes de tocar sons no Discord."))
            return
        try:
            source = self.load_sound_source(item)
            rendered = render_sound_for_playback(source, item.volume, item.pitch_semitones, item.repeats)
            self.engine.play_sound(rendered)
            self.status_var.set(f"Tocando: {item.name}")
        except Exception as exc:
            self.after(0, lambda: messagebox.showerror("Soundboard", str(exc)))

    def load_sound_source(self, item: SoundItem):
        path = Path(item.path)
        stamp = path.stat().st_mtime
        cached = self.sound_cache.get(item.id)
        if cached and cached[0] == stamp:
            return cached[1]
        audio = load_audio_mono(item.path, self.engine.sample_rate)
        self.sound_cache[item.id] = (stamp, audio)
        return audio

    def _begin_shortcut_capture(self) -> None:
        if self.selected_sound_id:
            self.capturing_shortcut = True
            self.sound_shortcut_var.set("pressione o atalho")

    def _on_keypress(self, event) -> None:
        hotkey = self.event_to_hotkey(event)
        if not hotkey:
            return
        if self.capturing_shortcut:
            self.capturing_shortcut = False
            self.sound_shortcut_var.set(hotkey)
            self.save_selected_sound()
            return
        item = self.library.by_shortcut(hotkey)
        if item:
            self.play_sound(item.id)

    def register_hotkeys(self) -> None:
        try:
            import keyboard
        except Exception:
            return
        for handle in self.hotkey_handles:
            try:
                keyboard.remove_hotkey(handle)
            except Exception:
                pass
        self.hotkey_handles = []
        for item in self.library.items:
            hotkey = self.normalize_hotkey(item.shortcut)
            if not hotkey:
                continue
            try:
                handle = keyboard.add_hotkey(hotkey, lambda item_id=item.id: self.after(0, lambda: self.play_sound(item_id)))
                self.hotkey_handles.append(handle)
            except Exception:
                continue

    def event_to_hotkey(self, event) -> str:
        key = event.keysym
        if not key or key in {"Shift_L", "Shift_R", "Control_L", "Control_R", "Alt_L", "Alt_R"}:
            return ""
        parts = []
        if event.state & 0x4:
            parts.append("ctrl")
        if event.state & 0x8 or event.state & 0x20000:
            parts.append("alt")
        if event.state & 0x1:
            parts.append("shift")
        parts.append(key.lower() if len(key) == 1 else key.lower())
        return "+".join(parts)

    def normalize_hotkey(self, value: str) -> str:
        value = value.strip().lower().replace("control", "ctrl").replace(" ", "")
        value = value.replace("ctrl+", "ctrl+").replace("alt+", "alt+").replace("shift+", "shift+")
        return value

    def _on_default_sound_scale(self, _value: float) -> None:
        self.default_sound_volume_label_var.set(f"{self.default_sound_volume_var.get():.1f}x")
        pitch = round(self.default_sound_pitch_var.get() * 2.0) / 2.0
        self.default_sound_pitch_var.set(pitch)
        self.default_sound_pitch_label_var.set(f"{pitch:+.1f}")
        self.default_sound_repeats_var.set(round(self.default_sound_repeats_var.get()))
        self.default_sound_repeats_label_var.set(f"{self.default_sound_repeats_var.get():.0f}x")

    def save_sound_defaults(self) -> None:
        self.library.defaults = SoundDefaults(
            volume=max(0.0, float(self.default_sound_volume_var.get())),
            pitch_semitones=float(self.default_sound_pitch_var.get()),
            repeats=max(1, min(20, int(round(self.default_sound_repeats_var.get())))),
        )
        self.library.save_settings()
        messagebox.showinfo("Presets", "Preset padrão do soundboard salvo.")

    def toggle_voice_recording(self) -> None:
        if not self.engine.running:
            messagebox.showinfo("Gravador", "Ative o processamento antes de gravar a voz.")
            return
        if not self.engine.recording:
            self.engine.start_recording()
            self.voice_record_button.configure(text="Parar gravação da voz", fg_color=DANGER)
            self.voice_record_var.set("Gravando voz processada...")
            return
        recordings_dir = self.library.base_dir / "recordings"
        recordings_dir.mkdir(parents=True, exist_ok=True)
        file_path = recordings_dir / f"voz_processada_{time.strftime('%Y%m%d_%H%M%S')}.wav"
        try:
            frames = self.engine.stop_recording(str(file_path))
        except Exception as exc:
            messagebox.showerror("Gravador", str(exc))
            return
        self.voice_record_button.configure(text="Começar gravação da voz", fg_color=ACCENT_DARK)
        self.voice_record_var.set(f"Salvo em {file_path} ({frames} samples)")

    def toggle_pc_recording(self) -> None:
        if not self.pc_recorder.running:
            selected = [self.record_devices[int(i)] for i in self.record_device_list.curselection()]
            if not selected:
                messagebox.showinfo("Gravador do PC", "Selecione uma ou mais fontes na lista.")
                return
            try:
                self.pc_recorder.start(selected)
            except Exception as exc:
                messagebox.showerror("Gravador do PC", str(exc))
                return
            self.pc_record_button.configure(text="Parar gravação do PC", fg_color=DANGER)
            self.pc_record_var.set(f"Gravando {len(selected)} fonte(s)...")
            return
        try:
            paths = self.pc_recorder.stop()
        except Exception as exc:
            messagebox.showerror("Gravador do PC", str(exc))
            return
        self.pc_record_button.configure(text="Gravar fontes selecionadas", fg_color=ACCENT_DARK)
        self.pc_record_var.set(f"Salvo: {len(paths)} arquivo(s) em {self.library.base_dir / 'pc_recordings'}")

    def _create_tray_icon(self) -> None:
        try:
            import pystray
            from PIL import Image, ImageDraw
        except Exception:
            return

        if PNG_ICON_PATH.exists():
            image = Image.open(PNG_ICON_PATH).resize((64, 64))
        else:
            image = Image.new("RGBA", (64, 64), (7, 17, 29, 255))
            draw = ImageDraw.Draw(image)
            draw.ellipse((18, 8, 46, 42), outline=(37, 167, 242, 255), width=5)
            draw.line((32, 9, 32, 33), fill=(37, 167, 242, 255), width=5)
            draw.arc((12, 18, 52, 58), start=200, end=340, fill=(37, 167, 242, 255), width=5)
            draw.line((32, 48, 32, 58), fill=(37, 167, 242, 255), width=5)

        self.tray_icon = pystray.Icon(
            "MicFudiddo",
            image,
            "MicFudiddo",
            pystray.Menu(
                pystray.MenuItem("Mostrar", lambda _icon, _item: self.after(0, self.show_from_tray)),
                pystray.MenuItem("Fechar", lambda _icon, _item: self.after(0, self.quit_from_tray)),
            ),
        )
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def hide_to_tray(self) -> None:
        self.withdraw()
        self.status_var.set("Rodando em segundo plano na bandeja do Windows")

    def show_from_tray(self) -> None:
        self.deiconify()
        self.lift()
        self.focus_force()

    def quit_from_tray(self) -> None:
        self._really_quit = True
        self._on_close()

    def _poll_engine(self) -> None:
        if self.engine.running:
            self.level_bar.set(min(1.0, self.engine.last_level))
        else:
            self.level_bar.set(0)
        self.after(120, self._poll_engine)

    def _on_close(self) -> None:
        if self.enable_startup_automation and not self._really_quit:
            self.hide_to_tray()
            return
        try:
            self.register_hotkeys_cleanup()
        finally:
            self.deactivate_virtual_mode()
            if self.pc_recorder.running:
                self.pc_recorder.stop(discard=True)
            if self.tray_icon is not None:
                try:
                    self.tray_icon.stop()
                except Exception:
                    pass
            self.destroy()

    def register_hotkeys_cleanup(self) -> None:
        try:
            import keyboard
        except Exception:
            return
        for handle in self.hotkey_handles:
            try:
                keyboard.remove_hotkey(handle)
            except Exception:
                pass
        self.hotkey_handles = []


def main() -> None:
    app = MicFudiddoApp()
    app.mainloop()
