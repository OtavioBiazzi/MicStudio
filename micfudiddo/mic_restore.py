"""Escolhe qual microfone devolver ao Windows quando o VozLab desliga a voz ou fecha.

O VozLab troca o microfone padrao do Windows para o CABLE Output (a voz modificada). Ao fechar, ele devolve o
microfone de antes. O problema: o "id" interno de um microfone muda (driver reinstalado, fone em outra porta USB),
e a volta falhava com "Elemento nao encontrado", deixando o Windows preso no CABLE. Por isso guardamos tambem o
NOME do microfone e procuramos por ele quando o id sumir. O proprio CABLE nunca e escolhido como "original".
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Endpoint:
    id: str
    name: str


def is_virtual_name(name: str) -> bool:
    lowered = str(name or "").casefold()
    return "cable output" in lowered or "vb-audio" in lowered or "voicemeeter" in lowered


def _find_by_name(endpoints: list, name: str):
    wanted = str(name or "").strip().casefold()
    if not wanted:
        return None
    real = [endpoint for endpoint in endpoints if not is_virtual_name(endpoint.name)]
    exact = next((endpoint for endpoint in real if endpoint.name.casefold() == wanted), None)
    if exact is not None:
        return exact
    return next((endpoint for endpoint in real if wanted in endpoint.name.casefold() or endpoint.name.casefold() in wanted), None)


def pick_restore_target(endpoints: list, wanted_id: str = "", wanted_name: str = "", fallback_names: list | None = None):
    """Devolve o microfone (endpoint) para voltar a ser o padrao, ou None.

    Ordem: o mesmo id (se ainda existir e nao for o CABLE) > o mesmo nome > nomes de reserva (ex.: o microfone
    escolhido no app)."""
    by_id = {endpoint.id: endpoint for endpoint in endpoints}
    if wanted_id and wanted_id in by_id and not is_virtual_name(by_id[wanted_id].name):
        return by_id[wanted_id]
    for name in [wanted_name, *(fallback_names or [])]:
        match = _find_by_name(endpoints, name)
        if match is not None:
            return match
    return None


def describe_defaults(defaults: dict, endpoints: list) -> dict:
    """Transforma {papel: id} em {"ids": {...}, "names": {...}} sem guardar o CABLE como microfone original."""
    names_by_id = {endpoint.id: endpoint.name for endpoint in endpoints}
    ids: dict[str, str] = {}
    names: dict[str, str] = {}
    for role, device_id in (defaults or {}).items():
        name = names_by_id.get(device_id, "")
        if not device_id or is_virtual_name(name):
            continue
        ids[str(int(role))] = device_id
        names[str(int(role))] = name
    return {"ids": ids, "names": names}


def read_saved_defaults(raw) -> tuple[dict[int, str], dict[int, str]]:
    """Le o arquivo de seguranca nos dois formatos: antigo {papel: id} e novo {"ids": ..., "names": ...}."""
    if not isinstance(raw, dict):
        return {}, {}
    if "ids" in raw or "names" in raw:
        ids = {int(role): str(value) for role, value in (raw.get("ids") or {}).items() if value}
        names = {int(role): str(value) for role, value in (raw.get("names") or {}).items() if value}
        return ids, names
    return {int(role): str(value) for role, value in raw.items() if value}, {}
