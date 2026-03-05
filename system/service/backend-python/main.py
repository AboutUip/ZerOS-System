# ZerOS Python 后端 - 与 PHP/Java 相同的 API 接口，支持 JWT + upid 鉴权（与 randomSecurity/jwtVerify/programPermissions 兼容）
from pathlib import Path as PathLib

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
import os
import re
import time
import subprocess
import tempfile
import sys
import zipfile
import base64
import FSDriver
import jwt_auth
import jwt_zeros
import jwt_verify
import boot_security

app = FastAPI()

# 项目根目录（用于挂载静态文件，支持单端口运行）
_BACKEND_DIR = PathLib(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_DIR.parent.parent.parent

# 允许来自前端的跨域请求（支持 localhost/127.0.0.1 任意端口，便于开发预览）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8089",
        "http://localhost:8080",
        "http://localhost:8000",
        "http://localhost:3000",
        "http://127.0.0.1:8089",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 需要 ZerOS JWT+upid 校验的路径及其服务名
_JWT_SERVICE_MAP = {
    "/system/service/FSDirve": "FSDirve",
    "/system/service/CompressionDirve": "CompressionDirve",
    "/system/service/DISKMANAGER": "DISKMANAGER",
}


def _get_service_name(path: str) -> str | None:
    path = path.rstrip("/") or path
    for prefix, name in _JWT_SERVICE_MAP.items():
        if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix + "?"):
            return name
    return None


class ZerOSJWTVerifyMiddleware(BaseHTTPMiddleware):
    """ZerOS JWT 校验：SystemToken 放行；UserToken 要求 upid 并校验 action 权限。"""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path.rstrip("/") or request.url.path
        if path in ("/system/service/randomSecurity", "/system/service/programPermissions",
                    "/system/service/auth/jwt", "/system/service/RunPython"):
            return await call_next(request)
        if path.startswith("/system/service/randomSecurity") or path.startswith("/system/service/programPermissions"):
            return await call_next(request)
        svc = _get_service_name(path)
        if not svc:
            return await call_next(request)
        # D:/bin 目录的只读操作（read_file）不需要 JWT 验证，属于系统工具目录
        if svc == "FSDirve":
            q = request.query_params
            action = q.get("action") or ""
            req_path = q.get("path") or ""
            if action == "read_file" and req_path.upper().startswith("D:/BIN"):
                return await call_next(request)
        ok, reason = jwt_verify.require_jwt_verify(request, svc)
        if not ok:
            return JSONResponse(
                status_code=401,
                content={
                    "status": "error",
                    "message": reason or "未授权",
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "timestamp_unix": int(time.time()),
                    "data": {},
                },
            )
        return await call_next(request)


app.add_middleware(ZerOSJWTVerifyMiddleware)


def success(data=None, message="success"):
    return JSONResponse({
        "status": "success",
        "message": message,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "timestamp_unix": int(time.time()),
        "data": data if data is not None else {}
    })


def error(message, status_code=200):
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "message": message,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp_unix": int(time.time()),
            "data": {}
        }
    )


def _normalize_path_and_file(path: str, file_name: str | None) -> tuple[str, str | None]:
    """若 path 为完整路径（含文件名）且 file_name 为空，则拆分为目录路径与文件名。"""
    path = (path or "").strip().replace("\\", "/")
    if file_name:
        return path.rstrip("/"), file_name
    if path.count(":") >= 1:
        drive_end = path.find(":") + 1
        rest = path[drive_end:].lstrip("/")
        if rest and "/" in rest:
            last_slash = rest.rfind("/")
            dir_part = rest[:last_slash]
            return path[:drive_end] + dir_part, rest[last_slash + 1:]
        if rest:
            return path[:drive_end], rest
    return path, file_name


async def _get_params(request: Request):
    """合并 query 与 POST body 参数。"""
    params = dict(request.query_params)
    if request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict):
                for k, v in body.items():
                    if k not in params or params[k] in (None, ""):
                        params[k] = v
        except Exception:
            pass
    return params


# ===========================
# JWT 认证 - 全局唯一 JWT，载荷含系统唯一 ID（机器 ID），可与白名单配合
# ===========================

@app.post("/system/service/auth/jwt")
async def auth_jwt(request: Request):
    """
    生成 JWT。系统初始化或登录时由前端调用，获取后每次请求在 Header 中携带 Authorization: Bearer <token>。
    - machine_id：可选，不传则由后端生成并返回，前端应持久化（如注册表/LStorage）后续请求携带。
    - auto_whitelist：可选，为 true 时将本次 machine_id 加入白名单（需后端启用 JWT_WHITELIST_ENABLED）。
    - expire_days：可选，过期天数，0 表示不过期。
    """
    try:
        body = await request.json() if request.method == "POST" else {}
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    machine_id = (body.get("machine_id") or body.get("machineId") or "").strip()
    auto_whitelist = body.get("auto_whitelist", body.get("autoWhitelist", True))
    expire_days = body.get("expire_days", body.get("expireDays"))
    if expire_days is not None:
        try:
            expire_days = int(expire_days)
        except (TypeError, ValueError):
            expire_days = None
    result = jwt_auth.create_token(machine_id=machine_id or None, expire_days=expire_days)
    if result.get("status") == "error":
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": result.get("error", "JWT 生成失败"),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "timestamp_unix": int(time.time()),
                "data": {},
            },
        )
    mid = result.get("machine_id", "")
    if mid and auto_whitelist and jwt_auth.WHITELIST_ENABLED:
        jwt_auth.add_to_whitelist(mid)
    return JSONResponse({
        "status": "success",
        "message": "JWT 生成成功",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "timestamp_unix": int(time.time()),
        "data": {
            "token": result.get("token"),
            "machine_id": mid,
            "expire_days": result.get("expire_days", 0),
        },
    })


