# ZerOS 终端命令参考

本文档列出了 ZerOS 终端支持的所有内置命令及其用法。

## 命令处理优先级

终端按以下优先级查找和执行命令：

1. **内置命令** - 终端内置的命令（如 `ls`, `cd`, `clear` 等）
2. **D:/bin/ 目录** - 查找 `D:/bin/<命令名>.js` 文件，如果存在则作为程序执行
3. **程序注册表** - 从 `ApplicationAssetManager` 查找已注册的程序
4. **环境变量** - 从环境变量中查找命令名，如果找到则执行其值（可以是程序名或文件路径）

## 文件系统命令

### `ls [-l] [path]`

列出目录项。

**参数**:
- `-l` (可选): 输出长格式（详细信息）
- `path` (可选): 目录路径，支持相对或绝对路径（如 `C:/dir`）

**示例**:
```bash
ls                    # 列出当前目录
ls -l                 # 列出当前目录（长格式）
ls C:/Users           # 列出指定目录
ls -l D:/project      # 列出指定目录（长格式）
```

### `cd <dir>`

切换目录。

**参数**:
- `dir` (必需): 目标目录路径，支持相对路径（如 `..` 返回上级）和绝对路径

**示例**:
```bash
cd C:/Users           # 切换到 C:/Users
cd ..                 # 返回上级目录
cd D:/project/myapp   # 切换到指定目录
```

### `pwd`

显示当前工作目录。

**示例**:
```bash
pwd
# 输出: C:/Users/Alice
```

### `tree [-L depth] [path]`

以树状结构显示目录。

**参数**:
- `-L depth` (可选): 限制显示深度
- `path` (可选): 目录路径，支持相对或绝对路径

**示例**:
```bash
tree                  # 显示当前目录树
tree -L 2             # 显示当前目录树（深度限制为2）
tree C:/Users         # 显示指定目录树
```

### `markdir <path>`

创建目录。

**参数**:
- `path` (必需): 目录路径，支持多级路径（如 `foo/bar`）

**示例**:
```bash
markdir newdir        # 创建目录
markdir foo/bar/baz   # 创建多级目录
```

### `markfile <path>`

创建空文件。

**参数**:
- `path` (必需): 文件路径

**示例**:
```bash
markfile test.txt     # 创建空文件
```

### `cat [-md] <file>`

显示文件内容。

**参数**:
- `-md` (可选): 渲染 Markdown 格式
- `file` (必需): 文件路径，支持相对或绝对路径

**示例**:
```bash
cat file.txt          # 显示文件内容
cat -md README.md     # 渲染 Markdown 文件
```

### `write [-a] <file> <txt>`

写入文件。

**参数**:
- `-a` (可选): 追加模式（默认覆盖）
- `file` (必需): 文件路径
- `txt` (必需): 要写入的文本

**示例**:
```bash
write file.txt "Hello World"           # 覆盖写入
write -a file.txt "New line"          # 追加写入
```

### `rm <file|dir>`

删除文件或目录。

**参数**:
- `file|dir` (必需): 文件或目录路径

**示例**:
```bash
rm file.txt           # 删除文件
rm olddir             # 删除目录
```

### `rename <old> <new>`

重命名文件或目录。

**参数**:
- `old` (必需): 原名称
- `new` (必需): 新名称

**示例**:
```bash
rename old.txt new.txt
```

### `mv <src> <dest>`

移动文件或目录到目标位置。

**参数**:
- `src` (必需): 源路径
- `dest` (必需): 目标路径

**示例**:
```bash
mv file.txt C:/Users
```

### `copy <file|dir>`

复制文件或目录到剪贴板。

**参数**:
- `file|dir` (必需): 文件或目录路径

**示例**:
```bash
copy file.txt         # 复制文件到剪贴板
```

### `paste`

从剪贴板粘贴文件或目录到当前目录。

**示例**:
```bash
paste                # 粘贴剪贴板内容
```

## 进程管理命令

### `ps [-l|--long] [pid]`

显示程序内存信息。

**参数**:
- `-l` 或 `--long` (可选): 显示详细信息
- `pid` (可选): 指定进程 ID，查看特定程序

**示例**:
```bash
ps                   # 显示所有程序
ps -l                # 显示详细信息
ps 12345             # 显示指定进程
```

### `kill [signal] <pid>`

终止指定程序并释放其内存。

**参数**:
- `signal` (可选): 信号参数（如 `-9`）
- `pid` (必需): 进程 ID

**示例**:
```bash
kill 12345           # 终止进程
kill -9 12345        # 强制终止进程
```

## 网络命令

### `netport <命令> [选项]`

TCP 端口管理工具。

**命令**:
- `register, reg, r <端口> [程序名]`: 注册端口监听
- `unregister, unreg, u <端口>`: 取消端口监听
- `status, stat, s <端口>`: 查看端口状态
- `list, ls, l`: 列出所有已注册的端口
- `send <主机> <端口> <数据>`: 向端口发送数据

