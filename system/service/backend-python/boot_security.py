# ZerOS 安全文件 (BootSecurityToken.json) 操作
# 与 PHP 的 BOOT_SECURITY_TOKEN_FILE 路径和格式一致
import json
import hashlib
import random
from pathlib import Path

try:
    import fcntl
except ImportError:
    fcntl = None

from typing import Callable

_BACKEND_DIR = Path(__file__).resolve().parent
_SERVICE_DIR = _BACKEND_DIR.parent
BOOT_SECURITY_FILE = _SERVICE_DIR / "DISK" / "D" / "BootSecurityToken.json"
BOOT_SECURITY_MAX_COUNT = 2


def _ensure_dir() -> bool:
    BOOT_SECURITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    return True


def load_boot_security() -> dict:
    if not BOOT_SECURITY_FILE.exists():
        return {"tokens": [], "count": 0, "max_count": BOOT_SECURITY_MAX_COUNT, "programPermissionsMap": {}}
    try:
        data = json.loads(BOOT_SECURITY_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"tokens": [], "count": 0, "max_count": BOOT_SECURITY_MAX_COUNT, "programPermissionsMap": {}}
        if "programPermissionsMap" not in data or not isinstance(data["programPermissionsMap"], dict):
            data["programPermissionsMap"] = {}
        if "tokens" not in data or not isinstance(data["tokens"], list):
            data["tokens"] = []
        data["count"] = len(data["tokens"])
        data["max_count"] = BOOT_SECURITY_MAX_COUNT
        return data
    except Exception:
        return {"tokens": [], "count": 0, "max_count": BOOT_SECURITY_MAX_COUNT, "programPermissionsMap": {}}


def save_boot_security(data: dict) -> bool:
    _ensure_dir()
    try:
        BOOT_SECURITY_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=4),
            encoding="utf-8"
        )
        return True
    except Exception:
        return False


def load_modify_save(modify_fn: Callable[[dict], None]) -> bool:
    """在文件锁保护下 load-modify-save"""
    _ensure_dir()
    path = BOOT_SECURITY_FILE
    if not path.parent.is_dir():
        return False
    try:
        with open(path, "a+", encoding="utf-8") as f:
            if fcntl:
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                except OSError:
                    pass
            f.seek(0)
            raw = f.read()
            data = json.loads(raw) if raw else {}
            if "programPermissionsMap" not in data or not isinstance(data["programPermissionsMap"], dict):
                data["programPermissionsMap"] = {}
            if "tokens" not in data or not isinstance(data["tokens"], list):
                data["tokens"] = []
            data["count"] = len(data["tokens"])
            data["max_count"] = BOOT_SECURITY_MAX_COUNT
            modify_fn(data)
            f.seek(0)
            f.truncate()
            f.write(json.dumps(data, ensure_ascii=False, indent=4))
            if fcntl:
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass
        return True
    except Exception:
        return False


def generate_upid(program_name: str | None, existing_keys: dict | None = None) -> str:
    """生成 upid，与 PHP generateUpid 算法一致"""
    existing_keys = existing_keys or {}
    encoded = (program_name or "").encode("utf-8") if program_name else b""
    while True:
        rand1 = str(random.randint(1000000000000000, 9999999999999999))
        rand2 = str(random.randint(1000000000000000, 9999999999999999))
        h1 = hashlib.sha256((rand1.encode() + encoded)).hexdigest()
        h2 = hashlib.sha256((rand2.encode() + encoded)).hexdigest()
        concat = (h1 + h2) if random.randint(0, 1) == 0 else (h2 + h1)
        upid = hashlib.md5(concat.encode()).hexdigest()
        if upid not in existing_keys:
            return upid