# ===========================
# randomSecurity - 与 PHP randomSecurity.php 等效，签发 SystemToken/UserToken
# ===========================


@app.api_route("/system/service/randomSecurity", methods=["GET", "POST"])
@app.api_route("/system/service/randomSecurity.php", methods=["GET", "POST"])
async def random_security(request: Request):
    """签发 JWT，与 PHP randomSecurity.php 接口一致。"""
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}
    else:
        body = dict(request.query_params)
    action = body.get("action") or request.query_params.get("action")
    if action == "clear":
        cleared = False
        err_msg = None
        if boot_security.BOOT_SECURITY_FILE.exists():
            try:
                boot_security.BOOT_SECURITY_FILE.unlink()
                cleared = True
            except Exception as e:
                err_msg = str(e)
        else:
            cleared = True
        return success({"cleared": cleared, "error": err_msg}, "JWT 已清空")

    random_value = body.get("randomValue")
    token_type = body.get("type", "Unknown")
    user_level = body.get("userLevel")
    permissions = body.get("permissions")
    if isinstance(permissions, str):
        try:
            import json as _json
            permissions = _json.loads(permissions) if permissions else None
        except Exception:
            permissions = None
    if not random_value or not isinstance(random_value, str):
        return error("缺少 randomValue 参数或格式错误", 400)
    if not re.match(r"^[0-9a-f]{32}$", random_value, re.I):
        return error("randomValue 格式错误，应为32个十六进制字符（128位）", 400)

    resolved_type = token_type if (token_type and isinstance(token_type, str)) else "Unknown"
    data = boot_security.load_boot_security()
    existing = data.get("tokens") or []
    program_map = data.get("programPermissionsMap") or {}

    if resolved_type == "SystemToken" and existing:
        existing = []
        if boot_security.BOOT_SECURITY_FILE.exists():
            try:
                boot_security.BOOT_SECURITY_FILE.unlink()
            except Exception:
                pass
    if resolved_type == "UserToken":
        existing = [t for t in existing if t.get("type") != "UserToken"]

    if len(existing) >= boot_security.BOOT_SECURITY_MAX_COUNT:
        return JSONResponse(
            status_code=403,
            content={
                "status": "error",
                "message": "JWT 数量已达上限，禁止生成",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "timestamp_unix": int(time.time()),
                "data": {"current_count": len(existing), "max_count": boot_security.BOOT_SECURITY_MAX_COUNT},
            },
        )

    payload = {
        "randomValue": random_value,
        "type": "UserToken" if resolved_type == "UserToken" else resolved_type,
        "generated_at": int(time.time()),
    }
    if resolved_type == "UserToken" and user_level:
        payload["userLevel"] = user_level
    if resolved_type == "UserToken" and isinstance(permissions, list):
        payload["permissions"] = permissions

    token = jwt_zeros.encode(payload, expiration=0)
    record = {
        "token": token,
        "randomValue": random_value,
        "type": payload["type"],
        "userLevel": payload.get("userLevel"),
        "permissions": payload.get("permissions"),
        "generated_at": int(time.time()),
        "generated_at_str": time.strftime("%Y-%m-%d %H:%M:%S"),
        "expiration": 0,
        "expires_at": None,
        "expires_at_str": None,
    }
    existing.append(record)
    data = {"tokens": existing, "count": len(existing), "max_count": boot_security.BOOT_SECURITY_MAX_COUNT, "programPermissionsMap": program_map}
    record_saved = boot_security.save_boot_security(data)
    return success({
        "token": token,
        "randomValue": random_value,
        "expiration": 0,
        "expires_at": None,
        "recorded": record_saved,
        "record_error": None if record_saved else "写入文件失败",
        "current_count": len(existing),
        "max_count": boot_security.BOOT_SECURITY_MAX_COUNT,
    }, "JWT Token 生成成功")


# ===========================
# programPermissions - 与 PHP programPermissions.php 等效，分配/回收 upid
# ===========================


def _program_permissions_verify(request: Request):
    """programPermissions 需要有效 JWT，但不校验 upid"""
    ok, reason = jwt_verify.require_jwt_verify(request, None)
    if not ok:
        return JSONResponse(status_code=401, content={
            "status": "error", "message": reason or "未授权",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "timestamp_unix": int(time.time()), "data": {},
        })
    return None


@app.api_route("/system/service/programPermissions", methods=["GET", "POST"])
@app.api_route("/system/service/programPermissions.php", methods=["GET", "POST"])
async def program_permissions(request: Request):
    """程序权限注册，分配/回收 upid。"""
    err_resp = _program_permissions_verify(request)
    if err_resp:
        return err_resp
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}
    else:
        body = {}
    action = body.get("action") or request.query_params.get("action")

    if action == "register":
        permissions = body.get("permissions")
        program_name = body.get("programName")
        if not isinstance(permissions, list):
            return error("permissions 必须为数组", 400)
        upid = None

        def do_register(data: dict):
            nonlocal upid
            m = data.setdefault("programPermissionsMap", {})
            upid = boot_security.generate_upid(program_name, m)
            m[upid] = permissions

        if not boot_security.load_modify_save(do_register) or upid is None:
            return error("写入安全文件失败", 500)
        return success({"upid": upid}, "权限注册成功")

    if action == "reclaim":
        upid_raw = body.get("upid") or request.query_params.get("upid")
        upid = (upid_raw if isinstance(upid_raw, str) else str(upid_raw or "")).strip()
        if not upid:
            return error("缺少 upid 参数", 400)

        def do_reclaim(data: dict):
            m = data.get("programPermissionsMap") or {}
            m.pop(upid, None)

        if not boot_security.load_modify_save(do_reclaim):
            return error("写入安全文件失败", 500)
        return success({"upid": upid}, "upid 已回收")

    return error("无效的 action", 400)


