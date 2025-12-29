// 桌面管理器
// 负责沙盒环境的桌面实现，包括快捷方式、桌面图标排列、右键菜单等
// 依赖：GUIManager, ThemeManager, ApplicationAssetManager, ContextMenuManager, ProcessManager

KernelLogger.info("DesktopManager", "模块初始化");

class DesktopManager {
    // 桌面容器元素
    static _desktopContainer = null;
    // 桌面图标容器
    static _iconsContainer = null;
    // 桌面图标数据 Map<iconId, IconData>
    static _icons = new Map();
    // 图标ID计数器
    static _iconIdCounter = 0;
    // 图标排列模式：'grid' (网格), 'list' (列表), 'auto' (自动)
    static _arrangementMode = 'grid';
    // 图标大小：'small', 'medium', 'large'
    static _iconSize = 'medium';
    // 是否自动排列
    static _autoArrange = true;
    // 图标间距（像素）
    static _iconSpacing = 20;
    // 是否已初始化
    static _initialized = false;
    // 存储键
    static STORAGE_KEY_ICONS = 'desktop.icons';
    static STORAGE_KEY_ARRANGEMENT = 'desktop.arrangement';
    static STORAGE_KEY_ICON_SIZE = 'desktop.iconSize';
    static STORAGE_KEY_AUTO_ARRANGE = 'desktop.autoArrange';
    
    // 桌面组件管理
    static _componentsContainer = null; // 桌面组件容器
    static _components = new Map(); // Map<componentId, ComponentData>
    static _componentIdCounter = 0; // 组件ID计数器
    static _componentsByPid = new Map(); // Map<pid, Set<componentId>> 用于快速查找程序创建的组件
    
    /**
     * 初始化桌面管理器
     * @returns {Promise<void>}
     */
    static async init() {
        if (DesktopManager._initialized) {
            KernelLogger.debug("DesktopManager", "已初始化，跳过");
            return;
        }
        
        if (typeof document === 'undefined') {
            KernelLogger.warn("DesktopManager", "document 不可用，跳过桌面初始化");
            return;
        }
        
        KernelLogger.info("DesktopManager", "初始化桌面管理器");
        
        // 获取桌面容器（gui-container）
        DesktopManager._desktopContainer = document.getElementById('gui-container');
        if (!DesktopManager._desktopContainer) {
            KernelLogger.warn("DesktopManager", "桌面容器不存在，等待容器创建");
            // 延迟初始化
            setTimeout(() => DesktopManager.init(), 100);
            return;
        }
        
        // 创建图标容器
        DesktopManager._createIconsContainer();
        
        // 创建桌面组件容器
        DesktopManager._createComponentsContainer();
        
        // 从存储加载桌面配置
        await DesktopManager._loadDesktopConfig();
        
        // 等待任务栏位置加载（如果 TaskbarManager 可用）
        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager._loadTaskbarPosition === 'function') {
            try {
                await TaskbarManager._loadTaskbarPosition();
                // 任务栏位置加载后，更新图标容器布局
                DesktopManager._updateIconsContainerLayout();
            } catch (e) {
                KernelLogger.warn("DesktopManager", `加载任务栏位置失败: ${e.message}`);
            }
        }
        
        // 加载桌面图标
        await DesktopManager._loadDesktopIcons();
        
        // 注册桌面右键菜单
        DesktopManager._registerDesktopContextMenu();
        
        // 监听主题和风格变更
        DesktopManager._setupThemeListeners();
        
        // 设置键盘监听（Tab 键切换通知栏）
        DesktopManager._setupKeyboardListeners();
        
        // 注册到POOL
        DesktopManager._registerToPool();
        
        DesktopManager._initialized = true;
        KernelLogger.info("DesktopManager", "桌面管理器初始化完成");
        
