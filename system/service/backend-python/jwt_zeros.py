# ZerOS JWT 工具 - 与 PHP JWT.php 兼容
# 使用相同密钥和算法，确保与 randomSecurity/jwtVerify 互操作
import os
import json
import hmac
import hashlib
import base64
from typing import Any

# 与 PHP JWT.php 相同的默认密钥
_DEFAULT_SECRET = 'ZerOS_JWT_Secret_Key_Change_In_Production_Environment_256bit'


def _get_secret() -> str:
    return os.environ.get("ZEROS_JWT_SECRET", _DEFAULT_SECRET)


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _base64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += '=' * pad
    return base64.urlsafe_b64decode(s)


def encode(payload: dict, expiration: int = 0, secret: str | None = None) -> str:
    """
    生成 JWT，与 PHP JWT::encode 兼容。
    expiration=0 表示永不过期。
    """
    secret = secret or _get_secret()
    header = {"typ": "JWT", "alg": "HS256"}
    if expiration > 0:
        import time
        payload = dict(payload)
        payload["exp"] = int(time.time()) + expiration
    payload = dict(payload)
    payload["iat"] = int(__import__("time").time())

    header_b64 = _base64url_encode(json.dumps(header, separators=(',', ':'), ensure_ascii=False).encode())
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode())
    message = f"{header_b64}.{payload_b64}"
    sig = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    sig_b64 = _base64url_encode(sig)
    return f"{message}.{sig_b64}"


def decode(token: str, secret: str | None = None) -> dict | None:
    """
    校验并解码 JWT，与 PHP JWT::decode 兼容。
    失败返回 None。
    """
    if not token or not isinstance(token, str):
        return None
    parts = token.strip().split('.')
    if len(parts) != 3:
        return None
    secret = secret or _get_secret()
    header_b64, payload_b64, sig_b64 = parts
    message = f"{header_b64}.{payload_b64}"

    try:
        sig = _base64url_decode(sig_b64)
        expected = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload_raw = _base64url_decode(payload_b64)
        payload = json.loads(payload_raw.decode('utf-8'))
        if isinstance(payload.get('exp'), (int, float)) and payload['exp'] < __import__("time").time():
            return None
        return payload
    except Exception:
        return None
