# ZerOS Python 后端 - JWT 与系统唯一 ID（机器 ID）认证
# 会议方案：全局唯一 JWT，每次请求携带；后端网关验证；JWT 载荷含计算机 ID；白名单校验
import os
import json
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone

try:
    import jwt
except ImportError:
    jwt = None

# 配置：从环境变量读取，未设置则 JWT 不强制（兼容现有前端）
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ENFORCE = os.environ.get("JWT_ENFORCE", "").lower() in ("true", "1", "yes")
JWT_EXPIRE_DAYS = int(os.environ.get("JWT_EXPIRE_DAYS", "30"))  # 0 表示不设过期（需自行承担风险）
WHITELIST_ENABLED = os.environ.get("JWT_WHITELIST_ENABLED", "").lower() in ("true", "1", "yes")

# 数据目录：与 backend-python 同级的 data，白名单文件放于其中
_BACKEND_DIR = Path(__file__).resolve().parent
_DATA_DIR = _BACKEND_DIR / "data"
WHITELIST_FILE = _DATA_DIR / "jwt_allowed_machine_ids.json"

# 默认密钥仅用于开发；生产必须设置 JWT_SECRET
_DEFAULT_DEV_SECRET = "zeros-python-backend-dev-secret-change-in-production"


def _get_secret() -> str:
    if JWT_SECRET:
        return JWT_SECRET
    return _DEFAULT_DEV_SECRET


def _ensure_data_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def create_token(machine_id: str | None = None, expire_days: int | None = None) -> dict:
    """
    生成 JWT。载荷中包含系统唯一 ID（机器 ID）。
    若未传 machine_id，则由后端生成 UUID 并返回，前端应持久化后后续请求携带。
    """
    if jwt is None:
        return {"error": "PyJWT not installed", "status": "error"}
    mid = (machine_id or "").strip() or str(uuid.uuid4())
    secret = _get_secret()
    expire = expire_days if expire_days is not None else JWT_EXPIRE_DAYS
    payload = {
        "machine_id": mid,
        "iat": datetime.now(timezone.utc),
        "nbf": datetime.now(timezone.utc),
    }
    if expire > 0:
        payload["exp"] = datetime.now(timezone.utc) + timedelta(days=expire)
    token = jwt.encode(payload, secret, algorithm="HS256")
    if hasattr(token, "decode"):
        token = token.decode("utf-8")
    return {
        "token": token,
        "machine_id": mid,
        "expire_days": expire,
        "status": "success",
    }


def verify_token(token: str) -> dict | None:
    """
    验证 JWT，返回载荷（含 machine_id）或 None。
    """
    if not token or jwt is None:
        return None
    secret = _get_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except Exception:
        return None


def get_whitelist_path() -> Path:
    return WHITELIST_FILE


def load_whitelist() -> list[str]:
    """加载机器 ID 白名单。"""
    p = get_whitelist_path()
    if not p.exists():
        return []
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [str(x).strip() for x in data if x]
        if isinstance(data, dict) and "machine_ids" in data:
            return [str(x).strip() for x in data["machine_ids"] if x]
        return []
    except Exception:
        return []


def add_to_whitelist(machine_id: str) -> bool:
    """将机器 ID 加入白名单并持久化。"""
    if not machine_id or not machine_id.strip():
        return False
    _ensure_data_dir()
    mid = machine_id.strip()
    allowed = load_whitelist()
    if mid in allowed:
        return True
    allowed.append(mid)
    try:
        with open(get_whitelist_path(), "w", encoding="utf-8") as f:
            json.dump({"machine_ids": allowed}, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def is_machine_allowed(machine_id: str) -> bool:
    """白名单未启用时一律允许；启用时检查 machine_id 是否在白名单中。"""
    if not WHITELIST_ENABLED:
        return True
    if not machine_id:
        return False
    return machine_id.strip() in load_whitelist()


def is_jwt_required() -> bool:
    """当前是否要求请求必须携带有效 JWT。"""
    return JWT_ENFORCE


def verify_request_authorization(auth_header: str | None) -> tuple[bool, str | None]:
    """
    校验请求的 Authorization 头（Bearer <token>）。
    返回 (是否通过, 失败原因)。
    通过时会在后续通过 request.state 传递 payload（由调用方从 token 解析后写入）。
    """
    if not auth_header or not auth_header.strip().startswith("Bearer "):
        return False, "缺少或无效的 Authorization 头（需要 Bearer <token>）"
    token = auth_header.strip()[7:].strip()
    if not token:
        return False, "未提供 JWT"
    payload = verify_token(token)
    if not payload:
        return False, "JWT 无效或已过期"
    mid = payload.get("machine_id") or ""
    if not is_machine_allowed(mid):
        return False, "机器 ID 不在白名单中"
    return True, None