**选项**:
- `-h, --help`: 显示帮助信息

**示例**:
```bash
netport register 8080 MyServer        # 注册端口 8080
netport unregister 8080               # 取消端口 8080
netport status 8080                   # 查看端口 8080 状态
netport list                          # 列出所有端口
netport send 127.0.0.1 8080 "Hello"  # 向端口发送数据
netport --help                        # 显示帮助
```

**注意**: 
- 需要 `NETWORK_ACCESS` 权限（普通权限，自动授予）
- **需要管理员权限**：只有管理员用户才能使用此命令

## 系统命令

### `clear`

清除屏幕。

**示例**:
```bash
clear
```

### `echo [-n] [text...]`

输出文本。

**参数**:
- `-n` (可选): 不换行输出到同一行
- `text...` (可选): 要输出的文本

**示例**:
```bash
echo "Hello World"   # 输出文本并换行
echo -n "Hello"      # 输出文本不换行
```

### `whoami`

显示当前用户。

**示例**:
```bash
whoami
# 输出: alice
```

### `check`

全面自检内核并给出详细的检查报告。

**示例**:
```bash
check
```

### `diskmanger [-l] [disk]`

显示磁盘分区信息。

**参数**:
- `-l` (可选): 显示详细文件和目录占用
- `disk` (可选): 指定磁盘（如 `C:` 或 `D:`）

**示例**:
```bash
diskmanger           # 显示所有磁盘信息
diskmanger -l        # 显示详细信息
diskmanger -l C:     # 显示指定磁盘详细信息
```

### `power <action>`

系统电源管理。

**参数**:
- `action` (必需): 操作类型
  - `reboot` 或 `restart`: 重启系统（重新加载页面）
  - `shutdown` 或 `off`: 关闭系统
  - `help`: 显示帮助信息

**示例**:
```bash
power reboot         # 重启系统
power shutdown       # 关闭系统
power help           # 显示帮助
```

### `debug <action> [args...]`

调试工具，支持触发异常测试（用于测试异常处理机制）。

**权限要求**: ⚠️ **需要管理员权限**

**参数**:
- `action` (必需): 操作类型
  - `exception <level> [message]`: 触发指定等级的异常
    - `level` (必需): 异常等级
      - `kernel`: 内核异常（将进入BIOS安全模式）
      - `system`: 系统异常（将显示蓝屏并重启）
      - `program`: 程序异常（将终止当前程序）
      - `service`: 服务异常（仅记录日志）
    - `message` (可选): 异常消息，默认为测试消息

**示例**:
```bash
debug exception service "测试服务异常"    # 触发服务异常（仅记录日志）
debug exception program                  # 触发程序异常（终止当前程序）
debug exception system "系统资源耗尽"    # 触发系统异常（蓝屏并重启）
debug exception kernel "内核模块错误"    # 触发内核异常（进入BIOS安全模式）
debug                                   # 显示帮助信息
```

**警告**:
- ⚠️ **内核异常 (kernel)**: 将导致系统进入BIOS安全模式，系统重启后必须进入BIOS清除异常标志才能正常启动
- ⚠️ **系统异常 (system)**: 将强制停止所有程序，显示蓝屏，系统将在15-60秒后自动重启
- ⚠️ **程序异常 (program)**: 将导致当前程序（终端）被终止
- ✓ **服务异常 (service)**: 仅记录日志，不影响系统运行

**注意**: 此命令主要用于测试异常处理机制，请谨慎使用。

### `exit`

关闭当前终端程序进程。

**示例**:
```bash
exit
```

## 用户管理命令

### `login <username>`

切换用户登录。

**参数**:
- `username` (必需): 用户名

**示例**:
```bash
login alice          # 切换到 alice 用户
```

### `su <username>`

切换用户（与 `login` 相同）。

**参数**:
- `username` (必需): 用户名

**示例**:
```bash
su admin             # 切换到 admin 用户
```

### `users`

列出所有用户及其级别。

**示例**:
```bash
users
# 输出:
# 用户列表:
#   admin - 默认管理员 (当前)
#   alice - 用户
```

### `groups`

列出所有用户组。

**示例**:
```bash
groups
```

### `groupadd <name> [type] [desc]`

创建用户组（需要管理员权限）。

**参数**:
- `name` (必需): 组名
- `type` (可选): 类型（`USER_GROUP` 或 `ADMIN_GROUP`，默认为 `USER_GROUP`）
- `desc` (可选): 组描述

**示例**:
```bash
groupadd developers              # 创建用户组
groupadd admins ADMIN_GROUP      # 创建管理员组（需要默认管理员权限）
groupadd test "Test Group"       # 创建带描述的用户组
```

### `groupdel <name>`

删除用户组（需要默认管理员权限）。

**参数**:
- `name` (必需): 组名

**示例**:
```bash
groupdel test        # 删除用户组
```

### `groupmod <name> <op>`

修改用户组（需要管理员权限）。