# ===========================
# FSDirve - 与 PHP/Java 接口一致
# ===========================

@app.api_route("/system/service/FSDirve", methods=["GET", "POST", "OPTIONS"])
async def fsdrive(request: Request):
    if request.method == "OPTIONS":
        return JSONResponse(content={})
    params = await _get_params(request)
    action = params.get("action")
    # path 处理：以下 action 的 path 表示「父目录或目录自身」完整路径，禁止被拆成 path+fileName，否则子目录操作会错位（与仅 PHP 行为一致）
    # - list_dir / delete_dir / delete_dir_recursive：path = 目录自身
    # - create_dir / rename_dir：path = 父目录，name/oldName/newName 单独传
    # - rename_file：path = 文件所在父目录，oldFileName/newFileName 单独传
    # 其余（create_file, read_file, write_file, delete_file, get_file_info, exists 带 fileName）用 _normalize_path_and_file，因 path+fileName 可能合并传
    raw_path = (params.get("path") or "").strip().replace("\\", "/")
    if action in ("list_dir", "delete_dir", "delete_dir_recursive", "create_dir", "rename_dir", "rename_file"):
        path, file_name = raw_path, params.get("fileName")
    elif action == "exists" and not params.get("fileName"):
        path, file_name = raw_path, None
    else:
        path, file_name = _normalize_path_and_file(params.get("path", ""), params.get("fileName"))
    content = params.get("content", "")
    write_mod = params.get("writeMod", "overwrite")
    as_base64 = str(params.get("asBase64", "")).lower() in ("true", "1", "yes")
    is_base64 = str(params.get("isBase64", "")).lower() in ("true", "1", "yes")

    if not action:
        return error("缺少参数: action", 400)

    try:
        # 目录操作
        if action == "create_dir":
            name = params.get("name", "")
            if not name:
                return error("缺少必要参数: name", 400)
            data = FSDriver.create_directory(path, name)
            return success(data, "目录创建成功")

        if action == "delete_dir":
            data = FSDriver.delete_directory(path)
            return success(data, "目录删除成功")

        if action == "delete_dir_recursive":
            data = FSDriver.delete_directory_recursive(path)
            return success(data, "目录删除成功")

        if action == "list_dir":
            data = FSDriver.list_directory(path)
            return success(data, "目录列表获取成功")

        if action == "rename_dir":
            old_name = params.get("oldName", "")
            new_name = params.get("newName", "")
            if not old_name or not new_name:
                return error("缺少必要参数: oldName, newName", 400)
            data = FSDriver.rename_directory(path, old_name, new_name)
            return success(data, "目录重命名成功")

        if action == "move_dir":
            source_path = params.get("sourcePath", "")
            target_path = params.get("targetPath", "")
            if not source_path or not target_path:
                return error("缺少必要参数: sourcePath, targetPath", 400)
            data = FSDriver.move_directory(source_path, target_path)
            return success(data, "目录移动成功")

        if action == "copy_dir":
            source_path = params.get("sourcePath", "")
            target_path = params.get("targetPath", "")
            if not source_path or not target_path:
                return error("缺少必要参数: sourcePath, targetPath", 400)
            data = FSDriver.copy_directory(source_path, target_path)
            return success(data, "目录复制成功")

        # 文件操作
        if action == "create_file":
            if not file_name:
                return error("缺少必要参数: fileName", 400)
            data = FSDriver.create_file(path, file_name, content)
            return success(data, "文件创建成功")

        if action == "read_file":
            if not file_name:
                return error("缺少必要参数: fileName", 400)
            data = FSDriver.read_file_content(path, file_name, as_base64=as_base64)
            return success(data, "文件读取成功")

        if action == "write_file":
            if not file_name:
                return error("缺少必要参数: fileName", 400)
            data = FSDriver.write_file(path, file_name, content, write_mod, is_base64)
            return success(data, "文件写入成功")

        if action == "delete_file":
            if not file_name:
                return error("缺少必要参数: fileName", 400)
            data = FSDriver.delete_file(path, file_name)
            return success(data, "文件删除成功")

        if action == "rename_file":
            old_file_name = params.get("oldFileName", "")
            new_file_name = params.get("newFileName", "")
            if not old_file_name or not new_file_name:
                return error("缺少必要参数: oldFileName, newFileName", 400)
            data = FSDriver.rename_file(path, old_file_name, new_file_name)
            return success(data, "文件重命名成功")

        if action == "move_file":
            source_path = params.get("sourcePath", "")
            source_file_name = params.get("sourceFileName", "")
            target_path = params.get("targetPath", "")
            target_file_name = params.get("targetFileName") or source_file_name
            if not all([source_path, source_file_name, target_path]):
                return error("缺少必要参数: sourcePath, sourceFileName, targetPath", 400)
            data = FSDriver.move_file(source_path, source_file_name, target_path, target_file_name)
            return success(data, "文件移动成功")

        if action == "copy_file":
            source_path = params.get("sourcePath", "")
            source_file_name = params.get("sourceFileName", "")
            target_path = params.get("targetPath", "")
            target_file_name = params.get("targetFileName") or source_file_name
            if not all([source_path, source_file_name, target_path]):
                return error("缺少必要参数: sourcePath, sourceFileName, targetPath", 400)
            data = FSDriver.copy_file(source_path, source_file_name, target_path, target_file_name)
            return success(data, "文件复制成功")

        if action == "get_file_info":
            if not file_name:
                return error("缺少必要参数: fileName", 400)
            data = FSDriver.get_file_info(path, file_name)
            return success(data, "文件信息获取成功")

        # 其他
        if action == "exists":
            if file_name:
                exists_result = FSDriver.exists(path, file_name)
                return success({
                    "path": path + "/" + file_name if path else file_name,
                    "exists": exists_result,
                    "type": "file" if exists_result else None
                }, "路径检查完成")
            data = FSDriver.check_path_exists(path)
            return success(data, "路径存在" if data.get("exists") else "路径不存在")

        if action == "get_disk_info":
            disk = (params.get("disk") or "").strip().upper()
            if len(disk) != 1 or disk < "A" or disk > "Z":
                return error("缺少必要参数: disk (单字母 A-Z)", 400)
            data = FSDriver.get_disk_info(disk)
            return success(data, "磁盘信息获取成功")

        return error(f"未知的操作: {action}", 400)

    except FileNotFoundError as e:
        return error(str(e), 404)
    except FileExistsError as e:
        return error(str(e), 409)
    except PermissionError as e:
        return error(str(e), 400)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        return error(f"操作失败: {str(e)}", 500)


