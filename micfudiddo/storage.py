from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import tempfile
from typing import Any


def _replace_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def atomic_write_json(path: Path, payload: Any) -> None:
    path = Path(path)
    backup_path = path.with_suffix(path.suffix + ".bak")
    if path.exists():
        try:
            json.loads(path.read_text(encoding="utf-8"))
            shutil.copy2(path, backup_path)
        except (OSError, json.JSONDecodeError):
            pass
    _replace_json(path, payload)
    if not backup_path.exists():
        try:
            shutil.copy2(path, backup_path)
        except OSError:
            pass


def load_json_with_backup(path: Path, default: Any, expected_type: type | tuple[type, ...] | None = None) -> Any:
    path = Path(path)
    backup_path = path.with_suffix(path.suffix + ".bak")
    for candidate in (path, backup_path):
        try:
            value = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if expected_type is not None and not isinstance(value, expected_type):
            continue
        if candidate == backup_path:
            try:
                _replace_json(path, value)
            except OSError:
                pass
        elif not backup_path.exists():
            try:
                shutil.copy2(path, backup_path)
            except OSError:
                pass
        return value
    return default
