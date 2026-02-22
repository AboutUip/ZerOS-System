# ZerOS 文件系统驱动 - 与 PHP/Java 后端 API 兼容
# 虚拟磁盘根目录：system/service/DISK（与 PHP/Java 一致）
from pathlib import Path
import re
import shutil
from datetime import datetime

# 虚拟磁盘根目录（backend-python 的上级目录为 system/service，DISK 为 system/service/DISK）
_BACKEND_DIR = Path(__file__).resolve().parent
_SERVICE_DIR = _BACKEND_DIR.parent
DISK_BASE_PATH = _SERVICE_DIR / "DISK"

# 路径格式：A-Z: 或 A-Z:/...（校验时接受小写盘符并规范为大写；冒号后可为 / 或路径）
_PATH_PATTERN = re.compile(r"^[A-Za-z]:(?:\/|$)")


def _normalize_virtual_path(virtual_path: str) -> str:
    """规范虚拟路径：小写盘符转大写，单字母盘符转为 D: 形式，统一使用 /，冒号后保留斜杠（D:/path）。"""
    if not virtual_path or not isinstance(virtual_path, str):
        return virtual_path or ""
    s = virtual_path.strip().replace("\\", "/").lstrip("/")
    if not s:
        return s
    # 单字母盘符（如 D）转为 D:
    if len(s) == 1 and s[0].upper() in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        return s[0].upper() + ":"
    if ":" in s:
        disk, rest = s.split(":", 1)
        if len(disk) == 1 and disk.upper() in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            rest = rest.lstrip("/")
            return disk.upper() + ":" + ("/" + rest if rest else "")
    return s


def _validate_path(virtual_path: str) -> dict | None:
    """验证虚拟路径，返回 {'disk': letter, 'path': relative_path} 或 None。"""
    if not virtual_path or not isinstance(virtual_path, str):
        return None
    virtual_path = _normalize_virtual_path(virtual_path)
    if not virtual_path:
        return None
    if not _PATH_PATTERN.match(virtual_path):
        return None
    parts = virtual_path.split(":", 1)
    disk = parts[0].upper()
    relative = parts[1].lstrip("/") if len(parts) > 1 else ""
    if len(disk) != 1 or disk < "A" or disk > "Z":
        return None
    if ".." in relative:
        return None
    return {"disk": disk, "path": relative}


def get_partition_path(disk_letter: str) -> Path | None:
    """获取分区物理路径，分区不存在则不创建。"""
    if not disk_letter or len(disk_letter) != 1 or disk_letter < "A" or disk_letter > "Z":
        return None
    return DISK_BASE_PATH / disk_letter


def get_real_path(virtual_path: str) -> Path | None:
    """将虚拟路径转换为实际文件系统路径。"""
    v = _validate_path(virtual_path)
    if not v:
        return None
    base = get_partition_path(v["disk"])
    if base is None or not base.is_dir():
        return None
    if not v["path"]:
        return base
    full = (base / v["path"]).resolve()
    try:
        full.relative_to(base)
    except ValueError:
        return None
    return full


def get_dir_path(virtual_path: str) -> Path | None:
    """获取目录物理路径（用于目录操作）。"""
    return get_real_path(virtual_path)


def normalize_path(virtual_path: str) -> str:
    """规范化虚拟路径（去掉末尾斜杠，根路径保持 A: 形式）。"""
    if not virtual_path:
        return virtual_path
    virtual_path = virtual_path.strip().replace("\\", "/")
    if re.match(r"^[A-Z]:$", virtual_path):
        return virtual_path
    return virtual_path.rstrip("/")


# ---------- 目录操作 ----------

def create_directory(path: str, name: str) -> dict:
    if not name or "/" in name or "\\" in name:
        raise ValueError("无效的目录名")
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    if not dir_path.is_dir():
        raise FileNotFoundError(f"父目录不存在: {path}")
    new_dir = dir_path / name
    if new_dir.is_dir():
        return {"path": normalize_path(path) + "/" + name, "name": name, "existed": True}
    new_dir.mkdir(parents=True, exist_ok=False)
    return {"path": normalize_path(path) + "/" + name, "name": name, "existed": False}