# ===========================
# DISKMANAGER - 分区检查/创建（使用 DISK 根目录）
# ===========================

def _partition_letter(partition: str) -> str | None:
    s = (partition or "").strip().upper()
    if len(s) == 1 and "A" <= s <= "Z":
        return s
    if len(s) == 2 and s[1] == ":" and "A" <= s[0] <= "Z":
        return s[0]
    return None


def _disk_data_file():
    """DiskData.json 路径（优先 D 盘，不存在则取第一个分区）。"""
    d_path = FSDriver.DISK_BASE_PATH / "D" / "DiskData.json"
    if d_path.exists():
        return d_path
    for item in sorted(FSDriver.DISK_BASE_PATH.iterdir()):
        if item.is_dir() and re.match(r'^[A-Z]$', item.name):
            candidate = item / "DiskData.json"
            if candidate.exists():
                return candidate
    return d_path  # 默认


def _read_disk_data() -> dict:
    path = _disk_data_file()
    if path.exists():
        import json
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"totalSize": 3221225472, "partitionCount": 0, "partitions": {}}


def _partition_info(letter: str, partition_sizes: dict) -> dict:
    part_path = FSDriver.DISK_BASE_PATH / letter
    partition_name = f"{letter}:"
    actual_size = sum(f.stat().st_size for f in part_path.rglob("*") if f.is_file())
    configured_size = partition_sizes.get(partition_name)
    info: dict = {
        "partition": partition_name,
        "letter": letter,
        "path": str(part_path),
        "size": actual_size,
        "configuredSize": configured_size,
        "fileCount": sum(1 for _ in part_path.rglob("*") if _.is_file()),
        "dirCount": sum(1 for _ in part_path.rglob("*") if _.is_dir()),
    }
    if configured_size is not None:
        info["diskTotalSize"] = configured_size
        info["diskFreeSpace"] = max(0, configured_size - actual_size)
        info["diskUsedSpace"] = actual_size
        info["diskUsagePercent"] = round(actual_size / configured_size * 100, 2) if configured_size else 0
    return info


