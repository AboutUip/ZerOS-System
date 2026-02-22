# ZerOS Python 后端 - 与 PHP/Java 相同的 API 接口，支持 JWT + upid 鉴权（与 randomSecurity/jwtVerify/programPermissions 兼容）
from pathlib import Path as PathLib

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
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


@app.api_route("/system/service/DISKMANAGER", methods=["GET", "POST"])
async def diskmanager(request: Request):
    params = request.query_params
    action = params.get("action")
    partition = params.get("partition", "")

    if action == "check":
        letter = _partition_letter(partition)
        if not letter:
            return error(f"无效的分区名称: {partition} (格式应为单个大写字母+冒号，如 C:)")
        part_path = FSDriver.DISK_BASE_PATH / letter
        exists = part_path.is_dir()
        info = {
            "partition": f"{letter}:",
            "letter": letter,
            "exists": exists,
            "path": str(part_path),
        }
        if exists:
            info["size"] = sum(f.stat().st_size for f in part_path.rglob("*") if f.is_file())
            info["fileCount"] = sum(1 for _ in part_path.rglob("*") if _.is_file())
            info["dirCount"] = sum(1 for _ in part_path.rglob("*") if _.is_dir())
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

    return error(f"未知的操作: {action}", 400)


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


# 挂载静态文件：支持访问 http://localhost:8000/ 直接加载前端（单端口运行，解决 401）
if _PROJECT_ROOT.exists():
    app.mount("/", StaticFiles(directory=str(_PROJECT_ROOT), html=True), name="static")
