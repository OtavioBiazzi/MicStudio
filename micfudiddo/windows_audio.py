from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import ctypes
import time
from ctypes import POINTER, byref
from ctypes.wintypes import DWORD, LPWSTR

import comtypes
from comtypes import GUID, COMMETHOD, HRESULT, IUnknown


E_RENDER = 0
E_CAPTURE = 1
DEVICE_STATE_ACTIVE = 0x00000001
STGM_READ = 0x00000000

ROLE_CONSOLE = 0
ROLE_MULTIMEDIA = 1
ROLE_COMMUNICATIONS = 2
ALL_ROLES = (ROLE_CONSOLE, ROLE_MULTIMEDIA, ROLE_COMMUNICATIONS)

VT_LPWSTR = 31
RPC_E_CHANGED_MODE = -2147417850

CLSID_MMDeviceEnumerator = GUID("{BCDE0395-E52F-467C-8E3D-C4579291692E}")
CLSID_PolicyConfigClient = GUID("{870af99c-171d-4f9e-af0d-e63df40c2bc9}")
IID_IMMDeviceEnumerator = GUID("{A95664D2-9614-4F35-A746-DE8DB63617E6}")
IID_IPolicyConfig = GUID("{F8679F50-850A-41CF-9C72-430F290290C8}")
PKEY_Device_FriendlyName = None


class PROPERTYKEY(ctypes.Structure):
    _fields_ = [
        ("fmtid", GUID),
        ("pid", DWORD),
    ]


class _PROPVARIANT_UNION(ctypes.Union):
    _fields_ = [
        ("pwszVal", LPWSTR),
        ("pszVal", ctypes.c_char_p),
        ("ulVal", ctypes.c_ulong),
        ("boolVal", ctypes.c_short),
        ("punkVal", ctypes.c_void_p),
    ]


class PROPVARIANT(ctypes.Structure):
    _fields_ = [
        ("vt", ctypes.c_ushort),
        ("wReserved1", ctypes.c_ushort),
        ("wReserved2", ctypes.c_ushort),
        ("wReserved3", ctypes.c_ushort),
        ("value", _PROPVARIANT_UNION),
    ]


class IPropertyStore(IUnknown):
    _iid_ = GUID("{886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99}")
    _methods_ = [
        COMMETHOD([], HRESULT, "GetCount", (["out"], POINTER(DWORD), "cProps")),
        COMMETHOD([], HRESULT, "GetAt", (["in"], DWORD, "iProp"), (["out"], POINTER(PROPERTYKEY), "pkey")),
        COMMETHOD([], HRESULT, "GetValue", (["in"], POINTER(PROPERTYKEY), "key"), (["out"], POINTER(PROPVARIANT), "pv")),
        COMMETHOD([], HRESULT, "SetValue", (["in"], POINTER(PROPERTYKEY), "key"), (["in"], POINTER(PROPVARIANT), "propvar")),
        COMMETHOD([], HRESULT, "Commit"),
    ]


class IMMDevice(IUnknown):
    _iid_ = GUID("{D666063F-1587-4E43-81F1-B948E807363F}")
    _methods_ = [
        COMMETHOD([], HRESULT, "Activate"),
        COMMETHOD([], HRESULT, "OpenPropertyStore", (["in"], DWORD, "stgmAccess"), (["out"], POINTER(POINTER(IPropertyStore)), "ppProperties")),
        COMMETHOD([], HRESULT, "GetId", (["out"], POINTER(LPWSTR), "ppstrId")),
        COMMETHOD([], HRESULT, "GetState", (["out"], POINTER(DWORD), "pdwState")),
    ]


class IMMDeviceCollection(IUnknown):
    _iid_ = GUID("{0BD7A1BE-7A1A-44DB-8397-C0EDE3FDEFEA}")
    _methods_ = [
        COMMETHOD([], HRESULT, "GetCount", (["out"], POINTER(ctypes.c_uint), "pcDevices")),
        COMMETHOD([], HRESULT, "Item", (["in"], ctypes.c_uint, "nDevice"), (["out"], POINTER(POINTER(IMMDevice)), "ppDevice")),
    ]