@app.api_route("/system/service/DISKMANAGER", methods=["GET", "POST"])
async def diskmanager(request: Request):
    params = request.query_params
    action = params.get("action")
    partition = params.get("partition", "")
    import json as _json

    if action == "check":
        letter = _partition_letter(partition)
        if not letter:
            return error(f"无效的分区名称: {partition} (格式应为单个大写字母+冒号，如 C:)")
        part_path = FSDriver.DISK_BASE_PATH / letter
        exists = part_path.is_dir()
        disk_data = _read_disk_data()
        partition_sizes = disk_data.get("partitions", {})
        if exists:
            info = _partition_info(letter, partition_sizes)
            info["exists"] = True
        else:
            info = {"partition": f"{letter}:", "letter": letter, "exists": False, "path": str(part_path)}
        return success(info, "分区存在" if exists else "分区不存在")

    if action == "create":
        letter = _partition_letter(partition)
        if not letter:
            return error(f"无效的分区名称: {partition} (格式应为单个大写字母+冒号，如 C:)")
        FSDriver.DISK_BASE_PATH.mkdir(parents=True, exist_ok=True)
        part_path = FSDriver.DISK_BASE_PATH / letter
        if part_path.is_dir():
            return JSONResponse(
                status_code=409,
                content={
                    "status": "error",
                    "message": f"分区已存在: {letter}:",
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "timestamp_unix": int(time.time()),
                    "data": {"partition": f"{letter}:", "path": str(part_path)},
                },
            )
        part_path.mkdir(parents=True, exist_ok=True)
        return success(
            {
                "partition": f"{letter}:",
                "letter": letter,
                "path": str(part_path),
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            },
            f"分区创建成功: {letter}:",
        )

    if action == "list":
        disk_base = FSDriver.DISK_BASE_PATH
        if not disk_base.is_dir():
            return success({"partitions": [], "count": 0, "createdPartitions": []}, "DISK目录不存在")
        disk_data = _read_disk_data()
        partition_sizes = disk_data.get("partitions", {}) if isinstance(disk_data.get("partitions"), dict) else {}
        # 扫描物理分区
        physical = {p.name for p in disk_base.iterdir() if p.is_dir() and re.match(r'^[A-Z]$', p.name)}
        # 从 DiskData 配置补建（D 盘除外）
        created = []
        for pname, _sz in partition_sizes.items():
            m = re.match(r'^([A-Z]):$', pname)
            if not m:
                continue
            ltr = m.group(1)
            if ltr not in physical and ltr != "D":
                new_path = disk_base / ltr
                try:
                    new_path.mkdir(parents=True, exist_ok=True)
                    physical.add(ltr)
                    created.append(pname)
                except Exception:
                    pass
        partitions = []
        for letter in sorted(physical):
            part_path = disk_base / letter
            if part_path.is_dir():
                partitions.append(_partition_info(letter, partition_sizes))
        msg = "分区列表获取成功"
        if created:
            msg += f"（已自动创建分区: {', '.join(created)}）"
        return success({"partitions": partitions, "count": len(partitions), "createdPartitions": created}, msg)

    if action == "delete":
        letter = _partition_letter(partition)
        if not letter:
            return error("缺少必要参数: partition")
        part_path = FSDriver.DISK_BASE_PATH / letter
        if not part_path.is_dir():
            return error(f"分区不存在: {letter}:", 404)
        force = params.get("force", "false").lower() in ("true", "1")
        import shutil
        if force:
            shutil.rmtree(str(part_path))
        else:
            try:
                part_path.rmdir()
            except OSError:
                return error(f"分区 {letter}: 非空，使用 force=true 强制删除", 400)
        return success({"partition": f"{letter}:", "deleted": True}, f"分区删除成功: {letter}:")

    if action == "merge":
        src = params.get("source", "")
        tgt = params.get("target", "")
        if not src or not tgt:
            return error("缺少必要参数: source, target")
        sl = _partition_letter(src)
        tl = _partition_letter(tgt)
        if not sl or not tl:
            return error("source 或 target 格式无效")
        src_path = FSDriver.DISK_BASE_PATH / sl
        tgt_path = FSDriver.DISK_BASE_PATH / tl
        if not src_path.is_dir():
            return error(f"源分区不存在: {sl}:", 404)
        if not tgt_path.is_dir():
            return error(f"目标分区不存在: {tl}:", 404)
        delete_source = params.get("deleteSource", "false").lower() in ("true", "1")
        import shutil
        merged, errors_list = 0, []
        for item in src_path.rglob("*"):
            if item.is_file():
                rel = item.relative_to(src_path)
                dst = tgt_path / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.copy2(str(item), str(dst))
                    merged += 1
                except Exception as ex:
                    errors_list.append(str(ex))
        if delete_source and not errors_list:
            shutil.rmtree(str(src_path))
        return success({
            "source": f"{sl}:", "target": f"{tl}:",
            "mergedCount": merged, "errors": errors_list
        }, f"分区合并完成: {sl}: → {tl}:")

    if action == "read_data":
        data = _read_disk_data()
        return success(data, "DiskData.json 读取成功")

    if action == "sync_data":
        disk_base = FSDriver.DISK_BASE_PATH
        data = _read_disk_data()
        total_size = int(data.get("totalSize", 3221225472))
        partition_sizes = data.get("partitions", {}) if isinstance(data.get("partitions"), dict) else {}
        if disk_base.is_dir():
            for p in disk_base.iterdir():
                if p.is_dir() and re.match(r'^[A-Z]$', p.name):
                    pname = f"{p.name}:"
                    if pname not in partition_sizes:
                        default_sz = 1073741824 if p.name == "C" else (2147483648 if p.name == "D" else 1073741824)
                        current_sum = sum(int(v) for v in partition_sizes.values())
                        if current_sum + default_sz <= total_size:
                            partition_sizes[pname] = default_sz
        data["partitions"] = partition_sizes
        data["partitionCount"] = len(partition_sizes)
        df = _disk_data_file()
        df.parent.mkdir(parents=True, exist_ok=True)
        import json as _json2
        df.write_text(_json2.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return success(data, "DiskData.json 同步成功")

    return error(f"未知的操作: {action} (支持: check, create, delete, merge, list, read_data, sync_data)", 400)


# ===========================
# CompressionDirve - ZIP 操作（与 PHP/Java 接口一致）
# ===========================

def _compression_get_real_path(virtual_path: str):
    """压缩服务使用的路径解析。"""
    return FSDriver.get_real_path(virtual_path)


@app.api_route("/system/service/CompressionDirve", methods=["GET", "POST", "OPTIONS"])
async def compression_dirve(request: Request):
    if request.method == "OPTIONS":
        return JSONResponse(content={})
    params = await _get_params(request)
    action = params.get("action")
    source_path = params.get("sourcePath")
    target_path = params.get("targetPath")
    options = params.get("options")
    if isinstance(options, dict):
        pass
    elif options is not None:
        options = {}
    else:
        options = {}

    if not action:
        return error("缺少参数: action", 400)

    try:
        if action == "check_support":
            return success({
                "zip": True,
                "rar": False,
            }, "支持检查完成")

        if action == "compress_zip":
            # 支持 sourcePath 或 sourcePaths（POST body）
            source_paths = params.get("sourcePaths")
            if source_paths is None and source_path:
                source_paths = [source_path]
            if not source_paths:
                return error("缺少必要参数: sourcePath 或 sourcePaths", 400)
            if not target_path:
                return error("缺少必要参数: targetPath", 400)
            target_real = _compression_get_real_path(target_path)
            if not target_real:
                return error("无效的目标路径格式", 400)
            if not target_real.parent.is_dir():
                return error("目标目录不存在", 404)
            if target_real.exists():
                return error("目标文件已存在", 409)
            exclude = options.get("exclude") or []
            level = min(9, max(0, int(options.get("compressionLevel", 6))))
            with zipfile.ZipFile(target_real, "w", zipfile.ZIP_DEFLATED, compresslevel=level) as zf:
                for sp in source_paths:
                    src_real = _compression_get_real_path(sp)
                    if not src_real or not src_real.exists():
                        return error(f"源路径不存在或无效: {sp}", 404)
                    if src_real.is_file():
                        zf.write(src_real, src_real.name)
                    else:
                        for f in src_real.rglob("*"):
                            if f.is_file():
                                arcname = f.relative_to(src_real.parent)
                                skip = False
                                for ex in exclude:
                                    if ex in str(arcname):
                                        skip = True
                                        break
                                if not skip:
                                    zf.write(f, arcname)
            size = target_real.stat().st_size
            return success({
                "sourcePath": source_paths[0] if len(source_paths) == 1 else None,
                "sourcePaths": source_paths,
                "targetPath": target_path,
                "size": size,
                "compressionLevel": level,
                "sourceCount": len(source_paths),
            }, "ZIP 压缩成功")

        if action == "extract_zip":
            if not source_path or not target_path:
                return error("缺少必要参数: sourcePath, targetPath", 400)
            source_real = _compression_get_real_path(source_path)
            target_real = _compression_get_real_path(target_path)
            if not source_real or not target_real:
                return error("无效的路径格式", 400)
            if not source_real.exists():
                return error("压缩文件不存在", 404)
            if source_real.suffix.lower() not in (".zip", ".zom"):
                return error("文件不是 ZIP 格式（支持 .zip 和 .zom）", 400)
            target_real.mkdir(parents=True, exist_ok=True)
            files_to_extract = options.get("files") or []
            overwrite = options.get("overwrite", False)
            with zipfile.ZipFile(source_real, "r") as zf:
                if files_to_extract:
                    for name in files_to_extract:
                        zf.extract(name, target_real)
                    extracted = files_to_extract
                else:
                    zf.extractall(target_real)
                    extracted = zf.namelist()
            return success({
                "sourcePath": source_path,
                "targetPath": target_path,
                "extractedCount": len(extracted),
                "extractedFiles": extracted,
            }, "ZIP 解压缩成功")

        if action == "list_zip":
            if not source_path:
                return error("缺少必要参数: sourcePath", 400)
            source_real = _compression_get_real_path(source_path)
            if not source_real or not source_real.exists():
                return error("压缩文件不存在或路径无效", 404)
            if source_real.suffix.lower() not in (".zip", ".zom"):
                return error("文件不是 ZIP 格式", 400)
            with zipfile.ZipFile(source_real, "r") as zf:
                items = []
                for info in zf.infolist():
                    is_dir = info.filename.endswith("/")
                    items.append({
                        "name": info.filename,
                        "size": info.file_size,
                        "compressedSize": info.compress_size,
                        "isDirectory": is_dir
                    })
            return success({
                "path": source_path,
                "items": items,
                "count": len(items),
            }, "ZIP 列表获取成功")

        return error(f"未知的操作: {action}", 400)

    except FileNotFoundError as e:
        return error(str(e), 404)
    except zipfile.BadZipFile as e:
        return error(f"ZIP 文件无效: {e}", 400)
    except Exception as e:
        return error(f"操作失败: {str(e)}", 500)


# ===========================
# RunPython（保留）
# ===========================

@app.post("/system/service/RunPython")
async def run_python(request: Request):
    try:
        body = await request.json()
        code = body.get("code")
        if not code:
            return error("Missing python code")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as f:
            f.write(code)
            temp_file = f.name
        result = subprocess.run(
            [sys.executable, temp_file],
            capture_output=True,
            text=True,
            timeout=5
        )
        os.remove(temp_file)
        return success({
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        })
    except subprocess.TimeoutExpired:
        return error("Python execution timed out")
    except Exception as e:
        return error(str(e))


# ===========================
# 应用商店 API
# 从本地 DISK/C/appPack/ 目录读取 .zom 文件，提供应用列表/搜索/详情/下载
# ===========================

_APP_PACK_DIR = FSDriver.DISK_BASE_PATH / "C" / "appPack"


def _read_app_manifest(zom_path: PathLib) -> dict | None:
    """从 .zom 文件中读取 application.json 元数据。"""
    try:
        with zipfile.ZipFile(zom_path, "r") as zf:
            names = zf.namelist()
            meta_name = next((n for n in names if n.lower() == "application.json"), None)
            if not meta_name:
                return None
            data = json.loads(zf.read(meta_name).decode("utf-8"))
            data["_zom_file"] = zom_path.name
            data["_zom_size"] = zom_path.stat().st_size
            return data
    except Exception:
        return None


def _build_app_entry(meta: dict, zom_path: PathLib) -> dict:
    """将 application.json 转换为商店 API 格式。"""
    import base64, hashlib
    app_id = hashlib.md5(zom_path.name.encode()).hexdigest()[:12]
    return {
        "id": app_id,
        "programName": meta.get("name", zom_path.stem),
        "name": meta.get("description") or meta.get("name", zom_path.stem),
        "version": meta.get("version", "1.0.0"),
        "author": meta.get("author", "ZerOS"),
        "category": meta.get("category", "utility"),
        "type": meta.get("type", "GUI"),
        "description": meta.get("description", ""),
        "size": meta.get("_zom_size", 0),
        "downloadUrl": f"/api/application/{app_id}/package",
        "icon": None,
        "downloads": 0,
        "rating": 5.0,
        "_zom_file": meta.get("_zom_file", ""),
    }


def _get_all_apps() -> list[dict]:
    """扫描本地 appPack 目录，返回应用列表。"""
    import json as _j
    apps = []
    if not _APP_PACK_DIR.exists():
        return apps
    for zom in sorted(_APP_PACK_DIR.glob("*.zom")):
        meta = _read_app_manifest(zom)
        if meta:
            apps.append(_build_app_entry(meta, zom))
    return apps


def _find_app_by_id(app_id: str) -> tuple[dict | None, PathLib | None]:
    """通过 id 查找 app 和对应的 zom 文件。"""
    import hashlib
    if not _APP_PACK_DIR.exists():
        return None, None
    for zom in _APP_PACK_DIR.glob("*.zom"):
        if hashlib.md5(zom.name.encode()).hexdigest()[:12] == app_id:
            meta = _read_app_manifest(zom)
            if meta:
                return _build_app_entry(meta, zom), zom
    return None, None


import json as json


@app.get("/api/application/list")
async def store_list():
    apps = _get_all_apps()
    return JSONResponse({"code": 200, "msg": "ok", "data": apps})


@app.get("/api/application/search")
async def store_search(keyword: str = ""):
    apps = _get_all_apps()
    kw = keyword.strip().lower()
    if kw:
        apps = [a for a in apps if kw in a["name"].lower() or kw in a["programName"].lower() or kw in a["description"].lower()]
    return JSONResponse({"code": 200, "msg": "ok", "data": apps})


@app.get("/api/application/{app_id}")
async def store_detail(app_id: str):
    if app_id == "list" or app_id == "search":
        return JSONResponse({"code": 404, "msg": "not found", "data": None}, status_code=404)
    app_entry, _ = _find_app_by_id(app_id)
    if not app_entry:
        return JSONResponse({"code": 404, "msg": "应用不存在", "data": None}, status_code=404)
    return JSONResponse({"code": 200, "msg": "ok", "data": app_entry})


@app.post("/api/application/{app_id}/download")
async def store_download_url(app_id: str):
    app_entry, zom_path = _find_app_by_id(app_id)
    if not app_entry or not zom_path:
        return JSONResponse({"code": 404, "msg": "应用不存在", "data": None}, status_code=404)
    download_url = f"/api/application/{app_id}/package"
    return JSONResponse({"code": 200, "msg": "ok", "data": download_url})


@app.get("/api/application/{app_id}/package")
async def store_package(app_id: str):
    app_entry, zom_path = _find_app_by_id(app_id)
    if not app_entry or not zom_path:
        return JSONResponse({"code": 404, "msg": "应用不存在", "data": None}, status_code=404)
    return FileResponse(
        path=str(zom_path),
        media_type="application/zip",
        filename=zom_path.name,
    )


# ===========================
# AI 代理（dashscope / spark-ai）
# 与 PHP 版本接口兼容，转发 POST 请求至各 AI 服务
# ===========================

async def _proxy_post(upstream_url: str, headers: dict, body: dict):
    """通用异步 HTTP 代理（POST JSON）。"""
    try:
        import httpx
    except ImportError:
        return JSONResponse(status_code=500, content={"error": "httpx 未安装，请执行 pip install httpx"})
    try:
        async with httpx.AsyncClient(timeout=60, verify=False) as client:
            resp = await client.post(upstream_url, json=body, headers=headers)
            return JSONResponse(status_code=resp.status_code, content=resp.json()
                                if resp.headers.get("content-type", "").startswith("application/json")
                                else {"raw": resp.text})
    except httpx.TimeoutException:
        return JSONResponse(status_code=504, content={"error": "上游 AI 服务请求超时"})
    except Exception as ex:
        return JSONResponse(status_code=502, content={"error": f"代理请求失败: {ex}"})


@app.api_route("/system/service/dashscope-ai-proxy", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/system/service/dashscope-ai-proxy.php", methods=["GET", "POST", "OPTIONS"])
async def dashscope_ai_proxy(request: Request):
    if request.method == "OPTIONS":
        return JSONResponse(content={})
    if request.method != "POST":
        return JSONResponse(status_code=405, content={"error": "Method not allowed"})
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})
    _auth = body.pop("_auth", {}) or {}
    api_key = _auth.get("apiKey", "")
    upstream = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    return await _proxy_post(upstream, {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }, body)


