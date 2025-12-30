# CVS-ZEROS-007: 勒索病毒模拟程序技术文档

**漏洞编号**: CVS-ZEROS-007  
**发现日期**: 2025-12-24  
**最后更新**: 2025-12-30  
**严重程度**: 严重 (CVSS 9.5)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-434 (危险文件类型上传), CWE-749 (暴露危险方法或函数)  
**状态**: 安全测试程序  
**程序版本**: 3.2.0

---

## 概述

本文档详细记录了 ZerOS 勒索病毒模拟程序 (`escalate.js`) 所利用的所有技术和实现细节。该程序用于模拟真实的勒索病毒攻击，测试系统的安全防护能力。

**⚠️ 警告**: 此程序仅用于 ZerOS 系统安全测试，请勿在真实环境中使用！

---

## 程序功能

### 1. 启动前警告对话框

**技术**: GUIManager API

**实现**:
- 使用 `GUIManager.showConfirm()` API 显示模态确认对话框
- 明确告知用户程序的危险性
- 要求用户明确确认后才能继续运行
- 使用 Promise 实现异步确认流程

**代码位置**: `_showWarningDialog()` 方法

**技术要点**:
```javascript
// 使用 GUIManager API 显示确认对话框
const message = `⚠️ 严重警告 ⚠️

这是 ZerOS 勒索病毒模拟程序！

此程序将执行以下破坏性操作：
• 修改桌面壁纸为勒索壁纸
• 重复发出噪音干扰
• 创建多个无法关闭的GUI窗口
• 在桌面创建大量快捷方式填充桌面（300个）
• 尝试破坏系统数据
• 发送大量通知干扰用户（150条）
• 干扰用户输入（鼠标和键盘）
• 创建虚假系统错误提示
• 破坏系统主题颜色
• 干扰剪贴板操作
• 创建全屏覆盖层

此程序仅用于 ZerOS 系统安全测试。

⚠️ 使用前请确保已备份重要数据！ ⚠️

确定要继续运行此程序吗？`;

return await GUIManager.showConfirm(message, '⚠️ 勒索病毒模拟程序警告', 'error');
```

**利用的 API**:
- `GUIManager.showConfirm()` - 显示确认对话框

**降级方案**: 如果 GUIManager 不可用，使用原生 `confirm()` 函数

---

### 2. 勒索壁纸创建与设置

**技术**: SVG 动态生成 + DOM 直接操作

**实现**:
- 使用 SVG 创建动态勒索壁纸（包含动画效果）
- 使用 `encodeURIComponent()` 将 SVG 转换为 Data URL（格式：`data:image/svg+xml;charset=utf-8,` + 编码内容）
- **直接修改 DOM 元素的 `backgroundImage` 样式**（避免 ThemeManager 路径处理问题）
- 可选：通过 ThemeManager 注册背景（仅用于记录，不影响功能）

**代码位置**: `_createRansomWallpaper()` 方法

**技术要点**:
```javascript
// SVG 转换为 Data URL（使用 encodeURIComponent，不是 base64）
const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);

// 直接修改 DOM（最可靠的方法）
const desktop = document.getElementById('desktop');
desktop.style.backgroundImage = `url(${svgDataUrl})`;
desktop.style.backgroundSize = 'cover';
desktop.style.backgroundPosition = 'center';
desktop.style.backgroundRepeat = 'no-repeat';

// 可选：尝试通过 ThemeManager 保存（但不依赖它）
ThemeManager.registerDesktopBackground('ransomware-test', {...});
```

**利用的 API**:
- DOM 直接操作（无需权限）
- `ThemeManager.registerDesktopBackground()` - 可选，需要 `THEME_WRITE` 权限
- `ThemeManager.setDesktopBackground()` - 可选，需要 `THEME_WRITE` 权限

**修复说明**: 
- v3.2.0 版本修复了壁纸设置问题（ThemeManager 将 Data URL 当作 HTTP 路径导致 403 错误）
- 现在使用直接 DOM 操作，确保壁纸正确设置

---

### 3. 无法关闭的 GUI 窗口（主窗口）

**技术**: GUIManager API + 事件拦截 + 窗口监控