**参数**:
- `name` (必需): 组名
- `op` (必需): 操作类型
  - `-a <username>`: 添加成员
  - `-d <username>`: 删除成员
  - `-m <description>`: 修改描述

**示例**:
```bash
groupmod developers -a alice     # 添加成员
groupmod developers -d bob       # 删除成员
groupmod developers -m "Dev Team" # 修改描述
```

### `groupinfo <name>`

显示用户组详细信息。

**参数**:
- `name` (必需): 组名

**示例**:
```bash
groupinfo developers
```

## 环境变量命令

### `env`

列出所有环境变量。

**示例**:
```bash
env
# 输出:
# 环境变量列表:
#   PATH=C:/bin
#   HOME=C:/Users/alice
```

### `setenv <name> <value>`

设置环境变量。

**参数**:
- `name` (必需): 环境变量名
- `value` (必需): 环境变量值（支持包含空格的值）

**示例**:
```bash
setenv PATH "C:/bin;C:/tools"   # 设置环境变量
setenv MYAPP_HOME "C:/myapp"    # 设置环境变量
```

**注意**: 普通用户只能读取环境变量，只有管理员可以设置、修改和删除环境变量。

### `export <name>=<value>`

设置环境变量（与 `setenv` 相同，支持两种格式）。

**参数**:
- `name=value` (格式1): 使用等号分隔
- `name` 和 `value` (格式2): 分别作为两个参数

**示例**:
```bash
export PATH="C:/bin"            # 格式1: 使用等号
export MYAPP_HOME "C:/myapp"    # 格式2: 分别指定
```

**注意**: 普通用户只能读取环境变量，只有管理员可以设置、修改和删除环境变量。

### `unsetenv <name>`

删除环境变量。

**参数**:
- `name` (必需): 环境变量名

**示例**:
```bash
unsetenv MYAPP_HOME             # 删除环境变量
```

**注意**: 只有管理员可以删除环境变量。

### `unset <name>`

删除环境变量（与 `unsetenv` 相同）。

**参数**:
- `name` (必需): 环境变量名

**示例**:
```bash
unset PATH                      # 删除环境变量
```

**注意**: 只有管理员可以删除环境变量。

### `getenv <name>`

获取环境变量值。

**参数**:
- `name` (必需): 环境变量名

**示例**:
```bash
getenv PATH
# 输出: PATH=C:/bin
```

## 编辑器命令

### `vim [file]`

Vim 文本编辑器（支持 Normal/Insert/Command 模式，支持鼠标滚轮滚动）。

**参数**:
- `file` (可选): 要编辑的文件路径

**示例**:
```bash
vim                 # 启动 Vim 编辑器
vim file.txt        # 编辑指定文件
```

## 其他命令

### `help`

显示所有支持的命令及其用法。

**示例**:
```bash
help
```

### `demo`

演示脚本。

**示例**:
```bash
demo
```

### `toggleview`

切换视图。

**示例**:
```bash
toggleview
```

## 命令自动补全

终端支持 Tab 键自动补全：

- 输入命令的前几个字符，然后按 `Tab` 键
- 如果有多个匹配项，会显示补全面板
- 使用 `Tab` 或 `Shift+Tab` 在候选之间循环
- 按 `Enter` 选择当前候选

支持自动补全的内容：
- 所有内置命令
- 已注册的程序（CLI 和 GUI）
- 文件和目录名（当前目录）

## 环境变量作为命令

环境变量可以设置为程序名或文件路径，用于创建命令别名：

**示例**:
```bash
# 设置环境变量为程序名
export es escalate
es                  # 执行 escalate 程序

# 设置环境变量为文件路径
export myapp "D:/application/myapp/myapp.js"
myapp               # 执行指定路径的程序
```

**注意**: 
- 如果环境变量值是文件路径（包含 `/` 或 `\`，或以 `.js` 结尾），终端会读取文件内容并作为程序执行
- 如果环境变量值是程序名，终端会从程序注册表中查找并执行
- 环境变量值对应的程序必须符合 ZerOS 程序规范（包含 `__init__` 和 `__info__` 方法）

## D:/bin/ 目录

可以将 `.js` 文件放在 `D:/bin/` 目录下，文件名即为命令名：

**示例**:
```bash
# 如果存在 D:/bin/mycommand.js
mycommand           # 会自动执行 D:/bin/mycommand.js
```

**注意**:
- 文件必须是有效的 ZerOS 程序（包含 `__init__` 和 `__info__` 方法）
- 如果文件不存在或无效，终端会静默继续查找其他位置（程序注册表、环境变量）
- 不会显示错误信息，因为文件不存在是正常情况

## 相关文档

- [TerminalAPI.md](./API/TerminalAPI.md) - 终端 API（供 CLI 程序使用）
- [ProcessManager.md](./API/ProcessManager.md) - 进程管理
- [LStorage.md](./API/LStorage.md) - 本地存储（环境变量存储）
- [PermissionManager.md](./API/PermissionManager.md) - 权限管理