@app.api_route("/system/service/spark-ai-proxy", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/system/service/spark-ai-proxy.php", methods=["GET", "POST", "OPTIONS"])
async def spark_ai_proxy(request: Request):
    """
    讯飞星火 HTTP API 代理。
    讯飞 spark-api-open.xf-yun.com 的 HTTP 接口使用简单 Bearer Token 认证：
      Authorization: Bearer <APIPassword>
    APIPassword 直接从讯飞控制台 -> 星火大模型 -> 服务接口认证信息 中获取。
    不需要 HMAC，不需要 APIKey:APISecret 格式。
    """
    if request.method == "OPTIONS":
        return JSONResponse(content={})
    if request.method != "POST":
        return JSONResponse(status_code=405, content={"error": "Method not allowed"})
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})
    _auth = body.pop("_auth", {}) or {}
    api_password = _auth.get("apiPassword", "").strip()
    if body.get("model") in ("spark-x", "spark", "generalv3.5", "", None):
        body["model"] = "lite"

    upstream = "https://spark-api-open.xf-yun.com/v1/chat/completions"
    try:
        import httpx
    except ImportError:
        return JSONResponse(status_code=500, content={"error": "httpx 未安装，请运行 pip install httpx"})

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_password}",
    }
    try:
        async with httpx.AsyncClient(timeout=60, verify=False) as client:
            resp = await client.post(upstream, json=body, headers=headers)
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}
            print(f"[spark-proxy] upstream status={resp.status_code} body={json.dumps(data)[:500]}", flush=True)
            # 讯飞 HTTP 200 但 code 非 0 也是业务错误，统一用 200 返回，让前端处理错误消息
            # 非 200 的讯飞错误（如 401/500）也原样透传，前端能读到 message 字段
            return JSONResponse(status_code=200, content=data)
    except httpx.TimeoutException:
        return JSONResponse(status_code=200, content={"code": -1, "message": "上游 AI 服务请求超时，请稍后重试"})
    except Exception as ex:
        return JSONResponse(status_code=200, content={"code": -1, "message": f"代理请求失败: {ex}"})