**实现**:
- 使用 `GUIManager.registerWindow()` 注册窗口
- 设置 `closable: false` 选项禁止关闭
- 拦截关闭按钮的点击事件
- 定期检查窗口状态，如果被关闭则重新创建
- **拦截所有退出快捷键**（Ctrl+E, Ctrl+Q, Ctrl+W, Alt+F4）
- 强制窗口最大化并定期检查恢复
- **先添加到容器确保可见**，然后再注册到 GUIManager
- 立即最大化窗口并聚焦
- 多次调用确保窗口正确显示（50ms, 200ms, 500ms）
- 定期强制全屏（每500ms检查一次）

**修复说明**:
- v3.2.0 版本修复了窗口创建失败的问题
- 增强了错误处理和日志记录
- 添加了容器查找的降级方案（尝试多个可能的容器位置）

**代码位置**: `_createRansomWindow()` 和 `_preventWindowClose()` 方法

**技术要点**:
```javascript
// 注册窗口时禁止关闭
GUIManager.registerWindow(this.pid, this.window, {
    closable: false,  // 禁止关闭
    minimizable: false,  // 禁止最小化
    maximizable: true
});

// 拦截关闭按钮
closeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
};

// 拦截所有退出快捷键
EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
    // 阻止 Alt+F4
    if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    
    // 阻止 Ctrl+E
    if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    
    // 阻止 Ctrl+Q
    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    
    // 阻止 Ctrl+W
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
});

// 定期检查并恢复窗口
setInterval(() => {
    const windows = GUIManager.getWindowsByPid(this.pid);
    if (!windows || windows.length === 0) {
        this._createRansomWindow();  // 重新创建
    }
}, 2000);
```

**利用的 API**:
- `GUIManager.registerWindow()` - 需要 `GUI_WINDOW_CREATE` 权限
- `GUIManager.maximizeWindow()` - 需要 `GUI_WINDOW_MANAGE` 权限
- `GUIManager.getWindowsByPid()` - 需要 `GUI_WINDOW_MANAGE` 权限
- `EventManager.registerEventHandler()` - 需要 `EVENT_LISTENER` 权限

**防护绕过技术**:
1. **关闭按钮拦截**: 阻止点击事件传播，禁用按钮指针事件
2. **窗口监控**: 定期检查窗口是否存在，如果被关闭则重新创建
3. **强制最大化**: 定期检查窗口状态，如果不是最大化则强制最大化
4. **焦点劫持**: 定期检查窗口焦点，如果失去焦点则重新获得焦点
5. **键盘拦截**: 拦截所有退出快捷键（Ctrl+E, Ctrl+Q, Ctrl+W, Alt+F4），所有被拦截的快捷键都会显示通知提示

---

### 4. 重复噪音播放

**技术**: Web Audio API (AudioContext)

**实现**:
- 使用 `AudioContext` 创建音频上下文
- 生成白噪音（随机音频数据）
- 使用 `OscillatorNode` 创建警报声
- 循环播放噪音和警报声

**代码位置**: `_startNoise()` 方法

**技术要点**:
```javascript
// 创建音频上下文
this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

// 生成白噪音
const buffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;  // 随机值 -1 到 1
}

// 创建警报声
const oscillator = this.audioContext.createOscillator();
oscillator.type = 'sine';
oscillator.frequency.value = 800;
```

**噪音类型**:
1. **白噪音**: 使用随机数据生成，每 5 秒重新生成
2. **警报声**: 使用正弦波振荡器，每 3 秒播放一次

**影响**: 干扰用户操作，造成心理压力

---

### 5. 大量通知干扰

**技术**: NotificationManager API

**实现**:
- 使用 `NotificationManager.createNotification()` 发送通知
- 批量发送多条通知（最多 30 条）
- 每条通知间隔 1.5 秒

**代码位置**: `_spamNotifications()` 方法

**技术要点**:
```javascript
NotificationManager.createNotification(this.pid, {
    type: 'snapshot',
    title: '⚠️ 系统警告',
    content: `这是第 ${count} 条测试通知\n勒索病毒模拟程序正在运行\n桌面已被快捷方式填充！`,
    duration: 5000
});
```

**利用的 API**:
- `NotificationManager.createNotification()` - 需要 `SYSTEM_NOTIFICATION` 权限

**影响**: 干扰用户界面，造成视觉干扰

**增强内容（v3.2.0）**:
- 通知数量从 30 条增加到 **150 条**
- 发送间隔从 1.5 秒缩短到 **0.8 秒**
- 更频繁的通知轰炸，造成更强的干扰

---

### 6. 系统数据破坏尝试