        // 初始化完成后，尝试强制保存一次（确保之前未保存的图标被保存）
        setTimeout(async () => {
            if (DesktopManager._icons.size > 0) {
                await DesktopManager._forceSaveDesktopIcons();
            }
        }, 2000); // 延迟2秒，确保文件系统完全初始化
    }
    
    /**
     * 创建图标容器
     */
    static _createIconsContainer() {
        if (!DesktopManager._desktopContainer) {
            return;
        }
        
        // 如果已存在，先移除
        const existing = DesktopManager._desktopContainer.querySelector('.desktop-icons-container');
        if (existing) {
            existing.remove();
        }
        
        // 创建图标容器
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'desktop-icons-container';
        iconsContainer.style.display = 'block';
        iconsContainer.style.visibility = 'visible';
        
        DesktopManager._iconsContainer = iconsContainer;
        DesktopManager._desktopContainer.appendChild(iconsContainer);
        
        KernelLogger.debug("DesktopManager", "图标容器已创建并添加到桌面");
        
        // 根据任务栏位置调整容器布局
        DesktopManager._updateIconsContainerLayout();
        
        // 应用当前排列模式
        DesktopManager._applyArrangementMode();
        
        // 监听窗口大小变化和任务栏位置变化
        DesktopManager._setupLayoutListeners();
    }
    
    /**
     * 更新图标容器布局（根据任务栏位置）
     */
    static _updateIconsContainerLayout() {
        if (!DesktopManager._iconsContainer || !DesktopManager._desktopContainer) {
            return;
        }
        
        // 获取任务栏位置和尺寸
        const taskbarInfo = DesktopManager._getTaskbarInfo();
        const taskbarPosition = taskbarInfo.position;
        const taskbarWidth = taskbarInfo.width;
        const taskbarHeight = taskbarInfo.height;
        
        // 获取桌面容器尺寸
        const containerRect = DesktopManager._desktopContainer.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        
        // 根据任务栏位置计算图标容器的位置和尺寸
        let top = 0;
        let left = 0;
        let width = containerWidth;
        let height = containerHeight;
        
        switch (taskbarPosition) {
            case 'top':
                top = taskbarHeight;
                height = containerHeight - taskbarHeight;
                break;
            case 'bottom':
                // top 保持 0
                height = containerHeight - taskbarHeight;
                break;
            case 'left':
                left = taskbarWidth;
                width = containerWidth - taskbarWidth;
                break;
            case 'right':
                // left 保持 0
                width = containerWidth - taskbarWidth;
                break;
            default:
                // 默认底部，但这里已经处理了
                height = containerHeight - taskbarHeight;
                break;
        }
        
        // 应用布局样式（位置和尺寸）
        DesktopManager._iconsContainer.style.position = 'absolute';
        DesktopManager._iconsContainer.style.top = `${top}px`;
        DesktopManager._iconsContainer.style.left = `${left}px`;
        DesktopManager._iconsContainer.style.width = `${width}px`;
        DesktopManager._iconsContainer.style.height = `${height}px`;
        DesktopManager._iconsContainer.style.padding = `${DesktopManager._iconSpacing}px`;
        DesktopManager._iconsContainer.style.boxSizing = 'border-box';
        DesktopManager._iconsContainer.style.overflow = 'hidden'; // 改为 hidden，防止图标溢出
        DesktopManager._iconsContainer.style.pointerEvents = 'none';
        DesktopManager._iconsContainer.style.zIndex = '10';
        DesktopManager._iconsContainer.style.display = 'block';
        DesktopManager._iconsContainer.style.visibility = 'visible';
        
        // 强制浏览器重新计算布局（确保 clientWidth/clientHeight 更新）
        void DesktopManager._iconsContainer.offsetWidth;
        
        // 调试日志：输出容器尺寸信息
        const actualWidth = DesktopManager._iconsContainer.clientWidth || DesktopManager._iconsContainer.offsetWidth || 0;
        const actualHeight = DesktopManager._iconsContainer.clientHeight || DesktopManager._iconsContainer.offsetHeight || 0;
        KernelLogger.debug("DesktopManager", `图标容器布局更新: 桌面容器 ${containerWidth}x${containerHeight}, 设置尺寸 ${width}x${height}, 实际可用 ${actualWidth}x${actualHeight}, 任务栏位置 ${taskbarPosition}, 任务栏尺寸 ${taskbarWidth}x${taskbarHeight}`);
        
        // 重新应用排列模式（确保排列样式正确）
        DesktopManager._applyArrangementMode();
        
        // 延迟重新排列图标，确保布局已完全更新
        requestAnimationFrame(() => {
            if (DesktopManager._autoArrange) {
                DesktopManager._arrangeIcons();
            }
        });
        
    }
    
    /**
     * 获取任务栏信息
     * @returns {Object} { position: string, width: number, height: number }
     */
    static _getTaskbarInfo() {
        let position = 'bottom';
        let width = 0;
        let height = 0;
        
        // 尝试从 TaskbarManager 获取位置
        if (typeof TaskbarManager !== 'undefined' && TaskbarManager._taskbarPosition) {
            position = TaskbarManager._taskbarPosition;
        } else {
            // 尝试从 DOM 元素获取
            const taskbar = document.getElementById('taskbar');
            if (taskbar) {
                if (taskbar.classList.contains('taskbar-top')) {
                    position = 'top';
                } else if (taskbar.classList.contains('taskbar-left')) {
                    position = 'left';
                } else if (taskbar.classList.contains('taskbar-right')) {
                    position = 'right';
                } else {
                    position = 'bottom';
                }
            }
        }
        
        // 获取任务栏尺寸
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            const taskbarRect = taskbar.getBoundingClientRect();
            width = taskbarRect.width || 0;
            height = taskbarRect.height || 0;
        } else {
            // 使用默认尺寸
            if (position === 'top' || position === 'bottom') {
                height = 60;
                width = 0; // 全宽
            } else {
                width = 60;
                height = 0; // 全高
            }
        }
        
        return { position, width, height };
    }
    
    /**
     * 设置布局监听器
     */
    static _setupLayoutListeners() {
        // 监听窗口大小变化
        let resizeTimeout = null;
        const handleResize = () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                DesktopManager._updateIconsContainerLayout();
                // 重新排列图标
                DesktopManager._arrangeIcons();
            }, 100);
        };
        
        // 使用 EventManager 注册窗口 resize 事件
        if (typeof EventManager !== 'undefined') {
            const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
            EventManager.registerEventHandler(exploitPid, 'resize', handleResize, {
                priority: 100,
                selector: null  // 监听 window 的 resize 事件
            });
        } else {
            // 降级：直接使用 addEventListener
            window.addEventListener('resize', handleResize);
        }
        
        // 监听任务栏位置变化（通过观察 DOM 变化）
        if (typeof MutationObserver !== 'undefined') {
            const taskbar = document.getElementById('taskbar');
            if (taskbar) {
                const observer = new MutationObserver(() => {
                    DesktopManager._updateIconsContainerLayout();
                    DesktopManager._arrangeIcons();
                });
                
                observer.observe(taskbar, {
                    attributes: true,
                    attributeFilter: ['class', 'style']
                });
            }
        }
        
        // 定期检查任务栏位置变化（作为后备方案）
        setInterval(() => {
            DesktopManager._updateIconsContainerLayout();
        }, 1000);
    }
    
    /**
     * 应用排列模式
     */
    static _applyArrangementMode() {
        if (!DesktopManager._iconsContainer) {
            return;
        }
        
        const container = DesktopManager._iconsContainer;
        
        // 保存当前的位置和尺寸样式
        const currentTop = container.style.top || '';
        const currentLeft = container.style.left || '';
        const currentWidth = container.style.width || '';
        const currentHeight = container.style.height || '';
        const currentPosition = container.style.position || '';
        const currentZIndex = container.style.zIndex || '';
        const currentPadding = container.style.padding || '';
        const currentBoxSizing = container.style.boxSizing || '';
        const currentOverflow = container.style.overflow || '';
        const currentPointerEvents = container.style.pointerEvents || '';
        
        if (DesktopManager._arrangementMode === 'grid') {
            // 网格排列
            container.style.display = 'grid';
            container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
            container.style.gridAutoRows = 'minmax(120px, auto)';
            container.style.gap = `${DesktopManager._iconSpacing}px`;
            container.style.alignContent = 'start';
            container.style.justifyItems = 'start';
            container.style.flexDirection = '';
        } else if (DesktopManager._arrangementMode === 'list') {
            // 列表排列（垂直）- 使用 block 布局，图标使用绝对定位
            container.style.display = 'block';
            container.style.flexDirection = '';
            container.style.alignItems = '';
            container.style.gap = '';
            container.style.gridTemplateColumns = '';
            container.style.gridAutoRows = '';
            container.style.alignContent = '';
            container.style.justifyItems = '';
        } else {
            // 自动排列（自由拖拽）
            container.style.display = 'block';
            container.style.position = 'relative';
            container.style.flexDirection = '';
            container.style.gridTemplateColumns = '';
            container.style.gridAutoRows = '';
            container.style.alignContent = '';
            container.style.justifyItems = '';
            container.style.gap = '';
        }
        
        // 恢复位置和尺寸样式
        if (currentPosition) container.style.position = currentPosition;
        if (currentTop) container.style.top = currentTop;
        if (currentLeft) container.style.left = currentLeft;
        if (currentWidth) container.style.width = currentWidth;
        if (currentHeight) container.style.height = currentHeight;
        if (currentZIndex) container.style.zIndex = currentZIndex;
        if (currentPadding) container.style.padding = currentPadding;
        if (currentBoxSizing) container.style.boxSizing = currentBoxSizing;
        if (currentOverflow) container.style.overflow = currentOverflow;
        if (currentPointerEvents) container.style.pointerEvents = currentPointerEvents;
        
        // 重新排列图标
        DesktopManager._arrangeIcons();
    }
    
    /**
     * 排列图标
     */
    static _arrangeIcons() {
        if (!DesktopManager._iconsContainer) {
            KernelLogger.warn("DesktopManager", "图标容器不存在，无法排列图标");
            return;
        }
        
        if (DesktopManager._icons.size === 0) {
            return;
        }
        
        // 如果排列模式是 'auto'，默认使用网格模式
        const effectiveMode = DesktopManager._arrangementMode === 'auto' ? 'grid' : DesktopManager._arrangementMode;
        
        if (DesktopManager._autoArrange && effectiveMode === 'grid') {
            // 网格自动排列
            DesktopManager._arrangeIconsGrid();
        } else if (DesktopManager._autoArrange && effectiveMode === 'list') {
            // 列表自动排列
            DesktopManager._arrangeIconsList();
        } else {
            // 使用保存的位置
            DesktopManager._restoreIconPositions();
        }
    }
    
    /**
     * 网格排列图标
     */
    static _arrangeIconsGrid() {
        const icons = Array.from(DesktopManager._icons.values());
        const container = DesktopManager._iconsContainer;
        
        if (!container) {
            KernelLogger.warn("DesktopManager", "图标容器不存在，无法进行网格排列");
            return;
        }
        
        // 强制浏览器重新计算布局（确保获取最新的尺寸）
        void container.offsetWidth;
        
        // 使用 clientWidth/clientHeight 获取实际可用空间（不包括 padding）
        // 注意：clientWidth 已经减去了 padding，所以这就是实际可用宽度
        let containerWidth = container.clientWidth || 0;
        let containerHeight = container.clientHeight || 0;
        
        // 如果 clientWidth/clientHeight 为 0，尝试使用其他方法获取尺寸
        if (containerWidth === 0 || containerHeight === 0) {
            // 方法1：使用 getBoundingClientRect 获取实际尺寸（包括 padding）
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                // 使用 box-sizing: border-box，所以 rect.width/height 已经包含了 padding
                // 但我们需要的是内容区域，所以需要减去 padding
                const spacing = DesktopManager._iconSpacing;
                containerWidth = Math.max(0, rect.width - spacing * 2);
                containerHeight = Math.max(0, rect.height - spacing * 2);
            } else {
                // 方法2：使用 offsetWidth/offsetHeight（但需要确保足够大）
                const spacing = DesktopManager._iconSpacing;
                const offsetW = container.offsetWidth || 0;
                const offsetH = container.offsetHeight || 0;
                
                // 只有当 offsetWidth/offsetHeight 大于 padding * 2 时才使用
                if (offsetW > spacing * 2 && offsetH > spacing * 2) {
                    containerWidth = offsetW - spacing * 2;
                    containerHeight = offsetH - spacing * 2;
                } else {
                    // 容器还未完全布局，延迟排列
                    KernelLogger.debug("DesktopManager", `容器尺寸未就绪: offsetWidth=${offsetW}, offsetHeight=${offsetH}, 延迟排列`);
                    setTimeout(() => {
                        if (DesktopManager._autoArrange) {
                            DesktopManager._arrangeIcons();
                        }
                    }, 100);
                    return;
                }
            }
        }
        
        const iconWidth = DesktopManager._getIconWidth();
        const iconHeight = DesktopManager._getIconHeight();
        const spacing = DesktopManager._iconSpacing;
        
        // 确保容器尺寸有效
        if (containerWidth <= 0 || containerHeight <= 0) {
            KernelLogger.debug("DesktopManager", `容器尺寸无效: ${containerWidth}x${containerHeight}，延迟重试`);
            // 延迟重试，等待容器布局完成
            setTimeout(() => {
                if (DesktopManager._autoArrange) {
                    DesktopManager._arrangeIcons();
                }
            }, 100);
            return;
        }
        
        // 容器已经有 padding = spacing，所以 clientWidth 已经是可用宽度
        // 计算每行可容纳的图标数：可用宽度 / (图标宽度 + 间距)
        // 注意：不需要再减去 spacing，因为 padding 已经处理了边距
        const iconsPerRow = Math.max(1, Math.floor(containerWidth / (iconWidth + spacing)));
        
        // 计算每列可容纳的图标数
        const iconsPerCol = Math.max(1, Math.floor(containerHeight / (iconHeight + spacing)));
        
        // 调试日志
        if (icons.length > 0) {
            KernelLogger.debug("DesktopManager", `网格排列: 容器 ${containerWidth}x${containerHeight}, 图标 ${iconWidth}x${iconHeight}, 间距 ${spacing}, 每行 ${iconsPerRow} 个, 每列 ${iconsPerCol} 个, 共 ${icons.length} 个图标`);
        }
        
        icons.forEach((iconData, index) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (!iconElement) {
                return;
            }
            
            // 计算行列位置
            const row = Math.floor(index / iconsPerRow);
            const col = index % iconsPerRow;
            
            // 计算位置
            // 容器已经有 padding = spacing，所以第一个图标的位置就是 spacing
            // 后续图标位置：spacing + col * (iconWidth + spacing)
            let x = spacing + col * (iconWidth + spacing);
            let y = spacing + row * (iconHeight + spacing);
            
            // 边界检查：确保图标不会超出容器（考虑 padding）
            const maxX = containerWidth - iconWidth; // containerWidth 已经是 clientWidth（已减去 padding）
            const maxY = containerHeight - iconHeight; // containerHeight 已经是 clientHeight（已减去 padding）
            x = Math.max(spacing, Math.min(x, maxX));
            y = Math.max(spacing, Math.min(y, maxY));
            
            iconElement.style.position = 'absolute';
            iconElement.style.left = `${x}px`;
            iconElement.style.top = `${y}px`;
            iconElement.style.display = 'flex'; // 确保显示
        });
    }
    
    /**
     * 列表排列图标（支持多列垂直排列）
     * 列表模式：优先垂直排列，当一列排满后自动换到下一列
     */
    static _arrangeIconsList() {
        const icons = Array.from(DesktopManager._icons.values());
        const container = DesktopManager._iconsContainer;
        
        if (!container) {
            KernelLogger.warn("DesktopManager", "图标容器不存在，无法进行列表排列");
            return;
        }
        
        // 强制浏览器重新计算布局（确保获取最新的尺寸）
        void container.offsetWidth;
        
        // 使用 clientWidth/clientHeight 获取实际可用空间（不包括 padding）
        // 注意：clientWidth/clientHeight 已经减去了 padding，所以这就是实际可用尺寸
        let containerWidth = container.clientWidth || 0;
        let containerHeight = container.clientHeight || 0;
        
        // 如果 clientWidth/clientHeight 为 0，尝试使用其他方法获取尺寸
        if (containerWidth === 0 || containerHeight === 0) {
            // 使用 getBoundingClientRect 获取实际尺寸（包括 padding）
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const spacing = DesktopManager._iconSpacing;
                containerWidth = Math.max(0, rect.width - spacing * 2);
                containerHeight = Math.max(0, rect.height - spacing * 2);
            } else {
                // 容器还未完全布局，延迟排列
                KernelLogger.debug("DesktopManager", `列表排列: 容器尺寸未就绪，延迟排列`);
                setTimeout(() => {
                    if (DesktopManager._autoArrange) {
                        DesktopManager._arrangeIcons();
                    }
                }, 100);
                return;
            }
        }
        
        const iconWidth = DesktopManager._getIconWidth();
        const iconHeight = DesktopManager._getIconHeight();
        const spacing = DesktopManager._iconSpacing;
        
        // 确保容器尺寸有效
        if (containerWidth <= 0 || containerHeight <= 0) {
            KernelLogger.debug("DesktopManager", `列表排列: 容器尺寸无效: ${containerWidth}x${containerHeight}，延迟重试`);
            setTimeout(() => {
                if (DesktopManager._autoArrange) {
                    DesktopManager._arrangeIcons();
                }
            }, 100);
            return;
        }
        
        // 计算每列可容纳的图标数（垂直方向）
        // 容器已经有 padding，所以可用高度就是 containerHeight
        const iconsPerCol = Math.max(1, Math.floor(containerHeight / (iconHeight + spacing)));
        
        // 计算每行可容纳的列数（水平方向）
        // 容器已经有 padding，所以可用宽度就是 containerWidth
        const colsPerRow = Math.max(1, Math.floor(containerWidth / (iconWidth + spacing)));
        
        // 计算总列数（根据图标总数和每列图标数）
        const totalCols = Math.ceil(icons.length / iconsPerCol);
        // 实际使用的列数（不超过容器宽度限制）
        const actualCols = Math.min(totalCols, colsPerRow);
        
        // 调试日志
        if (icons.length > 0) {
            KernelLogger.debug("DesktopManager", `列表排列: 容器 ${containerWidth}x${containerHeight}, 图标 ${iconWidth}x${iconHeight}, 间距 ${spacing}, 每列 ${iconsPerCol} 个, 每行 ${colsPerRow} 列, 总列数 ${totalCols}, 实际列数 ${actualCols}, 共 ${icons.length} 个图标`);
        }
        
        icons.forEach((iconData, index) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (!iconElement) {
                return;
            }
            
            // 计算列索引（第几列）
            const col = Math.floor(index / iconsPerCol);
            // 计算行索引（在当前列中的位置）
            const row = index % iconsPerCol;
            
            // 计算位置
            // 容器已经有 padding = spacing，所以第一列第一个图标的位置是 spacing
            // 水平位置：spacing + col * (iconWidth + spacing)
            // 垂直位置：spacing + row * (iconHeight + spacing)
            let x = spacing + col * (iconWidth + spacing);
            let y = spacing + row * (iconHeight + spacing);
            
            // 边界检查：确保图标不会超出容器
            const maxX = containerWidth - iconWidth; // containerWidth 已经是 clientWidth（已减去 padding）
            const maxY = containerHeight - iconHeight; // containerHeight 已经是 clientHeight（已减去 padding）
            x = Math.max(spacing, Math.min(x, maxX));
            y = Math.max(spacing, Math.min(y, maxY));
            
            iconElement.style.position = 'absolute';
            iconElement.style.left = `${x}px`;
            iconElement.style.top = `${y}px`;
            iconElement.style.display = 'flex'; // 确保显示
        });
    }
    
    /**
     * 恢复图标位置
     */
    static _restoreIconPositions() {
        const container = DesktopManager._iconsContainer;
        if (!container) {
            KernelLogger.warn("DesktopManager", "图标容器不存在，无法恢复图标位置");
            return;
        }
        
        // 获取容器实际可用空间
        const containerWidth = container.clientWidth || container.offsetWidth || 0;
        const containerHeight = container.clientHeight || container.offsetHeight || 0;
        const iconWidth = DesktopManager._getIconWidth();
        const iconHeight = DesktopManager._getIconHeight();
        const spacing = DesktopManager._iconSpacing;
        
        DesktopManager._icons.forEach((iconData) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (!iconElement) {
                KernelLogger.warn("DesktopManager", `图标元素不存在，无法恢复位置: ${iconData.name} (ID: ${iconData.id})`);
                return;
            }
            
            // 在自由排列模式下，图标必须是绝对定位
            if (DesktopManager._arrangementMode === 'auto') {
                iconElement.style.position = 'absolute';
                
                if (iconData.position && iconData.position.x !== undefined && iconData.position.y !== undefined) {
                    // 验证并修正保存的位置，确保在容器边界内
                    let x = iconData.position.x;
                    let y = iconData.position.y;
                    
                    // 边界检查
                    const maxX = containerWidth - iconWidth - spacing;
                    const maxY = containerHeight - iconHeight - spacing;
                    x = Math.max(spacing, Math.min(x, maxX));
                    y = Math.max(spacing, Math.min(y, maxY));
                    
                    // 如果位置被修正，更新保存的位置
                    if (x !== iconData.position.x || y !== iconData.position.y) {
                        iconData.position = { x, y };
                        KernelLogger.debug("DesktopManager", `修正图标位置: ${iconData.name} (${iconData.position.x}, ${iconData.position.y}) -> (${x}, ${y})`);
                    }
                    
                    iconElement.style.left = `${x}px`;
                    iconElement.style.top = `${y}px`;
                    KernelLogger.debug("DesktopManager", `恢复图标位置: ${iconData.name} (${x}, ${y})`);
                } else {
                    // 如果没有保存的位置，使用默认位置（左上角开始，按顺序排列）
                    const index = Array.from(DesktopManager._icons.keys()).indexOf(iconData.id);
                    // 容器已经有 padding，clientWidth 已经是可用宽度
                    const iconsPerRow = Math.max(1, Math.floor(containerWidth / (iconWidth + spacing)));
                    const row = Math.floor(index / iconsPerRow);
                    const col = index % iconsPerRow;
                    
                    // 容器已经有 padding，第一个图标位置是 spacing
                    let x = spacing + col * (iconWidth + spacing);
                    let y = spacing + row * (iconHeight + spacing);
                    
                    // 边界检查
                    const maxX = containerWidth - iconWidth - spacing;
                    const maxY = containerHeight - iconHeight - spacing;
                    x = Math.max(spacing, Math.min(x, maxX));
                    y = Math.max(spacing, Math.min(y, maxY));
                    
                    iconElement.style.left = `${x}px`;
                    iconElement.style.top = `${y}px`;
                    
                    // 保存初始位置
                    iconData.position = { x, y };
                    KernelLogger.debug("DesktopManager", `设置默认图标位置: ${iconData.name} (${x}, ${y})`);
                }
            } else {
                // 非自由排列模式，确保图标位置被清除（由网格/列表排列方法设置）
                KernelLogger.debug("DesktopManager", `非自由排列模式，位置将由排列方法设置: ${iconData.name}`);
            }
        });
    }
    
    /**
     * 获取图标宽度
     */
    static _getIconWidth() {
        const sizes = {
            small: 64,
            medium: 80,
            large: 96
        };
        return sizes[DesktopManager._iconSize] || sizes.medium;
    }
    
    /**
     * 获取图标高度（包括标签）
     */
    static _getIconHeight() {
        const iconHeight = DesktopManager._getIconWidth();
        const labelHeight = 40; // 标签高度
        return iconHeight + labelHeight;
    }
    
    /**
     * 从存储加载桌面配置
     */
    static async _loadDesktopConfig() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("DesktopManager", "LStorage 不可用，使用默认配置");
            return;
        }
        
        try {
            // 加载排列模式
            const arrangement = await LStorage.getSystemStorage(DesktopManager.STORAGE_KEY_ARRANGEMENT);
            if (arrangement && ['grid', 'list', 'auto'].includes(arrangement)) {
                DesktopManager._arrangementMode = arrangement;
                KernelLogger.debug("DesktopManager", `从存储加载排列模式: ${arrangement}`);
            } else {
                // 如果没有保存的配置或配置无效，使用默认的网格模式
                DesktopManager._arrangementMode = 'grid';
                KernelLogger.debug("DesktopManager", `使用默认排列模式: grid`);
            }
            
            // 加载图标大小
            const iconSize = await LStorage.getSystemStorage(DesktopManager.STORAGE_KEY_ICON_SIZE);
            if (iconSize && ['small', 'medium', 'large'].includes(iconSize)) {
                DesktopManager._iconSize = iconSize;
            }
            
            // 加载自动排列设置
            const autoArrange = await LStorage.getSystemStorage(DesktopManager.STORAGE_KEY_AUTO_ARRANGE);
            if (typeof autoArrange === 'boolean') {
                DesktopManager._autoArrange = autoArrange;
            }
        } catch (e) {
            KernelLogger.warn("DesktopManager", `加载桌面配置失败: ${e.message}`);
        }
    }
    
    /**
     * 从存储加载桌面图标
     */
    static async _loadDesktopIcons() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("DesktopManager", "LStorage 不可用，桌面图标为空");
            return;
        }
        
        // 确保 LStorage 已初始化
        if (!LStorage._initialized) {
            KernelLogger.info("DesktopManager", "等待 LStorage 初始化...");
            try {
                await LStorage.init();
            } catch (e) {
                KernelLogger.error("DesktopManager", `LStorage 初始化失败: ${e.message}`, e);
                return;
            }
        }
        
        // 确保图标容器已创建
        if (!DesktopManager._iconsContainer) {
            KernelLogger.warn("DesktopManager", "图标容器未创建，尝试创建");
            DesktopManager._createIconsContainer();
            if (!DesktopManager._iconsContainer) {
                KernelLogger.error("DesktopManager", "无法创建图标容器，无法加载桌面图标");
                return;
            }
        }
        
        try {
            KernelLogger.info("DesktopManager", `从 PHP 存储加载桌面图标: Key=${DesktopManager.STORAGE_KEY_ICONS}`);
            const savedIcons = await LStorage.getSystemStorage(DesktopManager.STORAGE_KEY_ICONS);
            
            KernelLogger.debug("DesktopManager", `加载的图标数据: ${savedIcons ? (Array.isArray(savedIcons) ? `数组，长度=${savedIcons.length}` : `类型=${typeof savedIcons}`) : 'null'}`);
            
            if (savedIcons && Array.isArray(savedIcons) && savedIcons.length > 0) {
                let loadedCount = 0;
                let skippedCount = 0;
                
                // 恢复保存的图标
                for (let i = 0; i < savedIcons.length; i++) {
                    const iconData = savedIcons[i];
                    
                    // 验证图标数据的有效性
                    // 支持程序快捷方式（有 programName）和文件/文件夹图标（有 type 和 targetPath）
                    const isValidProgramIcon = iconData && iconData.programName && iconData.id !== undefined;
                    const isValidFileOrFolderIcon = iconData && iconData.type && iconData.targetPath && iconData.id !== undefined;
                    
                    if (isValidProgramIcon || isValidFileOrFolderIcon) {
                        DesktopManager._icons.set(iconData.id, iconData);
                        const element = DesktopManager._createIconElement(iconData);
                        if (element) {
                            loadedCount++;
                        } else {
                            skippedCount++;
                            KernelLogger.warn("DesktopManager", `创建图标元素失败: ${iconData.name} (ID: ${iconData.id})`);
                        }
                    } else {
                        skippedCount++;
                        KernelLogger.warn("DesktopManager", `图标数据无效，跳过: ${iconData?.name || '未知'}`);
                    }
                }
                
                // 更新图标ID计数器
                if (savedIcons.length > 0) {
                    const maxId = Math.max(...savedIcons.map(i => (i && i.id !== undefined) ? i.id : 0));
                    DesktopManager._iconIdCounter = Math.max(DesktopManager._iconIdCounter, maxId + 1);
                }
                
                if (loadedCount > 0) {
                    KernelLogger.info("DesktopManager", `已加载 ${loadedCount} 个桌面图标${skippedCount > 0 ? `，跳过 ${skippedCount} 个无效图标` : ''}`);
                }
                
                // 验证DOM中的图标元素数量（仅在数量不匹配时警告）
                if (DesktopManager._iconsContainer && skippedCount === 0) {
                    const domIcons = DesktopManager._iconsContainer.querySelectorAll('.desktop-icon');
                    if (domIcons.length !== DesktopManager._icons.size) {
                        KernelLogger.warn("DesktopManager", `图标数量不匹配！DOM: ${domIcons.length}, 内存: ${DesktopManager._icons.size}`);
                    }
                }
            } else if (savedIcons === null || savedIcons === undefined) {
                KernelLogger.info("DesktopManager", "没有保存的桌面图标数据（首次运行或数据未保存）");
            } else if (!Array.isArray(savedIcons)) {
                KernelLogger.warn("DesktopManager", `保存的图标数据格式错误: 期望数组，实际为 ${typeof savedIcons}, 值: ${JSON.stringify(savedIcons).substring(0, 200)}`);
            } else if (savedIcons.length === 0) {
                KernelLogger.info("DesktopManager", "桌面图标数组为空");
            }
        } catch (e) {
            KernelLogger.error("DesktopManager", `加载桌面图标失败: ${e.message}`, e);
            KernelLogger.error("DesktopManager", `错误堆栈: ${e.stack || '无堆栈信息'}`);
        }
        
        // 排列图标
        DesktopManager._arrangeIcons();
        
        KernelLogger.info("DesktopManager", `桌面图标加载完成，当前图标数量: ${DesktopManager._icons.size}`);
    }
    
    
    /**
     * 创建图标元素
     * @param {Object} iconData 图标数据
     */
    static _createIconElement(iconData) {
        if (!DesktopManager._iconsContainer) {
            KernelLogger.warn("DesktopManager", `无法创建图标元素: 图标容器不存在 (${iconData?.name || '未知'})`);
            return null;
        }
        
        // 检查是否已存在相同ID的图标元素
        const existingElement = document.getElementById(`desktop-icon-${iconData.id}`);
        if (existingElement) {
            KernelLogger.debug("DesktopManager", `图标元素已存在: ${iconData.name} (ID: ${iconData.id})`);
            return existingElement;
        }
        
        KernelLogger.debug("DesktopManager", `创建图标元素: ${iconData.name} (ID: ${iconData.id}, icon: ${iconData.icon || '无图标'})`);
        
        const iconId = iconData.id;
        const iconElement = document.createElement('div');
        iconElement.id = `desktop-icon-${iconId}`;
        iconElement.className = 'desktop-icon';
        iconElement.setAttribute('data-icon-id', iconId);
        
        // 应用图标大小
        const iconSize = DesktopManager._getIconWidth();
        
        // 图标样式
        iconElement.style.cssText = `
            position: absolute;
            width: ${iconSize}px;
            height: ${iconSize + 40}px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            cursor: pointer;
            user-select: none;
            pointer-events: auto;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 8px;
            padding: 8px;
            box-sizing: border-box;
        `;
        
        // 创建图标图片
        const iconImage = document.createElement('div');
        iconImage.className = 'desktop-icon-image';
        iconImage.style.cssText = `
            width: ${iconSize}px;
            height: ${iconSize}px;
            background: var(--theme-background-elevated, rgba(30, 30, 46, 0.6));
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
        `;
        
        // 使用 description 优先，如果没有则使用 name
        const displayName = iconData.description || iconData.name;
        
        // 检查是否是图片文件（需要显示缩略图）
        let isImageFile = false;
        let imageUrl = null;
        
        if (iconData.type === 'file' && iconData.targetPath) {
            // 检查文件扩展名是否是图片格式
            const fileName = iconData.targetPath.split('/').pop() || iconData.targetPath;
            const extension = fileName.split('.').pop()?.toLowerCase() || '';
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
            
            if (imageExts.includes(extension)) {
                isImageFile = true;
                // 转换虚拟路径为实际 URL
                imageUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                    ? ProcessManager.convertVirtualPathToUrl(iconData.targetPath)
                    : iconData.targetPath;
            }
        }
        
        // 加载图标或图片缩略图
        if (isImageFile && imageUrl) {
            // 图片文件：显示缩略图
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = displayName;
            img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                padding: 0;
            `;
            img.onerror = () => {
                // 图片加载失败，使用默认图标
                iconImage.innerHTML = `
                    <div style="
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: ${iconSize * 0.4}px;
                        color: var(--theme-text, #d7e0dd);
                        font-weight: bold;
                    ">${displayName.charAt(0).toUpperCase()}</div>
                `;
            };
            iconImage.appendChild(img);
        } else if (iconData.icon) {
            // 使用指定的图标
            const img = document.createElement('img');
            // 转换虚拟路径为实际 URL
            const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(iconData.icon)
                : iconData.icon;
            img.src = iconUrl;
            img.alt = displayName;
            img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: contain;
                padding: 8px;
            `;
            img.onerror = () => {
                // 图标加载失败，使用默认图标
                iconImage.innerHTML = `
                    <div style="
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: ${iconSize * 0.4}px;
                        color: var(--theme-text, #d7e0dd);
                        font-weight: bold;
                    ">${displayName.charAt(0).toUpperCase()}</div>
                `;
            };
            iconImage.appendChild(img);
        } else {
            // 无图标，显示文字
            iconImage.innerHTML = `
                <div style="
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: ${iconSize * 0.4}px;
                    color: var(--theme-text, #d7e0dd);
                    font-weight: bold;
                ">${displayName.charAt(0).toUpperCase()}</div>
            `;
        }
        
        // 创建图标标签
        const iconLabel = document.createElement('div');
        iconLabel.className = 'desktop-icon-label';
        // 使用 description 优先，如果没有则使用 name
        iconLabel.textContent = iconData.description || iconData.name;
        iconLabel.style.cssText = `
            width: 100%;
            text-align: center;
            font-size: 12px;
            color: var(--theme-text, #d7e0dd);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 4px;
            padding: var(--style-desktop-icon-padding, 2px 4px);
            border-radius: var(--style-desktop-icon-border-radius, 4px);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            background: var(--style-desktop-icon-background, transparent);
            backdrop-filter: var(--style-desktop-icon-backdrop-filter, none);
            -webkit-backdrop-filter: var(--style-desktop-icon-backdrop-filter, none);
        `;
        
        // 组装图标元素
        iconElement.appendChild(iconImage);
        iconElement.appendChild(iconLabel);
        
        // 添加鼠标事件
        DesktopManager._setupIconEvents(iconElement, iconData);
        
        // 添加到容器
        DesktopManager._iconsContainer.appendChild(iconElement);
        KernelLogger.debug("DesktopManager", `图标元素已添加到容器: ${iconData.name} (ID: ${iconData.id})`);
        
        // 在自由排列模式下，确保图标是绝对定位
        if (DesktopManager._arrangementMode === 'auto') {
            iconElement.style.position = 'absolute';
        }
        
        // 应用位置（如果有保存的位置）
        if (iconData.position && iconData.position.x !== undefined && iconData.position.y !== undefined) {
            iconElement.style.left = `${iconData.position.x}px`;
            iconElement.style.top = `${iconData.position.y}px`;
        }
        
        // 添加进入动画（确保图标最终可见）
        iconElement.style.opacity = '0';
        iconElement.style.transform = 'scale(0.8) translateY(-10px)';
        iconElement.style.visibility = 'visible';
        iconElement.style.display = 'flex';
        
        // 使用双重 requestAnimationFrame 确保动画执行
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                iconElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                iconElement.style.opacity = '1';
                iconElement.style.transform = 'scale(1) translateY(0)';
            });
        });
        
        // 备用方案：如果动画未执行，确保图标在500ms后可见
        setTimeout(() => {
            if (iconElement.style.opacity === '0' || iconElement.style.opacity === '') {
                KernelLogger.warn("DesktopManager", `图标动画未执行，强制显示: ${iconData.name}`);
                iconElement.style.opacity = '1';
                iconElement.style.transform = 'scale(1) translateY(0)';
                iconElement.style.transition = 'none';
            }
        }, 500);
        
        // 返回创建的元素
        return iconElement;
    }
    
    /**
     * 设置图标事件
     * @param {HTMLElement} iconElement 图标元素
     * @param {Object} iconData 图标数据
     */
    static _setupIconEvents(iconElement, iconData) {
        // 点击和双击事件处理（防止重复启动）
        let clickTimer = null;
        let isProcessing = false; // 防止重复处理标志
        
        iconElement.addEventListener('click', (e) => {
            // 如果刚刚发生了拖拽，阻止点击事件
            if (iconElement.dataset.dragging === 'true') {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            
            // 如果正在处理，忽略此次点击
            if (isProcessing) {
                return;
            }
            
            // 清除之前的定时器
            if (clickTimer) {
                clearTimeout(clickTimer);
            }
            
            // 延迟处理单击事件，等待可能的双击
            clickTimer = setTimeout(() => {
                if (!isProcessing) {
                    isProcessing = true;
                    DesktopManager._handleIconClick(iconData);
                    // 处理完成后重置标志
                    setTimeout(() => {
                        isProcessing = false;
                    }, 500);
                }
                clickTimer = null;
            }, 300); // 300ms 延迟，等待双击事件
        });
        
        // 双击事件（启动程序）
        iconElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            
            // 清除单击定时器
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            
            // 如果正在处理，忽略此次双击
            if (isProcessing) {
                return;
            }
            
            // 立即处理双击事件
            isProcessing = true;
            DesktopManager._handleIconClick(iconData);
            // 处理完成后重置标志
            setTimeout(() => {
                isProcessing = false;
            }, 500);
        });
        
        // 右键菜单
        // 将 iconData 保存到元素上，确保事件处理器能访问到
        iconElement._iconData = iconData;
        // 注意：右键菜单现在由 ContextMenuManager 统一处理
        // 不再需要直接添加事件监听器，ContextMenuManager._getDesktopMenu 会处理
        
        // 鼠标悬停效果
        iconElement.addEventListener('mouseenter', () => {
            const iconImageEl = iconElement.querySelector('.desktop-icon-image');
            const iconLabelEl = iconElement.querySelector('.desktop-icon-label');
            iconElement.style.transform = 'scale(1.1) translateY(-4px)';
            if (iconImageEl) {
                iconImageEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
            }
            if (iconLabelEl) {
                iconLabelEl.style.background = 'var(--style-desktop-icon-background-hover, var(--theme-background-elevated, rgba(30, 30, 46, 0.8)))';
            }
        });
        
        iconElement.addEventListener('mouseleave', () => {
            const iconImageEl = iconElement.querySelector('.desktop-icon-image');
            const iconLabelEl = iconElement.querySelector('.desktop-icon-label');
            iconElement.style.transform = 'scale(1) translateY(0)';
            if (iconImageEl) {
                iconImageEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }
            if (iconLabelEl) {
                iconLabelEl.style.background = 'var(--style-desktop-icon-background, transparent)';
            }
        });
        
        // 拖拽功能（所有模式都支持，但行为不同）
        DesktopManager._setupIconDrag(iconElement, iconData);
    }
    
    /**
     * 设置图标拖拽
     * @param {HTMLElement} iconElement 图标元素
     * @param {Object} iconData 图标数据
     */
    static _setupIconDrag(iconElement, iconData) {
        // 如果已经设置了拖拽，先移除旧的事件监听器
        if (iconElement._dragHandlers) {
            DesktopManager._removeIconDrag(iconElement);
        }
        
        let isDragging = false;
        let hasMoved = false; // 标记是否发生了实际移动
        let startX = 0;
        let startY = 0;
        let initialX = 0;
        let initialY = 0;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let targetIndex = -1; // 目标位置索引（用于 grid 和 list 模式）
        const DRAG_THRESHOLD = 5; // 拖拽阈值（像素），超过此距离才认为是拖拽
        
        const mousedownHandler = (e) => {
            if (e.button !== 0) return; // 只处理左键
            
            isDragging = true;
            hasMoved = false; // 重置移动标志
            startX = e.clientX;
            startY = e.clientY;
            targetIndex = -1;
            
            const rect = iconElement.getBoundingClientRect();
            const containerRect = DesktopManager._iconsContainer.getBoundingClientRect();
            initialX = rect.left - containerRect.left;
            initialY = rect.top - containerRect.top;
            
            // 计算鼠标相对于图标中心的偏移（用于 grid/list 模式）
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            
            iconElement.style.transition = 'none';
            iconElement.style.zIndex = '1000';
            iconElement.style.cursor = 'grabbing';
            
            // 标记这是一个拖拽操作，用于阻止点击事件
            iconElement.dataset.dragging = 'true';
            
            e.preventDefault();
            e.stopPropagation();
        };
        
        const mousemoveHandler = (e) => {
            if (!isDragging) return;
            
            const deltaX = Math.abs(e.clientX - startX);
            const deltaY = Math.abs(e.clientY - startY);
            
            // 如果移动距离超过阈值，认为是拖拽
            if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
                hasMoved = true;
            }
            
            if (!hasMoved) return; // 如果还没有移动超过阈值，不更新位置
            
            const containerRect = DesktopManager._iconsContainer.getBoundingClientRect();
            const moveDeltaX = e.clientX - startX;
            const moveDeltaY = e.clientY - startY;
            
            if (DesktopManager._arrangementMode === 'auto') {
                // 自由排列模式：自由拖拽
                let newX = initialX + moveDeltaX;
                let newY = initialY + moveDeltaY;
                
                // 边界检查：使用容器的实际可用空间（考虑 padding）
                const iconWidth = DesktopManager._getIconWidth();
                const iconHeight = DesktopManager._getIconHeight();
                const spacing = DesktopManager._iconSpacing;
                
                // 使用 clientWidth/clientHeight 获取实际可用空间
                const containerWidth = DesktopManager._iconsContainer.clientWidth || containerRect.width;
                const containerHeight = DesktopManager._iconsContainer.clientHeight || containerRect.height;
                
                // 确保图标不会超出容器边界（留出 spacing 的边距）
                const maxX = containerWidth - iconWidth - spacing;
                const maxY = containerHeight - iconHeight - spacing;
                newX = Math.max(spacing, Math.min(newX, maxX));
                newY = Math.max(spacing, Math.min(newY, maxY));
                
                iconElement.style.left = `${newX}px`;
                iconElement.style.top = `${newY}px`;
            } else {
                // Grid 或 List 模式：拖动时跟随鼠标，并检测目标位置
                const currentX = e.clientX - containerRect.left;
                const currentY = e.clientY - containerRect.top;
                
                // 更新拖动图标的位置（跟随鼠标）
                iconElement.style.left = `${currentX - dragOffsetX}px`;
                iconElement.style.top = `${currentY - dragOffsetY}px`;
                
                // 检测目标位置（应该插入到哪个位置）
                const newTargetIndex = DesktopManager._getTargetIndexForDrag(
                    iconElement, 
                    iconData, 
                    currentX, 
                    currentY
                );
                
                if (newTargetIndex !== targetIndex && newTargetIndex >= 0) {
                    targetIndex = newTargetIndex;
                    // 更新其他图标的位置（显示插入效果）
                    DesktopManager._updateIconPositionsForDrag(iconData.id, targetIndex);
                }
            }
        };
        
        const mouseupHandler = (e) => {
            if (!isDragging) return;
            
            const wasDragging = hasMoved; // 保存是否发生了拖拽
            
            isDragging = false;
            hasMoved = false;
            iconElement.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            iconElement.style.zIndex = '1';
            iconElement.style.cursor = 'pointer';
            
            // 如果发生了拖拽，阻止后续的点击事件
            if (wasDragging) {
                e.preventDefault();
                e.stopPropagation();
                
                if (DesktopManager._arrangementMode === 'auto') {
                    // 自由排列模式：保存位置
                    const rect = iconElement.getBoundingClientRect();
                    const containerRect = DesktopManager._iconsContainer.getBoundingClientRect();
                    iconData.position = {
                        x: rect.left - containerRect.left,
                        y: rect.top - containerRect.top
                    };
                } else {
                    // Grid 或 List 模式：交换顺序
                    if (targetIndex >= 0) {
                        DesktopManager._swapIconOrder(iconData.id, targetIndex);
                    }
                    // 重置所有图标的过渡效果
                    DesktopManager._icons.forEach((icon) => {
                        const element = document.getElementById(`desktop-icon-${icon.id}`);
                        if (element) {
                            element.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                        }
                    });
                    // 重新排列图标
                    DesktopManager._arrangeIcons();
                }
                
                DesktopManager._saveDesktopIcons().catch((e) => {
                    KernelLogger.error("DesktopManager", `拖拽后保存桌面图标失败: ${e.message}`, e);
                });
                
                // 延迟清除拖拽标志，确保点击事件被阻止
                setTimeout(() => {
                    delete iconElement.dataset.dragging;
                }, 100);
            } else {
                // 如果没有移动，清除标志，允许点击事件
                delete iconElement.dataset.dragging;
            }
        };
        
        // 保存事件处理器引用，以便后续移除
        iconElement._dragHandlers = {
            mousedown: mousedownHandler,
            mousemove: mousemoveHandler,
            mouseup: mouseupHandler
        };
        
        iconElement.addEventListener('mousedown', mousedownHandler);
        document.addEventListener('mousemove', mousemoveHandler);
        document.addEventListener('mouseup', mouseupHandler);
    }
    
    /**
     * 获取拖动时的目标索引位置
     * @param {HTMLElement} draggedElement 被拖动的图标元素
     * @param {Object} draggedIconData 被拖动的图标数据
     * @param {number} mouseX 鼠标X坐标（相对于容器）
     * @param {number} mouseY 鼠标Y坐标（相对于容器）
     * @returns {number} 目标索引位置
     */
    static _getTargetIndexForDrag(draggedElement, draggedIconData, mouseX, mouseY) {
        const icons = Array.from(DesktopManager._icons.values());
        const currentIndex = icons.findIndex(icon => icon.id === draggedIconData.id);
        
        if (currentIndex < 0) return -1;
        
        const iconWidth = DesktopManager._getIconWidth();
        const iconHeight = DesktopManager._getIconHeight();
        const spacing = DesktopManager._iconSpacing;
        const container = DesktopManager._iconsContainer;
        
        if (!container) return -1;
        
        if (DesktopManager._arrangementMode === 'grid') {
            // 网格模式：根据鼠标位置计算目标行列
            const containerWidth = container.clientWidth || container.offsetWidth || 0;
            // 容器已经有 padding，clientWidth 已经是可用宽度
            const iconsPerRow = Math.max(1, Math.floor(containerWidth / (iconWidth + spacing)));
            
            const targetCol = Math.floor((mouseX - spacing) / (iconWidth + spacing));
            const targetRow = Math.floor((mouseY - spacing) / (iconHeight + spacing));
            const targetIndex = targetRow * iconsPerRow + targetCol;
            
            return Math.max(0, Math.min(targetIndex, icons.length - 1));
        } else if (DesktopManager._arrangementMode === 'list') {
            // 列表模式：根据鼠标位置计算目标索引（支持多列）
            // 首先计算列索引
            const targetCol = Math.floor((mouseX - spacing) / (iconWidth + spacing));
            // 然后计算行索引（在当前列中的位置）
            const targetRow = Math.floor((mouseY - spacing) / (iconHeight + spacing));
            // 计算每列可容纳的图标数
            const containerHeight = container.clientHeight || container.offsetHeight || 0;
            const iconsPerCol = Math.max(1, Math.floor(containerHeight / (iconHeight + spacing)));
            // 计算目标索引
            const targetIndex = targetCol * iconsPerCol + targetRow;
            return Math.max(0, Math.min(targetIndex, icons.length - 1));
        }
        
        return currentIndex;
    }
    
    /**
     * 更新图标位置以显示拖动插入效果
     * @param {number} draggedIconId 被拖动的图标ID
     * @param {number} targetIndex 目标索引位置
     */
    static _updateIconPositionsForDrag(draggedIconId, targetIndex) {
        const icons = Array.from(DesktopManager._icons.values());
        const draggedIndex = icons.findIndex(icon => icon.id === draggedIconId);
        
        if (draggedIndex < 0 || targetIndex < 0) return;
        
        const container = DesktopManager._iconsContainer;
        if (!container) return;
        
        const iconWidth = DesktopManager._getIconWidth();
        const iconHeight = DesktopManager._getIconHeight();
        const spacing = DesktopManager._iconSpacing;
        
        if (DesktopManager._arrangementMode === 'grid') {
            const containerWidth = container.clientWidth || container.offsetWidth || 0;
            // 容器已经有 padding，clientWidth 已经是可用宽度
            const iconsPerRow = Math.max(1, Math.floor(containerWidth / (iconWidth + spacing)));
            
            icons.forEach((iconData, index) => {
                if (iconData.id === draggedIconId) return; // 跳过被拖动的图标
                
                let displayIndex = index;
                if (index > draggedIndex && index <= targetIndex) {
                    // 向后移动
                    displayIndex = index - 1;
                } else if (index < draggedIndex && index >= targetIndex) {
                    // 向前移动
                    displayIndex = index + 1;
                }
                
                const row = Math.floor(displayIndex / iconsPerRow);
                const col = displayIndex % iconsPerRow;
                // 容器已经有 padding，第一个图标位置是 spacing
                const x = spacing + col * (iconWidth + spacing);
                const y = spacing + row * (iconHeight + spacing);
                
                const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
                if (iconElement && !iconElement.dataset.dragging) {
                    // 拖动时使用平滑过渡，但不要影响被拖动的图标
                    iconElement.style.transition = 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
                    iconElement.style.left = `${x}px`;
                    iconElement.style.top = `${y}px`;
                }
            });
        } else if (DesktopManager._arrangementMode === 'list') {
            // 列表模式：支持多列垂直排列
            const containerHeight = container.clientHeight || container.offsetHeight || 0;
            const iconsPerCol = Math.max(1, Math.floor(containerHeight / (iconHeight + spacing)));
            
            icons.forEach((iconData, index) => {
                if (iconData.id === draggedIconId) return; // 跳过被拖动的图标
                
                let displayIndex = index;
                if (index > draggedIndex && index <= targetIndex) {
                    // 向后移动
                    displayIndex = index - 1;
                } else if (index < draggedIndex && index >= targetIndex) {
                    // 向前移动
                    displayIndex = index + 1;
                }
                
                // 计算列索引和行索引
                const col = Math.floor(displayIndex / iconsPerCol);
                const row = displayIndex % iconsPerCol;
                
                // 计算位置
                const x = spacing + col * (iconWidth + spacing);
                const y = spacing + row * (iconHeight + spacing);
                
                const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
                if (iconElement && !iconElement.dataset.dragging) {
                    // 拖动时使用平滑过渡，但不要影响被拖动的图标
                    iconElement.style.transition = 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
                    iconElement.style.left = `${x}px`;
                    iconElement.style.top = `${y}px`;
                }
            });
        }
    }
    
    /**
     * 交换图标顺序
     * @param {number} draggedIconId 被拖动的图标ID
     * @param {number} targetIndex 目标索引位置
     */
    static _swapIconOrder(draggedIconId, targetIndex) {
        // 将 Map 转换为数组以便重新排序
        const iconsArray = Array.from(DesktopManager._icons.values());
        const draggedIndex = iconsArray.findIndex(icon => icon.id === draggedIconId);
        
        if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
            return;
        }
        
        // 从数组中移除被拖动的图标
        const [draggedIcon] = iconsArray.splice(draggedIndex, 1);
        
        // 插入到目标位置
        iconsArray.splice(targetIndex, 0, draggedIcon);
        
        // 清空 Map 并按照新顺序重新添加
        DesktopManager._icons.clear();
        iconsArray.forEach(iconData => {
            DesktopManager._icons.set(iconData.id, iconData);
        });
        
        KernelLogger.debug("DesktopManager", `图标顺序已更新: ${draggedIconId} 移动到位置 ${targetIndex}`);
    }
    
    /**
     * 移除图标拖拽
     * @param {HTMLElement} iconElement 图标元素
     */
    static _removeIconDrag(iconElement) {
        if (!iconElement._dragHandlers) {
            return;
        }
        
        const handlers = iconElement._dragHandlers;
        iconElement.removeEventListener('mousedown', handlers.mousedown);
        document.removeEventListener('mousemove', handlers.mousemove);
        document.removeEventListener('mouseup', handlers.mouseup);
        
        iconElement._dragHandlers = null;
    }
    
    /**
     * 处理图标点击
     * @param {Object} iconData 图标数据
     */
    static _handleIconClick(iconData) {
        // 如果是文件/文件夹图标
        if (iconData.type && (iconData.type === 'file' || iconData.type === 'directory')) {
            DesktopManager._handleFileOrFolderIconClick(iconData);
            return;
        }
        
        // 如果是程序快捷方式
        if (!iconData.programName) {
            KernelLogger.warn("DesktopManager", `图标 ${iconData.name} 没有关联的程序`);
            return;
        }
        
        if (typeof ProcessManager === 'undefined') {
            KernelLogger.warn("DesktopManager", "ProcessManager 不可用，无法启动程序");
            return;
        }
        
        // 检查程序是否已在运行
        const runningProcess = DesktopManager._findRunningProcess(iconData.programName);
        
        if (runningProcess) {
            // 程序已在运行，聚焦或恢复窗口
            DesktopManager._focusOrRestoreProgram(runningProcess.pid);
            KernelLogger.info("DesktopManager", `程序 ${iconData.programName} 已在运行 (PID: ${runningProcess.pid})，聚焦窗口`);
        } else {
            // 程序未运行，启动程序
            try {
                ProcessManager.startProgram(iconData.programName, {})
                    .then((pid) => {
                        KernelLogger.info("DesktopManager", `启动程序: ${iconData.programName} (PID: ${pid})`);
                    })
                    .catch((e) => {
                        KernelLogger.error("DesktopManager", `启动程序失败: ${e.message}`, e);
                    });
            } catch (e) {
                KernelLogger.error("DesktopManager", `启动程序失败: ${e.message}`, e);
            }
        }
    }
    
    /**
     * 处理文件/文件夹图标点击
     * @param {Object} iconData 图标数据
     */
    static async _handleFileOrFolderIconClick(iconData) {
        if (!iconData.targetPath) {
            KernelLogger.warn("DesktopManager", `图标 ${iconData.name} 没有目标路径`);
            return;
        }
        
        if (typeof ProcessManager === 'undefined') {
            KernelLogger.warn("DesktopManager", "ProcessManager 不可用，无法打开文件/文件夹");
            return;
        }
        
        try {
            if (iconData.type === 'directory') {
                // 文件夹：使用文件管理器打开对应目录
                await ProcessManager.startProgram('filemanager', {
                    args: [iconData.targetPath]
                });
                KernelLogger.info("DesktopManager", `打开文件夹: ${iconData.targetPath}`);
            } else if (iconData.type === 'file') {
                // 文件：根据文件类型选择对应程序打开
                const fileName = iconData.targetPath.split('/').pop() || iconData.targetPath;
                const extension = fileName.split('.').pop()?.toLowerCase() || '';
                
                // 获取文件类型
                let fileType = 'UNKNOWN';
                if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager._getFileTypeFromExtension === 'function') {
                    // 尝试从 ApplicationAssetManager 获取文件类型判断方法
                    // 如果没有，使用扩展名推断
                    fileType = DesktopManager._getFileTypeFromExtension(extension);
                } else {
                    fileType = DesktopManager._getFileTypeFromExtension(extension);
                }
                
                // 根据文件类型选择程序
                let programName = null;
                let programArgs = [iconData.targetPath];
                
                if (fileType === 'AUDIO') {
                    programName = 'audioplayer';
                } else if (fileType === 'VIDEO') {
                    programName = 'videoplayer';
                } else if (fileType === 'IMAGE') {
                    programName = 'imageviewer';
                } else if (fileType === 'TEXT' || fileType === 'CODE' || fileType === 'MARKDOWN') {
                    programName = 'vim';
                    programArgs = [iconData.targetPath];
                } else {
                    // 未知格式：使用文件管理器打开文件所在位置
                    const parentPath = iconData.targetPath.split('/').slice(0, -1).join('/') || iconData.targetPath.split(':')[0] + ':';
                    programName = 'filemanager';
                    programArgs = [parentPath];
                    KernelLogger.info("DesktopManager", `未知文件类型，打开文件所在位置: ${parentPath}`);
                }
                
                if (programName) {
                    await ProcessManager.startProgram(programName, {
                        args: programArgs
                    });
                    KernelLogger.info("DesktopManager", `打开文件: ${iconData.targetPath} (使用程序: ${programName})`);
                } else {
                    KernelLogger.warn("DesktopManager", `无法确定打开文件 ${iconData.targetPath} 的程序`);
                }
            }
        } catch (error) {
            KernelLogger.error("DesktopManager", `打开文件/文件夹失败: ${error.message}`, error);
            // 打开失败，使用通知提示（不打断用户）
            // DesktopManager 没有 PID，使用 exploit PID（系统/内核相关）
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
                    await NotificationManager.createNotification(exploitPid, {
                        type: 'snapshot',
                        title: '桌面管理器',
                        content: `打开文件/文件夹失败: ${error.message}`,
                        duration: 4000
                    });
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("DesktopManager", `创建通知失败: ${e.message}`);
                    }
                }
            }
        }
    }
    
    /**
     * 根据扩展名获取文件类型
     * @param {string} extension 文件扩展名（小写）
     * @returns {string} 文件类型
     */
    static _getFileTypeFromExtension(extension) {
        if (!extension) return 'UNKNOWN';
        
        const ext = extension.toLowerCase();
        
        // 音频格式
        const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma', 'opus', 'mp4a'];
        if (audioExts.includes(ext)) {
            return 'AUDIO';
        }
        
        // 视频格式
        const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp'];
        if (videoExts.includes(ext)) {
            return 'VIDEO';
        }
        
        // 图片格式
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'];
        if (imageExts.includes(ext)) {
            return 'IMAGE';
        }
        
        // 文本格式
        const textExts = ['txt', 'md', 'markdown', 'log', 'ini', 'conf', 'cfg', 'json', 'xml', 'csv'];
        if (textExts.includes(ext)) {
            return 'TEXT';
        }
        
        // 代码格式
        const codeExts = ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less', 'py', 'java', 'cpp', 'c', 'h', 'hpp', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart', 'sh', 'bat', 'ps1', 'yml', 'yaml'];
        if (codeExts.includes(ext)) {
            return 'CODE';
        }
        
        return 'UNKNOWN';
    }
    
    /**
    
    /**
     * 查找正在运行的程序
     * @param {string} programName 程序名称
     * @returns {Object|null} 进程信息 { pid, processInfo } 或 null
     */
    static _findRunningProcess(programName) {
        if (typeof ProcessManager === 'undefined') {
            return null;
        }
        
        // 遍历进程表，查找正在运行的程序
        for (const [pid, processInfo] of ProcessManager.PROCESS_TABLE) {
            if (processInfo.programName === programName && processInfo.status === 'running') {
                return { pid, processInfo };
            }
        }
        
        return null;
    }
    
    /**
     * 聚焦或恢复程序窗口
     * @param {number} pid 进程ID
     */
    static _focusOrRestoreProgram(pid) {
        if (typeof GUIManager === 'undefined') {
            KernelLogger.warn("DesktopManager", "GUIManager 不可用，无法聚焦窗口");
            return;
        }
        
        // 获取该进程的所有窗口
        const windows = GUIManager.getWindowsByPid(pid);
        if (windows.length === 0) {
            KernelLogger.warn("DesktopManager", `程序 PID ${pid} 没有窗口`);
            return;
        }
        
        // 获取主窗口（或第一个窗口）
        const mainWindow = windows.find(w => w.isMainWindow) || windows[0];
        if (!mainWindow) {
            return;
        }
        
        // 如果窗口已最小化，先恢复
        if (mainWindow.isMinimized) {
            GUIManager.restoreWindow(mainWindow.windowId, true);
        } else {
            // 如果窗口未最小化，聚焦窗口
            GUIManager.focusWindow(mainWindow.windowId);
        }
    }
    
    /**
     * 显示图标右键菜单
     * @param {Event} e 事件对象
     * @param {Object} iconData 图标数据
     */
    static _showIconContextMenu(e, iconData) {
        if (typeof ContextMenuManager === 'undefined') {
            return;
        }
        
        // 如果是文件/文件夹图标，使用不同的菜单
        // 检查 iconData.type 是否为 'file' 或 'directory'
        if (iconData && iconData.type && (iconData.type === 'file' || iconData.type === 'directory')) {
            DesktopManager._showFileOrFolderIconContextMenu(e, iconData);
            return;
        }
        
        const menuConfig = {
            items: [
                {
                    label: '打开',
                    icon: '▶',
                    action: () => {
                        DesktopManager._handleIconClick(iconData);
                        ContextMenuManager._hideMenu();
                    }
                },
                {
                    label: '删除',
                    icon: '🗑',
                    action: () => {
                        DesktopManager.removeShortcut(iconData.id);
                        ContextMenuManager._hideMenu();
                    }
                },
                {
                    label: '重命名',
                    icon: '✏',
                    action: () => {
                        DesktopManager._renameIcon(iconData);
                        ContextMenuManager._hideMenu();
                    }
                },
                {
                    label: '程序详细',
                    icon: '📋',
                    action: () => {
                        DesktopManager._showProgramDetails(iconData);
                        ContextMenuManager._hideMenu();
                    }
                },
                {
                    label: '属性',
                    icon: 'ℹ',
                    action: () => {
                        DesktopManager._showIconProperties(iconData);
                        ContextMenuManager._hideMenu();
                    }
                }
            ]
        };
        
        ContextMenuManager._showMenu(menuConfig, e);
    }
    
    /**
     * 显示文件/文件夹图标右键菜单
     * @param {Event} e 事件对象
     * @param {Object} iconData 图标数据
     */
    static _showFileOrFolderIconContextMenu(e, iconData) {
        if (typeof ContextMenuManager === 'undefined') {
            return;
        }
        
        const items = [];
        
        // 打开选项
        items.push({
            label: '打开',
            icon: iconData.type === 'directory' ? '📂' : '📄',
            action: () => {
                DesktopManager._handleFileOrFolderIconClick(iconData);
                ContextMenuManager._hideMenu();
            }
        });
        
        items.push({ type: 'separator' });
        
        // 重命名选项
        items.push({
            label: '重命名',
            icon: '✏️',
            action: () => {
                DesktopManager._renameIcon(iconData);
                ContextMenuManager._hideMenu();
            }
        });
        
        // 删除选项
        items.push({
            label: '删除',
            icon: '🗑️',
            danger: true,
            action: async () => {
                // 直接执行删除，不显示确认弹窗
                DesktopManager.removeShortcut(iconData.id);
                ContextMenuManager._hideMenu();
            }
        });
        
        items.push({ type: 'separator' });
        
        // 文件属性选项
        items.push({
            label: '文件属性',
            icon: '📋',
            action: async () => {
                ContextMenuManager._hideMenu();
                await DesktopManager._showFileOrFolderIconProperties(iconData);
            }
        });
        
        const menuConfig = {
            items: items
        };
        
        ContextMenuManager._showMenu(menuConfig, e);
    }
    
    /**
     * 显示文件/文件夹图标属性（使用文件管理器显示，无弹窗）
     * @param {Object} iconData 图标数据
     */
    static async _showFileOrFolderIconProperties(iconData) {
        if (!iconData.targetPath) {
            KernelLogger.warn("DesktopManager", `图标 ${iconData.name} 没有目标路径`);
            return;
        }
        
        try {
            // 使用文件管理器打开文件所在目录并显示属性
            if (typeof ProcessManager === 'undefined') {
                KernelLogger.warn("DesktopManager", "ProcessManager 不可用，无法打开文件管理器");
                return;
            }
            
            // 获取文件所在目录
            let targetPath = iconData.targetPath;
            if (iconData.type === 'file') {
                // 文件：打开文件所在目录
                const pathParts = targetPath.split('/');
                pathParts.pop(); // 移除文件名
                targetPath = pathParts.join('/') || (targetPath.split(':')[0] + ':');
            }
            // 文件夹：直接打开该目录
            
            // 启动文件管理器
            const pid = await ProcessManager.startProgram('filemanager', {
                args: [targetPath]
            });
            
            // 等待文件管理器窗口加载完成
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // 通过文件管理器的窗口发送消息，要求显示属性
            if (typeof GUIManager !== 'undefined') {
                const windows = GUIManager.getWindowsByPid(pid);
                if (windows.length > 0) {
                    const fileManagerWindow = windows[0];
                    // 聚焦文件管理器窗口
                    GUIManager.focusWindow(fileManagerWindow.windowId);
                    
                    // 通过自定义事件通知文件管理器显示属性
                    // 文件管理器会监听这个事件并显示对应文件的属性
                    const showPropertiesEvent = new CustomEvent('show-file-properties', {
                        detail: {
                            path: iconData.targetPath,
                            name: iconData.name,
                            type: iconData.type
                        },
                        bubbles: true
                    });
                    fileManagerWindow.window.dispatchEvent(showPropertiesEvent);
                }
            }
        } catch (error) {
            KernelLogger.error("DesktopManager", `显示文件属性失败: ${error.message}`, error);
        }
    }
    
    /**
     * 从文件系统获取文件信息
     * @param {string} filePath 文件路径
     * @returns {Promise<Object|null>} 文件信息
     */
    static async _getFileInfo(filePath) {
        try {
            // 解析路径
            // 例如：C:/UH.jpg -> dirPath: C:, fileName: UH.jpg
            // 例如：C:/folder/file.txt -> dirPath: C:/folder, fileName: file.txt
            const pathParts = filePath.split('/');
            const fileName = pathParts.pop() || '';
            
            // 获取目录路径
            let dirPath = pathParts.join('/');
            
            // 如果路径为空或只有盘符，确保格式为 C: 或 D:
            if (!dirPath || dirPath === '') {
                // 从完整路径中提取盘符
                const match = filePath.match(/^([CD]):/);
                dirPath = match ? match[1] + ':' : 'C:';
            } else {
                // 规范化路径：移除多余的斜杠
                dirPath = dirPath.replace(/\/+/g, '/');
                // 移除尾部斜杠（但保留根路径格式 C:/）
                if (dirPath.endsWith('/') && !dirPath.match(/^[CD]:\/$/)) {
                    dirPath = dirPath.slice(0, -1);
                }
                // 确保根路径格式为 C: 而不是 C:/
                if (dirPath.match(/^[CD]:\/$/)) {
                    dirPath = dirPath.slice(0, -1); // 移除尾部斜杠，变成 C:
                }
            }
            
            // 使用 FSDirve.php 获取文件信息
            const url = new URL('/system/service/FSDirve.php', window.location.origin);
            url.searchParams.set('action', 'get_file_info');
            url.searchParams.set('path', dirPath);
            url.searchParams.set('fileName', fileName); // 注意：PHP 期望的是 fileName，不是 name
            
            const response = await fetch(url.toString());
            if (!response.ok) {
                KernelLogger.warn("DesktopManager", `获取文件信息失败: ${response.status} ${response.statusText} (path: ${dirPath}, name: ${fileName})`);
                return null;
            }
            
            const result = await response.json();
            if (result.status === 'success' && result.data) {
                return result.data;
            }
            
            return null;
        } catch (error) {
            KernelLogger.error("DesktopManager", `获取文件信息失败: ${error.message}`, error);
            return null;
        }
    }
    
    /**
     * 重命名图标
     * @param {Object} iconData 图标数据
     */
    static _renameIcon(iconData) {
        const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
        if (!iconElement) return;
        
        const label = iconElement.querySelector('.desktop-icon-label');
        if (!label) return;
        
        // 使用 description 优先，如果没有则使用 name
        const currentDisplayName = iconData.description || iconData.name;
        const newName = prompt('请输入新名称:', currentDisplayName);
        
        if (newName && newName.trim() && newName !== currentDisplayName) {
            // 更新 description 字段（用于显示）
            iconData.description = newName.trim();
            // 同时更新 name 字段（用于兼容性）
            if (!iconData.name) {
                iconData.name = newName.trim();
            }
            // 更新显示
            label.textContent = iconData.description || iconData.name;
            DesktopManager._saveDesktopIcons().catch((e) => {
                KernelLogger.error("DesktopManager", `重命名后保存桌面图标失败: ${e.message}`, e);
            });
            KernelLogger.info("DesktopManager", `图标重命名: ${currentDisplayName} -> ${iconData.description}`);
        }
    }
    
    /**
     * 显示程序详细信息
     * @param {Object} iconData 图标数据
     */
    static async _showProgramDetails(iconData) {
        if (!iconData.programName) {
            KernelLogger.warn("DesktopManager", "图标没有关联的程序");
            return;
        }
        
        // 如果 ContextMenuManager 有显示程序详情的方法，直接使用
        if (typeof ContextMenuManager !== 'undefined' && typeof ContextMenuManager._showProgramDetails === 'function') {
            await ContextMenuManager._showProgramDetails(iconData.programName, null);
            return;
        }
        
        // 否则使用简单的实现
        DesktopManager._showSimpleProgramDetails(iconData);
    }
    
    /**
     * 显示简单的程序详情（降级方案）
     * @param {Object} iconData 图标数据
     */
    static _showSimpleProgramDetails(iconData) {
        let programInfo = null;
        if (typeof ApplicationAssetManager !== 'undefined') {
            programInfo = ApplicationAssetManager.getProgramInfo(iconData.programName);
        }
        
        const metadata = programInfo?.metadata || {};
        const info = [
            `程序名称: ${iconData.programName}`,
            `显示名称: ${iconData.name}`,
            `描述: ${metadata.description || iconData.description || '无'}`,
            `版本: ${metadata.version || '未知'}`,
            `作者: ${metadata.author || '未知'}`,
            `脚本路径: ${programInfo?.script || '未知'}`,
            `图标: ${programInfo?.icon || iconData.icon || '无'}`,
            `创建时间: ${new Date(iconData.createdAt || Date.now()).toLocaleString()}`
        ].join('\n');
        
        alert(info);
    }
    
    /**
     * 显示图标属性
     * @param {Object} iconData 图标数据
     */
    static _showIconProperties(iconData) {
        // TODO: 实现属性窗口
        const info = [
            `名称: ${iconData.name}`,
            `程序: ${iconData.programName || '无'}`,
            `描述: ${iconData.description || '无'}`,
            `创建时间: ${new Date(iconData.createdAt || Date.now()).toLocaleString()}`
        ].join('\n');
        
        alert(info);
    }
    
    /**
     * 注册桌面右键菜单
     */
    static _registerDesktopContextMenu() {
        if (typeof ContextMenuManager === 'undefined') {
            KernelLogger.warn("DesktopManager", "ContextMenuManager 不可用，跳过桌面右键菜单注册");
            return;
        }
        
        // 桌面右键菜单已由 ContextMenuManager 处理
        // 这里只需要确保查看菜单功能已实现
    }
    
    /**
     * 设置主题监听器
     */
    static _setupThemeListeners() {
        if (typeof ThemeManager === 'undefined') {
            return;
        }
        
        // 监听主题变更
        ThemeManager.onThemeChange((themeId, theme) => {
            DesktopManager._updateDesktopStyles();
        });
        
        // 监听风格变更
        ThemeManager.onStyleChange((styleId, style) => {
            DesktopManager._updateDesktopStyles();
        });
    }
    
    /**
     * 设置键盘监听（Tab 键切换通知栏）
     */
    static _setupKeyboardListeners() {
        if (typeof EventManager === 'undefined') {
            KernelLogger.warn("DesktopManager", "EventManager 不可用，无法注册 Tab 键监听");
            return;
        }
        
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 监听 Tab 键事件
        EventManager.registerEventHandler(exploitPid, 'keydown', (e) => {
            // 检查是否按下了 Tab 键（不包含其他修饰键）
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                // 检查是否在输入框中（如果是，则不处理）
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    return;
                }
                
                // 阻止默认行为
                e.preventDefault();
                
                // 切换通知栏显示状态
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.toggleNotificationContainer === 'function') {
                    NotificationManager.toggleNotificationContainer();
                }
            }
        }, {
            priority: 50,  // 中等优先级
            useCapture: false
        });
        
        KernelLogger.debug("DesktopManager", "键盘监听已设置（Tab 键切换通知栏）");
    }
    
    /**
     * 更新桌面样式
     */
    static _updateDesktopStyles() {
        // 更新所有图标样式
        DesktopManager._icons.forEach((iconData) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (!iconElement) return;
            
            const iconImage = iconElement.querySelector('.desktop-icon-image');
            const iconLabel = iconElement.querySelector('.desktop-icon-label');
            
            if (iconImage) {
                iconImage.style.background = 'var(--theme-background-elevated, rgba(30, 30, 46, 0.6))';
            }
            
            if (iconLabel) {
                iconLabel.style.color = 'var(--theme-text, #d7e0dd)';
            }
        });
    }
    
    /**
     * 保存桌面图标
     */
    static async _saveDesktopIcons() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("DesktopManager", "LStorage 不可用，跳过保存");
            return;
        }
        
        // 检查 D: 分区是否可用
        // 注意：我们检查 diskSeparateSize 而不是 diskSeparateMap，
        // 因为 diskSeparateSize 存储的是分区大小信息（持久化），
        // 而 diskSeparateMap 中的 NodeTreeCollection 对象可能尚未从 POOL 加载
        if (typeof Disk !== 'undefined') {
            // 检查 diskSeparateSize 中是否有 D: 分区
            const diskSeparateSize = Disk.diskSeparateSize;
            if (diskSeparateSize && diskSeparateSize instanceof Map) {
                const dPartitionSize = diskSeparateSize.get("D:");
                if (!dPartitionSize || dPartitionSize <= 0) {
                    // D: 分区未初始化或大小为0，延迟保存
                    KernelLogger.debug("DesktopManager", "D: 分区尚未初始化（diskSeparateSize 中没有 D: 或大小为0），延迟保存");
                    DesktopManager._scheduleDelayedSave();
                    return;
                }
                // D: 分区已初始化，继续保存
                KernelLogger.debug("DesktopManager", `D: 分区已初始化，大小: ${dPartitionSize} 字节`);
            } else {
                // diskSeparateSize 不可用，但我们可以尝试直接使用 LStorage（不依赖 Disk）
                KernelLogger.debug("DesktopManager", "diskSeparateSize 不可用，但将尝试直接使用 LStorage（不依赖 Disk）");
            }
        }
        
        try {
            const iconsArray = Array.from(DesktopManager._icons.values());
            
            KernelLogger.info("DesktopManager", `保存桌面图标到 PHP 存储: Key=${DesktopManager.STORAGE_KEY_ICONS}, 图标数量=${iconsArray.length}`);
            
            // 确保 LStorage 已初始化
            if (!LStorage._initialized) {
                KernelLogger.info("DesktopManager", "等待 LStorage 初始化...");
                await LStorage.init();
            }
            
            KernelLogger.debug("DesktopManager", `准备保存 ${iconsArray.length} 个图标到 PHP 存储`);
            const success = await LStorage.setSystemStorage(DesktopManager.STORAGE_KEY_ICONS, iconsArray);
            if (success) {
                // 保存成功，重置重试计数
                DesktopManager._delayedSaveRetryCount = 0;
                KernelLogger.info("DesktopManager", `桌面图标保存成功: ${iconsArray.length} 个图标已保存到 PHP 存储`);
                
                // 验证保存是否真的成功（从内存中读取验证）
                try {
                    const savedIcons = await LStorage.getSystemStorage(DesktopManager.STORAGE_KEY_ICONS);
                    if (savedIcons && Array.isArray(savedIcons) && savedIcons.length === iconsArray.length) {
                        KernelLogger.debug("DesktopManager", `保存验证成功: ${savedIcons.length} 个图标已确认保存`);
                    } else {
                        KernelLogger.warn("DesktopManager", `保存验证失败: 期望 ${iconsArray.length} 个图标，实际 ${savedIcons ? (Array.isArray(savedIcons) ? savedIcons.length : '非数组') : 'null'}`);
                        // 验证失败，抛出错误
                        throw new Error(`保存验证失败: 期望 ${iconsArray.length} 个图标，实际 ${savedIcons ? (Array.isArray(savedIcons) ? savedIcons.length : '非数组') : 'null'}`);
                    }
                } catch (verifyError) {
                    KernelLogger.warn("DesktopManager", `保存验证失败: ${verifyError.message}`);
                    // 验证失败，抛出错误
                    throw verifyError;
                }
            } else {
                const errorMsg = "保存桌面图标失败（LStorage返回false）";
                KernelLogger.error("DesktopManager", errorMsg);
                DesktopManager._scheduleDelayedSave();
                // 抛出错误，让调用者知道保存失败
                throw new Error(errorMsg);
            }
        } catch (e) {
            KernelLogger.error("DesktopManager", `保存桌面图标失败: ${e.message}，将稍后重试`, e);
            KernelLogger.error("DesktopManager", `错误堆栈: ${e.stack || '无堆栈信息'}`);
            DesktopManager._scheduleDelayedSave();
            // 重新抛出错误，让调用者知道保存失败
            throw e;
        }
    }
    
    /**
     * 强制保存桌面图标（用于初始化后确保保存）
     */
    static async _forceSaveDesktopIcons() {
        if (typeof LStorage === 'undefined') {
            return;
        }
        
        // 重置重试计数
        DesktopManager._delayedSaveRetryCount = 0;
        
        // 清除延迟保存定时器
        if (DesktopManager._delayedSaveTimer) {
            clearTimeout(DesktopManager._delayedSaveTimer);
            DesktopManager._delayedSaveTimer = null;
        }
        
        // 直接尝试保存
        await DesktopManager._saveDesktopIcons();
    }
    
    /**
     * 延迟保存定时器
     */
    static _delayedSaveTimer = null;
    /**
     * 延迟保存重试次数
     */
    static _delayedSaveRetryCount = 0;
    /**
     * 最大重试次数
     */
    static MAX_DELAYED_SAVE_RETRIES = 30; // 最多重试30次（约5分钟）
    
    /**
     * 安排延迟保存
     */
    static _scheduleDelayedSave() {
        // 清除之前的定时器
        if (DesktopManager._delayedSaveTimer) {
            clearTimeout(DesktopManager._delayedSaveTimer);
        }
        
        // 检查重试次数
        if (DesktopManager._delayedSaveRetryCount >= DesktopManager.MAX_DELAYED_SAVE_RETRIES) {
            KernelLogger.error("DesktopManager", `延迟保存已达到最大重试次数 (${DesktopManager.MAX_DELAYED_SAVE_RETRIES})，停止重试`);
            DesktopManager._delayedSaveRetryCount = 0;
            return;
        }
        
        DesktopManager._delayedSaveRetryCount++;
        const retryDelay = Math.min(1000 * DesktopManager._delayedSaveRetryCount, 10000); // 递增延迟，最多10秒
        
        // 设置新的延迟保存
        DesktopManager._delayedSaveTimer = setTimeout(async () => {
            DesktopManager._delayedSaveTimer = null;
            await DesktopManager._saveDesktopIcons();
            // 如果保存成功，重置重试计数
            if (DesktopManager._delayedSaveRetryCount > 0) {
                // 检查是否真的保存成功（通过检查D:分区和LStorage状态）
                if (typeof Disk !== 'undefined' && Disk.diskSeparateMap) {
                    const dPartition = Disk.diskSeparateMap.get("D:");
                    if (dPartition) {
                        // 验证保存是否成功：尝试读取
                        try {
                            if (typeof LStorage !== 'undefined') {
                                const savedIcons = await LStorage.getSystemStorage(DesktopManager.STORAGE_KEY_ICONS);
                                if (savedIcons && Array.isArray(savedIcons) && savedIcons.length === DesktopManager._icons.size) {
                                    DesktopManager._delayedSaveRetryCount = 0;
                                }
                            }
                        } catch (e) {
                            // 验证失败，继续重试
                        }
                    }
                }
            }
        }, retryDelay);
    }
    
    /**
     * 保存配置（带错误处理）
     * @param {string} key 配置键
     * @param {*} value 配置值
     */
    static async _saveConfig(key, value) {
        if (typeof LStorage === 'undefined') {
            return;
        }
        
        // 检查 D: 分区是否可用
        // 注意：我们检查 diskSeparateSize 而不是 diskSeparateMap
        if (typeof Disk !== 'undefined') {
            const diskSeparateSize = Disk.diskSeparateSize;
            if (diskSeparateSize && diskSeparateSize instanceof Map) {
                const dPartitionSize = diskSeparateSize.get("D:");
                if (!dPartitionSize || dPartitionSize <= 0) {
                    KernelLogger.debug("DesktopManager", `D: 分区尚未初始化，跳过保存配置: ${key}`);
                    return;
                }
            }
        }
        
        try {
            const success = await LStorage.setSystemStorage(key, value);
            if (!success) {
                KernelLogger.debug("DesktopManager", `保存配置失败: ${key}`);
            }
        } catch (e) {
            KernelLogger.debug("DesktopManager", `保存配置失败: ${key} - ${e.message}`);
        }
    }
    
    /**
     * 注册到POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "DesktopManager", DesktopManager);
            } catch (e) {
                KernelLogger.warn("DesktopManager", `注册到POOL失败: ${e.message}`);
            }
        }
    }
    
    // ==================== 公共API ====================
    
    /**
     * 添加桌面快捷方式
     * @param {Object} options 选项
     * @param {string} options.programName 程序名称
     * @param {string} options.name 显示名称
     * @param {string} [options.icon] 图标路径
     * @param {string} [options.description] 描述
     * @param {Object} [options.position] 位置 {x, y}
     * @returns {number} 图标ID
     */
    static addShortcut(options) {
        if (!options || !options.programName) {
            throw new Error('DesktopManager.addShortcut: programName 是必需的');
        }
        
        const iconId = DesktopManager._iconIdCounter++;
        const iconData = {
            id: iconId,
            programName: options.programName,
            name: options.name || options.programName,
            icon: options.icon || null,
            description: options.description || '',
            position: options.position || null,
            createdAt: Date.now()
        };
        
        DesktopManager._icons.set(iconId, iconData);
        
        // 创建图标元素
        const iconElement = DesktopManager._createIconElement(iconData);
        if (!iconElement) {
            KernelLogger.error("DesktopManager", `无法创建图标元素: ${iconData.name}`);
            DesktopManager._icons.delete(iconId);
            throw new Error(`无法创建图标元素: ${iconData.name}`);
        }
        
        KernelLogger.info("DesktopManager", `桌面图标已创建: ${iconData.name} (ID: ${iconId}, icon: ${iconData.icon || '无图标'})`);
        
        // 重新排列
        DesktopManager._arrangeIcons();
        
        // 确保图标容器可见
        if (DesktopManager._iconsContainer) {
            DesktopManager._iconsContainer.style.display = 'block';
            DesktopManager._iconsContainer.style.visibility = 'visible';
        }
        
        // 保存（异步，不阻塞，但确保保存成功）
        DesktopManager._saveDesktopIcons().then(() => {
            KernelLogger.info("DesktopManager", `添加桌面快捷方式: ${iconData.name} (已保存到 PHP 存储)`);
        }).catch((e) => {
            KernelLogger.error("DesktopManager", `添加桌面快捷方式: ${iconData.name} (保存失败: ${e.message})`, e);
            // 保存失败时，安排延迟重试
            DesktopManager._scheduleDelayedSave();
        });
        
        return iconId;
    }
    
    /**
     * 添加文件/文件夹图标到桌面（映射）
     * @param {Object} options 选项
     * @param {string} options.type 类型：'file' 或 'directory'
     * @param {string} options.targetPath 目标路径（文件或文件夹的完整路径）
     * @param {string} options.name 显示名称
     * @param {string} [options.icon] 图标路径
     * @param {string} [options.description] 描述
     * @param {Object} [options.position] 位置 {x, y}
     * @returns {number} 图标ID
     */
    static addFileOrFolderIcon(options) {
        if (!options || !options.type || !options.targetPath) {
            throw new Error('DesktopManager.addFileOrFolderIcon: type 和 targetPath 是必需的');
        }
        
        if (options.type !== 'file' && options.type !== 'directory') {
            throw new Error('DesktopManager.addFileOrFolderIcon: type 必须是 "file" 或 "directory"');
        }
        
        const iconId = DesktopManager._iconIdCounter++;
        const iconData = {
            id: iconId,
            type: options.type,  // 'file' 或 'directory'
            targetPath: options.targetPath,  // 文件或文件夹的完整路径
            name: options.name || (options.targetPath.split('/').pop() || options.targetPath),
            icon: options.icon || null,
            description: options.description || '',
            position: options.position || null,
            createdAt: Date.now()
        };
        
        DesktopManager._icons.set(iconId, iconData);
        
        // 创建图标元素
        const iconElement = DesktopManager._createIconElement(iconData);
        if (!iconElement) {
            KernelLogger.error("DesktopManager", `无法创建图标元素: ${iconData.name}`);
            DesktopManager._icons.delete(iconId);
            throw new Error(`无法创建图标元素: ${iconData.name}`);
        }
        
        KernelLogger.info("DesktopManager", `桌面文件/文件夹图标已创建: ${iconData.name} (ID: ${iconId}, type: ${iconData.type}, path: ${iconData.targetPath})`);
        
        // 重新排列
        DesktopManager._arrangeIcons();
        
        // 确保图标容器可见
        if (DesktopManager._iconsContainer) {
            DesktopManager._iconsContainer.style.display = 'block';
            DesktopManager._iconsContainer.style.visibility = 'visible';
        }
        
        // 保存（异步，不阻塞，但确保保存成功）
        DesktopManager._saveDesktopIcons().then(() => {
            KernelLogger.info("DesktopManager", `添加桌面文件/文件夹图标: ${iconData.name} (已保存到 PHP 存储)`);
        }).catch((e) => {
            KernelLogger.error("DesktopManager", `添加桌面文件/文件夹图标: ${iconData.name} (保存失败: ${e.message})`, e);
            // 保存失败时，安排延迟重试
            DesktopManager._scheduleDelayedSave();
        });
        
        return iconId;
    }
    
    /**
     * 移除桌面快捷方式
     * @param {number} iconId 图标ID
     */
    static removeShortcut(iconId) {
        const iconData = DesktopManager._icons.get(iconId);
        if (!iconData) {
            KernelLogger.warn("DesktopManager", `图标不存在: ${iconId}`);
            return;
        }
        
        // 移除DOM元素
        const iconElement = document.getElementById(`desktop-icon-${iconId}`);
        if (iconElement) {
            // 添加淡出动画
            iconElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            iconElement.style.opacity = '0';
            iconElement.style.transform = 'scale(0.8) translateY(-10px)';
            
            setTimeout(() => {
                iconElement.remove();
            }, 300);
        }
        
        // 从Map中移除
        DesktopManager._icons.delete(iconId);
        
        // 保存
        DesktopManager._saveDesktopIcons().catch((e) => {
            KernelLogger.error("DesktopManager", `移除后保存桌面图标失败: ${e.message}`, e);
        });
        
        KernelLogger.info("DesktopManager", `移除桌面快捷方式: ${iconData.name}`);
    }
    
    /**
     * 设置排列模式
     * @param {string} mode 排列模式: 'grid', 'list', 'auto'
     */
    static setArrangementMode(mode) {
        if (!['grid', 'list', 'auto'].includes(mode)) {
            throw new Error(`DesktopManager.setArrangementMode: 无效的模式: ${mode}`);
        }
        
        // 列表模式已支持多列垂直排列，无需警告
        
        DesktopManager._arrangementMode = mode;
        DesktopManager._applyArrangementMode();
        
        // 重新排列图标
        if (DesktopManager._autoArrange) {
            DesktopManager._arrangeIcons();
        }
        
        // 根据模式启用/禁用拖拽功能
        DesktopManager._updateIconDragState();
        
        // 保存配置
        DesktopManager._saveConfig(DesktopManager.STORAGE_KEY_ARRANGEMENT, mode);
    }
    
    /**
     * 更新所有图标的拖拽状态
     */
    static _updateIconDragState() {
        DesktopManager._icons.forEach((iconData) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (!iconElement) return;
            
            // 所有模式都支持拖拽（但行为不同）
            DesktopManager._setupIconDrag(iconElement, iconData);
        });
    }
    
    /**
     * 设置图标大小
     * @param {string} size 图标大小: 'small', 'medium', 'large'
     */
    static setIconSize(size) {
        if (!['small', 'medium', 'large'].includes(size)) {
            throw new Error(`DesktopManager.setIconSize: 无效的大小: ${size}`);
        }
        
        DesktopManager._iconSize = size;
        
        // 更新所有图标大小
        DesktopManager._icons.forEach((iconData) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (!iconElement) return;
            
            const iconSize = DesktopManager._getIconWidth();
            const iconImage = iconElement.querySelector('.desktop-icon-image');
            
            iconElement.style.width = `${iconSize}px`;
            iconElement.style.height = `${iconSize + 40}px`;
            
            if (iconImage) {
                iconImage.style.width = `${iconSize}px`;
                iconImage.style.height = `${iconSize}px`;
            }
        });
        
        // 重新排列
        DesktopManager._arrangeIcons();
        
        // 保存配置
        DesktopManager._saveConfig(DesktopManager.STORAGE_KEY_ICON_SIZE, size);
    }
    
    /**
     * 设置自动排列
     * @param {boolean} autoArrange 是否自动排列
     */
    static setAutoArrange(autoArrange) {
        DesktopManager._autoArrange = autoArrange;
        
        // 重新排列
        DesktopManager._arrangeIcons();
        
        // 保存配置
        DesktopManager._saveConfig(DesktopManager.STORAGE_KEY_AUTO_ARRANGE, autoArrange);
    }
    
    /**
     * 刷新桌面
     */
    static refresh() {
        // 重新加载图标
        DesktopManager._loadDesktopIcons();
        
        // 更新样式
        DesktopManager._updateDesktopStyles();
    }
    
    /**
     * 获取桌面图标列表
     * @returns {Array} 图标数据数组
     */
    static getIcons() {
        return Array.from(DesktopManager._icons.values());
    }
    
    /**
     * 获取桌面配置
     * @returns {Object} 配置对象
     */
    static getConfig() {
        return {
            arrangementMode: DesktopManager._arrangementMode,
            iconSize: DesktopManager._iconSize,
            autoArrange: DesktopManager._autoArrange,
            iconSpacing: DesktopManager._iconSpacing
        };
    }
    
    // ==================== 桌面组件管理 ====================
    
    /**
     * 创建桌面组件容器
     */
    static _createComponentsContainer() {
        if (!DesktopManager._desktopContainer) {
            return;
        }
        
        // 检查是否已存在
        if (DesktopManager._componentsContainer) {
            return;
        }
        
        const componentsContainer = document.createElement('div');
        componentsContainer.id = 'desktop-components-container';
        componentsContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2;
            overflow: hidden;
        `;
        
        DesktopManager._componentsContainer = componentsContainer;
        DesktopManager._desktopContainer.appendChild(componentsContainer);
        
        KernelLogger.debug("DesktopManager", "桌面组件容器已创建");
    }
    
    /**
     * 计算避开图标的位置
     * @param {Object} size - 组件尺寸 {width, height}
     * @param {Object} preferredPosition - 首选位置 {x, y}（可选）
     * @returns {Object} 避开图标的位置 {x, y}
     */
    static _calculateComponentPositionAvoidingIcons(size, preferredPosition = null) {
        if (!DesktopManager._iconsContainer || DesktopManager._arrangementMode === 'auto') {
            // 自由排列模式或没有图标容器，使用首选位置或默认位置
            return preferredPosition || { x: 20, y: 20 };
        }
        
        const containerRect = DesktopManager._iconsContainer.getBoundingClientRect();
        const desktopRect = DesktopManager._desktopContainer ? DesktopManager._desktopContainer.getBoundingClientRect() : { left: 0, top: 0 };
        
        const iconWidth = DesktopManager._getIconWidth();
        const iconHeight = DesktopManager._getIconHeight();
        const spacing = DesktopManager._iconSpacing;
        const padding = 20; // 组件与图标之间的间距
        
        // 获取所有图标的位置
        const iconRects = [];
        DesktopManager._icons.forEach((iconData) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (iconElement) {
                const rect = iconElement.getBoundingClientRect();
                iconRects.push({
                    left: rect.left - desktopRect.left,
                    top: rect.top - desktopRect.top,
                    right: rect.left - desktopRect.left + iconWidth,
                    bottom: rect.top - desktopRect.top + iconHeight
                });
            }
        });
        
        // 尝试首选位置
        if (preferredPosition) {
            const testRect = {
                left: preferredPosition.x,
                top: preferredPosition.y,
                right: preferredPosition.x + size.width,
                bottom: preferredPosition.y + size.height
            };
            
            // 检查是否与图标重叠
            const overlaps = iconRects.some(iconRect => {
                return !(testRect.right + padding < iconRect.left ||
                        testRect.left - padding > iconRect.right ||
                        testRect.bottom + padding < iconRect.top ||
                        testRect.top - padding > iconRect.bottom);
            });
            
            if (!overlaps) {
                return preferredPosition;
            }
        }
        
        // 在图标区域外寻找位置
        const startX = containerRect.width + spacing; // 从图标区域右侧开始
        const startY = spacing;
        const maxX = (DesktopManager._desktopContainer ? DesktopManager._desktopContainer.clientWidth : window.innerWidth) - size.width - spacing;
        const maxY = (DesktopManager._desktopContainer ? DesktopManager._desktopContainer.clientHeight : window.innerHeight) - size.height - spacing;
        
        // 尝试多个位置
        const positions = [
            { x: startX, y: startY }, // 图标区域右侧
            { x: spacing, y: containerRect.height + spacing }, // 图标区域下方
            { x: startX, y: containerRect.height + spacing }, // 右下角
            { x: maxX, y: spacing }, // 右上角
            { x: maxX, y: maxY } // 右下角（最远）
        ];
        
        for (const pos of positions) {
            if (pos.x < 0 || pos.y < 0 || pos.x > maxX || pos.y > maxY) {
                continue;
            }
            
            const testRect = {
                left: pos.x,
                top: pos.y,
                right: pos.x + size.width,
                bottom: pos.y + size.height
            };
            
            // 检查是否与图标重叠
            const overlaps = iconRects.some(iconRect => {
                return !(testRect.right + padding < iconRect.left ||
                        testRect.left - padding > iconRect.right ||
                        testRect.bottom + padding < iconRect.top ||
                        testRect.top - padding > iconRect.bottom);
            });
            
            if (!overlaps) {
                return pos;
            }
        }
        
        // 如果所有位置都重叠，返回默认位置（可能在图标上方，但至少能显示）
        return { x: Math.max(spacing, maxX - size.width), y: Math.max(spacing, maxY - size.height) };
    }
    
    /**
     * 创建桌面组件
     * @param {number} pid - 程序PID
     * @param {Object} options - 组件选项
     * @param {string} options.type - 组件类型（可选，用于标识）
     * @param {Object} options.position - 位置 {x, y}（可选，如果不提供则自动避开图标）
     * @param {Object} options.size - 尺寸 {width, height}（可选）
     * @param {Object} options.style - 自定义样式（可选）
     * @param {boolean} options.persistent - 是否持久化（默认false，程序创建的均为非持久化）
     * @param {boolean} options.draggable - 是否可拖动（默认true）
     * @returns {string} 组件ID
     */
    static createComponent(pid, options = {}) {
        if (!DesktopManager._componentsContainer) {
            DesktopManager._createComponentsContainer();
            if (!DesktopManager._componentsContainer) {
                KernelLogger.error("DesktopManager", "无法创建组件：组件容器不存在");
                throw new Error("桌面组件容器未初始化");
            }
        }
        
        const componentId = `desktop-component-${++DesktopManager._componentIdCounter}`;
        const {
            type = 'default',
            position = null, // 默认null，自动计算避开图标的位置
            size = { width: 200, height: 200 },
            style = {},
            persistent = false,
            draggable = true
        } = options;
        
        // 计算位置（如果未指定，自动避开图标）
        const finalPosition = position || DesktopManager._calculateComponentPositionAvoidingIcons(size);
        
        // 创建组件容器
        const componentElement = document.createElement('div');
        componentElement.id = componentId;
        componentElement.className = 'desktop-component';
        componentElement.dataset.pid = pid.toString();
        componentElement.dataset.type = type;
        componentElement.dataset.persistent = persistent.toString();
        componentElement.dataset.draggable = draggable.toString();
        
        // 应用样式
        componentElement.style.cssText = `
            position: absolute;
            left: ${finalPosition.x}px;
            top: ${finalPosition.y}px;
            width: ${size.width}px;
            height: ${size.height}px;
            pointer-events: auto;
            ${draggable ? 'cursor: move;' : ''}
            ${Object.entries(style).map(([key, value]) => {
                const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${cssKey}: ${value};`;
            }).join('')}
        `;
        
        // 创建内容容器（供程序使用）
        const contentContainer = document.createElement('div');
        contentContainer.className = 'desktop-component-content';
        contentContainer.style.cssText = `
            width: 100%;
            height: 100%;
            position: relative;
        `;
        componentElement.appendChild(contentContainer);
        
        // 保存组件数据
        const componentData = {
            id: componentId,
            pid: pid,
            type: type,
            position: position,
            size: size,
            persistent: persistent,
            element: componentElement,
            contentContainer: contentContainer,
            createdAt: Date.now()
        };
        
        DesktopManager._components.set(componentId, componentData);
        
        // 记录到PID映射
        if (!DesktopManager._componentsByPid.has(pid)) {
            DesktopManager._componentsByPid.set(pid, new Set());
        }
        DesktopManager._componentsByPid.get(pid).add(componentId);
        
        // 添加到DOM
        DesktopManager._componentsContainer.appendChild(componentElement);
        
        // 设置拖动功能
        if (draggable) {
            DesktopManager._setupComponentDrag(componentElement, componentData);
        }
        
        KernelLogger.debug("DesktopManager", `创建桌面组件: ${componentId} (PID: ${pid}, 类型: ${type}, 持久化: ${persistent}, 可拖动: ${draggable})`);
        
        return componentId;
    }
    
    /**
     * 设置组件拖动功能
     * @param {HTMLElement} componentElement - 组件元素
     * @param {Object} componentData - 组件数据
     */
    static _setupComponentDrag(componentElement, componentData) {
        // 如果已经设置了拖拽，先移除旧的事件监听器
        if (componentElement._dragHandlers) {
            DesktopManager._removeComponentDrag(componentElement);
        }
        
        // 使用 EventManager 注册拖动事件（如果可用）
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerDrag === 'function') {
            const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
            const componentId = componentData.id;
            const dragState = {
                isDragging: false,
                startX: 0,
                startY: 0,
                initialX: 0,
                initialY: 0
            };
            
            EventManager.registerDrag(
                `desktop-component-${componentId}`,
                componentElement,
                componentElement,
                dragState,
                // onDragStart
                (e) => {
                    // 只处理鼠标左键
                    if (e.button !== 0) {
                        return;
                    }
                    
                    // 如果点击的是按钮或其他交互元素，不启动拖动
                    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                        return;
                    }
                    
                    dragState.isDragging = true;
                    const rect = componentElement.getBoundingClientRect();
                    const containerRect = DesktopManager._componentsContainer.getBoundingClientRect();
                    
                    dragState.startX = e.clientX;
                    dragState.startY = e.clientY;
                    dragState.initialX = rect.left - containerRect.left;
                    dragState.initialY = rect.top - containerRect.top;
                    
                    componentElement.style.zIndex = '1000';
                    componentElement.style.cursor = 'grabbing';
                    componentElement.style.transition = 'none';
                    
                    // 阻止默认行为，避免文本选择等
                    e.preventDefault();
                },
                // onDrag
                (e) => {
                    const moveDeltaX = e.clientX - dragState.startX;
                    const moveDeltaY = e.clientY - dragState.startY;
                    
                    let newX = dragState.initialX + moveDeltaX;
                    let newY = dragState.initialY + moveDeltaY;
                    
                    // 限制在桌面容器内
                    const containerRect = DesktopManager._componentsContainer.getBoundingClientRect();
                    const maxX = containerRect.width - componentData.size.width;
                    const maxY = containerRect.height - componentData.size.height;
                    
                    newX = Math.max(0, Math.min(newX, maxX));
                    newY = Math.max(0, Math.min(newY, maxY));
                    
                    // 在非自由排列模式下，检查是否与图标重叠
                    if (DesktopManager._arrangementMode !== 'auto') {
                        const adjustedPosition = DesktopManager._adjustComponentPositionToAvoidIcons(
                            { x: newX, y: newY },
                            componentData.size
                        );
                        newX = adjustedPosition.x;
                        newY = adjustedPosition.y;
                    }
                    
                    componentElement.style.left = `${newX}px`;
                    componentElement.style.top = `${newY}px`;
                },
                // onDragEnd
                (e) => {
                    dragState.isDragging = false;
                    componentElement.style.zIndex = '';
                    componentElement.style.cursor = 'move';
                    componentElement.style.transition = '';
                    
                    // 更新组件数据
                    const rect = componentElement.getBoundingClientRect();
                    const containerRect = DesktopManager._componentsContainer.getBoundingClientRect();
                    componentData.position = {
                        x: rect.left - containerRect.left,
                        y: rect.top - containerRect.top
                    };
                    
                    KernelLogger.debug("DesktopManager", `组件 ${componentData.id} 拖动完成，新位置: (${componentData.position.x}, ${componentData.position.y})`);
                },
                ['button'] // 排除按钮元素
            );
            
            // 保存拖动状态引用以便清理
            componentElement._dragState = dragState;
            componentElement._dragId = `desktop-component-${componentId}`;
        } else {
            // 降级方案：使用 addEventListener
            let isDragging = false;
            let startX = 0;
            let startY = 0;
            let initialX = 0;
            let initialY = 0;
            
            const handleMouseDown = (e) => {
                // 如果点击的是按钮或其他交互元素，不启动拖动
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    return;
                }
                
                isDragging = true;
                const rect = componentElement.getBoundingClientRect();
                const containerRect = DesktopManager._componentsContainer.getBoundingClientRect();
                
                startX = e.clientX;
                startY = e.clientY;
                initialX = rect.left - containerRect.left;
                initialY = rect.top - containerRect.top;
                
                componentElement.style.zIndex = '1000';
                componentElement.style.cursor = 'grabbing';
                componentElement.style.transition = 'none';
                
                e.preventDefault();
            };
            
            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                const moveDeltaX = e.clientX - startX;
                const moveDeltaY = e.clientY - startY;
                
                let newX = initialX + moveDeltaX;
                let newY = initialY + moveDeltaY;
                
                // 限制在桌面容器内
                const containerRect = DesktopManager._componentsContainer.getBoundingClientRect();
                const maxX = containerRect.width - componentData.size.width;
                const maxY = containerRect.height - componentData.size.height;
                
                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));
                
                // 在非自由排列模式下，检查是否与图标重叠
                if (DesktopManager._arrangementMode !== 'auto') {
                    const adjustedPosition = DesktopManager._adjustComponentPositionToAvoidIcons(
                        { x: newX, y: newY },
                        componentData.size
                    );
                    newX = adjustedPosition.x;
                    newY = adjustedPosition.y;
                }
                
                componentElement.style.left = `${newX}px`;
                componentElement.style.top = `${newY}px`;
            };
            
            const handleMouseUp = () => {
                if (!isDragging) return;
                
                isDragging = false;
                componentElement.style.zIndex = '';
                componentElement.style.cursor = 'move';
                componentElement.style.transition = '';
                
                // 更新组件数据
                const rect = componentElement.getBoundingClientRect();
                const containerRect = DesktopManager._componentsContainer.getBoundingClientRect();
                componentData.position = {
                    x: rect.left - containerRect.left,
                    y: rect.top - containerRect.top
                };
                
                KernelLogger.debug("DesktopManager", `组件 ${componentData.id} 拖动完成，新位置: (${componentData.position.x}, ${componentData.position.y})`);
            };
            
            componentElement.addEventListener('mousedown', handleMouseDown);
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            // 保存事件处理器以便清理
            componentElement._dragHandlers = {
                mousedown: handleMouseDown,
                mousemove: handleMouseMove,
                mouseup: handleMouseUp
            };
        }
    }
    
    /**
     * 移除组件拖动功能
     * @param {HTMLElement} componentElement - 组件元素
     */
    static _removeComponentDrag(componentElement) {
        // 如果使用 EventManager，注销拖动
        if (componentElement._dragId && typeof EventManager !== 'undefined' && typeof EventManager.unregisterDrag === 'function') {
            EventManager.unregisterDrag(componentElement._dragId);
            delete componentElement._dragId;
            delete componentElement._dragState;
        }
        
        // 如果使用降级方案，移除事件监听器
        if (componentElement._dragHandlers) {
            const handlers = componentElement._dragHandlers;
            componentElement.removeEventListener('mousedown', handlers.mousedown);
            document.removeEventListener('mousemove', handlers.mousemove);
            document.removeEventListener('mouseup', handlers.mouseup);
            delete componentElement._dragHandlers;
        }
    }
    
    /**
     * 调整组件位置以避开图标
     * @param {Object} position - 当前位置 {x, y}
     * @param {Object} size - 组件尺寸 {width, height}
     * @returns {Object} 调整后的位置 {x, y}
     */
    static _adjustComponentPositionToAvoidIcons(position, size) {
        if (!DesktopManager._iconsContainer || DesktopManager._arrangementMode === 'auto') {
            return position;
        }
        
        const padding = 20; // 组件与图标之间的间距
        const iconWidth = DesktopManager._getIconWidth();
        const iconHeight = DesktopManager._getIconHeight();
        
        const componentRect = {
            left: position.x,
            top: position.y,
            right: position.x + size.width,
            bottom: position.y + size.height
        };
        
        // 获取所有图标的位置
        const iconRects = [];
        DesktopManager._icons.forEach((iconData) => {
            const iconElement = document.getElementById(`desktop-icon-${iconData.id}`);
            if (iconElement) {
                const rect = iconElement.getBoundingClientRect();
                const containerRect = DesktopManager._iconsContainer.getBoundingClientRect();
                iconRects.push({
                    left: rect.left - containerRect.left,
                    top: rect.top - containerRect.top,
                    right: rect.left - containerRect.left + iconWidth,
                    bottom: rect.top - containerRect.top + iconHeight
                });
            }
        });
        
        // 检查是否与图标重叠
        const overlaps = iconRects.some(iconRect => {
            return !(componentRect.right + padding < iconRect.left ||
                    componentRect.left - padding > iconRect.right ||
                    componentRect.bottom + padding < iconRect.top ||
                    componentRect.top - padding > iconRect.bottom);
        });
        
        if (!overlaps) {
            return position;
        }
        
        // 如果重叠，尝试调整位置
        // 优先向右移动，如果不行则向下移动
        let adjustedX = position.x;
        let adjustedY = position.y;
        
        // 找到最近的图标
        let minDistance = Infinity;
        let nearestIcon = null;
        
        iconRects.forEach(iconRect => {
            const centerX = (iconRect.left + iconRect.right) / 2;
            const centerY = (iconRect.top + iconRect.bottom) / 2;
            const componentCenterX = (componentRect.left + componentRect.right) / 2;
            const componentCenterY = (componentRect.top + componentRect.bottom) / 2;
            
            const distance = Math.sqrt(
                Math.pow(centerX - componentCenterX, 2) +
                Math.pow(centerY - componentCenterY, 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestIcon = iconRect;
            }
        });
        
        if (nearestIcon) {
            // 尝试放在图标右侧
            if (nearestIcon.right + padding + size.width <= DesktopManager._componentsContainer.clientWidth) {
                adjustedX = nearestIcon.right + padding;
                adjustedY = nearestIcon.top;
            }
            // 尝试放在图标下方
            else if (nearestIcon.bottom + padding + size.height <= DesktopManager._componentsContainer.clientHeight) {
                adjustedX = nearestIcon.left;
                adjustedY = nearestIcon.bottom + padding;
            }
            // 尝试放在图标左侧
            else if (nearestIcon.left - padding - size.width >= 0) {
                adjustedX = nearestIcon.left - padding - size.width;
                adjustedY = nearestIcon.top;
            }
            // 尝试放在图标上方
            else if (nearestIcon.top - padding - size.height >= 0) {
                adjustedX = nearestIcon.left;
                adjustedY = nearestIcon.top - padding - size.height;
            }
        }
        
        // 限制在容器内
        const containerRect = DesktopManager._componentsContainer.getBoundingClientRect();
        adjustedX = Math.max(0, Math.min(adjustedX, containerRect.width - size.width));
        adjustedY = Math.max(0, Math.min(adjustedY, containerRect.height - size.height));
        
        return { x: adjustedX, y: adjustedY };
    }
    
    /**
     * 获取组件内容容器（供程序使用）
     * @param {string} componentId - 组件ID
     * @returns {HTMLElement|null} 内容容器元素
     */
    static getComponentContentContainer(componentId) {
        const componentData = DesktopManager._components.get(componentId);
        if (!componentData) {
            KernelLogger.warn("DesktopManager", `组件不存在: ${componentId}`);
            return null;
        }
        return componentData.contentContainer;
    }
    
    /**
     * 更新组件位置
     * @param {string} componentId - 组件ID
     * @param {Object} position - 新位置 {x, y}
     */
    static updateComponentPosition(componentId, position) {
        const componentData = DesktopManager._components.get(componentId);
        if (!componentData) {
            KernelLogger.warn("DesktopManager", `组件不存在: ${componentId}`);
            return;
        }
        
        componentData.position = position;
        componentData.element.style.left = `${position.x}px`;
        componentData.element.style.top = `${position.y}px`;
        
        KernelLogger.debug("DesktopManager", `更新组件位置: ${componentId} -> (${position.x}, ${position.y})`);
    }
    
    /**
     * 更新组件尺寸
     * @param {string} componentId - 组件ID
     * @param {Object} size - 新尺寸 {width, height}
     */
    static updateComponentSize(componentId, size) {
        const componentData = DesktopManager._components.get(componentId);
        if (!componentData) {
            KernelLogger.warn("DesktopManager", `组件不存在: ${componentId}`);
            return;
        }
        
        componentData.size = size;
        componentData.element.style.width = `${size.width}px`;
        componentData.element.style.height = `${size.height}px`;
        
        KernelLogger.debug("DesktopManager", `更新组件尺寸: ${componentId} -> ${size.width}x${size.height}`);
    }
    
    /**
     * 更新组件样式
     * @param {string} componentId - 组件ID
     * @param {Object} style - 样式对象
     */
    static updateComponentStyle(componentId, style) {
        const componentData = DesktopManager._components.get(componentId);
        if (!componentData) {
            KernelLogger.warn("DesktopManager", `组件不存在: ${componentId}`);
            return;
        }
        
        Object.entries(style).forEach(([key, value]) => {
            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            componentData.element.style[cssKey] = value;
        });
        
        KernelLogger.debug("DesktopManager", `更新组件样式: ${componentId}`);
    }
    
    /**
     * 删除组件
     * @param {string} componentId - 组件ID
     * @param {boolean} force - 是否强制删除（包括持久化组件）
     */
    static removeComponent(componentId, force = false) {
        const componentData = DesktopManager._components.get(componentId);
        if (!componentData) {
            KernelLogger.warn("DesktopManager", `组件不存在: ${componentId}`);
            return false;
        }
        
        // 检查是否为持久化组件
        if (componentData.persistent && !force) {
            KernelLogger.warn("DesktopManager", `无法删除持久化组件: ${componentId}`);
            return false;
        }
        
        // 清理拖动事件监听器
        if (componentData.element) {
            DesktopManager._removeComponentDrag(componentData.element);
        }
        
        // 从DOM移除
        if (componentData.element && componentData.element.parentNode) {
            componentData.element.parentNode.removeChild(componentData.element);
        }
        
        // 从映射中移除
        const pid = componentData.pid;
        if (DesktopManager._componentsByPid.has(pid)) {
            DesktopManager._componentsByPid.get(pid).delete(componentId);
            if (DesktopManager._componentsByPid.get(pid).size === 0) {
                DesktopManager._componentsByPid.delete(pid);
            }
        }
        
        DesktopManager._components.delete(componentId);
        
        KernelLogger.debug("DesktopManager", `删除桌面组件: ${componentId} (PID: ${pid})`);
        return true;
    }
    
    /**
     * 获取程序创建的所有组件ID
     * @param {number} pid - 程序PID
     * @returns {Array<string>} 组件ID数组
     */
    static getComponentsByPid(pid) {
        const componentIds = DesktopManager._componentsByPid.get(pid);
        return componentIds ? Array.from(componentIds) : [];
    }
    
    /**
     * 获取组件信息
     * @param {string} componentId - 组件ID
     * @returns {Object|null} 组件数据
     */
    static getComponentInfo(componentId) {
        const componentData = DesktopManager._components.get(componentId);
        if (!componentData) {
            return null;
        }
        
        return {
            id: componentData.id,
            pid: componentData.pid,
            type: componentData.type,
            position: { ...componentData.position },
            size: { ...componentData.size },
            persistent: componentData.persistent,
            createdAt: componentData.createdAt
        };
    }
    
    /**
     * 获取所有组件信息
     * @param {number|null} pid - 可选，如果提供则只返回该程序的组件
     * @returns {Array<Object>} 组件信息数组
     */
    static getAllComponents(pid = null) {
        if (pid !== null) {
            const componentIds = DesktopManager.getComponentsByPid(pid);
            return componentIds.map(id => DesktopManager.getComponentInfo(id)).filter(info => info !== null);
        }
        
        return Array.from(DesktopManager._components.values()).map(data => ({
            id: data.id,
            pid: data.pid,
            type: data.type,
            position: { ...data.position },
            size: { ...data.size },
            persistent: data.persistent,
            createdAt: data.createdAt
        }));
    }
    
    /**
     * 清理程序创建的所有非持久化组件
     * @param {number} pid - 程序PID
     */
    static cleanupProgramComponents(pid) {
        const componentIds = DesktopManager.getComponentsByPid(pid);
        if (componentIds.length === 0) {
            return;
        }
        
        KernelLogger.debug("DesktopManager", `清理程序 PID ${pid} 的桌面组件 (${componentIds.length} 个)`);
        
        let removedCount = 0;
        componentIds.forEach(componentId => {
            const componentData = DesktopManager._components.get(componentId);
            if (componentData && !componentData.persistent) {
                if (DesktopManager.removeComponent(componentId, false)) {
                    removedCount++;
                }
            }
        });
        
        KernelLogger.info("DesktopManager", `已清理程序 PID ${pid} 的 ${removedCount} 个桌面组件`);
    }
    
    /**
     * 检查组件是否存在
     * @param {string} componentId - 组件ID
     * @returns {boolean}
     */
    static hasComponent(componentId) {
        return DesktopManager._components.has(componentId);
    }
}

// 自动初始化（延迟，等待其他模块加载）
if (typeof document !== 'undefined') {
    // 等待DOM和依赖模块加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => DesktopManager.init(), 500);
        });
    } else {
        setTimeout(() => DesktopManager.init(), 500);
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../system/ui/desktop.js");
}
 