# ===========================
# TTS 代理（tts-proxy.php）
# 后端负责调用 cenguigui TTS API，轮询获取音频，直接返回音频流给前端
# 彻底避免浏览器直连外部 TTS API 导致的 CORS 问题
# ===========================

_TTS_BASE = "https://api-v1.cenguigui.cn/api/speech/AiChat/"

@app.api_route("/system/service/tts-proxy", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/system/service/tts-proxy.php", methods=["GET", "POST", "OPTIONS"])
async def tts_proxy(request: Request):
    if request.method == "OPTIONS":
        return JSONResponse(content={})
    # 支持 GET querystring 和 POST JSON body
    text = ""
    voice = "译制腔"
    if request.method == "POST":
        try:
            body = await request.json()
            text = body.get("text", "")
            voice = body.get("voice", "译制腔")
        except Exception:
            pass
    else:
        text = request.query_params.get("text", "")
        voice = request.query_params.get("voice", "译制腔")
    text = text.strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": "缺少 text 参数"})
    try:
        import httpx
    except ImportError:
        return JSONResponse(status_code=500, content={"error": "httpx 未安装，请执行 pip install httpx"})
    import urllib.parse as _urlparse
    tts_url = f"{_TTS_BASE}?text={_urlparse.quote(text)}&voice={_urlparse.quote(voice)}&module=audio"
    # 轮询等待 TTS 音频生成（最多 10 次，间隔 2 秒）
    audio_url = None
    async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True) as client:
        for attempt in range(10):
            try:
                resp = await client.get(tts_url, headers={"Accept": "application/json"})
                if resp.status_code != 200:
                    return JSONResponse(status_code=502, content={"error": f"TTS 接口返回 {resp.status_code}"})
                data = resp.json()
                if data.get("code") != 200:
                    return JSONResponse(status_code=502, content={"error": data.get("message", "TTS 接口错误")})
                if data.get("data") and data["data"].get("audio_url"):
                    audio_url = data["data"]["audio_url"]
                    break
                # task_id 存在但音频未生成，等待后重试
                if data.get("task_id") and attempt < 9:
                    import asyncio
                    await asyncio.sleep(2)
                    continue
                return JSONResponse(status_code=502, content={"error": "TTS 音频生成超时"})
            except Exception as ex:
                if attempt == 9:
                    return JSONResponse(status_code=502, content={"error": f"TTS 请求失败: {ex}"})
                import asyncio
                await asyncio.sleep(2)
    if not audio_url:
        return JSONResponse(status_code=502, content={"error": "未能获取 TTS 音频 URL"})
    # 下载音频并流式返回，前端无需再发起跨域请求
    try:
        async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True) as client:
            audio_resp = await client.get(audio_url, headers={"Accept": "*/*"})
            content_type = audio_resp.headers.get("content-type", "audio/wav")
            return StreamingResponse(
                content=iter([audio_resp.content]),
                status_code=200,
                media_type=content_type,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600",
                    "Content-Disposition": "inline; filename=\"tts.wav\"",
                },
            )
    except Exception as ex:
        return JSONResponse(status_code=502, content={"error": f"音频下载失败: {ex}"})