**技术**: LStorage API + ProcessManager.callKernelAPI

**实现**:
- 修改系统存储数据
- 删除文件
- 清空缓存
- 创建大量测试文件
- 修改进程表（应该被阻止）

**代码位置**: `_attemptDataDestruction()` 方法

#### 6.1 修改系统存储

**技术要点**:
```javascript
// 修改主题设置
await LStorage.setSystemStorage('system.theme', 'ransomware-theme');

// 创建恶意存储键
await LStorage.setSystemStorage('ransomware.test', {
    timestamp: Date.now(),
    message: 'This is a ransomware test',
    infected: true
});
```

**利用的 API**:
- `LStorage.setSystemStorage()` - 需要 `SYSTEM_STORAGE_WRITE` 权限

**防护**: 系统存储写入需要相应权限，危险键（如 `userControl.users`）需要危险权限，仅管理员可授予

#### 6.2 删除文件

**技术要点**:
```javascript
await ProcessManager.callKernelAPI(this.pid, 'FileSystem.delete', [filePath]);
```

**利用的 API**:
- `ProcessManager.callKernelAPI()` - 需要 `KERNEL_DISK_DELETE` 权限

**防护**: 文件删除需要 `KERNEL_DISK_DELETE` 权限，需要用户确认

#### 6.3 清空缓存

**技术要点**:
```javascript
await ProcessManager.callKernelAPI(this.pid, 'Cache.clear', [{}]);
```

**利用的 API**:
- `ProcessManager.callKernelAPI()` - 需要 `CACHE_WRITE` 权限

**防护**: 缓存清空需要 `CACHE_WRITE` 权限

#### 6.4 创建大量文件

**技术要点**:
```javascript
for (let i = 0; i < 5; i++) {
    const filePath = `C:/ransomware_test_${Date.now()}_${i}.txt`;
    const content = `Ransomware test file ${i}\n`.repeat(100);
    await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [filePath, content]);
}
```

**利用的 API**:
- `ProcessManager.callKernelAPI()` - 需要 `KERNEL_DISK_WRITE` 权限

**防护**: 文件写入需要 `KERNEL_DISK_WRITE` 权限，需要用户确认

#### 6.5 修改进程表（应该被阻止）

**技术要点**:
```javascript
const processInfo = ProcessManager.PROCESS_TABLE.get(this.pid);
// 尝试修改进程信息（应该被Proxy阻止）
// processInfo.isExploit = true;  // 这应该被阻止
```

**防护**: 进程表使用 Proxy 保护，直接修改会被阻止

---

### 10. 创建多个勒索窗口（v3.2.0 新增）

**技术**: DOM 直接操作

**实现**:
- 创建 3 个额外的全屏勒索窗口
- 窗口层叠显示，增加视觉干扰
- 每个窗口偏移 50px，形成层叠效果

**代码位置**: `_createAdditionalWindows()` 方法

**技术要点**:
```javascript
const windowCount = 3;
for (let i = 0; i < windowCount; i++) {
    const extraWindow = document.createElement('div');
    extraWindow.style.cssText = `
        position: fixed;
        left: ${(i * 50)}px;
        top: ${(i * 50)}px;
        width: ${screenWidth - (i * 100)}px;
        height: ${screenHeight - (i * 100)}px;
        background: rgba(0, 0, 0, 0.95);
        border: 5px solid #ff0000;
        z-index: ${99999 - i};
        ...
    `;
    guiContainer.appendChild(extraWindow);
}
```

**影响**: 创建多个全屏窗口，严重干扰用户界面

---

### 11. 干扰用户输入（v3.2.0 新增）

**技术**: DOM 事件拦截

**实现**:
- 干扰鼠标移动（10% 概率阻止事件）
- 阻止关键快捷键（Ctrl+Q, Ctrl+W 等）
- 监听 `mousemove`、`keydown`、`keypress` 事件

**代码位置**: `_interfereWithInput()` 方法

**技术要点**:
```javascript
// 干扰鼠标移动
this._mouseInterference = (e) => {
    if (Math.random() < 0.1) { // 10%概率干扰
        e.preventDefault();
    }
};

// 干扰键盘输入
this._keyboardInterference = (e) => {
    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q' || e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
};

document.addEventListener('mousemove', this._mouseInterference, true);
document.addEventListener('keydown', this._keyboardInterference, true);
```

**影响**: 干扰用户正常操作，造成操作困难

---

