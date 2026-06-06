from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
import base64
import json
import mimetypes
from pathlib import Path
import shutil
import subprocess
import time
import uuid

import numpy as np
import re
import unicodedata

from .processing import DualDelayPitchShifter, EffectsSettings, VoiceEffectsProcessor


def sanitize_sound_name(name: str) -> str:
    name = str(name or "").lower()
    sanitized = []
    for c in name:
        cat = unicodedata.category(c)
        if cat.startswith("L") or cat.startswith("N") or c in " _-":
            sanitized.append(c)
    result = "".join(sanitized)
    result = re.sub(r"\s+", " ", result).strip()
    return result



DIRECT_AUDIO_EXTENSIONS = {".wav", ".flac", ".ogg", ".aiff", ".aif"}
FFMPEG_AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".opus", ".wma", ".mp4", ".mov", ".mkv", ".webm"}
SUPPORTED_FILE_EXTENSIONS = DIRECT_AUDIO_EXTENSIONS | FFMPEG_AUDIO_EXTENSIONS
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

SUPPORTED_AUDIO_TYPES = (
    ("Audio e video curto", "*.wav *.flac *.ogg *.aiff *.aif *.mp3 *.m4a *.aac *.opus *.wma *.mp4 *.mov *.mkv *.webm"),
    ("Todos os arquivos", "*.*"),
)


@dataclass
class SoundItem:
    id: str
    name: str
    path: str
    category: str = "Geral"
    color: str = "#25a7f2"
    volume: float = 1.0
    pitch_semitones: float = 0.0
    pitch_mode: str = "preserve"
    speed: float = 1.0
    normalize: bool = False
    fade_in_ms: float = 0.0
    fade_out_ms: float = 0.0
    repeats: int = 1
    loop: bool = False
    playback_mode: str = "restart"
    stop_other_sounds: bool = False
    mute_other_sounds: bool = False
    output_route: str = "both"
    shortcut: str = ""
    block_voice: bool = False
    play_count: int = 0
    last_played_at: float = 0.0
    cover_path: str = ""
    created_at: float = field(default_factory=time.time)
    effects: dict = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)


@dataclass
class SoundDefaults:
    volume: float = 1.0
    pitch_semitones: float = 0.0
    pitch_mode: str = "preserve"
    speed: float = 1.0
    normalize: bool = False
    fade_in_ms: float = 0.0
    fade_out_ms: float = 0.0
    repeats: int = 1
    category: str = "Geral"
    color: str = "#25a7f2"
    playback_mode: str = "restart"
    stop_other_sounds: bool = False
    mute_other_sounds: bool = False
    output_route: str = "both"
    tags: list[str] = field(default_factory=list)