class IMMDeviceEnumerator(IUnknown):
    _iid_ = IID_IMMDeviceEnumerator
    _methods_ = [
        COMMETHOD(
            [],
            HRESULT,
            "EnumAudioEndpoints",
            (["in"], ctypes.c_int, "dataFlow"),
            (["in"], DWORD, "dwStateMask"),
            (["out"], POINTER(POINTER(IMMDeviceCollection)), "ppDevices"),
        ),
        COMMETHOD(
            [],
            HRESULT,
            "GetDefaultAudioEndpoint",
            (["in"], ctypes.c_int, "dataFlow"),
            (["in"], ctypes.c_int, "role"),
            (["out"], POINTER(POINTER(IMMDevice)), "ppEndpoint"),
        ),
        COMMETHOD([], HRESULT, "GetDevice", (["in"], LPWSTR, "pwstrId"), (["out"], POINTER(POINTER(IMMDevice)), "ppDevice")),
        COMMETHOD([], HRESULT, "RegisterEndpointNotificationCallback"),
        COMMETHOD([], HRESULT, "UnregisterEndpointNotificationCallback"),
    ]


class IPolicyConfig(IUnknown):
    _iid_ = IID_IPolicyConfig
    _methods_ = [
        COMMETHOD([], HRESULT, "GetMixFormat", (["in"], LPWSTR, "wszDeviceId"), (["out"], POINTER(ctypes.c_void_p), "ppFormat")),
        COMMETHOD(
            [],
            HRESULT,
            "GetDeviceFormat",
            (["in"], LPWSTR, "wszDeviceId"),
            (["in"], ctypes.c_int, "bDefault"),
            (["out"], POINTER(ctypes.c_void_p), "ppFormat"),
        ),
        COMMETHOD([], HRESULT, "ResetDeviceFormat", (["in"], LPWSTR, "wszDeviceId")),
        COMMETHOD([], HRESULT, "SetDeviceFormat", (["in"], LPWSTR, "wszDeviceId"), (["in"], ctypes.c_void_p, "pEndpointFormat"), (["in"], ctypes.c_void_p, "pMixFormat")),
        COMMETHOD(
            [],
            HRESULT,
            "GetProcessingPeriod",
            (["in"], LPWSTR, "wszDeviceId"),
            (["in"], ctypes.c_int, "bDefault"),
            (["out"], POINTER(ctypes.c_longlong), "pmftDefaultPeriod"),
            (["out"], POINTER(ctypes.c_longlong), "pmftMinimumPeriod"),
        ),
        COMMETHOD([], HRESULT, "SetProcessingPeriod", (["in"], LPWSTR, "wszDeviceId"), (["in"], ctypes.c_longlong, "pmftPeriod")),
        COMMETHOD([], HRESULT, "GetShareMode", (["in"], LPWSTR, "wszDeviceId"), (["out"], POINTER(ctypes.c_void_p), "pMode")),
        COMMETHOD([], HRESULT, "SetShareMode", (["in"], LPWSTR, "wszDeviceId"), (["in"], ctypes.c_void_p, "mode")),
        COMMETHOD([], HRESULT, "GetPropertyValue", (["in"], LPWSTR, "wszDeviceId"), (["in"], POINTER(PROPERTYKEY), "key"), (["out"], POINTER(PROPVARIANT), "pv")),
        COMMETHOD([], HRESULT, "SetPropertyValue", (["in"], LPWSTR, "wszDeviceId"), (["in"], POINTER(PROPERTYKEY), "key"), (["in"], POINTER(PROPVARIANT), "pv")),
        COMMETHOD([], HRESULT, "SetDefaultEndpoint", (["in"], LPWSTR, "wszDeviceId"), (["in"], ctypes.c_int, "role")),
        COMMETHOD([], HRESULT, "SetEndpointVisibility", (["in"], LPWSTR, "wszDeviceId"), (["in"], ctypes.c_int, "bVisible")),
    ]