### 12. 创建虚假系统错误（v3.2.0 新增）

**技术**: DOM 动态创建

**实现**:
- 创建 20 个虚假错误提示
- 显示系统文件损坏、内存错误等虚假警告
- 带滑动动画效果（slideIn/slideOut）
- 错误提示在屏幕右侧依次显示

**代码位置**: `_createFakeErrors()` 方法

**技术要点**:
```javascript
const errorMessages = [
    '系统文件损坏',
    '内存访问错误',
    '磁盘读写失败',
    '网络连接中断',
    '进程异常终止',
    '系统资源耗尽',
    '安全模块失效',
    '数据完整性检查失败'
];

// 创建错误提示元素
const errorDiv = document.createElement('div');
errorDiv.style.cssText = `
    position: fixed;
    top: ${20 + (errorCount % 5) * 80}px;
    right: 20px;
    background: #ff0000;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    z-index: 99998;
    animation: slideIn 0.3s ease-out;
`;
errorDiv.textContent = `⚠️ 错误: ${message}`;
document.body.appendChild(errorDiv);
```

**影响**: 制造恐慌，让用户误以为系统出现问题

---

### 13. 破坏系统主题（v3.2.0 新增）

**技术**: CSS 变量修改

**实现**:
- 修改 CSS 变量（`--primary-color`、`--background-color`）
- 设置为红色警告主题
- 定期闪烁颜色（每秒一次）

**代码位置**: `_corruptSystemTheme()` 方法

**技术要点**:
```javascript
const root = document.documentElement;
root.style.setProperty('--primary-color', '#ff0000');
root.style.setProperty('--background-color', '#1a0000');

// 定期闪烁颜色
this._themeFlashInterval = setInterval(() => {
    const colors = ['#ff0000', '#ff3333', '#cc0000'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    root.style.setProperty('--primary-color', randomColor);
}, 1000);
```

**影响**: 改变系统外观，营造被攻击的氛围

---

### 14. 干扰剪贴板（v3.2.0 新增）

**技术**: Clipboard API + 事件拦截

**实现**:
- 监听复制/剪切操作
- 在剪贴板内容后添加警告信息
- 定期（30% 概率）清空剪贴板并替换为警告文本

**代码位置**: `_interfereWithClipboard()` 方法

**技术要点**:
```javascript
// 监听剪贴板操作
this._clipboardHandler = async (e) => {
    const originalText = await navigator.clipboard.readText().catch(() => '');
    if (originalText && !originalText.includes('RANSOMWARE_TEST')) {
        const modifiedText = originalText + '\n\n⚠️ 警告：系统已被感染！这是测试程序。';
        e.clipboardData.setData('text/plain', modifiedText);
    }
};

document.addEventListener('copy', this._clipboardHandler, true);
document.addEventListener('cut', this._clipboardHandler, true);

// 定期清空剪贴板
this._clipboardClearInterval = setInterval(async () => {
    if (Math.random() < 0.3) { // 30%概率清空
        await navigator.clipboard.writeText('⚠️ 系统已被感染！');
    }
}, 5000);
```

**影响**: 干扰用户复制粘贴操作，造成使用不便

---

### 15. 创建全屏覆盖层（v3.2.0 新增）

**技术**: DOM 动态创建

**实现**:
- 创建半透明全屏覆盖层
- 显示"系统已被感染"警告
- 带脉冲动画效果

**代码位置**: `_createFullscreenOverlay()` 方法

**技术要点**:
```javascript
const overlay = document.createElement('div');
overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 99997;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const warningText = document.createElement('div');
warningText.textContent = '⚠️ 系统已被感染 ⚠️';
warningText.style.cssText = `
    color: #ff0000;
    font-size: 48px;
    font-weight: bold;
    animation: pulse 2s infinite;
`;
overlay.appendChild(warningText);
document.body.appendChild(overlay);
```

**影响**: 创建视觉障碍，干扰用户操作

---

## 权限要求

程序需要以下权限才能正常运行：