class SoundLibrary:
    def __init__(self, app_name: str = "MicFudiddo") -> None:
        base = Path.home() / "AppData" / "Roaming" / app_name
        self.base_dir = base
        self.sounds_dir = base / "sounds"
        self.covers_dir = base / "covers"
        self.index_path = base / "soundboard.json"
        self.settings_path = base / "settings.json"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.sounds_dir.mkdir(parents=True, exist_ok=True)
        self.covers_dir.mkdir(parents=True, exist_ok=True)
        self.items: list[SoundItem] = []
        self.defaults = SoundDefaults()
        self.load_settings()
        self.load()

    def load(self) -> list[SoundItem]:
        if not self.index_path.exists():
            self.items = []
            return self.items

        try:
            raw_items = json.loads(self.index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self.items = []
            return self.items

        items: list[SoundItem] = []
        changed = False
        for raw in raw_items:
            try:
                item = SoundItem(**_dataclass_payload(SoundItem, raw))
            except TypeError:
                continue
            changed = self._sanitize_item(item) or changed
            if Path(item.path).exists():
                changed = self._migrate_existing_item(item) or changed
                items.append(item)
        self.items = items
        if changed:
            self.save()
        return self.items

    def save(self) -> None:
        self.index_path.write_text(
            json.dumps([asdict(item) for item in self.items], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def load_settings(self) -> SoundDefaults:
        if not self.settings_path.exists():
            self.defaults = SoundDefaults()
            return self.defaults
        try:
            raw = json.loads(self.settings_path.read_text(encoding="utf-8"))
            self.defaults = SoundDefaults(**_dataclass_payload(SoundDefaults, raw.get("sound_defaults", {})))
            self._sanitize_defaults()
        except (OSError, json.JSONDecodeError, TypeError):
            self.defaults = SoundDefaults()
        return self.defaults

    def save_settings(self) -> None:
        data = {"sound_defaults": asdict(self.defaults)}
        self.settings_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def add_file(self, source: str, category: str | None = None, name: str | None = None, color: str | None = None) -> SoundItem:
        source_path = Path(source)
        if not source_path.is_file():
            raise RuntimeError(f"Arquivo nao encontrado: {source}")
        suffix = source_path.suffix.lower()
        if suffix not in SUPPORTED_FILE_EXTENSIONS:
            raise RuntimeError(f"Formato ainda nao suportado: {suffix or source_path.name}")

        safe_id = uuid.uuid4().hex
        target = self.sounds_dir / f"{safe_id}{self._target_suffix(suffix)}"
        self._copy_or_convert(source_path, target)

        raw_name = name or source_path.stem
        sanitized_name = sanitize_sound_name(raw_name)
        if not sanitized_name:
            sanitized_name = "som"

        item = SoundItem(
            id=safe_id,
            name=sanitized_name,
            path=str(target),
            category=(category or self.defaults.category or "Geral").strip() or "Geral",
            color=color or self.defaults.color,
            volume=self.defaults.volume,
            pitch_semitones=self.defaults.pitch_semitones,
            pitch_mode=self.defaults.pitch_mode,
            speed=self.defaults.speed,
            normalize=self.defaults.normalize,
            fade_in_ms=self.defaults.fade_in_ms,
            fade_out_ms=self.defaults.fade_out_ms,
            repeats=self.defaults.repeats,
            playback_mode=self.defaults.playback_mode,
            stop_other_sounds=self.defaults.stop_other_sounds,
            mute_other_sounds=self.defaults.mute_other_sounds,
            output_route=self.defaults.output_route,
            effects={},
        )
        self.items.append(item)
        self.save()
        return item

    def add_folder(self, source: str) -> list[SoundItem]:
        folder = Path(source)
        if not folder.is_dir():
            raise RuntimeError(f"Pasta nao encontrada: {source}")
        added: list[SoundItem] = []
        for path in sorted(folder.rglob("*")):
            if path.is_file() and path.suffix.lower() in SUPPORTED_FILE_EXTENSIONS:
                added.append(self.add_file(str(path)))
        return added

    def remove(self, item_id: str) -> None:
        kept = []
        for item in self.items:
            if item.id == item_id:
                try:
                    Path(item.path).unlink(missing_ok=True)
                except OSError:
                    pass
                try:
                    (self.sounds_dir / f"{item.id}.original.wav").unlink(missing_ok=True)
                except OSError:
                    pass
                if item.cover_path:
                    try:
                        Path(item.cover_path).unlink(missing_ok=True)
                    except OSError:
                        pass
            else:
                kept.append(item)
        self.items = kept
        self.save()

    def detach(self, item_id: str) -> dict | None:
        removed = self.detach_many([item_id])
        return removed[0] if removed else None

    def detach_many(self, item_ids: list[str]) -> list[dict]:
        wanted = {str(item_id) for item_id in item_ids}
        removed: list[dict] = []
        kept: list[SoundItem] = []
        for item in self.items:
            if item.id in wanted:
                removed.append(asdict(item))
            else:
                kept.append(item)
        if removed:
            self.items = kept
            self.save()
        return removed

    def restore_items(self, raw_items: list[dict]) -> list[SoundItem]:
        restored: list[SoundItem] = []
        existing = {item.id for item in self.items}
        for raw in raw_items:
            try:
                item = SoundItem(**_dataclass_payload(SoundItem, raw))
            except TypeError:
                continue
            if item.id in existing or not Path(item.path).exists():
                continue
            self._sanitize_item(item)
            self.items.append(item)
            existing.add(item.id)
            restored.append(item)
        if restored:
            self.save()
        return restored

    def update(self, item: SoundItem) -> None:
        for index, existing in enumerate(self.items):
            if existing.id == item.id:
                self.items[index] = item
                self.save()
                return
        self.items.append(item)
        self.save()

    def set_cover(self, item_id: str, source: str) -> SoundItem:
        item = self.by_id(item_id)
        if item is None:
            raise RuntimeError("Som nao encontrado.")
        source_path = Path(source)
        if not source_path.is_file():
            raise RuntimeError(f"Imagem nao encontrada: {source}")
        suffix = source_path.suffix.lower()
        if suffix not in SUPPORTED_IMAGE_EXTENSIONS:
            raise RuntimeError(f"Formato de imagem nao suportado: {suffix or source_path.name}")
        target = self.covers_dir / f"{item.id}{suffix}"
        shutil.copy2(source_path, target)
        if item.cover_path and Path(item.cover_path).resolve() != target.resolve():
            try:
                Path(item.cover_path).unlink(missing_ok=True)
            except OSError:
                pass
        item.cover_path = str(target)
        self.update(item)
        return item

    def record_play(self, item_id: str) -> None:
        item = self.by_id(item_id)
        if item is None:
            return
        item.play_count = max(0, int(item.play_count)) + 1
        item.last_played_at = time.time()
        self.update(item)

    def trimmed_copy(self, item_id: str, start_seconds: float, end_seconds: float | None = None) -> SoundItem:
        item = self.by_id(item_id)
        if item is None:
            raise RuntimeError("Som nao encontrado.")

        trimmed, sample_rate = render_audio_file_edit(
            item.path,
            start_seconds,
            end_seconds,
            volume=1.0,
            pitch_semitones=0.0,
            repeats=1,
            effects=None,
        )
        safe_id = uuid.uuid4().hex
        target = self.sounds_dir / f"{safe_id}.wav"
        try:
            import soundfile as sf
        except Exception as exc:  # pragma: no cover - depends on user environment
            raise RuntimeError("A biblioteca soundfile nao esta instalada.") from exc

        sf.write(target, trimmed, sample_rate)
        copied = SoundItem(
            id=safe_id,
            name=f"{item.name} corte",
            path=str(target),
            category=item.category or "Geral",
            color=item.color or "#25a7f2",
            volume=item.volume,
            pitch_semitones=item.pitch_semitones,
            pitch_mode=item.pitch_mode,
            speed=item.speed,
            normalize=item.normalize,
            fade_in_ms=item.fade_in_ms,
            fade_out_ms=item.fade_out_ms,
            repeats=item.repeats,
            loop=item.loop,
            playback_mode=item.playback_mode,
            stop_other_sounds=item.stop_other_sounds,
            mute_other_sounds=item.mute_other_sounds,
            output_route=item.output_route,
            shortcut="",
            block_voice=item.block_voice,
            effects=dict(item.effects or {}),
        )
        self.items.append(copied)
        self.save()
        return copied

    def save_edited(
        self,
        item_id: str,
        *,
        replace: bool,
        name: str,
        category: str,
        color: str,
        volume: float,
        pitch_semitones: float,
        repeats: int,
        pitch_mode: str = "preserve",
        speed: float = 1.0,
        normalize: bool = False,
        fade_in_ms: float = 0.0,
        fade_out_ms: float = 0.0,
        loop: bool = False,
        playback_mode: str = "restart",
        stop_other_sounds: bool = False,
        mute_other_sounds: bool = False,
        output_route: str = "both",
        shortcut: str = "",
        block_voice: bool = False,
        start_seconds: float = 0.0,
        end_seconds: float | None = None,
        effects: EffectsSettings | dict | None = None,
    ) -> SoundItem:
        item = self.by_id(item_id)
        if item is None:
            raise RuntimeError("Som nao encontrado.")
        effects_dict = effects if isinstance(effects, dict) else asdict(effects) if effects else {}
        try:
            import soundfile as sf
        except Exception as exc:  # pragma: no cover - depends on user environment
            raise RuntimeError("A biblioteca soundfile nao esta instalada.") from exc

        rendered, sample_rate = render_audio_file_edit(
            item.path,
            start_seconds,
            end_seconds,
            volume=volume,
            pitch_semitones=pitch_semitones,
            pitch_mode=pitch_mode,
            speed=speed,
            normalize=normalize,
            fade_in_ms=fade_in_ms,
            fade_out_ms=fade_out_ms,
            repeats=repeats,
            effects=effects,
        )

        clean_name = str(name or item.name or "Som").strip() or "Som"
        clean_category = str(category or item.category or "Geral").strip() or "Geral"
        clean_color = str(color or item.color or "#25a7f2")

        if replace:
            original_backup = self.sounds_dir / f"{item.id}.original.wav"
            if not original_backup.exists() and Path(item.path).exists():
                try:
                    shutil.copy2(item.path, original_backup)
                except Exception as e:
                    print("Erro ao fazer backup do som original:", e)

            target = self.sounds_dir / f"{item.id}.wav"
            temp_target = self.sounds_dir / f"{item.id}.edit.wav"
            sf.write(temp_target, rendered, sample_rate)
            old_path = Path(item.path)
            temp_target.replace(target)
            if old_path.exists() and old_path.resolve() != target.resolve():
                try:
                    old_path.unlink(missing_ok=True)
                except OSError:
                    pass
            item.path = str(target)
            item.name = clean_name
            item.category = clean_category
            item.color = clean_color
            item.volume = 1.0
            item.pitch_semitones = 0.0
            item.pitch_mode = "preserve"
            item.speed = 1.0
            item.normalize = False
            item.fade_in_ms = 0.0
            item.fade_out_ms = 0.0
            item.repeats = 1
            item.loop = bool(loop)
            item.playback_mode = _sanitize_playback_mode(playback_mode)
            item.stop_other_sounds = bool(stop_other_sounds)
            item.mute_other_sounds = bool(mute_other_sounds)
            item.output_route = _sanitize_output_route(output_route)
            item.shortcut = str(shortcut or "").strip()
            item.block_voice = bool(block_voice)
            item.effects = effects_dict
            self.update(item)
            return item

        safe_id = uuid.uuid4().hex
        target = self.sounds_dir / f"{safe_id}.wav"
        sf.write(target, rendered, sample_rate)
        copied = SoundItem(
            id=safe_id,
            name=f"{clean_name} copia",
            path=str(target),
            category=clean_category,
            color=clean_color,
            volume=1.0,
            pitch_semitones=0.0,
            pitch_mode="preserve",
            speed=1.0,
            normalize=False,
            fade_in_ms=0.0,
            fade_out_ms=0.0,
            repeats=1,
            loop=bool(loop),
            playback_mode=_sanitize_playback_mode(playback_mode),
            stop_other_sounds=bool(stop_other_sounds),
            mute_other_sounds=bool(mute_other_sounds),
            output_route=_sanitize_output_route(output_route),
            shortcut="",
            block_voice=bool(block_voice),
            effects=effects_dict,
        )
        self.items.append(copied)
        self.save()
        return copied

    def restore_original(self, item_id: str) -> SoundItem:
        item = self.by_id(item_id)
        if item is None:
            raise RuntimeError("Som nao encontrado.")
        original_backup = self.sounds_dir / f"{item.id}.original.wav"
        if not original_backup.exists():
            raise RuntimeError("Nenhum backup original encontrado para este som.")
        
        shutil.copy2(original_backup, item.path)
        try:
            original_backup.unlink(missing_ok=True)
        except OSError:
            pass
        
        item.volume = 1.0
        item.pitch_semitones = 0.0
        item.pitch_mode = "preserve"
        item.speed = 1.0
        item.normalize = False
        item.fade_in_ms = 0.0
        item.fade_out_ms = 0.0
        item.repeats = 1
        item.effects = {}
        
        self.update(item)
        return item

    def export_mfsound(self, item_id: str, export_path: str) -> str:
        import zipfile
        item = self.by_id(item_id)
        if not item:
            raise RuntimeError("Som nao encontrado.")
        
        audio_path = Path(item.path)
        original_backup = self.sounds_dir / f"{item.id}.original.wav"
        if original_backup.exists():
            audio_path = original_backup
            
        if not audio_path.exists():
            raise RuntimeError(f"Arquivo de audio nao encontrado em: {audio_path}")
            
        metadata = {
            "name": item.name,
            "category": item.category,
            "color": item.color,
            "volume": item.volume,
            "pitch_semitones": item.pitch_semitones,
            "pitch_mode": item.pitch_mode,
            "speed": item.speed,
            "normalize": item.normalize,
            "fade_in_ms": item.fade_in_ms,
            "fade_out_ms": item.fade_out_ms,
            "loop": item.loop,
            "playback_mode": item.playback_mode,
            "stop_other_sounds": item.stop_other_sounds,
            "mute_other_sounds": item.mute_other_sounds,
            "output_route": item.output_route,
            "shortcut": item.shortcut,
            "block_voice": item.block_voice,
            "effects": item.effects,
            "tags": item.tags,
            "audio_filename": audio_path.name
        }
        
        with zipfile.ZipFile(export_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))
            zipf.write(audio_path, arcname=audio_path.name)
            
        return export_path

    def import_mfsound(self, archive_path: str) -> SoundItem:
        import zipfile
        import tempfile
        archive_path = Path(archive_path)
        if not archive_path.is_file():
            raise RuntimeError(f"Arquivo .mfsound nao encontrado: {archive_path}")
            
        with zipfile.ZipFile(archive_path, "r") as zipf:
            namelist = zipf.namelist()
            if "metadata.json" not in namelist:
                raise RuntimeError("Arquivo .mfsound invalido: metadata.json nao encontrado.")
                
            metadata = json.loads(zipf.read("metadata.json").decode("utf-8"))
            audio_filename = metadata.get("audio_filename")
            
            if not audio_filename or audio_filename not in namelist:
                for name in namelist:
                    if name != "metadata.json" and Path(name).suffix.lower() in SUPPORTED_FILE_EXTENSIONS:
                        audio_filename = name
                        break
                        
            if not audio_filename:
                raise RuntimeError("Nenhum arquivo de audio suportado encontrado no pacote.")
                
            safe_id = uuid.uuid4().hex
            audio_suffix = Path(audio_filename).suffix.lower()
            target = self.sounds_dir / f"{safe_id}{self._target_suffix(audio_suffix)}"
            
            with tempfile.TemporaryDirectory() as tmpdir:
                extracted_path = zipf.extract(audio_filename, tmpdir)
                self._copy_or_convert(Path(extracted_path), target)
                
            item = SoundItem(
                id=safe_id,
                name=metadata.get("name", "Som Importado"),
                path=str(target),
                category=metadata.get("category", "Geral"),
                color=metadata.get("color", "#25a7f2"),
                volume=metadata.get("volume", 1.0),
                pitch_semitones=metadata.get("pitch_semitones", 0.0),
                pitch_mode=metadata.get("pitch_mode", "preserve"),
                speed=metadata.get("speed", 1.0),
                normalize=metadata.get("normalize", False),
                fade_in_ms=metadata.get("fade_in_ms", 0.0),
                fade_out_ms=metadata.get("fade_out_ms", 0.0),
                repeats=metadata.get("repeats", 1),
                loop=metadata.get("loop", False),
                playback_mode=metadata.get("playback_mode", "restart"),
                stop_other_sounds=metadata.get("stop_other_sounds", False),
                mute_other_sounds=metadata.get("mute_other_sounds", False),
                output_route=metadata.get("output_route", "both"),
                shortcut=metadata.get("shortcut", ""),
                block_voice=metadata.get("block_voice", False),
                effects=metadata.get("effects", {}),
                tags=metadata.get("tags", []),
            )
            self.items.append(item)
            self.save()
            return item


    def categories(self) -> list[str]:
        names = {
            (item.category or "Geral").strip() or "Geral"
            for item in self.items
        }
        names.add((self.defaults.category or "Geral").strip() or "Geral")
        return sorted(names, key=str.lower)

    def by_id(self, item_id: str) -> SoundItem | None:
        for item in self.items:
            if item.id == item_id:
                return item
        return None

    def by_shortcut(self, shortcut: str) -> SoundItem | None:
        shortcut = shortcut.strip().lower()
        if not shortcut:
            return None
        for item in self.items:
            if item.shortcut.strip().lower() == shortcut:
                return item
        return None

    def _target_suffix(self, suffix: str) -> str:
        if suffix in DIRECT_AUDIO_EXTENSIONS:
            return suffix
        return ".wav"

    def _copy_or_convert(self, source: Path, target: Path) -> None:
        suffix = source.suffix.lower()
        if suffix in DIRECT_AUDIO_EXTENSIONS:
            shutil.copy2(source, target)
            return

        ffmpeg = shutil.which("ffmpeg") or _bundled_ffmpeg()
        if not ffmpeg:
            raise RuntimeError("Para importar MP3/M4A/MP4/WMA/WEBM automaticamente, instale o FFmpeg no Windows.")

        command = [
            ffmpeg,
            "-y",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "48000",
            str(target),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0 or not target.exists():
            detail = (completed.stderr or completed.stdout or "erro desconhecido").strip().splitlines()[-1:]
            raise RuntimeError(f"Nao consegui converter {source.name}: {' '.join(detail)}")

    def _migrate_existing_item(self, item: SoundItem) -> bool:
        source = Path(item.path)
        if source.suffix.lower() not in FFMPEG_AUDIO_EXTENSIONS:
            return False
        target = self.sounds_dir / f"{item.id}.wav"
        if source.resolve() == target.resolve():
            return False
        try:
            self._copy_or_convert(source, target)
        except RuntimeError:
            return False
        if not target.exists():
            return False
        item.path = str(target)
        try:
            source.unlink(missing_ok=True)
        except OSError:
            pass
        return True

    def _sanitize_item(self, item: SoundItem) -> bool:
        before = asdict(item)
        item.name = sanitize_sound_name(str(item.name or "Som"))
        if not item.name:
            item.name = "som"
        item.category = str(item.category or "Geral").strip() or "Geral"
        item.color = _sanitize_color(item.color)
        item.volume = max(0.0, _finite_float(item.volume, 1.0))
        item.pitch_semitones = _finite_float(item.pitch_semitones, 0.0)
        item.pitch_mode = _sanitize_pitch_mode(item.pitch_mode)
        item.speed = _sanitize_speed(item.speed)
        item.normalize = bool(item.normalize)
        item.fade_in_ms = _clamp(_finite_float(item.fade_in_ms, 0.0), 0.0, 5000.0)
        item.fade_out_ms = _clamp(_finite_float(item.fade_out_ms, 0.0), 0.0, 5000.0)
        item.repeats = max(1, min(20, int(round(_finite_float(item.repeats, 1.0)))))
        item.loop = bool(item.loop)
        item.playback_mode = _sanitize_playback_mode(item.playback_mode)
        item.stop_other_sounds = bool(item.stop_other_sounds)
        item.mute_other_sounds = bool(item.mute_other_sounds)
        item.output_route = _sanitize_output_route(item.output_route)
        item.shortcut = str(item.shortcut or "").strip()
        item.block_voice = bool(item.block_voice)
        item.effects = dict(item.effects or {})
        item.tags = [str(t).strip() for t in (item.tags or []) if str(t).strip()]
        return before != asdict(item)

    def _sanitize_defaults(self) -> None:
        self.defaults.volume = max(0.0, _finite_float(self.defaults.volume, 1.0))
        self.defaults.pitch_semitones = _finite_float(self.defaults.pitch_semitones, 0.0)
        self.defaults.pitch_mode = _sanitize_pitch_mode(self.defaults.pitch_mode)
        self.defaults.speed = _sanitize_speed(self.defaults.speed)
        self.defaults.normalize = bool(self.defaults.normalize)
        self.defaults.fade_in_ms = _clamp(_finite_float(self.defaults.fade_in_ms, 0.0), 0.0, 5000.0)
        self.defaults.fade_out_ms = _clamp(_finite_float(self.defaults.fade_out_ms, 0.0), 0.0, 5000.0)
        self.defaults.repeats = max(1, min(20, int(round(_finite_float(self.defaults.repeats, 1.0)))))
        self.defaults.category = str(self.defaults.category or "Geral").strip() or "Geral"
        self.defaults.color = _sanitize_color(self.defaults.color)
        self.defaults.playback_mode = _sanitize_playback_mode(self.defaults.playback_mode)
        self.defaults.stop_other_sounds = bool(self.defaults.stop_other_sounds)
        self.defaults.mute_other_sounds = bool(self.defaults.mute_other_sounds)
        self.defaults.output_route = _sanitize_output_route(self.defaults.output_route)
        self.defaults.tags = [str(t).strip() for t in (self.defaults.tags or []) if str(t).strip()]


def _bundled_ffmpeg() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def load_audio_mono(path: str, target_sample_rate: int) -> np.ndarray:
    try:
        import soundfile as sf
    except Exception as exc:  # pragma: no cover - depends on user environment
        raise RuntimeError("A biblioteca soundfile nao esta instalada.") from exc

    data, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    if data.size == 0:
        return np.zeros(0, dtype=np.float32)
    mono = data.mean(axis=1).astype(np.float32, copy=False)
    if int(sample_rate) != int(target_sample_rate):
        mono = resample_linear(mono, int(sample_rate), int(target_sample_rate))
    return mono.astype(np.float32, copy=False)


def audio_duration_seconds(path: str) -> float:
    try:
        import soundfile as sf

        info = sf.info(path)
        if info.samplerate > 0:
            return float(info.frames) / float(info.samplerate)
    except Exception:
        pass

    # Fallback for WAV files using standard library 'wave'
    if str(path).lower().endswith(".wav"):
        try:
            import wave
            with wave.open(str(path), 'rb') as w:
                frames = w.getnframes()
                rate = w.getframerate()
                if rate > 0:
                    return float(frames) / float(rate)
        except Exception:
            pass

    # Fallback using ffmpeg
    try:
        import shutil
        import subprocess
        
        ffmpeg = shutil.which("ffmpeg") or _bundled_ffmpeg()
        if ffmpeg:
            cmd = [ffmpeg, "-i", str(path), "-f", "null", "-"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            for line in res.stderr.splitlines():
                if "Duration:" in line:
                    parts = line.split("Duration:")[1].split(",")[0].strip().split(":")
                    if len(parts) == 3:
                        h = float(parts[0])
                        m = float(parts[1])
                        s = float(parts[2])
                        return h * 3600 + m * 60 + s
    except Exception:
        pass

    return 0.0


def image_data_url(path: str) -> str:
    if not path:
        return ""
    image_path = Path(path)
    if not image_path.exists() or image_path.suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS:
        return ""
    try:
        data = image_path.read_bytes()
    except OSError:
        return ""
    if len(data) > 4_000_000:
        return ""
    mime = mimetypes.guess_type(image_path.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def render_sound_for_playback(
    samples: np.ndarray,
    volume: float,
    pitch_semitones: float,
    repeats: int,
    *,
    pitch_mode: str = "preserve",
    speed: float = 1.0,
    normalize: bool = False,
    fade_in_ms: float = 0.0,
    fade_out_ms: float = 0.0,
    sample_rate: int = 48000,
) -> np.ndarray:
    y = np.asarray(samples, dtype=np.float32).reshape(-1)
    if y.size == 0:
        return y.copy()

    ratio = 2.0 ** (float(pitch_semitones) / 12.0)
    if abs(ratio - 1.0) > 0.0001:
        if _sanitize_pitch_mode(pitch_mode) == "resample":
            y = resample_by_ratio(y, ratio)
        else:
            y = pitch_shift_preserve_duration(y, float(pitch_semitones), int(sample_rate))

    speed = _sanitize_speed(speed)
    if abs(speed - 1.0) > 0.0001:
        y = resample_by_ratio(y, speed)

    if normalize:
        y = normalize_peak(y)

    y = y * np.float32(max(0.0, float(volume)))
    from .processing import soft_clip
    y = soft_clip(y, threshold=0.8)
    y = apply_fades(y, int(sample_rate), fade_in_ms, fade_out_ms)
    repeats = max(1, min(20, int(repeats)))
    if repeats > 1:
        gap = np.zeros(1200, dtype=np.float32)
        parts: list[np.ndarray] = []
        for _index in range(repeats):
            parts.append(y)
            parts.append(gap)
        y = np.concatenate(parts[:-1])

    return np.nan_to_num(y, nan=0.0, posinf=1.0, neginf=-1.0).astype(np.float32, copy=False)


def render_audio_file_edit(
    path: str,
    start_seconds: float = 0.0,
    end_seconds: float | None = None,
    *,
    volume: float = 1.0,
    pitch_semitones: float = 0.0,
    pitch_mode: str = "preserve",
    speed: float = 1.0,
    normalize: bool = False,
    fade_in_ms: float = 0.0,
    fade_out_ms: float = 0.0,
    repeats: int = 1,
    effects: EffectsSettings | dict | None = None,
) -> tuple[np.ndarray, int]:
    try:
        import soundfile as sf
    except Exception as exc:  # pragma: no cover - depends on user environment
        raise RuntimeError("A biblioteca soundfile nao esta instalada.") from exc

    data, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    if data.size == 0:
        raise RuntimeError("Arquivo de audio vazio.")
    mono = data.mean(axis=1).astype(np.float32, copy=False)
    total_frames = int(mono.size)
    start = max(0, min(total_frames, int(float(start_seconds or 0.0) * sample_rate)))
    if end_seconds is None or end_seconds == "" or float(end_seconds) <= 0:
        end = total_frames
    else:
        end = max(start + 1, min(total_frames, int(float(end_seconds) * sample_rate)))
    trimmed = mono[start:end]
    if trimmed.size == 0:
        raise RuntimeError("Trecho vazio.")
    rendered = render_sound_for_playback(
        trimmed,
        volume,
        pitch_semitones,
        repeats,
        pitch_mode=pitch_mode,
        speed=speed,
        normalize=normalize,
        fade_in_ms=fade_in_ms,
        fade_out_ms=fade_out_ms,
        sample_rate=int(sample_rate),
    )
    if effects is not None:
        if isinstance(effects, dict):
            effects = EffectsSettings(**{**asdict(EffectsSettings()), **effects})
        rendered = VoiceEffectsProcessor(int(sample_rate)).process(rendered, effects)
    return rendered, int(sample_rate)


def resample_linear(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate <= 0 or target_rate <= 0 or source_rate == target_rate or samples.size < 2:
        return samples.copy()
    duration = samples.size / float(source_rate)
    output_size = max(1, int(round(duration * target_rate)))
    old_x = np.linspace(0.0, 1.0, samples.size, endpoint=False)
    new_x = np.linspace(0.0, 1.0, output_size, endpoint=False)
    return np.interp(new_x, old_x, samples).astype(np.float32)


def resample_by_ratio(samples: np.ndarray, ratio: float) -> np.ndarray:
    if ratio <= 0.0 or samples.size < 2:
        return samples.copy()
    output_size = max(1, int(round(samples.size / ratio)))
    indexes = np.arange(output_size, dtype=np.float32) * np.float32(ratio)
    indexes = np.clip(indexes, 0.0, samples.size - 1.001)
    left = np.floor(indexes).astype(np.int64)
    right = np.minimum(left + 1, samples.size - 1)
    frac = indexes - left
    return ((samples[left] * (1.0 - frac)) + (samples[right] * frac)).astype(np.float32)


def pitch_shift_preserve_duration(samples: np.ndarray, semitones: float, sample_rate: int) -> np.ndarray:
    """Change perceived pitch while keeping the rendered length stable."""
    block = np.asarray(samples, dtype=np.float32).reshape(-1)
    if block.size == 0 or abs(float(semitones)) < 0.0001:
        return block.copy()
    shifter = DualDelayPitchShifter(int(sample_rate))
    shifter.set_pitch_semitones(float(semitones))
    chunks: list[np.ndarray] = []
    block_size = 1024
    for offset in range(0, block.size, block_size):
        chunks.append(shifter.process(block[offset : offset + block_size]))
    shifted = np.concatenate(chunks) if chunks else block.copy()
    if shifted.size != block.size:
        shifted = resample_to_length(shifted, block.size)
    return shifted.astype(np.float32, copy=False)


def resample_to_length(samples: np.ndarray, target_size: int) -> np.ndarray:
    block = np.asarray(samples, dtype=np.float32).reshape(-1)
    target_size = max(0, int(target_size))
    if block.size == target_size:
        return block.copy()
    if block.size == 0 or target_size == 0:
        return np.zeros(target_size, dtype=np.float32)
    old_x = np.linspace(0.0, 1.0, block.size, endpoint=False)
    new_x = np.linspace(0.0, 1.0, target_size, endpoint=False)
    return np.interp(new_x, old_x, block).astype(np.float32)


def normalize_peak(samples: np.ndarray, target: float = 0.92) -> np.ndarray:
    block = np.asarray(samples, dtype=np.float32).reshape(-1)
    if block.size == 0:
        return block.copy()
    peak = float(np.max(np.abs(block)))
    if peak <= 0.00001:
        return block.copy()
    return (block * np.float32(max(0.0, float(target)) / peak)).astype(np.float32, copy=False)


def apply_fades(samples: np.ndarray, sample_rate: int, fade_in_ms: float, fade_out_ms: float) -> np.ndarray:
    block = np.asarray(samples, dtype=np.float32).reshape(-1).copy()
    if block.size == 0:
        return block
    fade_in = min(block.size, int(max(0.0, float(fade_in_ms or 0.0)) * int(sample_rate) / 1000.0))
    fade_out = min(block.size, int(max(0.0, float(fade_out_ms or 0.0)) * int(sample_rate) / 1000.0))
    if fade_in > 1:
        block[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)
    if fade_out > 1:
        block[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)
    return block.astype(np.float32, copy=False)


def _dataclass_payload(cls, raw: object) -> dict:
    if not isinstance(raw, dict):
        return {}
    names = {field.name for field in fields(cls)}
    return {key: value for key, value in raw.items() if key in names}


def _sanitize_color(value) -> str:
    text = str(value or "#25a7f2").strip()
    if len(text) == 7 and text.startswith("#"):
        try:
            int(text[1:], 16)
            return text.lower()
        except ValueError:
            pass
    return "#25a7f2"


def _sanitize_pitch_mode(value) -> str:
    text = str(value or "preserve").strip().lower()
    if text in {"resample", "classic", "linked"}:
        return "resample"
    return "preserve"


def _sanitize_playback_mode(value) -> str:
    text = str(value or "restart").strip().lower()
    if text in {"restart", "pause", "stop", "overlap", "hold_loop"}:
        return text
    return "restart"


def _sanitize_output_route(value) -> str:
    text = str(value or "both").strip().lower()
    if text in {"microphone", "monitor", "both"}:
        return text
    return "both"


def _sanitize_speed(value) -> float:
    return _clamp(_finite_float(value, 1.0), 0.25, 4.0)


def _finite_float(value, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if not np.isfinite(number):
        return fallback
    return number


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, float(value)))