PKEY_Device_FriendlyName = PROPERTYKEY(GUID("{A45C254E-DF1C-4EFD-8020-67D146A850E0}"), 14)


@dataclass(frozen=True)
class WindowsAudioEndpoint:
    id: str
    name: str


def list_capture_endpoints() -> list[WindowsAudioEndpoint]:
    with com_initialized():
        enumerator = _device_enumerator()
        collection = enumerator.EnumAudioEndpoints(E_CAPTURE, DEVICE_STATE_ACTIVE)
        count = collection.GetCount()
        endpoints: list[WindowsAudioEndpoint] = []
        for index in range(count):
            device = collection.Item(index)
            endpoints.append(WindowsAudioEndpoint(id=_device_id(device), name=_device_name(device)))
        return endpoints


def get_default_capture_ids() -> dict[int, str]:
    with com_initialized():
        enumerator = _device_enumerator()
        defaults: dict[int, str] = {}
        for role in ALL_ROLES:
            try:
                device = enumerator.GetDefaultAudioEndpoint(E_CAPTURE, role)
                defaults[role] = _device_id(device)
            except Exception:
                continue
        return defaults


def set_default_capture_id(device_id: str) -> None:
    with com_initialized():
        policy = comtypes.CoCreateInstance(CLSID_PolicyConfigClient, interface=IPolicyConfig)
        for role in ALL_ROLES:
            policy.SetDefaultEndpoint(device_id, role)


def restore_default_capture_ids(defaults: dict[int, str], attempts: int = 3) -> bool:
    if not defaults:
        return True
    expected = {int(role): device_id for role, device_id in defaults.items() if device_id}
    for attempt in range(max(1, attempts)):
        try:
            with com_initialized():
                policy = comtypes.CoCreateInstance(CLSID_PolicyConfigClient, interface=IPolicyConfig)
                for role, device_id in expected.items():
                    try:
                        policy.SetDefaultEndpoint(device_id, role)
                    except Exception:
                        pass
            current = get_default_capture_ids()
        except Exception:
            current = {}
        if all(current.get(role) == device_id for role, device_id in expected.items()):
            return True
        if attempt + 1 < attempts:
            time.sleep(0.05)
    return False


def find_capture_endpoint(*needles: str) -> WindowsAudioEndpoint | None:
    lowered = [needle.lower() for needle in needles if needle]
    for endpoint in list_capture_endpoints():
        name = endpoint.name.lower()
        if all(needle in name for needle in lowered):
            return endpoint
    return None


def find_virtual_microphone_endpoint() -> WindowsAudioEndpoint | None:
    return (
        find_capture_endpoint("cable output", "vb-audio")
        or find_capture_endpoint("cable output")
        or find_capture_endpoint("vb-audio")
    )


def _device_enumerator():
    return comtypes.CoCreateInstance(CLSID_MMDeviceEnumerator, interface=IMMDeviceEnumerator)


@contextmanager
def com_initialized():
    initialized = False
    try:
        comtypes.CoInitialize()
        initialized = True
    except OSError as exc:
        if getattr(exc, "winerror", None) != RPC_E_CHANGED_MODE:
            raise
    try:
        yield
    finally:
        if initialized:
            comtypes.CoUninitialize()


def _device_id(device) -> str:
    return str(device.GetId())


def _device_name(device) -> str:
    store = device.OpenPropertyStore(STGM_READ)
    prop = store.GetValue(byref(PKEY_Device_FriendlyName))
    try:
        if prop.vt == VT_LPWSTR and prop.value.pwszVal:
            return str(prop.value.pwszVal)
    finally:
        ctypes.windll.ole32.PropVariantClear(byref(prop))
    return "Dispositivo de captura"