| 权限 | 级别 | 说明 |
|------|------|------|
| `SYSTEM_STORAGE_WRITE` | NORMAL | 写入系统存储（基础权限） |
| `SYSTEM_STORAGE_READ` | NORMAL | 读取系统存储（基础权限） |
| `THEME_WRITE` | SPECIAL | 修改主题和壁纸（需要用户确认） |
| `DESKTOP_MANAGE` | SPECIAL | 管理桌面（需要用户确认） |
| `SYSTEM_NOTIFICATION` | SPECIAL | 发送系统通知（需要用户确认） |
| `GUI_WINDOW_CREATE` | NORMAL | 创建窗口（基础权限） |
| `GUI_WINDOW_MANAGE` | SPECIAL | 管理窗口（需要用户确认） |
| `KERNEL_DISK_DELETE` | SPECIAL | 删除文件（需要用户确认） |
| `KERNEL_DISK_WRITE` | SPECIAL | 写入文件（需要用户确认） |
| `CACHE_WRITE` | NORMAL | 写入缓存（基础权限） |

**注意**: 所有特殊权限（SPECIAL）需要用户确认，危险权限（DANGEROUS）需要管理员授权。

---

## 安全防护机制

### 1. 权限检查

所有破坏性操作都需要相应权限：
- 系统存储写入需要 `SYSTEM_STORAGE_WRITE` 权限
- 文件删除需要 `KERNEL_DISK_DELETE` 权限
- 主题修改需要 `THEME_WRITE` 权限

### 2. 危险键保护

危险系统存储键（如 `userControl.users`）需要危险权限，仅管理员可授予：
- `SYSTEM_STORAGE_WRITE_USER_CONTROL` - 写入用户控制相关存储
- `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` - 写入权限控制相关存储

### 3. 进程表保护

进程表使用 Proxy 保护，直接修改会被阻止：
- `ProcessManager.PROCESS_TABLE` 是受保护的 Map
- 尝试修改 `isExploit` 标志会被 Proxy 拦截

### 4. 调用栈验证

LStorage 使用调用栈验证来区分内核模块调用和用户程序调用：
- 内核模块调用可以写入危险键
- 用户程序调用需要相应权限

---

## 攻击流程

1. **启动警告**: 显示警告对话框，要求用户确认
2. **创建壁纸**: 生成并设置勒索壁纸（直接DOM操作）
3. **创建窗口**: 创建多个无法关闭的最大化窗口（1个主窗口 + 3个额外窗口）
4. **创建快捷方式**: 创建300个桌面快捷方式填充桌面
5. **播放噪音**: 开始循环播放噪音和警报声
6. **发送通知**: 批量发送150条干扰通知
7. **破坏数据**: 尝试修改系统数据、删除文件等
8. **干扰输入**: 干扰鼠标和键盘输入
9. **创建虚假错误**: 显示20个虚假系统错误提示
10. **破坏主题**: 修改系统主题颜色为红色警告色
11. **干扰剪贴板**: 修改和清空剪贴板内容
12. **创建覆盖层**: 创建全屏覆盖层显示警告
13. **防止关闭**: 持续监控窗口状态，防止关闭

---

## 防护建议

### 1. 权限管理

- 严格限制程序权限，只授予必要的权限
- 危险权限仅管理员可授予
- 定期审查程序权限

### 2. 窗口管理

- 实现窗口关闭强制机制（强制关闭选项）
- 限制窗口创建数量
- 实现窗口超时自动关闭机制

### 3. 音频管理

- 限制音频播放时长
- 实现音频播放权限管理
- 检测异常音频播放模式

### 4. 通知管理

- 限制通知发送频率
- 实现通知去重机制
- 检测通知滥用行为

### 5. 文件系统保护

- 实现文件删除确认机制
- 限制文件创建数量
- 实现文件操作审计日志

### 6. 系统存储保护

- 危险键需要危险权限
- 实现存储操作审计日志
- 限制存储键创建

---

## 测试场景

### 场景 1: 权限不足

当程序缺少必要权限时：
- 壁纸设置可能失败（需要 `THEME_WRITE` 权限）
- 文件删除会被阻止（需要 `KERNEL_DISK_DELETE` 权限）
- 系统存储修改会被阻止（需要相应权限）

### 场景 2: 窗口关闭尝试

用户尝试关闭窗口时：
- 关闭按钮被禁用或拦截
- **所有退出快捷键被拦截**（Ctrl+E, Ctrl+Q, Ctrl+W, Alt+F4）
- 被拦截的快捷键会显示通知提示
- 窗口被关闭后会自动重新创建

### 场景 3: 强制终止

用户强制终止进程时：
- 程序会正常退出（`__exit__` 方法被调用）
- 音频会停止播放
- 窗口会被清理

---

## 相关文件

