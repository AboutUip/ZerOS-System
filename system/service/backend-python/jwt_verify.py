# ZerOS JWT 校验 - 与 PHP jwtVerify.php 等效
# SystemToken 放行；UserToken 要求 upid，并根据 action 校验程序权限与用户授权能力
import json
from pathlib import Path

import jwt_zeros

_BACKEND_DIR = Path(__file__).resolve().parent
_SERVICE_DIR = _BACKEND_DIR.parent
BOOT_SECURITY_FILE = _SERVICE_DIR / "DISK" / "D" / "BootSecurityToken.json"

# action -> 所需权限映射（与 PHP jwtVerifyGetActionPermissionMap 一致）
ACTION_PERMISSION_MAP = {
    "FSDirve": {
        "create_dir": "KERNEL_DISK_CREATE",
        "create_file": "KERNEL_DISK_CREATE",
        "delete_dir": "KERNEL_DISK_DELETE",
        "delete_file": "KERNEL_DISK_DELETE",
        "delete_dir_recursive": "KERNEL_DISK_DELETE",
        "list_dir": "KERNEL_DISK_LIST",
        "read_file": "KERNEL_DISK_READ",
        "get_file_info": "KERNEL_DISK_READ",
        "get_disk_info": "KERNEL_DISK_READ",
        "exists": "KERNEL_DISK_LIST",
        "write_file": "KERNEL_DISK_WRITE",
        "rename_file": "KERNEL_DISK_WRITE",
        "rename_dir": "KERNEL_DISK_WRITE",
        "move_file": "KERNEL_DISK_WRITE",
        "move_dir": "KERNEL_DISK_WRITE",
        "copy_file": "KERNEL_DISK_WRITE",
        "copy_dir": "KERNEL_DISK_WRITE",
    },
    "CompressionDirve": {
        "compress_zip": "KERNEL_DISK_WRITE",
        "extract_zip": "KERNEL_DISK_WRITE",
        "list_zip": "KERNEL_DISK_READ",
        "compress_rar": "KERNEL_DISK_WRITE",
        "extract_rar": "KERNEL_DISK_WRITE",
        "list_rar": "KERNEL_DISK_READ",
        "check_support": "KERNEL_DISK_READ",
    },
    "DISKMANAGER": {
        "check": "KERNEL_DISK_READ",
        "list": "KERNEL_DISK_LIST",
        "read_data": "KERNEL_DISK_READ",
        "create": "KERNEL_DISK_CREATE",
        "delete": "KERNEL_DISK_DELETE",
        "merge": "KERNEL_DISK_WRITE",
        "write_data": "KERNEL_DISK_WRITE",
        "sync_data": "KERNEL_DISK_WRITE",
    },
}

HIGH_RISK_PERMISSIONS = frozenset([
    "CRYPT_GENERATE_KEY",
    "CRYPT_IMPORT_KEY",
    "CRYPT_DELETE_KEY",
    "CRYPT_ENCRYPT",
    "CRYPT_DECRYPT",
    "PROCESS_MANAGE",
    "SYSTEM_STORAGE_WRITE_USER_CONTROL",
    "SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL",
])


def _load_program_permissions_map() -> dict:
    if not BOOT_SECURITY_FILE.exists():
        return {}
    try:
        data = json.loads(BOOT_SECURITY_FILE.read_text(encoding="utf-8"))
        m = data.get("programPermissionsMap")
        return m if isinstance(m, dict) else {}
    except Exception:
        return {}


def _can_user_grant_permission(permission: str, payload: dict) -> bool:
    level = payload.get("userLevel", "USER")
    if level in ("ADMIN", "DEFAULT_ADMIN"):
        return True
    if permission in HIGH_RISK_PERMISSIONS:
        return False
    perms = payload.get("permissions") or []
    return permission in perms


def _check_upid_permission(service_name: str, upid: str, action: str, payload: dict) -> str | None:
    """校验 upid 权限，返回错误原因或 None（通过）"""
    service_map = ACTION_PERMISSION_MAP.get(service_name)
    if not service_map:
        return None
    required = service_map.get(action)
    if not required:
        return None

    program_map = _load_program_permissions_map()
    declared = program_map.get(str(upid))
    if declared is None:
        return "upid 未在程序权限映射中注册或已失效"
    if not isinstance(declared, list) or required not in declared:
        return f"程序未声明该操作所需的权限: {required}"
    if not _can_user_grant_permission(required, payload):
        return f"当前用户无法授权该权限: {required}"
    return None


def extract_token_from_request(request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.strip().lower().startswith("bearer "):
        return auth[7:].strip()
    x_auth = request.headers.get("X-Auth-Token") or ""
    if x_auth:
        return x_auth.strip()
    x_jwt = request.headers.get("X-JWT") or ""
    if x_jwt:
        return x_jwt.strip()
    return None


def extract_upid_from_request(request) -> str | None:
    upid = request.query_params.get("upid")
    if upid is None:
        return None
    s = (upid if isinstance(upid, str) else str(upid)).strip()
    return s if s else None


def extract_action_from_request(request) -> str | None:
    action = request.query_params.get("action")
    if action is None or action == "":
        return None
    return str(action).strip() or None


def require_jwt_verify(request, service_name: str | None) -> tuple[bool, str | None]:
    """
    执行 JWT 验证。
    service_name: FSDirve, CompressionDirve, DISKMANAGER；None 时仅校验 Token 有效，不校验 upid。
    返回 (通过, 错误原因)，通过时错误原因为 None。
    """
    token = extract_token_from_request(request)
    if not token:
        return False, "缺少或无效的 JWT 鉴权"

    payload = jwt_zeros.decode(token)
    if not payload:
        return False, "缺少或无效的 JWT 鉴权"

    token_type = payload.get("type", "")
    if token_type == "SystemToken":
        return True, None
    if token_type == "UserToken":
        upid = extract_upid_from_request(request)
        if not upid:
            return False, "UserToken 需在 URL 中传入 upid 参数"
        if service_name:
            action = extract_action_from_request(request)
            if not action:
                return False, "请求缺少 action 参数"
            err = _check_upid_permission(service_name, upid, action, payload)
            if err:
                return False, err
        return True, None
    return False, "缺少或无效的 JWT 鉴权"