def delete_directory(path: str) -> dict:
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    if not dir_path.is_dir():
        raise FileNotFoundError(f"目录不存在: {path}")
    if any(p.name not in (".", "..") for p in dir_path.iterdir()):
        raise PermissionError("目录不为空，无法删除")
    dir_path.rmdir()
    return {"path": normalize_path(path)}


def _delete_dir_recursive_inner(p: Path) -> None:
    for item in p.iterdir():
        if item.is_dir():
            _delete_dir_recursive_inner(item)
        else:
            item.unlink()
    p.rmdir()


def delete_directory_recursive(path: str) -> dict:
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    if not dir_path.is_dir():
        raise FileNotFoundError(f"目录不存在: {path}")
    _delete_dir_recursive_inner(dir_path)
    return {"path": normalize_path(path)}


def list_directory(path: str) -> dict:
    # 先规范化路径（兼容 D、D:、D:/、d:/ 等），再解析
    path = _normalize_virtual_path(path or "")
    if not path:
        raise ValueError("无效的路径格式")
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    v = _validate_path(path)
    if not v:
        raise ValueError("无效的路径格式")
    base = get_partition_path(v["disk"])
    if not base or not base.is_dir():
        raise FileNotFoundError(f"分区不存在: {v['disk']}:")
    if not dir_path.is_dir():
        raise FileNotFoundError(f"目录不存在: {path}")
    norm_path = normalize_path(path)
    items = []
    for item in dir_path.iterdir():
        if item.name in (".", ".."):
            continue
        is_dir = item.is_dir()
        virt = (norm_path + "/" + item.name) if norm_path else (v["disk"] + ":/" + item.name)
        entry = {
            "name": item.name,
            "type": "directory" if is_dir else "file",
            "path": virt,
            "modified": datetime.fromtimestamp(item.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "created": datetime.fromtimestamp(item.stat().st_ctime).strftime("%Y-%m-%d %H:%M:%S"),
        }
        if is_dir:
            entry["size"] = 0
        else:
            entry["size"] = item.stat().st_size
            entry["extension"] = item.suffix.lstrip(".") if item.suffix else ""
        items.append(entry)
    items.sort(key=lambda x: (0 if x["type"] == "directory" else 1, x["name"].lower()))
    return {"path": norm_path, "items": items, "count": len(items)}


def rename_directory(path: str, old_name: str, new_name: str) -> dict:
    if not old_name or not new_name or "/" in old_name or "\\" in old_name or "/" in new_name or "\\" in new_name:
        raise ValueError("无效的目录名")
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    old_p = dir_path / old_name
    new_p = dir_path / new_name
    if not old_p.is_dir():
        raise FileNotFoundError(f"源目录不存在: {old_name}")
    if new_p.exists():
        raise FileExistsError(f"目标目录已存在: {new_name}")
    old_p.rename(new_p)
    return {"path": normalize_path(path) + "/" + new_name, "oldName": old_name, "newName": new_name}


def _virtual_parent_and_name(virtual_path: str) -> tuple[str, str]:
    """虚拟路径拆分为父路径和最后一段名称。例如 D:/a/b -> ('D:/a', 'b')，D:/x -> ('D:', 'x')。"""
    p = virtual_path.strip().replace("\\", "/").rstrip("/")
    if not p or ":" not in p:
        return "", ""
    disk, rest = p.split(":", 1)
    rest = rest.lstrip("/")
    if not rest:
        return "", ""
    parts = rest.split("/")
    name = parts[-1]
    parent = f"{disk}:" + ("/" + "/".join(parts[:-1]) if len(parts) > 1 else "")
    return parent, name


def move_directory(source_path: str, target_path: str) -> dict:
    source_dir = get_dir_path(source_path)
    target_parent_virt, target_name = _virtual_parent_and_name(target_path)
    if not target_name:
        raise ValueError("无效的目标路径")
    target_parent = get_dir_path(target_parent_virt)
    if not source_dir or not target_parent:
        raise ValueError("无效的路径格式")
    if not source_dir.is_dir():
        raise FileNotFoundError(f"源目录不存在: {source_path}")
    if not target_parent.is_dir():
        raise FileNotFoundError("目标父目录不存在")
    target_dir = target_parent / target_name
    if target_dir.exists():
        raise FileExistsError(f"目标目录已存在: {target_path}")
    shutil.move(str(source_dir), str(target_dir))
    return {"sourcePath": normalize_path(source_path), "targetPath": normalize_path(target_path)}


def _copy_dir_recursive(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if item.name in (".", ".."):
            continue
        dest_item = dst / item.name
        if item.is_dir():
            _copy_dir_recursive(item, dest_item)
        else:
            shutil.copy2(item, dest_item)


def copy_directory(source_path: str, target_path: str) -> dict:
    source_dir = get_dir_path(source_path)
    target_parent_virt, target_name = _virtual_parent_and_name(target_path)
    if not target_name:
        raise ValueError("无效的目标路径")
    target_parent = get_dir_path(target_parent_virt)
    if not source_dir or not target_parent:
        raise ValueError("无效的路径格式")
    if not source_dir.is_dir():
        raise FileNotFoundError(f"源目录不存在: {source_path}")
    if not target_parent.is_dir():
        raise FileNotFoundError("目标父目录不存在")
    target_dir = target_parent / target_name
    if target_dir.exists():
        raise FileExistsError(f"目标目录已存在: {target_path}")
    _copy_dir_recursive(source_dir, target_dir)
    return {"sourcePath": normalize_path(source_path), "targetPath": normalize_path(target_path)}


# ---------- 文件操作 ----------

def create_file(path: str, file_name: str, content: str = "") -> dict:
    if not file_name or "/" in file_name or "\\" in file_name:
        raise ValueError("无效的文件名")
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    if not dir_path.is_dir():
        raise FileNotFoundError(f"父目录不存在: {path}")
    file_path = dir_path / file_name
    if file_path.exists():
        raise FileExistsError(f"文件已存在: {file_name}")
    file_path.write_text(content, encoding="utf-8")
    return {"path": normalize_path(path) + "/" + file_name, "fileName": file_name, "size": len(content)}


def read_file_content(path: str, file_name: str, as_base64: bool = False) -> dict:
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    file_path = dir_path / file_name
    if not file_path.exists():
        raise FileNotFoundError(f"文件不存在: {file_name}")
    if not file_path.is_file():
        raise ValueError(f"路径不是文件: {file_name}")
    content = file_path.read_bytes()
    image_ext = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico"}
    use_b64 = as_base64 or (file_path.suffix and file_path.suffix.lower() in image_ext)
    if use_b64:
        import base64
        content_str = base64.b64encode(content).decode("ascii")
    else:
        content_str = content.decode("utf-8", errors="replace")
    stat = file_path.stat()
    return {
        "path": normalize_path(path) + "/" + file_name,
        "fileName": file_name,
        "size": stat.st_size,
        "content": content_str,
        "isBase64": use_b64,
        "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        "created": datetime.fromtimestamp(stat.st_ctime).strftime("%Y-%m-%d %H:%M:%S"),
    }


def write_file(path: str, file_name: str, content: str, write_mod: str = "overwrite", is_base64: bool = False) -> dict:
    if not file_name or "/" in file_name or "\\" in file_name:
        raise ValueError("无效的文件名")
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    if not dir_path.is_dir():
        raise FileNotFoundError(f"父目录不存在: {path}")
    file_path = dir_path / file_name
    if is_base64:
        import base64
        content = base64.b64decode(content).decode("utf-8", errors="replace") if isinstance(content, str) else base64.b64decode(content).decode("utf-8", errors="replace")
    if isinstance(content, str):
        content = content.encode("utf-8")
    existed = file_path.exists()
    if write_mod == "append" and existed:
        content = file_path.read_bytes() + content
    elif write_mod == "prepend" and existed:
        content = content + file_path.read_bytes()
    file_path.write_bytes(content)
    return {
        "path": normalize_path(path) + "/" + file_name,
        "fileName": file_name,
        "size": len(content),
        "writeMod": write_mod,
        "created": not existed,
    }


def delete_file(path: str, file_name: str) -> dict:
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    file_path = dir_path / file_name
    if not file_path.exists():
        raise FileNotFoundError(f"文件不存在: {file_name}")
    if not file_path.is_file():
        raise ValueError(f"路径不是文件: {file_name}")
    file_path.unlink()
    return {"path": normalize_path(path) + "/" + file_name, "fileName": file_name}


def rename_file(path: str, old_file_name: str, new_file_name: str) -> dict:
    if not old_file_name or not new_file_name or "/" in old_file_name or "\\" in old_file_name or "/" in new_file_name or "\\" in new_file_name:
        raise ValueError("无效的文件名")
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    old_p = dir_path / old_file_name
    new_p = dir_path / new_file_name
    if not old_p.exists():
        raise FileNotFoundError(f"源文件不存在: {old_file_name}")
    if new_p.exists():
        raise FileExistsError(f"目标文件已存在: {new_file_name}")
    old_p.rename(new_p)
    return {"path": normalize_path(path) + "/" + new_file_name, "oldFileName": old_file_name, "newFileName": new_file_name}


def move_file(source_path: str, source_file_name: str, target_path: str, target_file_name: str | None = None) -> dict:
    target_file_name = target_file_name or source_file_name
    source_dir = get_dir_path(source_path)
    target_dir = get_dir_path(target_path)
    if not source_dir or not target_dir:
        raise ValueError("无效的路径格式")
    src_file = source_dir / source_file_name
    dst_file = target_dir / target_file_name
    if not src_file.exists():
        raise FileNotFoundError(f"源文件不存在: {source_file_name}")
    if not target_dir.is_dir():
        raise FileNotFoundError("目标目录不存在")
    if dst_file.exists():
        raise FileExistsError(f"目标文件已存在: {target_file_name}")
    shutil.move(str(src_file), str(dst_file))
    return {
        "sourcePath": normalize_path(source_path) + "/" + source_file_name,
        "targetPath": normalize_path(target_path) + "/" + target_file_name,
        "sourceFileName": source_file_name,
        "targetFileName": target_file_name,
    }


def copy_file(source_path: str, source_file_name: str, target_path: str, target_file_name: str | None = None) -> dict:
    target_file_name = target_file_name or source_file_name
    source_dir = get_dir_path(source_path)
    target_dir = get_dir_path(target_path)
    if not source_dir or not target_dir:
        raise ValueError("无效的路径格式")
    src_file = source_dir / source_file_name
    dst_file = target_dir / target_file_name
    if not src_file.exists():
        raise FileNotFoundError(f"源文件不存在: {source_file_name}")
    if not target_dir.is_dir():
        raise FileNotFoundError("目标目录不存在")
    if dst_file.exists():
        raise FileExistsError(f"目标文件已存在: {target_file_name}")
    shutil.copy2(src_file, dst_file)
    return {
        "sourcePath": normalize_path(source_path) + "/" + source_file_name,
        "targetPath": normalize_path(target_path) + "/" + target_file_name,
        "sourceFileName": source_file_name,
        "targetFileName": target_file_name,
    }


def get_file_info(path: str, file_name: str) -> dict:
    dir_path = get_dir_path(path)
    if not dir_path:
        raise ValueError("无效的路径格式")
    file_path = dir_path / file_name
    if not file_path.exists():
        raise FileNotFoundError(f"文件不存在: {file_name}")
    stat = file_path.stat()
    is_dir = file_path.is_dir()
    info = {
        "path": normalize_path(path) + "/" + file_name,
        "name": file_name,
        "type": "directory" if is_dir else "file",
        "size": 0 if is_dir else stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        "created": datetime.fromtimestamp(stat.st_ctime).strftime("%Y-%m-%d %H:%M:%S"),
    }
    if not is_dir and file_path.suffix:
        info["extension"] = file_path.suffix.lstrip(".")
    return info


# ---------- 其他 ----------

def check_path_exists(path: str) -> dict:
    real = get_real_path(path)
    if not real:
        raise ValueError("无效的路径格式")
    exists = real.exists()
    is_dir = exists and real.is_dir()
    is_file = exists and real.is_file()
    info = {"path": normalize_path(path), "exists": exists, "type": "directory" if is_dir else ("file" if is_file else None)}
    if exists:
        stat = real.stat()
        info["size"] = 0 if is_dir else stat.st_size
        info["modified"] = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        info["created"] = datetime.fromtimestamp(stat.st_ctime).strftime("%Y-%m-%d %H:%M:%S")
        if is_file:
            info["extension"] = real.suffix.lstrip(".") if real.suffix else ""
    return info


def _dir_size(p: Path) -> int:
    total = 0
    for item in p.rglob("*"):
        if item.is_file():
            total += item.stat().st_size
    return total


def get_disk_info(disk: str) -> dict:
    disk = (disk or "").strip().upper()
    if len(disk) != 1 or disk < "A" or disk > "Z":
        raise ValueError(f"无效的分区名称: {disk}")
    base = get_partition_path(disk)
    if not base or not base.is_dir():
        raise FileNotFoundError(f"分区不存在: {disk}:")
    total = shutil.disk_usage(base).total
    free = shutil.disk_usage(base).free
    used = total - free
    dir_size = _dir_size(base)
    return {
        "disk": disk,
        "totalSize": total,
        "freeSpace": free,
        "usedSpace": used,
        "dirSize": dir_size,
        "usagePercent": round((used / total) * 100, 2) if total else 0,
    }


# ---------- 兼容旧接口（LStorage 等可能用 path + fileName 或 path 含文件名） ----------

def safe_path(path: str, file_name: str | None = None) -> Path:
    """兼容旧调用：将 path/fileName 映射到物理路径。"""
    base_path = path or ""
    if file_name:
        real = get_real_path(base_path)
        if real is None:
            base_path = base_path.strip().replace("\\", "/")
            if ":" in base_path:
                drive_end = base_path.find(":") + 1
                rest = base_path[drive_end:].lstrip("/")
                if rest and "/" in rest:
                    last = rest.rfind("/")
                    base_path = base_path[:drive_end] + rest[:last]
                    file_name = rest[last + 1:]
            real = get_real_path(base_path)
        if real is not None:
            return real / file_name
    real = get_real_path(base_path)
    if real is not None:
        return real
    # 降级：使用 DISK 下 path 作为目录
    base_path = (path or "").strip().replace("\\", "/").replace(":", "")
    return DISK_BASE_PATH / base_path / (file_name or "").lstrip("/") if file_name else DISK_BASE_PATH / base_path


def exists(path: str, file_name: str | None = None) -> bool:
    if file_name:
        p = safe_path(path, file_name)
        return p.exists()
    return get_real_path(path) is not None and get_real_path(path).exists()


def read_file(path: str, file_name: str) -> str:
    return read_file_content(path, file_name, as_base64=False).get("content", "")


def create_file_simple(path: str, file_name: str) -> None:
    create_file(path, file_name, "")


def write_file_simple(path: str, file_name: str, content: str) -> None:
    write_file(path, file_name, content, "overwrite", False)