- `system/service/DISK/D/application/escalate/escalate.js` - 勒索病毒模拟程序
- `kernel/process/permissionManager.js` - 权限管理器
- `kernel/drive/LStorage.js` - 本地存储管理器
- `system/ui/guiManager.js` - GUI 窗口管理器
- `system/ui/themeManager.js` - 主题管理器
- `system/ui/notificationManager.js` - 通知管理器

---

## 参考

- CVS-ZEROS-001: ProcessManager/PermissionManager/UserControl 权限提升漏洞（已修复）
- CVS-ZEROS-003: 终端命令处理权限绕过漏洞（已修复）
- CVS-ZEROS-005: LStorage 系统存储写入权限检查缺失漏洞（已修复）
- CVS-ZEROS-006: LStorage 内核模块调用验证绕过与 UserControl Proxy 保护机制绕过漏洞（已修复）

---

### 7. 桌面快捷方式填充

**技术**: DesktopManager API + ApplicationAssetManager

**实现**:
- 使用 `ApplicationAssetManager.listPrograms()` 获取所有可用程序
- 使用 `ProcessManager.callKernelAPI()` 调用 `Desktop.addShortcut` API
- 创建 **300 个快捷方式**，完全填充整个桌面
- 按网格排列，覆盖整个桌面区域
- 使用降级方案：如果内核 API 失败，直接调用 `DesktopManager.addShortcut()`
- **优化并发控制**：每 5 个暂停 300ms，每个之间额外延迟 50ms，避免 LStorage 验证失败

**代码位置**: `_floodDesktopWithShortcuts()` 方法

**技术要点**:
```javascript
// 创建大量快捷方式（300个）
const shortcutCount = 300;

for (let i = 0; i < shortcutCount; i++) {
    // 首先尝试内核 API
    try {
        iconId = await ProcessManager.callKernelAPI(this.pid, 'Desktop.addShortcut', [{...}]);
    } catch (e) {
        // 降级方案：直接调用 DesktopManager
        iconId = DesktopManager.addShortcut({...});
    }
    
    // 优化并发控制
    if (i % 5 === 4) {
        await new Promise(resolve => setTimeout(resolve, 300));
    } else {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}
```

**利用的 API**:
- `ApplicationAssetManager.listPrograms()` - 获取所有程序列表
- `ProcessManager.callKernelAPI()` - 需要 `DESKTOP_MANAGE` 权限
- `DesktopManager.addShortcut()` - 降级方案，需要 `DESKTOP_MANAGE` 权限

**影响**: 桌面被大量快捷方式填充（300个），严重干扰用户操作

**增强内容（v3.2.0）**:
- 快捷方式数量从 100 个增加到 **300 个**
- 优化并发控制，减少 LStorage 验证失败问题

---

### 8. 快捷键拦截（禁用所有退出方式）

**技术**: EventManager API

**实现**:
- 使用 `EventManager.registerEventHandler()` 注册键盘事件监听
- 拦截所有可能的退出快捷键：
  - **Ctrl+E**: 退出程序
  - **Ctrl+Q**: 退出程序
  - **Ctrl+W**: 关闭窗口
  - **Alt+F4**: 关闭窗口
- 所有被拦截的快捷键都会显示通知提示，但不会退出程序

**代码位置**: `_preventWindowClose()` 方法

**技术要点**:
```javascript
EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
    // 阻止 Alt+F4
    if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        // 显示通知提示
        NotificationManager.createNotification(this.pid, {
            type: 'snapshot',
            title: '⚠️ 无法关闭',
            content: 'Alt+F4 已被阻止\n这是测试程序的一部分',
            duration: 2000
        });
        return false;
    }
    
    // 阻止 Ctrl+E, Ctrl+Q, Ctrl+W
    if (e.ctrlKey && (e.key === 'e' || e.key === 'E' || 
                      e.key === 'q' || e.key === 'Q' || 
                      e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        e.stopPropagation();
        // 显示通知提示
        return false;
    }
});
```

**利用的 API**:
- `EventManager.registerEventHandler()` - 需要 `EVENT_LISTENER` 权限
- `NotificationManager.createNotification()` - 需要 `SYSTEM_NOTIFICATION` 权限

**影响**: 用户无法通过常规快捷键退出程序，只能通过强制终止进程或刷新页面退出

---

### 9. 管理员权限检查

**技术**: UserControl API