# ===========================
# 音频代理（audio-proxy.php）
# 转发外部音频 URL，绕过浏览器 CORS 限制（通用代理，tts-proxy 优先使用）
# ===========================

@app.api_route("/system/service/audio-proxy", methods=["GET", "OPTIONS"])
@app.api_route("/system/service/audio-proxy.php", methods=["GET", "OPTIONS"])
async def audio_proxy(request: Request):
    if request.method == "OPTIONS":
        return JSONResponse(content={})
    url = request.query_params.get("url", "").strip()
    if not url:
        return JSONResponse(status_code=400, content={"error": "缺少 url 参数"})
    import urllib.parse as _urlparse
    parsed = _urlparse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return JSONResponse(status_code=400, content={"error": "不支持的 URL 协议"})
    host = parsed.hostname or ""
    if host in ("localhost", "127.0.0.1", "::1") or host.startswith("192.168.") or host.startswith("10."):
        return JSONResponse(status_code=403, content={"error": "不允许代理内网地址"})
    try:
        import httpx
    except ImportError:
        return JSONResponse(status_code=500, content={"error": "httpx 未安装，请执行 pip install httpx"})
    try:
        async with httpx.AsyncClient(timeout=30, verify=False, follow_redirects=True) as client:
            upstream = await client.get(url, headers={"Accept": "*/*"})
            content_type = upstream.headers.get("content-type", "audio/wav")
            return StreamingResponse(
                content=iter([upstream.content]),
                status_code=upstream.status_code,
                media_type=content_type,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600",
                },
            )
    except httpx.TimeoutException:
        return JSONResponse(status_code=504, content={"error": "音频资源请求超时"})
    except Exception as ex:
        return JSONResponse(status_code=502, content={"error": f"音频代理失败: {ex}"})


# 挂载静态文件：支持访问 http://localhost:8000/ 直接加载前端（单端口运行，解决 401）
if _PROJECT_ROOT.exists():
    app.mount("/", StaticFiles(directory=str(_PROJECT_ROOT), html=True), name="static")