**实现**:
- 在程序启动时检查当前用户是否为管理员
- 使用 `UserControl.isAdmin()` 验证管理员权限
- 普通用户无法运行此程序

**代码位置**: `__init__()` 方法开始处

**技术要点**:
```javascript
if (typeof UserControl !== 'undefined') {
    await UserControl.ensureInitialized();
    const isAdmin = UserControl.isAdmin();
    if (!isAdmin) {
        throw new Error('需要管理员权限');
    }
}
```

**利用的 API**:
- `UserControl.isAdmin()` - 检查管理员权限
- `UserControl.ensureInitialized()` - 确保用户系统已初始化

**安全策略**: 只有管理员可以运行此危险程序

---

## 退出方法

**⚠️ 重要**: 所有常规退出快捷键已被禁用！

程序只能通过以下方式退出：

1. **强制终止**: 通过任务管理器或 `ProcessManager.killProgram()` 强制终止进程
2. **刷新页面**: 刷新浏览器页面会终止所有程序

**被禁用的快捷键**:
- ❌ Ctrl+E（退出程序）
- ❌ Ctrl+Q（退出程序）
- ❌ Ctrl+W（关闭窗口）
- ❌ Alt+F4（关闭窗口）

所有被拦截的快捷键都会显示通知提示，但不会退出程序。

**退出时会清理**:
- 停止音频播放
- 清理键盘事件监听器
- 关闭窗口
- 清理所有资源

**注意**: 程序退出时**不会**清理创建的桌面快捷方式，这些快捷方式会保留在桌面上，需要用户手动清理。

---

**文档状态**: ✅ 已完成  
**最后更新**: 2025-12-30  
**维护者**: ZerOS 安全团队

---

## 更新日志

### 2025-12-30 (v3.2.0 - 破坏性增强更新)

1. **大幅增强破坏性功能**:
   - 桌面快捷方式数量从 100 个增加到 **300 个**
   - 通知数量从 30 条增加到 **150 条**
   - 通知间隔从 1.5 秒缩短到 **0.8 秒**

2. **新增破坏性功能**:
   - **创建多个勒索窗口**: 新增 `_createAdditionalWindows()` 方法，创建 3 个额外的全屏勒索窗口
   - **干扰用户输入**: 新增 `_interfereWithInput()` 方法，干扰鼠标移动和键盘输入
   - **创建虚假系统错误**: 新增 `_createFakeErrors()` 方法，创建 20 个虚假错误提示
   - **破坏系统主题**: 新增 `_corruptSystemTheme()` 方法，修改系统主题颜色为红色警告色
   - **干扰剪贴板**: 新增 `_interfereWithClipboard()` 方法，修改和清空剪贴板内容
   - **创建全屏覆盖层**: 新增 `_createFullscreenOverlay()` 方法，创建半透明全屏覆盖层

3. **修复重要问题**:
   - **壁纸设置问题**: 修复了 ThemeManager 将 Data URL 当作 HTTP 路径导致 403 错误的问题，现在使用直接 DOM 操作
   - **GUI窗口创建问题**: 修复了窗口创建失败的问题，增强了错误处理和日志记录
   - **LStorage并发问题**: 优化了快捷方式创建的并发控制，每 5 个暂停 300ms，每个之间额外延迟 50ms，减少验证失败

4. **增强资源清理**:
   - 在 `__exit__` 方法中添加了所有新功能的清理逻辑
   - 确保退出时正确清理所有资源（额外窗口、输入干扰、剪贴板干扰、主题恢复等）

5. **增强错误处理**:
   - 添加了详细的调试日志
   - 改进了容器查找的降级方案
   - 增强了窗口创建的可靠性

### 2025-12-24 (v3.1.0)

1. **禁用所有退出快捷键**: 
   - 移除了 Ctrl+E 快捷键退出功能
   - 拦截所有退出快捷键（Ctrl+E, Ctrl+Q, Ctrl+W, Alt+F4）
   - 所有被拦截的快捷键都会显示通知提示

2. **使用标准 API**:
   - 警告对话框改为使用 `GUIManager.showConfirm()` API
   - 移除了自定义 DOM 创建代码

3. **简化退出清理**:
   - 移除了桌面快捷方式的自动清理
   - 保留了必要的资源清理（音频、窗口、事件监听器）

4. **增强通知干扰**:
   - 通知数量从 20 条增加到 30 条
   - 通知间隔从 2 秒缩短到 1.5 秒

