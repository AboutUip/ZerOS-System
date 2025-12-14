// 主题管理器
// 负责统一管理整个系统的GUI主题与风格
// 依赖 LStorage 保存主题设置到 D:/LocalSData.json
// 支持主题（颜色）和风格（GUI样式）的独立管理

KernelLogger.info("ThemeManager", "模块初始化");

class ThemeManager {
    // 当前主题ID
    static _currentThemeId = null;
    // 当前风格ID
    static _currentStyleId = null;
    // 主题定义
    static _themes = new Map();
    // 风格定义
    static _styles = new Map();
    // 主题变更监听器
    static _themeChangeListeners = [];
    // 风格变更监听器
    static _styleChangeListeners = [];
    // 是否已初始化
    static _initialized = false;
    
    // 存储键
    static STORAGE_KEY_THEME = 'system.theme';
    static STORAGE_KEY_STYLE = 'system.style';
    static STORAGE_KEY_DESKTOP_BACKGROUND = 'system.desktopBackground';
    static STORAGE_KEY_ANIMATION_PRESET = 'system.animationPreset';
    
    // 当前桌面背景图ID
    static _currentDesktopBackgroundId = null;
    
    // 桌面背景图定义
    static _desktopBackgrounds = new Map();
    
    // 当前动画预设ID
    static _currentAnimationPresetId = null;
    
    // 动画预设定义
    static _animationPresets = new Map();
    
    // 动画预设变更监听器
    static _animationPresetChangeListeners = [];
    
    /**
     * 初始化主题管理器
     * @returns {Promise<void>}
     */
    static async init() {
        if (ThemeManager._initialized) {
            KernelLogger.debug("ThemeManager", "已初始化，跳过");
            return;
        }
        
        KernelLogger.info("ThemeManager", "初始化主题管理器");
        
        // 注册内置主题和风格
        ThemeManager._registerBuiltinThemes();
        ThemeManager._registerBuiltinStyles();
        
        // 注册内置桌面背景图
        ThemeManager._registerBuiltinDesktopBackgrounds();
        
        // 注册内置动画预设
        ThemeManager._registerBuiltinAnimationPresets();
        
        // 从 LStorage 加载保存的主题和风格
        if (typeof LStorage !== 'undefined') {
            try {
                const savedThemeId = await LStorage.getSystemStorage(ThemeManager.STORAGE_KEY_THEME);
                if (savedThemeId && ThemeManager._themes.has(savedThemeId)) {
                    ThemeManager._currentThemeId = savedThemeId;
                    KernelLogger.info("ThemeManager", `加载保存的主题: ${savedThemeId}`);
                } else {
                    ThemeManager._currentThemeId = 'default';
                    KernelLogger.info("ThemeManager", "使用默认主题");
                }
                
                const savedStyleId = await LStorage.getSystemStorage(ThemeManager.STORAGE_KEY_STYLE);
                if (savedStyleId && ThemeManager._styles.has(savedStyleId)) {
                    ThemeManager._currentStyleId = savedStyleId;
                    KernelLogger.info("ThemeManager", `加载保存的风格: ${savedStyleId}`);
                } else {
                    ThemeManager._currentStyleId = 'ubuntu';
                    KernelLogger.info("ThemeManager", "使用默认风格");
                }
                
                const savedBackgroundId = await LStorage.getSystemStorage(ThemeManager.STORAGE_KEY_DESKTOP_BACKGROUND);
                // 确保 savedBackgroundId 是有效的字符串
                if (savedBackgroundId && typeof savedBackgroundId === 'string' && savedBackgroundId.trim() !== '') {
                    const trimmedId = savedBackgroundId.trim();
                    if (ThemeManager._desktopBackgrounds.has(trimmedId)) {
                        ThemeManager._currentDesktopBackgroundId = trimmedId;
                        KernelLogger.info("ThemeManager", `加载保存的桌面背景: ${trimmedId}`);
                    } else if (trimmedId.startsWith('local_')) {
                        // 如果是本地图片背景ID，尝试从存储中加载本地背景信息
                        const localBackgrounds = await LStorage.getSystemStorage('system.localDesktopBackgrounds');
                        if (localBackgrounds && Array.isArray(localBackgrounds)) {
                            // 查找匹配的本地背景
                            const localBg = localBackgrounds.find(bg => bg && bg.id === trimmedId);
                            if (localBg && localBg.path) {
                                // 重新注册本地背景
                                ThemeManager.registerDesktopBackground(localBg.id, {
                                    id: localBg.id,
                                    name: localBg.name || localBg.id,
                                    description: localBg.description || `本地图片: ${localBg.path}`,
                                    path: localBg.path
                                });
                                ThemeManager._currentDesktopBackgroundId = trimmedId;
                                KernelLogger.info("ThemeManager", `重新注册并加载本地桌面背景: ${trimmedId} (${localBg.path})`);
                            } else {
                                KernelLogger.warn("ThemeManager", `保存的本地桌面背景 ${trimmedId} 信息不存在，使用默认背景`);
                                ThemeManager._currentDesktopBackgroundId = 'default';
                            }
                        } else {
                            // 如果没有保存的本地背景列表，尝试从ID中提取路径（向后兼容）
                            KernelLogger.warn("ThemeManager", `保存的本地桌面背景 ${trimmedId} 未找到，使用默认背景`);
                            ThemeManager._currentDesktopBackgroundId = 'default';
                        }
                    } else {
                        KernelLogger.warn("ThemeManager", `保存的桌面背景 ${trimmedId} 不存在，使用默认背景`);
                        ThemeManager._currentDesktopBackgroundId = 'default';
                    }
                } else {
                    if (savedBackgroundId !== null && savedBackgroundId !== undefined) {
                        KernelLogger.warn("ThemeManager", `保存的桌面背景ID无效: ${savedBackgroundId} (类型: ${typeof savedBackgroundId})，使用默认背景`);
                    }
                    ThemeManager._currentDesktopBackgroundId = 'default';
                    KernelLogger.info("ThemeManager", "使用默认桌面背景");
                }
            } catch (e) {
                KernelLogger.warn("ThemeManager", `加载主题/风格/背景失败: ${e.message}，使用默认值`);
                ThemeManager._currentThemeId = 'default';
                ThemeManager._currentStyleId = 'ubuntu';
                ThemeManager._currentDesktopBackgroundId = 'default';
            }
        } else {
            ThemeManager._currentThemeId = 'default';
            ThemeManager._currentStyleId = 'ubuntu';
            ThemeManager._currentDesktopBackgroundId = 'default';
            KernelLogger.warn("ThemeManager", "LStorage 不可用，使用默认主题和风格");
        }
        
        // 应用当前主题和风格
        ThemeManager._applyTheme(ThemeManager._currentThemeId);
        ThemeManager._applyStyle(ThemeManager._currentStyleId);
        await ThemeManager._applyDesktopBackground(ThemeManager._currentDesktopBackgroundId);
        
        ThemeManager._initialized = true;
        KernelLogger.info("ThemeManager", "主题管理器初始化完成");
    }
    
    /**
     * 注册内置主题（高级主题）
     */
    static _registerBuiltinThemes() {
        // 主题1：默认主题 - 深色科技风格（高级版）
        ThemeManager.registerTheme('default', {
            id: 'default',
            name: '默认主题',
            description: '深色科技风格，紫色和蓝色渐变，现代感十足',
            colors: {
                // 背景色（多层次渐变，更深）
                background: '#050810',
                backgroundSecondary: '#0f1419',
                backgroundTertiary: '#1a1f28',
                backgroundElevated: '#252b35',
                
                // 文字色（高对比度）
                text: '#d7e0dd',
                textSecondary: '#b8c5c0',
                textMuted: '#8a9a94',
                textDisabled: '#5a6a64',
                
                // 强调色（渐变系统）- 调整为更柔和的紫色蓝色调
                primary: '#8b5cf6',
                primaryLight: 'rgba(139, 92, 246, 0.15)',
                primaryDark: '#7c3aed',
                primaryGradient: 'linear-gradient(135deg, #8b5cf6, #6c8eff)',
                secondary: '#6c8eff',
                secondaryLight: '#8da6ff',
                secondaryDark: '#5a7aff',
                secondaryGradient: 'linear-gradient(135deg, #6c8eff, #8b5cf6)',
                
                // 状态色（完整系统）- 调整为更柔和的色调
                success: '#4ade80',
                successLight: '#6ee7b7',
                successDark: '#22c55e',
                successGradient: 'linear-gradient(135deg, #4ade80, #22c55e)',
                warning: '#fbbf24',
                warningLight: '#fcd34d',
                warningDark: '#f59e0b',
                warningGradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                error: '#ef4444',
                errorLight: '#f87171',
                errorDark: '#dc2626',
                errorGradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
                info: '#6366f1',
                infoLight: '#818cf8',
                infoDark: '#4f46e5',
                infoGradient: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                
                // 边框色（多层次）
                border: 'rgba(139, 92, 246, 0.25)',
                borderLight: 'rgba(139, 92, 246, 0.15)',
                borderDark: 'rgba(139, 92, 246, 0.35)',
                borderFocus: 'rgba(139, 92, 246, 0.5)',
                
                // 阴影色（多层次）
                shadow: 'rgba(0, 0, 0, 0.5)',
                shadowLight: 'rgba(0, 0, 0, 0.3)',
                shadowDark: 'rgba(0, 0, 0, 0.7)',
                shadowColored: 'rgba(139, 92, 246, 0.3)',
                
                // 特殊色
                accent: '#8b5cf6',
                accentGradient: 'linear-gradient(135deg, #8b5cf6, #6c8eff)',
                glow: 'rgba(139, 92, 246, 0.6)',
                
                // Glow 效果（用于发光效果）
                primaryGlow: 'rgba(139, 92, 246, 0.7)',
                secondaryGlow: 'rgba(108, 142, 255, 0.5)',
                successGlow: 'rgba(74, 222, 128, 0.5)',
                warningGlow: 'rgba(251, 191, 36, 0.5)',
                errorGlow: 'rgba(239, 68, 68, 0.5)',
            }
        });
        
        // 主题2：深蓝主题 - 专业商务风格（高级版）
        ThemeManager.registerTheme('deep-blue', {
            id: 'deep-blue',
            name: '深蓝主题',
            description: '深蓝色调，专业商务风格，沉稳大气',
            colors: {
                background: '#0f172a',
                backgroundSecondary: '#1e293b',
                backgroundTertiary: '#334155',
                backgroundElevated: '#475569',
                
                text: '#f1f5f9',
                textSecondary: '#e2e8f0',
                textMuted: '#cbd5e1',
                textDisabled: '#94a3b8',
                
                primary: '#3b82f6',
                primaryLight: 'rgba(59, 130, 246, 0.15)',
                primaryDark: '#2563eb',
                primaryGradient: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                secondary: '#1e40af',
                secondaryLight: '#4a6cf7',
                secondaryDark: '#1e3a8a',
                secondaryGradient: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                
                success: '#10b981',
                successLight: '#34d399',
                successDark: '#059669',
                successGradient: 'linear-gradient(135deg, #10b981, #059669)',
                warning: '#f59e0b',
                warningLight: '#fbbf24',
                warningDark: '#d97706',
                warningGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
                error: '#ef4444',
                errorLight: '#f87171',
                errorDark: '#dc2626',
                errorGradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
                info: '#0ea5e9',
                infoLight: '#38bdf8',
                infoDark: '#0284c7',
                infoGradient: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                
                border: 'rgba(59, 130, 246, 0.25)',
                borderLight: 'rgba(59, 130, 246, 0.15)',
                borderDark: 'rgba(59, 130, 246, 0.35)',
                borderFocus: 'rgba(59, 130, 246, 0.5)',
                
                shadow: 'rgba(0, 0, 0, 0.5)',
                shadowLight: 'rgba(0, 0, 0, 0.3)',
                shadowDark: 'rgba(0, 0, 0, 0.7)',
                shadowColored: 'rgba(59, 130, 246, 0.3)',
                
                accent: '#3b82f6',
                accentGradient: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                glow: 'rgba(59, 130, 246, 0.6)',
                
                // Glow 效果（用于发光效果）
                primaryGlow: 'rgba(59, 130, 246, 0.7)',
                secondaryGlow: 'rgba(30, 64, 175, 0.5)',
                successGlow: 'rgba(16, 185, 129, 0.5)',
                warningGlow: 'rgba(245, 158, 11, 0.5)',
                errorGlow: 'rgba(239, 68, 68, 0.5)',
            }
        });
        
        // 主题3：绿色主题 - 护眼绿色调（高级版）
        ThemeManager.registerTheme('green', {
            id: 'green',
            name: '绿色主题',
            description: '护眼绿色调，舒适阅读体验，自然清新',
            colors: {
                background: '#0d1b0f',
                backgroundSecondary: '#1a2e1f',
                backgroundTertiary: '#27402f',
                backgroundElevated: '#32523f',
                
                text: '#d4e8d9',
                textSecondary: '#b8d4c0',
                textMuted: '#9ab8a7',
                textDisabled: '#7a9a87',
                
                primary: '#22c55e',
                primaryLight: 'rgba(34, 197, 94, 0.15)',
                primaryDark: '#16a34a',
                primaryGradient: 'linear-gradient(135deg, #22c55e, #10b981)',
                secondary: '#10b981',
                secondaryLight: '#34d399',
                secondaryDark: '#059669',
                secondaryGradient: 'linear-gradient(135deg, #10b981, #22c55e)',
                
                success: '#22c55e',
                successLight: '#4ade80',
                successDark: '#16a34a',
                successGradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
                warning: '#eab308',
                warningLight: '#facc15',
                warningDark: '#ca8a04',
                warningGradient: 'linear-gradient(135deg, #eab308, #ca8a04)',
                error: '#f87171',
                errorLight: '#fca5a5',
                errorDark: '#ef4444',
                errorGradient: 'linear-gradient(135deg, #f87171, #ef4444)',
                info: '#14b8a6',
                infoLight: '#5eead4',
                infoDark: '#0d9488',
                infoGradient: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                
                border: 'rgba(34, 197, 94, 0.25)',
                borderLight: 'rgba(34, 197, 94, 0.15)',
                borderDark: 'rgba(34, 197, 94, 0.35)',
                borderFocus: 'rgba(34, 197, 94, 0.5)',
                
                shadow: 'rgba(0, 0, 0, 0.5)',
                shadowLight: 'rgba(0, 0, 0, 0.3)',
                shadowDark: 'rgba(0, 0, 0, 0.7)',
                shadowColored: 'rgba(34, 197, 94, 0.3)',
                
                accent: '#22c55e',
                accentGradient: 'linear-gradient(135deg, #22c55e, #10b981)',
                glow: 'rgba(34, 197, 94, 0.6)',
                
                // Glow 效果（用于发光效果）
                primaryGlow: 'rgba(34, 197, 94, 0.7)',
                secondaryGlow: 'rgba(16, 185, 129, 0.5)',
                successGlow: 'rgba(34, 197, 94, 0.5)',
                warningGlow: 'rgba(234, 179, 8, 0.5)',
                errorGlow: 'rgba(248, 113, 113, 0.5)',
            }
        });
        
        // 主题4：橙色主题 - 温暖橙色调（高级版）
        ThemeManager.registerTheme('orange', {
            id: 'orange',
            name: '橙色主题',
            description: '温暖橙色调，活力四射，充满能量',
            colors: {
                background: '#1a0f0a',
                backgroundSecondary: '#2e1f1a',
                backgroundTertiary: '#402f27',
                backgroundElevated: '#523f35',
                
                text: '#e8ddd4',
                textSecondary: '#d4c5b8',
                textMuted: '#b8a89a',
                textDisabled: '#9a877a',
                
                primary: '#f97316',
                primaryLight: 'rgba(249, 115, 22, 0.15)',
                primaryDark: '#ea580c',
                primaryGradient: 'linear-gradient(135deg, #f97316, #ff8c42)',
                secondary: '#ff8c42',
                secondaryLight: '#ffa366',
                secondaryDark: '#ff6b1a',
                secondaryGradient: 'linear-gradient(135deg, #ff8c42, #f97316)',
                
                success: '#22c55e',
                successLight: '#4ade80',
                successDark: '#16a34a',
                successGradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
                warning: '#f59e0b',
                warningLight: '#fbbf24',
                warningDark: '#d97706',
                warningGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
                error: '#ef4444',
                errorLight: '#f87171',
                errorDark: '#dc2626',
                errorGradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
                info: '#f59e0b',
                infoLight: '#fbbf24',
                infoDark: '#d97706',
                infoGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
                
                border: 'rgba(249, 115, 22, 0.25)',
                borderLight: 'rgba(249, 115, 22, 0.15)',
                borderDark: 'rgba(249, 115, 22, 0.35)',
                borderFocus: 'rgba(249, 115, 22, 0.5)',
                
                shadow: 'rgba(0, 0, 0, 0.5)',
                shadowLight: 'rgba(0, 0, 0, 0.3)',
                shadowDark: 'rgba(0, 0, 0, 0.7)',
                shadowColored: 'rgba(249, 115, 22, 0.3)',
                
                accent: '#f97316',
                accentGradient: 'linear-gradient(135deg, #f97316, #ff8c42)',
                glow: 'rgba(249, 115, 22, 0.6)',
                
                // Glow 效果（用于发光效果）
                primaryGlow: 'rgba(249, 115, 22, 0.7)',
                secondaryGlow: 'rgba(255, 140, 66, 0.5)',
                successGlow: 'rgba(34, 197, 94, 0.5)',
                warningGlow: 'rgba(245, 158, 11, 0.5)',
                errorGlow: 'rgba(239, 68, 68, 0.5)',
            }
        });
        
        // 主题5：红色主题 - 热情红色调（高级版）
        ThemeManager.registerTheme('red', {
            id: 'red',
            name: '红色主题',
            description: '热情红色调，充满活力，激情澎湃',
            colors: {
                background: '#1a0a0a',
                backgroundSecondary: '#2e1a1a',
                backgroundTertiary: '#402727',
                backgroundElevated: '#523535',
                
                text: '#e8d4d4',
                textSecondary: '#d4b8b8',
                textMuted: '#b89a9a',
                textDisabled: '#9a7a7a',
                
                primary: '#ef4444',
                primaryLight: 'rgba(239, 68, 68, 0.15)',
                primaryDark: '#dc2626',
                primaryGradient: 'linear-gradient(135deg, #ef4444, #f43f5e)',
                secondary: '#f43f5e',
                secondaryLight: '#fb7185',
                secondaryDark: '#e11d48',
                secondaryGradient: 'linear-gradient(135deg, #f43f5e, #ef4444)',
                
                success: '#22c55e',
                successLight: '#4ade80',
                successDark: '#16a34a',
                successGradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
                warning: '#f59e0b',
                warningLight: '#fbbf24',
                warningDark: '#d97706',
                warningGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
                error: '#ef4444',
                errorLight: '#f87171',
                errorDark: '#dc2626',
                errorGradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
                info: '#ec4899',
                infoLight: '#f472b6',
                infoDark: '#db2777',
                infoGradient: 'linear-gradient(135deg, #ec4899, #db2777)',
                
                border: 'rgba(239, 68, 68, 0.25)',
                borderLight: 'rgba(239, 68, 68, 0.15)',
                borderDark: 'rgba(239, 68, 68, 0.35)',
                borderFocus: 'rgba(239, 68, 68, 0.5)',
                
                shadow: 'rgba(0, 0, 0, 0.5)',
                shadowLight: 'rgba(0, 0, 0, 0.3)',
                shadowDark: 'rgba(0, 0, 0, 0.7)',
                shadowColored: 'rgba(239, 68, 68, 0.3)',
                
                accent: '#ef4444',
                accentGradient: 'linear-gradient(135deg, #ef4444, #f43f5e)',
                glow: 'rgba(239, 68, 68, 0.6)',
                
                // Glow 效果（用于发光效果）
                primaryGlow: 'rgba(239, 68, 68, 0.7)',
                secondaryGlow: 'rgba(244, 63, 94, 0.5)',
                successGlow: 'rgba(34, 197, 94, 0.5)',
                warningGlow: 'rgba(245, 158, 11, 0.5)',
                errorGlow: 'rgba(239, 68, 68, 0.5)',
            }
        });
        
        // 主题6：玻璃主题 - 磨砂玻璃质感（高级版）
        ThemeManager.registerTheme('glass', {
            id: 'glass',
            name: '玻璃主题',
            description: '磨砂玻璃质感，透明朦胧，现代时尚',
            colors: {
                // 背景色（半透明，适合玻璃效果）
                background: 'rgba(15, 20, 30, 0.6)',
                backgroundSecondary: 'rgba(25, 30, 40, 0.7)',
                backgroundTertiary: 'rgba(35, 40, 50, 0.75)',
                backgroundElevated: 'rgba(45, 50, 60, 0.8)',
                
                // 文字色（高对比度，确保在玻璃背景上可读）
                text: '#ffffff',
                textSecondary: '#e0e0e0',
                textMuted: '#b0b0b0',
                textDisabled: '#808080',
                
                // 强调色（柔和透明）
                primary: '#60a5fa',
                primaryLight: 'rgba(96, 165, 250, 0.2)',
                primaryDark: '#3b82f6',
                primaryGradient: 'linear-gradient(135deg, rgba(96, 165, 250, 0.8), rgba(59, 130, 246, 0.8))',
                secondary: '#818cf8',
                secondaryLight: 'rgba(129, 140, 248, 0.2)',
                secondaryDark: '#6366f1',
                secondaryGradient: 'linear-gradient(135deg, rgba(129, 140, 248, 0.8), rgba(99, 102, 241, 0.8))',
                
                // 状态色（透明柔和）
                success: '#34d399',
                successLight: 'rgba(52, 211, 153, 0.2)',
                successDark: '#10b981',
                successGradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.8), rgba(16, 185, 129, 0.8))',
                warning: '#fbbf24',
                warningLight: 'rgba(251, 191, 36, 0.2)',
                warningDark: '#f59e0b',
                warningGradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.8), rgba(245, 158, 11, 0.8))',
                error: '#f87171',
                errorLight: 'rgba(248, 113, 113, 0.2)',
                errorDark: '#ef4444',
                errorGradient: 'linear-gradient(135deg, rgba(248, 113, 113, 0.8), rgba(239, 68, 68, 0.8))',
                info: '#60a5fa',
                infoLight: 'rgba(96, 165, 250, 0.2)',
                infoDark: '#3b82f6',
                infoGradient: 'linear-gradient(135deg, rgba(96, 165, 250, 0.8), rgba(59, 130, 246, 0.8))',
                
                // 边框色（透明）
                border: 'rgba(255, 255, 255, 0.2)',
                borderLight: 'rgba(255, 255, 255, 0.1)',
                borderDark: 'rgba(255, 255, 255, 0.3)',
                borderFocus: 'rgba(96, 165, 250, 0.5)',
                
                // 阴影色（柔和）
                shadow: 'rgba(0, 0, 0, 0.3)',
                shadowLight: 'rgba(0, 0, 0, 0.2)',
                shadowDark: 'rgba(0, 0, 0, 0.5)',
                shadowColored: 'rgba(96, 165, 250, 0.2)',
                
                // 特殊色
                accent: '#60a5fa',
                accentGradient: 'linear-gradient(135deg, rgba(96, 165, 250, 0.8), rgba(59, 130, 246, 0.8))',
                glow: 'rgba(96, 165, 250, 0.5)',
                
                // Glow 效果（用于发光效果）
                primaryGlow: 'rgba(96, 165, 250, 0.6)',
                secondaryGlow: 'rgba(129, 140, 248, 0.4)',
                successGlow: 'rgba(52, 211, 153, 0.4)',
                warningGlow: 'rgba(251, 191, 36, 0.4)',
                errorGlow: 'rgba(248, 113, 113, 0.4)',
            }
        });
        
        KernelLogger.info("ThemeManager", `已注册 ${ThemeManager._themes.size} 个内置主题`);
    }
    
    /**
     * 注册内置GUI风格
     */
    static _registerBuiltinStyles() {
        // 风格1：Ubuntu风格 - 高仿Ubuntu GNOME风格
        ThemeManager.registerStyle('ubuntu', {
            id: 'ubuntu',
            name: 'Ubuntu风格',
            description: '高仿Ubuntu GNOME桌面，圆角窗口，Adwaita风格，毛玻璃效果',
            styles: {
                // 窗口样式（默认主题不使用磨砂玻璃效果）
                window: {
                    borderRadius: '12px', // Ubuntu GNOME的圆角
                    borderWidth: '1px', // Ubuntu GNOME有细边框
                    backdropFilter: 'none', // 默认主题不使用磨砂玻璃效果
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.1) inset', // Ubuntu风格的阴影
                    boxShadowFocused: '0 12px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.3) inset, 0 0 24px rgba(139, 92, 246, 0.2)',
                    boxShadowUnfocused: '0 4px 16px rgba(0, 0, 0, 0.3)',
                    opacityUnfocused: 0.85,
                },
                // 任务栏样式
                taskbar: {
                    borderRadius: '0', // Ubuntu Dock无圆角
                    backdropFilter: 'blur(30px) saturate(200%)', // Ubuntu Dock的毛玻璃效果
                    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.1) inset', // Ubuntu Dock的阴影
                },
                // 按钮样式
                button: {
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                    boxShadowHover: '0 4px 12px rgba(0, 0, 0, 0.3)',
                },
                // 输入框样式
                input: {
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderWidth: '1px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                },
                // 菜单样式
                menu: {
                    borderRadius: '12px',
                    backdropFilter: 'blur(30px) saturate(180%)',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), 0 6px 20px rgba(0, 0, 0, 0.3)',
                    padding: '8px',
                },
                // 动画风格
                animation: {
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    durationFast: '150ms',
                    durationNormal: '300ms',
                    durationSlow: '500ms',
                },
                // 字体
                font: {
                    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
                    sizeBase: '14px',
                    sizeSmall: '12px',
                    sizeLarge: '16px',
                    weightNormal: '400',
                    weightMedium: '500',
                    weightBold: '600',
                },
                // 间距
                spacing: {
                    xs: '4px',
                    sm: '8px',
                    md: '12px',
                    lg: '16px',
                    xl: '24px',
                },
                // 图标风格
                icon: {
                    sizeSmall: '16px',
                    sizeMedium: '24px',
                    sizeLarge: '32px',
                    borderRadius: '4px',
                    padding: '4px',
                    fillColor: 'currentColor',
                    strokeColor: 'currentColor',
                    strokeWidth: '1.5',
                    opacity: '1',
                    opacityHover: '0.8',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    filter: 'none',
                    filterHover: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                    style: 'filled', // 'filled', 'outlined', 'rounded', 'sharp'
                },
                // 桌面图标标签风格
                desktopIcon: {
                    backdropFilter: 'none', // 默认无磨砂玻璃效果
                    background: 'transparent', // 默认透明背景
                    backgroundHover: 'var(--theme-background-elevated, rgba(30, 30, 46, 0.8))', // 悬停时背景
                    borderRadius: '4px',
                    padding: '2px 4px',
                },
                // 开始菜单风格（默认主题不使用磨砂玻璃效果）
                startMenu: {
                    backdropFilter: 'none', // 默认主题不使用磨砂玻璃效果
                    background: 'linear-gradient(135deg, rgba(30, 30, 30, 0.98) 0%, rgba(25, 25, 35, 0.98) 100%)',
                    borderRadius: '8px',
                    borderWidth: '1px',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08) inset',
                },
                // 多任务选择器风格
                taskSwitcher: {
                    backdropFilter: 'blur(20px)',
                    background: 'rgba(0, 0, 0, 0.85)',
                },
            }
        });
        
        // 风格2：Windows风格 - 高仿Windows 11风格
        ThemeManager.registerStyle('windows', {
            id: 'windows',
            name: 'Windows风格',
            description: '高仿Windows 11，Fluent Design，Acrylic材质，圆角适中',
            styles: {
                window: {
                    borderRadius: '8px', // Windows 11的适中圆角
                    borderWidth: '0', // Windows 11窗口无边框
                    backdropFilter: 'blur(40px) saturate(180%)', // Windows 11的Acrylic材质效果
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28), 0 0 1px rgba(255, 255, 255, 0.08) inset', // Windows 11风格的阴影
                    boxShadowFocused: '0 12px 48px rgba(0, 0, 0, 0.35), 0 0 1px rgba(255, 255, 255, 0.12) inset',
                    boxShadowUnfocused: '0 4px 20px rgba(0, 0, 0, 0.22)',
                    opacityUnfocused: 0.88, // Windows 11未激活窗口稍微透明
                },
                taskbar: {
                    borderRadius: '0', // Windows 11任务栏无圆角
                    backdropFilter: 'blur(40px) saturate(180%)', // Windows 11任务栏的Acrylic效果
                    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.2), inset 0 0.5px 0 rgba(255, 255, 255, 0.08)', // Windows 11任务栏的微妙阴影
                },
                button: {
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: '400',
                    transition: 'all 0.15s ease',
                    boxShadow: 'none',
                    boxShadowHover: '0 2px 8px rgba(0, 0, 0, 0.15)',
                },
                input: {
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderWidth: '1px',
                    transition: 'all 0.15s ease',
                },
                menu: {
                    borderRadius: '8px',
                    backdropFilter: 'blur(40px) saturate(150%)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    padding: '4px',
                },
                animation: {
                    easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
                    durationFast: '120ms',
                    durationNormal: '250ms',
                    durationSlow: '400ms',
                },
                font: {
                    family: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", sans-serif',
                    sizeBase: '13px',
                    sizeSmall: '11px',
                    sizeLarge: '15px',
                    weightNormal: '400',
                    weightMedium: '500',
                    weightBold: '600',
                },
                spacing: {
                    xs: '4px',
                    sm: '6px',
                    md: '10px',
                    lg: '16px',
                    xl: '20px',
                },
                icon: {
                    sizeSmall: '16px',
                    sizeMedium: '20px',
                    sizeLarge: '28px',
                    borderRadius: '2px',
                    padding: '2px',
                    fillColor: 'currentColor',
                    strokeColor: 'currentColor',
                    strokeWidth: '1',
                    opacity: '1',
                    opacityHover: '0.9',
                    transition: 'all 0.15s ease',
                    filter: 'none',
                    filterHover: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15))',
                    style: 'outlined',
                },
                // 桌面图标标签风格
                desktopIcon: {
                    backdropFilter: 'none',
                    background: 'transparent',
                    backgroundHover: 'var(--theme-background-elevated, rgba(30, 30, 46, 0.8))',
                    borderRadius: '4px',
                    padding: '2px 4px',
                },
                // 开始菜单风格
                startMenu: {
                    backdropFilter: 'blur(60px) saturate(180%)',
                    background: 'linear-gradient(135deg, rgba(30, 30, 30, 0.95) 0%, rgba(25, 25, 35, 0.95) 100%)',
                    borderRadius: '8px',
                    borderWidth: '0',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28), 0 0 1px rgba(255, 255, 255, 0.08) inset',
                },
                // 多任务选择器风格
                taskSwitcher: {
                    backdropFilter: 'blur(40px)',
                    background: 'rgba(0, 0, 0, 0.8)',
                },
            }
        });
        
        // 风格3：macOS风格 - 高仿macOS Big Sur/Sonoma风格
        ThemeManager.registerStyle('macos', {
            id: 'macos',
            name: 'macOS风格',
            description: '高仿macOS Big Sur/Sonoma，大圆角窗口，精致毛玻璃效果，优雅简洁',
            styles: {
                window: {
                    borderRadius: '20px', // macOS风格：更大的圆角
                    borderWidth: '0', // macOS窗口无边框
                    backdropFilter: 'blur(40px) saturate(180%)', // macOS风格的强毛玻璃效果
                    boxShadow: '0 25px 70px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(255, 255, 255, 0.08) inset', // macOS风格的柔和阴影
                    boxShadowFocused: '0 30px 90px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.12) inset, 0 0 40px rgba(0, 0, 0, 0.1)',
                    boxShadowUnfocused: '0 15px 50px rgba(0, 0, 0, 0.2)',
                    opacityUnfocused: 0.75, // macOS未激活窗口更透明
                },
                taskbar: {
                    borderRadius: '0', // macOS Dock无圆角（但图标有圆角）
                    backdropFilter: 'blur(60px) saturate(200%)', // macOS Dock的超强毛玻璃效果
                    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)', // macOS Dock的微妙阴影
                },
                button: {
                    borderRadius: '10px',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
                    boxShadowHover: '0 4px 12px rgba(0, 0, 0, 0.15)',
                },
                input: {
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    borderWidth: '1px',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                },
                menu: {
                    borderRadius: '12px',
                    backdropFilter: 'blur(40px) saturate(200%)',
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.3)',
                    padding: '6px',
                },
                animation: {
                    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    durationFast: '150ms',
                    durationNormal: '250ms',
                    durationSlow: '350ms',
                },
                font: {
                    family: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif',
                    sizeBase: '13px',
                    sizeSmall: '11px',
                    sizeLarge: '15px',
                    weightNormal: '400',
                    weightMedium: '500',
                    weightBold: '600',
                },
                spacing: {
                    xs: '4px',
                    sm: '8px',
                    md: '12px',
                    lg: '16px',
                    xl: '24px',
                },
                icon: {
                    sizeSmall: '18px',
                    sizeMedium: '24px',
                    sizeLarge: '32px',
                    borderRadius: '6px',
                    padding: '6px',
                    fillColor: 'currentColor',
                    strokeColor: 'currentColor',
                    strokeWidth: '1.5',
                    opacity: '1',
                    opacityHover: '0.85',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    filter: 'none',
                    filterHover: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))',
                    style: 'rounded',
                },
                // 桌面图标标签风格
                desktopIcon: {
                    backdropFilter: 'none',
                    background: 'transparent',
                    backgroundHover: 'var(--theme-background-elevated, rgba(30, 30, 46, 0.8))',
                    borderRadius: '6px',
                    padding: '2px 4px',
                },
                // 开始菜单风格
                startMenu: {
                    backdropFilter: 'blur(60px) saturate(180%)',
                    background: 'linear-gradient(135deg, rgba(30, 30, 30, 0.9) 0%, rgba(25, 25, 35, 0.9) 100%)',
                    borderRadius: '20px',
                    borderWidth: '0',
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 25px 70px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(255, 255, 255, 0.08) inset',
                },
                // 多任务选择器风格
                taskSwitcher: {
                    backdropFilter: 'blur(60px) saturate(200%)',
                    background: 'rgba(0, 0, 0, 0.7)',
                },
            }
        });
        
        // 风格4：玻璃风格 - 磨砂玻璃质感
        ThemeManager.registerStyle('glass', {
            id: 'glass',
            name: '玻璃风格',
            description: '磨砂玻璃质感，透明朦胧，现代时尚',
            styles: {
                window: {
                    borderRadius: '16px',
                    borderWidth: '1px',
                    backdropFilter: 'blur(30px) saturate(180%)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                    boxShadowFocused: '0 12px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 0 24px rgba(96, 165, 250, 0.2)',
                    boxShadowUnfocused: '0 4px 20px rgba(0, 0, 0, 0.25)',
                    opacityUnfocused: 0.8,
                },
                taskbar: {
                    borderRadius: '0',
                    backdropFilter: 'blur(40px) saturate(200%)',
                    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                },
                button: {
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                    boxShadowHover: '0 4px 12px rgba(0, 0, 0, 0.3)',
                },
                input: {
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderWidth: '1px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                },
                menu: {
                    borderRadius: '12px',
                    backdropFilter: 'blur(30px) saturate(180%)',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                    padding: '8px',
                },
                animation: {
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    durationFast: '150ms',
                    durationNormal: '300ms',
                    durationSlow: '500ms',
                },
                font: {
                    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    sizeBase: '14px',
                    sizeSmall: '12px',
                    sizeLarge: '16px',
                    weightNormal: '400',
                    weightMedium: '500',
                    weightBold: '600',
                },
                spacing: {
                    xs: '4px',
                    sm: '8px',
                    md: '12px',
                    lg: '16px',
                    xl: '24px',
                },
                icon: {
                    sizeSmall: '16px',
                    sizeMedium: '24px',
                    sizeLarge: '32px',
                    borderRadius: '6px',
                    padding: '4px',
                    fillColor: 'currentColor',
                    strokeColor: 'currentColor',
                    strokeWidth: '1.5',
                    opacity: '1',
                    opacityHover: '0.85',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    filter: 'none',
                    filterHover: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                    style: 'rounded',
                },
                // 桌面图标标签风格 - 磨砂玻璃效果
                desktopIcon: {
                    backdropFilter: 'blur(20px) saturate(180%)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    backgroundHover: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '2px 6px',
                },
                // 开始菜单风格
                startMenu: {
                    backdropFilter: 'blur(60px) saturate(180%)',
                    background: 'transparent', // 玻璃风格必须使用透明背景以确保 backdrop-filter 生效
                    borderRadius: '16px',
                    borderWidth: '1px',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                },
                // 多任务选择器风格
                taskSwitcher: {
                    backdropFilter: 'blur(30px) saturate(180%)',
                    background: 'rgba(0, 0, 0, 0.6)',
                },
            }
        });
        
        // 风格4：GNOME风格 - 高仿GNOME 40+ Adwaita风格
        ThemeManager.registerStyle('gnome', {
            id: 'gnome',
            name: 'GNOME风格',
            description: '高仿GNOME 40+ Adwaita，扁平化设计，大间距，现代感',
            styles: {
                window: {
                    borderRadius: '10px', // GNOME Adwaita的圆角
                    borderWidth: '1px', // GNOME有细边框
                    backdropFilter: 'blur(25px) saturate(170%)', // GNOME的毛玻璃效果
                    boxShadow: '0 6px 28px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05) inset', // GNOME风格的阴影
                    boxShadowFocused: '0 10px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                    boxShadowUnfocused: '0 4px 20px rgba(0, 0, 0, 0.25)',
                    opacityUnfocused: 0.88,
                },
                taskbar: {
                    borderRadius: '0', // GNOME顶部栏无圆角
                    backdropFilter: 'blur(35px) saturate(180%)', // GNOME顶部栏的毛玻璃效果
                    boxShadow: '0 -6px 28px rgba(0, 0, 0, 0.35)', // GNOME顶部栏的阴影
                },
                button: {
                    borderRadius: '9px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                    boxShadowHover: '0 4px 12px rgba(0, 0, 0, 0.2)',
                },
                input: {
                    borderRadius: '9px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    borderWidth: '1px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                },
                menu: {
                    borderRadius: '12px',
                    backdropFilter: 'blur(35px) saturate(180%)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
                    padding: '8px',
                },
                animation: {
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    durationFast: '150ms',
                    durationNormal: '300ms',
                    durationSlow: '450ms',
                },
                font: {
                    family: '"Cantarell", "Ubuntu", "Roboto", sans-serif',
                    sizeBase: '14px',
                    sizeSmall: '12px',
                    sizeLarge: '16px',
                    weightNormal: '400',
                    weightMedium: '500',
                    weightBold: '700',
                },
                spacing: {
                    xs: '6px',
                    sm: '10px',
                    md: '14px',
                    lg: '20px',
                    xl: '28px',
                },
                icon: {
                    sizeSmall: '20px',
                    sizeMedium: '24px',
                    sizeLarge: '36px',
                    borderRadius: '4px',
                    padding: '8px',
                    fillColor: 'currentColor',
                    strokeColor: 'currentColor',
                    strokeWidth: '1.5',
                    opacity: '1',
                    opacityHover: '0.88',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    filter: 'none',
                    filterHover: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15))',
                    style: 'filled',
                },
            }
        });
        
        // 风格5：Material Design风格 - 高仿Material Design 3风格
        ThemeManager.registerStyle('material', {
            id: 'material',
            name: 'Material Design风格',
            description: '高仿Material Design 3，卡片式设计，层次分明，Elevation阴影',
            styles: {
                window: {
                    borderRadius: '4px', // Material Design的小圆角
                    borderWidth: '0', // Material Design无边框
                    backdropFilter: 'blur(20px) saturate(160%)', // Material Design的轻微毛玻璃
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.1)', // Material Design的Elevation阴影
                    boxShadowFocused: '0 4px 16px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.15)', // 更高的Elevation
                    boxShadowUnfocused: '0 1px 4px rgba(0, 0, 0, 0.1)', // 较低的Elevation
                    opacityUnfocused: 0.92,
                },
                taskbar: {
                    borderRadius: '0', // Material Design底部栏无圆角
                    backdropFilter: 'blur(25px) saturate(160%)', // Material Design底部栏的毛玻璃
                    boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.15)', // Material Design底部栏的Elevation
                },
                button: {
                    borderRadius: '4px',
                    padding: '10px 24px',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    boxShadowHover: '0 4px 8px rgba(0, 0, 0, 0.15)',
                },
                input: {
                    borderRadius: '4px',
                    padding: '12px 16px',
                    fontSize: '14px',
                    borderWidth: '0',
                    borderBottomWidth: '2px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                },
                menu: {
                    borderRadius: '4px',
                    backdropFilter: 'blur(25px) saturate(160%)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                    padding: '8px',
                },
                animation: {
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    durationFast: '150ms',
                    durationNormal: '300ms',
                    durationSlow: '400ms',
                },
                font: {
                    family: '"Roboto", "Noto Sans", sans-serif',
                    sizeBase: '14px',
                    sizeSmall: '12px',
                    sizeLarge: '16px',
                    weightNormal: '400',
                    weightMedium: '500',
                    weightBold: '700',
                },
                spacing: {
                    xs: '4px',
                    sm: '8px',
                    md: '16px',
                    lg: '24px',
                    xl: '32px',
                },
                icon: {
                    sizeSmall: '20px',
                    sizeMedium: '24px',
                    sizeLarge: '40px',
                    borderRadius: '0',
                    padding: '8px',
                    fillColor: 'currentColor',
                    strokeColor: 'currentColor',
                    strokeWidth: '2',
                    opacity: '0.87',
                    opacityHover: '1',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    filter: 'none',
                    filterHover: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                    style: 'sharp',
                },
            }
        });
        
        KernelLogger.info("ThemeManager", `已注册 ${ThemeManager._styles.size} 个内置风格`);
    }
    
    /**
     * 注册主题
     * @param {string} themeId 主题ID
     * @param {Object} theme 主题配置
     */
    static registerTheme(themeId, theme) {
        if (!themeId || !theme) {
            KernelLogger.warn("ThemeManager", "注册主题失败：themeId 或 theme 为空");
            return false;
        }
        
        if (!theme.colors || typeof theme.colors !== 'object') {
            KernelLogger.warn("ThemeManager", `注册主题失败：主题 ${themeId} 缺少 colors 配置`);
            return false;
        }
        
        ThemeManager._themes.set(themeId, {
            id: themeId,
            name: theme.name || themeId,
            description: theme.description || '',
            colors: theme.colors
        });
        
        KernelLogger.debug("ThemeManager", `注册主题: ${themeId} - ${theme.name || themeId}`);
        return true;
    }
    
    /**
     * 注册风格
     * @param {string} styleId 风格ID
     * @param {Object} style 风格配置
     */
    static registerStyle(styleId, style) {
        if (!styleId || !style) {
            KernelLogger.warn("ThemeManager", "注册风格失败：styleId 或 style 为空");
            return false;
        }
        
        if (!style.styles || typeof style.styles !== 'object') {
            KernelLogger.warn("ThemeManager", `注册风格失败：风格 ${styleId} 缺少 styles 配置`);
            return false;
        }
        
        ThemeManager._styles.set(styleId, {
            id: styleId,
            name: style.name || styleId,
            description: style.description || '',
            styles: style.styles
        });
        
        KernelLogger.debug("ThemeManager", `注册风格: ${styleId} - ${style.name || styleId}`);
        return true;
    }
    
    /**
     * 设置主题
     * @param {string} themeId 主题ID
     * @param {boolean} save 是否保存到 LStorage（默认 true）
     */
    static async setTheme(themeId, save = true) {
        if (!ThemeManager._initialized) {
            await ThemeManager.init();
        }
        
        if (!ThemeManager._themes.has(themeId)) {
            KernelLogger.warn("ThemeManager", `主题不存在: ${themeId}`);
            return false;
        }
        
        // 应用主题
        ThemeManager._applyTheme(themeId);
        
        // 保存到 LStorage
        if (save && typeof LStorage !== 'undefined') {
            try {
                await LStorage.setSystemStorage(ThemeManager.STORAGE_KEY_THEME, themeId);
                KernelLogger.debug("ThemeManager", `主题已保存: ${themeId}`);
            } catch (e) {
                KernelLogger.warn("ThemeManager", `保存主题失败: ${e.message}`);
            }
        }
        
        // 通知监听器
        ThemeManager._notifyThemeChange(themeId);
        
        // 强制更新所有窗口样式（确保窗口样式及时更新）
        if (typeof GUIManager !== 'undefined' && typeof GUIManager._updateAllWindowsStyles === 'function') {
            GUIManager._updateAllWindowsStyles();
        }
        
        KernelLogger.info("ThemeManager", `主题已切换: ${themeId}`);
        return true;
    }
    
    /**
     * 设置风格
     * @param {string} styleId 风格ID
     * @param {boolean} save 是否保存到 LStorage（默认 true）
     */
    static async setStyle(styleId, save = true) {
        if (!ThemeManager._initialized) {
            await ThemeManager.init();
        }
        
        if (!ThemeManager._styles.has(styleId)) {
            KernelLogger.warn("ThemeManager", `风格不存在: ${styleId}`);
            return false;
        }
        
        // 应用风格
        ThemeManager._applyStyle(styleId);
        
        // 保存到 LStorage
        if (save && typeof LStorage !== 'undefined') {
            try {
                await LStorage.setSystemStorage(ThemeManager.STORAGE_KEY_STYLE, styleId);
                KernelLogger.debug("ThemeManager", `风格已保存: ${styleId}`);
            } catch (e) {
                KernelLogger.warn("ThemeManager", `保存风格失败: ${e.message}`);
            }
        }
        
        // 通知监听器
        ThemeManager._notifyStyleChange(styleId);
        
        // 强制更新所有窗口样式（确保窗口样式及时更新）
        if (typeof GUIManager !== 'undefined' && typeof GUIManager._updateAllWindowsStyles === 'function') {
            GUIManager._updateAllWindowsStyles();
        }
        
        KernelLogger.info("ThemeManager", `风格已切换: ${styleId}`);
        return true;
    }
    
    /**
     * 应用主题到 DOM
     * @param {string} themeId 主题ID
     */
    static _applyTheme(themeId) {
        const theme = ThemeManager._themes.get(themeId);
        if (!theme) {
            KernelLogger.warn("ThemeManager", `应用主题失败：主题 ${themeId} 不存在`);
            return;
        }
        
        ThemeManager._currentThemeId = themeId;
        
        // 获取根元素
        const root = document.documentElement;
        if (!root) {
            KernelLogger.warn("ThemeManager", "无法获取根元素，跳过主题应用");
            return;
        }
        
        // 应用CSS变量
        const colors = theme.colors;
        for (const [key, value] of Object.entries(colors)) {
            const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            root.style.setProperty(cssVarName, value);
        }
        
        // 应用基础样式
        if (document.body) {
            document.body.style.backgroundColor = colors.background;
            document.body.style.color = colors.text;
        }
        
        // 应用沙盒容器样式
        const sandboxContainer = document.getElementById('sandbox-container');
        if (sandboxContainer) {
            sandboxContainer.style.backgroundColor = colors.background;
        }
        
        // 应用窗口背景色到所有窗口
        const allWindows = document.querySelectorAll('.zos-gui-window');
        const currentStyle = ThemeManager.getCurrentStyle();
        const isGlassStyle = currentStyle && currentStyle.id === 'glass';
        
        allWindows.forEach(window => {
            // 获取当前风格的窗口 backdrop-filter 设置
            const windowBackdropFilter = currentStyle && currentStyle.styles && currentStyle.styles.window && currentStyle.styles.window.backdropFilter;
            
            // 根据风格设置 backdrop-filter（使用 !important 覆盖 CSS 默认值）
            // 如果不是玻璃风格，强制删除backdrop-filter
            if (isGlassStyle && windowBackdropFilter && windowBackdropFilter !== 'none') {
                window.style.setProperty('backdrop-filter', windowBackdropFilter, 'important');
                window.style.setProperty('-webkit-backdrop-filter', windowBackdropFilter, 'important');
                // 如果设置了 backdrop-filter，背景必须透明才能确保 backdrop-filter 生效
                window.style.setProperty('background-color', 'transparent', 'important');
            } else {
                // 不是玻璃风格或没有 backdrop-filter，设置为 'none'（使用 !important）
                window.style.setProperty('backdrop-filter', 'none', 'important');
                window.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                // 可以正常设置背景色
                const windowBg = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
                window.style.setProperty('background-color', windowBg, 'important');
            }
            
            window.style.setProperty('border-color', colors.border || colors.primary + '40', 'important');
        });
        
        // 应用窗口标题栏样式
        const allTitleBars = document.querySelectorAll('.zos-window-titlebar');
        allTitleBars.forEach(titleBar => {
            // 标题栏应该与窗口保持一致，如果窗口有 backdrop-filter，标题栏也应该透明
            const parentWindow = titleBar.closest('.zos-gui-window');
            const windowBackdropFilter = currentStyle && currentStyle.styles && currentStyle.styles.window && currentStyle.styles.window.backdropFilter;
            const hasBackdropFilter = isGlassStyle && parentWindow && (
                (parentWindow.style.backdropFilter && parentWindow.style.backdropFilter !== 'none') || 
                (parentWindow.style.webkitBackdropFilter && parentWindow.style.webkitBackdropFilter !== 'none') ||
                (windowBackdropFilter && windowBackdropFilter !== 'none')
            );
            
            if (hasBackdropFilter) {
                // 窗口有 backdrop-filter，标题栏背景设置为透明以确保毛玻璃效果
                titleBar.style.setProperty('background-color', 'transparent', 'important');
                titleBar.style.setProperty('backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                titleBar.style.setProperty('-webkit-backdrop-filter', 'blur(60px) saturate(180%)', 'important');
            } else {
                // 窗口没有 backdrop-filter，标题栏可以设置背景色
                // 设置为 'none'（使用 !important 覆盖 CSS 硬编码值）
                titleBar.style.setProperty('backdrop-filter', 'none', 'important');
                titleBar.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                const titleBarBg = colors.backgroundSecondary || colors.background;
                titleBar.style.setProperty('background-color', titleBarBg, 'important');
            }
            titleBar.style.borderBottomColor = colors.border || colors.primary + '33';
        });
        
        // 应用任务栏背景色
        const taskbar = document.getElementById('taskbar') || document.querySelector('.taskbar');
        if (taskbar) {
            const taskbarBg = colors.backgroundSecondary || colors.background;
            taskbar.style.backgroundColor = taskbarBg;
            taskbar.style.borderColor = colors.border || colors.primary + '33';
        }
        
        // 应用任务栏弹出面板的背景色
        const appMenu = document.getElementById('taskbar-app-menu');
        if (appMenu) {
            // 检查当前风格是否有开始菜单样式，如果有就使用风格样式，否则使用主题背景色
            const currentStyle = ThemeManager.getCurrentStyle();
            const currentTheme = ThemeManager.getCurrentTheme();
            // 检查风格ID或主题ID是否为'glass'
            const isGlassStyle = (currentStyle && currentStyle.id === 'glass') || (currentTheme && currentTheme.id === 'glass');
            if (currentStyle && currentStyle.styles && currentStyle.styles.startMenu) {
                // 使用风格样式（已经在 _applyStyle 中应用，这里不需要重复设置）
                // 但为了确保不被覆盖，我们再次应用一次
                const startMenuStyle = currentStyle.styles.startMenu;
                // 玻璃风格必须使用透明背景以确保 backdrop-filter 生效
                // 即使配置中有 background 值，也要强制设置为 transparent
                if (isGlassStyle) {
                    // 玻璃风格：如果有 backdrop-filter 配置，使用它；否则使用默认值
                    const backdropFilter = startMenuStyle.backdropFilter && startMenuStyle.backdropFilter !== 'none' 
                        ? startMenuStyle.backdropFilter 
                        : 'blur(60px) saturate(180%)';
                    KernelLogger.debug("ThemeManager", `_applyTheme: 应用玻璃风格开始菜单 - backdrop-filter: ${backdropFilter}, background: transparent`);
                    appMenu.style.setProperty('backdrop-filter', backdropFilter, 'important');
                    appMenu.style.setProperty('-webkit-backdrop-filter', backdropFilter, 'important');
                    // 强制设置为透明，忽略配置中的 background 值
                    appMenu.style.setProperty('background', 'transparent', 'important');
                    appMenu.style.setProperty('background-color', 'transparent', 'important');
                } else {
                    // 非玻璃风格：删除 backdrop-filter，使用配置的背景
                    KernelLogger.debug("ThemeManager", `_applyTheme: 应用非玻璃风格开始菜单 - backdrop-filter: none, background: ${startMenuStyle.background || '主题背景'}`);
                    appMenu.style.setProperty('backdrop-filter', 'none', 'important');
                    appMenu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    if (startMenuStyle.background) {
                        appMenu.style.setProperty('background', startMenuStyle.background, 'important');
                    }
                }
                if (startMenuStyle.borderColor) {
                    appMenu.style.setProperty('border-color', startMenuStyle.borderColor, 'important');
                }
            } else {
                // 没有风格样式，使用主题背景色
                if (isGlassStyle) {
                    // 玻璃风格：设置 backdrop-filter 和透明背景
                    KernelLogger.debug("ThemeManager", `_applyTheme: 没有风格样式，但使用玻璃风格 - backdrop-filter: blur(60px) saturate(180%), background: transparent`);
                    appMenu.style.setProperty('backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                    appMenu.style.setProperty('-webkit-backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                    appMenu.style.setProperty('background', 'transparent', 'important');
                    appMenu.style.setProperty('background-color', 'transparent', 'important');
                } else {
                    // 非玻璃风格：删除 backdrop-filter 并设置背景色
                    appMenu.style.setProperty('backdrop-filter', 'none', 'important');
                    appMenu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    const panelBg = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
                    appMenu.style.setProperty('background-color', panelBg, 'important');
                }
                appMenu.style.setProperty('border-color', colors.border || colors.primary + '33', 'important');
            }
        }
        
        const timeWheel = document.getElementById('taskbar-time-wheel');
        if (timeWheel) {
            const panelBg = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
            timeWheel.style.backgroundColor = panelBg;
            timeWheel.style.borderColor = colors.border || colors.primary + '33';
        }
        
        const networkPanel = document.getElementById('taskbar-network-panel');
        if (networkPanel) {
            const panelBg = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
            networkPanel.style.backgroundColor = panelBg;
            networkPanel.style.borderColor = colors.border || colors.primary + '33';
        }
        
        const batteryPanel = document.getElementById('taskbar-battery-panel');
        if (batteryPanel) {
            const panelBg = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
            batteryPanel.style.backgroundColor = panelBg;
            batteryPanel.style.borderColor = colors.border || colors.primary + '33';
        }
        
        const powerMenu = document.getElementById('taskbar-power-menu');
        if (powerMenu) {
            const panelBg = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
            powerMenu.style.backgroundColor = panelBg;
            powerMenu.style.borderColor = colors.border || colors.primary + '33';
        }
        
        KernelLogger.debug("ThemeManager", `主题已应用到DOM: ${themeId}`);
        
        // 强制更新所有窗口样式（确保窗口样式及时更新）
        if (typeof GUIManager !== 'undefined' && typeof GUIManager._updateAllWindowsStyles === 'function') {
            GUIManager._updateAllWindowsStyles();
        }
    }
    
    /**
     * 应用风格到 DOM
     * @param {string} styleId 风格ID
     */
    static _applyStyle(styleId) {
        const style = ThemeManager._styles.get(styleId);
        if (!style) {
            KernelLogger.warn("ThemeManager", `应用风格失败：风格 ${styleId} 不存在`);
            return;
        }
        
        ThemeManager._currentStyleId = styleId;
        
        // 获取根元素
        const root = document.documentElement;
        if (!root) {
            KernelLogger.warn("ThemeManager", "无法获取根元素，跳过风格应用");
            return;
        }
        
        // 如果不是玻璃风格，删除所有backdrop-filter属性
        const isGlassStyle = styleId === 'glass';
        if (!isGlassStyle) {
            KernelLogger.debug("ThemeManager", `非玻璃风格 (${styleId})，清理所有backdrop-filter属性`);
            
            // 清理所有窗口的backdrop-filter
            const allWindows = document.querySelectorAll('.zos-gui-window');
            allWindows.forEach(window => {
                window.style.removeProperty('backdrop-filter');
                window.style.removeProperty('-webkit-backdrop-filter');
            });
            
            // 清理所有标题栏的backdrop-filter
            const allTitleBars = document.querySelectorAll('.zos-window-titlebar');
            allTitleBars.forEach(titleBar => {
                titleBar.style.removeProperty('backdrop-filter');
                titleBar.style.removeProperty('-webkit-backdrop-filter');
            });
            
            // 清理开始菜单的backdrop-filter
            const appMenu = document.getElementById('taskbar-app-menu');
            if (appMenu) {
                appMenu.style.removeProperty('backdrop-filter');
                appMenu.style.removeProperty('-webkit-backdrop-filter');
            }
            
            // 清理任务栏的backdrop-filter
            const taskbar = document.getElementById('taskbar') || document.querySelector('.taskbar');
            if (taskbar) {
                taskbar.style.removeProperty('backdrop-filter');
                taskbar.style.removeProperty('-webkit-backdrop-filter');
            }
            
            // 清理多任务选择器的backdrop-filter
            const taskSwitcher = document.getElementById('task-switcher-container');
            if (taskSwitcher) {
                taskSwitcher.style.removeProperty('backdrop-filter');
                taskSwitcher.style.removeProperty('-webkit-backdrop-filter');
            }
            
            // 清理桌面图标标签的backdrop-filter
            const allDesktopIconLabels = document.querySelectorAll('.desktop-icon-label');
            allDesktopIconLabels.forEach(label => {
                label.style.removeProperty('backdrop-filter');
                label.style.removeProperty('-webkit-backdrop-filter');
            });
            
            // 清理所有可能的菜单和弹出层的backdrop-filter
            const allMenus = document.querySelectorAll('[class*="menu"], [class*="popup"], [class*="dialog"]');
            allMenus.forEach(menu => {
                menu.style.removeProperty('backdrop-filter');
                menu.style.removeProperty('-webkit-backdrop-filter');
            });
        }
        
        // 应用CSS变量
        const styles = style.styles;
        
        // 窗口样式
        if (styles.window) {
            root.style.setProperty('--style-window-border-radius', styles.window.borderRadius);
            root.style.setProperty('--style-window-border-width', styles.window.borderWidth);
            // 设置 backdrop-filter CSS 变量，如果为 'none' 则设置为 'none'，否则使用原值
            const backdropFilterValue = (styles.window.backdropFilter && styles.window.backdropFilter !== 'none') 
                ? styles.window.backdropFilter 
                : 'none';
            root.style.setProperty('--style-window-backdrop-filter', backdropFilterValue);
            root.style.setProperty('--style-window-box-shadow', styles.window.boxShadow);
            root.style.setProperty('--style-window-box-shadow-focused', styles.window.boxShadowFocused);
            root.style.setProperty('--style-window-box-shadow-unfocused', styles.window.boxShadowUnfocused);
            root.style.setProperty('--style-window-opacity-unfocused', styles.window.opacityUnfocused);
        }
        
        // 开始菜单样式 CSS 变量
        if (styles.startMenu) {
            const startMenuBackdropFilter = (styles.startMenu.backdropFilter && styles.startMenu.backdropFilter !== 'none')
                ? styles.startMenu.backdropFilter
                : 'none';
            root.style.setProperty('--start-menu-backdrop-filter', startMenuBackdropFilter);
        }
        
        // 任务栏样式
        if (styles.taskbar) {
            root.style.setProperty('--style-taskbar-border-radius', styles.taskbar.borderRadius);
            root.style.setProperty('--style-taskbar-backdrop-filter', styles.taskbar.backdropFilter);
            root.style.setProperty('--style-taskbar-box-shadow', styles.taskbar.boxShadow);
        }
        
        // 按钮样式
        if (styles.button) {
            root.style.setProperty('--style-button-border-radius', styles.button.borderRadius);
            root.style.setProperty('--style-button-padding', styles.button.padding);
            root.style.setProperty('--style-button-font-size', styles.button.fontSize);
            root.style.setProperty('--style-button-font-weight', styles.button.fontWeight);
            root.style.setProperty('--style-button-transition', styles.button.transition);
            root.style.setProperty('--style-button-box-shadow', styles.button.boxShadow);
            root.style.setProperty('--style-button-box-shadow-hover', styles.button.boxShadowHover);
        }
        
        // 输入框样式
        if (styles.input) {
            root.style.setProperty('--style-input-border-radius', styles.input.borderRadius);
            root.style.setProperty('--style-input-padding', styles.input.padding);
            root.style.setProperty('--style-input-font-size', styles.input.fontSize);
            root.style.setProperty('--style-input-border-width', styles.input.borderWidth);
            root.style.setProperty('--style-input-transition', styles.input.transition);
        }
        
        // 菜单样式
        if (styles.menu) {
            root.style.setProperty('--style-menu-border-radius', styles.menu.borderRadius);
            root.style.setProperty('--style-menu-backdrop-filter', styles.menu.backdropFilter);
            root.style.setProperty('--style-menu-box-shadow', styles.menu.boxShadow);
            root.style.setProperty('--style-menu-padding', styles.menu.padding);
        }
        
        // 动画风格
        if (styles.animation) {
            root.style.setProperty('--style-animation-easing', styles.animation.easing);
            root.style.setProperty('--style-animation-duration-fast', styles.animation.durationFast);
            root.style.setProperty('--style-animation-duration-normal', styles.animation.durationNormal);
            root.style.setProperty('--style-animation-duration-slow', styles.animation.durationSlow);
        }
        
        // 字体
        if (styles.font) {
            root.style.setProperty('--style-font-family', styles.font.family);
            root.style.setProperty('--style-font-size-base', styles.font.sizeBase);
            root.style.setProperty('--style-font-size-small', styles.font.sizeSmall);
            root.style.setProperty('--style-font-size-large', styles.font.sizeLarge);
            root.style.setProperty('--style-font-weight-normal', styles.font.weightNormal);
            root.style.setProperty('--style-font-weight-medium', styles.font.weightMedium);
            root.style.setProperty('--style-font-weight-bold', styles.font.weightBold);
            
            // 应用到 body
            if (document.body) {
                document.body.style.fontFamily = styles.font.family;
            }
        }
        
        // 间距
        if (styles.spacing) {
            root.style.setProperty('--style-spacing-xs', styles.spacing.xs);
            root.style.setProperty('--style-spacing-sm', styles.spacing.sm);
            root.style.setProperty('--style-spacing-md', styles.spacing.md);
            root.style.setProperty('--style-spacing-lg', styles.spacing.lg);
            root.style.setProperty('--style-spacing-xl', styles.spacing.xl);
        }
        
        // 图标风格
        if (styles.icon) {
            root.style.setProperty('--style-icon-size-small', styles.icon.sizeSmall);
            root.style.setProperty('--style-icon-size-medium', styles.icon.sizeMedium);
            root.style.setProperty('--style-icon-size-large', styles.icon.sizeLarge);
            root.style.setProperty('--style-icon-border-radius', styles.icon.borderRadius);
            root.style.setProperty('--style-icon-padding', styles.icon.padding);
            root.style.setProperty('--style-icon-fill-color', styles.icon.fillColor);
            root.style.setProperty('--style-icon-stroke-color', styles.icon.strokeColor);
            root.style.setProperty('--style-icon-stroke-width', styles.icon.strokeWidth);
            root.style.setProperty('--style-icon-opacity', styles.icon.opacity);
            root.style.setProperty('--style-icon-opacity-hover', styles.icon.opacityHover);
            root.style.setProperty('--style-icon-transition', styles.icon.transition);
            root.style.setProperty('--style-icon-filter', styles.icon.filter);
            root.style.setProperty('--style-icon-filter-hover', styles.icon.filterHover);
            root.style.setProperty('--style-icon-style', styles.icon.style);
        }
        
        // 桌面图标标签风格
        if (styles.desktopIcon) {
            root.style.setProperty('--style-desktop-icon-backdrop-filter', styles.desktopIcon.backdropFilter);
            root.style.setProperty('--style-desktop-icon-background', styles.desktopIcon.background);
            root.style.setProperty('--style-desktop-icon-background-hover', styles.desktopIcon.backgroundHover);
            root.style.setProperty('--style-desktop-icon-border-radius', styles.desktopIcon.borderRadius);
            root.style.setProperty('--style-desktop-icon-padding', styles.desktopIcon.padding);
            
            // 直接应用样式到所有桌面图标标签
            const allDesktopIconLabels = document.querySelectorAll('.desktop-icon-label');
            allDesktopIconLabels.forEach(label => {
                // 如果不是玻璃风格，强制删除backdrop-filter
                if (isGlassStyle && styles.desktopIcon.backdropFilter && styles.desktopIcon.backdropFilter !== 'none') {
                    label.style.setProperty('backdrop-filter', styles.desktopIcon.backdropFilter, 'important');
                    label.style.setProperty('-webkit-backdrop-filter', styles.desktopIcon.backdropFilter, 'important');
                } else {
                    label.style.setProperty('backdrop-filter', 'none', 'important');
                    label.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                }
                label.style.background = styles.desktopIcon.background;
                label.style.borderRadius = styles.desktopIcon.borderRadius;
                label.style.padding = styles.desktopIcon.padding;
            });
        }
        
        // 应用风格类到 body
        if (document.body) {
            // 移除所有风格类
            document.body.classList.remove(...Array.from(ThemeManager._styles.keys()).map(id => `style-${id}`));
            // 添加当前风格类
            document.body.classList.add(`style-${styleId}`);
        }
        
        // 直接应用窗口样式到所有窗口
        if (styles.window) {
            const allWindows = document.querySelectorAll('.zos-gui-window');
            allWindows.forEach(window => {
                window.style.borderRadius = styles.window.borderRadius;
                window.style.borderWidth = styles.window.borderWidth;
                
                // 处理 backdrop-filter（使用 !important 确保覆盖 CSS 默认值）
                // 如果不是玻璃风格，强制删除backdrop-filter
                if (isGlassStyle && styles.window.backdropFilter && styles.window.backdropFilter !== 'none') {
                    window.style.setProperty('backdrop-filter', styles.window.backdropFilter, 'important');
                    window.style.setProperty('-webkit-backdrop-filter', styles.window.backdropFilter, 'important');
                    // 如果设置了 backdrop-filter，背景必须透明才能确保 backdrop-filter 生效
                    window.style.setProperty('background-color', 'transparent', 'important');
                } else {
                    // 不是玻璃风格或没有 backdrop-filter，设置为 'none'（使用 !important）
                    window.style.setProperty('backdrop-filter', 'none', 'important');
                    window.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    // 需要设置背景色（从当前主题获取）
                    const currentTheme = ThemeManager.getCurrentTheme();
                    if (currentTheme && currentTheme.colors) {
                        const windowBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                        window.style.setProperty('background-color', windowBg, 'important');
                    }
                }
                
                // 根据焦点状态应用不同的阴影
                if (window.classList.contains('zos-window-focused')) {
                    window.style.boxShadow = styles.window.boxShadowFocused || styles.window.boxShadow;
                } else {
                    window.style.boxShadow = styles.window.boxShadowUnfocused || styles.window.boxShadow;
                    window.style.opacity = styles.window.opacityUnfocused || '1';
                }
            });
        }
        
        // 直接应用任务栏样式
        if (styles.taskbar) {
            const taskbar = document.getElementById('taskbar') || document.querySelector('.taskbar');
            if (taskbar) {
                taskbar.style.borderRadius = styles.taskbar.borderRadius;
                // 如果不是玻璃风格，强制删除backdrop-filter
                if (isGlassStyle && styles.taskbar.backdropFilter && styles.taskbar.backdropFilter !== 'none') {
                    taskbar.style.setProperty('backdrop-filter', styles.taskbar.backdropFilter, 'important');
                    taskbar.style.setProperty('-webkit-backdrop-filter', styles.taskbar.backdropFilter, 'important');
                    // 如果设置了 backdrop-filter，背景必须透明才能确保 backdrop-filter 生效
                    taskbar.style.setProperty('background-color', 'transparent', 'important');
                } else {
                    taskbar.style.setProperty('backdrop-filter', 'none', 'important');
                    taskbar.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    // 可以正常设置背景色（从当前主题获取）
                    const currentTheme = ThemeManager.getCurrentTheme();
                    if (currentTheme && currentTheme.colors) {
                        const taskbarBg = currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                        taskbar.style.setProperty('background-color', taskbarBg, 'important');
                    }
                }
                taskbar.style.boxShadow = styles.taskbar.boxShadow;
            }
        }
        
        // 应用开始菜单样式
        if (styles.startMenu) {
            const appMenu = document.getElementById('taskbar-app-menu');
            if (appMenu) {
                KernelLogger.debug("ThemeManager", `应用开始菜单样式 - 风格: ${styleId}, isGlassStyle: ${isGlassStyle}, backdropFilter: ${styles.startMenu.backdropFilter}, background: ${styles.startMenu.background}`);
                // 使用 setProperty 并设置 important 标志，确保样式优先级高于CSS
                // 玻璃风格必须使用透明背景以确保 backdrop-filter 生效
                // 玻璃风格必须使用透明背景以确保 backdrop-filter 生效
                // 即使配置中有 background 值，也要强制设置为 transparent
                if (isGlassStyle) {
                    // 玻璃风格：如果有 backdrop-filter 配置，使用它；否则使用默认值
                    const backdropFilter = styles.startMenu.backdropFilter && styles.startMenu.backdropFilter !== 'none' 
                        ? styles.startMenu.backdropFilter 
                        : 'blur(60px) saturate(180%)';
                    KernelLogger.debug("ThemeManager", `应用玻璃风格开始菜单 - backdrop-filter: ${backdropFilter}, background: transparent`);
                    appMenu.style.setProperty('backdrop-filter', backdropFilter, 'important');
                    appMenu.style.setProperty('-webkit-backdrop-filter', backdropFilter, 'important');
                    // 强制设置为透明，忽略配置中的 background 值
                    appMenu.style.setProperty('background', 'transparent', 'important');
                    appMenu.style.setProperty('background-color', 'transparent', 'important');
                } else {
                    // 非玻璃风格：删除 backdrop-filter，使用配置的背景
                    KernelLogger.debug("ThemeManager", `应用非玻璃风格开始菜单 - backdrop-filter: none, background: ${styles.startMenu.background || '主题背景'}`);
                    appMenu.style.setProperty('backdrop-filter', 'none', 'important');
                    appMenu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    // 可以正常设置背景
                    if (styles.startMenu.background) {
                        appMenu.style.setProperty('background', styles.startMenu.background, 'important');
                    }
                }
                if (styles.startMenu.borderRadius) {
                    appMenu.style.setProperty('border-radius', styles.startMenu.borderRadius, 'important');
                }
                if (styles.startMenu.borderWidth) {
                    appMenu.style.setProperty('border-width', styles.startMenu.borderWidth, 'important');
                }
                if (styles.startMenu.borderColor) {
                    appMenu.style.setProperty('border-color', styles.startMenu.borderColor, 'important');
                }
                if (styles.startMenu.boxShadow) {
                    appMenu.style.setProperty('box-shadow', styles.startMenu.boxShadow, 'important');
                }
            } else {
                KernelLogger.debug("ThemeManager", "开始菜单元素不存在，无法应用样式");
            }
        }
        
        // 应用多任务选择器样式
        if (styles.taskSwitcher) {
            const taskSwitcher = document.getElementById('task-switcher-container');
            if (taskSwitcher) {
                // 如果不是玻璃风格，强制删除backdrop-filter
                if (isGlassStyle && styles.taskSwitcher.backdropFilter && styles.taskSwitcher.backdropFilter !== 'none') {
                    taskSwitcher.style.setProperty('backdrop-filter', styles.taskSwitcher.backdropFilter, 'important');
                    taskSwitcher.style.setProperty('-webkit-backdrop-filter', styles.taskSwitcher.backdropFilter, 'important');
                    // 如果设置了 backdrop-filter，背景必须透明才能确保 backdrop-filter 生效
                    taskSwitcher.style.setProperty('background', 'transparent', 'important');
                } else {
                    taskSwitcher.style.setProperty('backdrop-filter', 'none', 'important');
                    taskSwitcher.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    // 可以正常设置背景
                    if (styles.taskSwitcher.background) {
                        taskSwitcher.style.setProperty('background', styles.taskSwitcher.background, 'important');
                    }
                }
            }
        }
        
        KernelLogger.debug("ThemeManager", `风格已应用到DOM: ${styleId}`);
        
        // 强制更新所有窗口样式（确保窗口样式及时更新）
        if (typeof GUIManager !== 'undefined' && typeof GUIManager._updateAllWindowsStyles === 'function') {
            GUIManager._updateAllWindowsStyles();
        }
    }
    
    /**
     * 获取当前主题ID
     * @returns {string} 当前主题ID
     */
    static getCurrentThemeId() {
        return ThemeManager._currentThemeId || 'default';
    }
    
    /**
     * 获取当前主题配置
     * @returns {Object|null} 当前主题配置
     */
    static getCurrentTheme() {
        return ThemeManager._themes.get(ThemeManager._currentThemeId) || null;
    }
    
    /**
     * 获取当前风格ID
     * @returns {string} 当前风格ID
     */
    static getCurrentStyleId() {
        return ThemeManager._currentStyleId || 'ubuntu';
    }
    
    /**
     * 获取当前风格配置
     * @returns {Object|null} 当前风格配置
     */
    static getCurrentStyle() {
        return ThemeManager._styles.get(ThemeManager._currentStyleId) || null;
    }
    
    /**
     * 获取所有主题列表
     * @returns {Array<Object>} 主题列表（包含完整主题信息）
     */
    static getAllThemes() {
        return Array.from(ThemeManager._themes.values());
    }
    
    /**
     * 获取所有风格列表
     * @returns {Array<Object>} 风格列表（包含完整风格信息）
     */
    static getAllStyles() {
        return Array.from(ThemeManager._styles.values());
    }
    
    /**
     * 注册内置桌面背景图
     */
    static _registerBuiltinDesktopBackgrounds() {
        // 默认背景
        ThemeManager.registerDesktopBackground('default', {
            id: 'default',
            name: '默认背景',
            description: '深色科技风格，紫色和蓝色渐变',
            path: 'assets/desktopBG/default.svg'
        });
        
        // 赛博朋克背景
        ThemeManager.registerDesktopBackground('cyberpunk', {
            id: 'cyberpunk',
            name: '赛博朋克',
            description: '霓虹风格，青色和品红色，未来感十足',
            path: 'assets/desktopBG/cyberpunk.svg'
        });
        
        // 极简背景
        ThemeManager.registerDesktopBackground('minimalist', {
            id: 'minimalist',
            name: '极简风格',
            description: '简洁优雅，蓝色渐变，适合长时间使用',
            path: 'assets/desktopBG/minimalist.svg'
        });
        
        // 自然背景
        ThemeManager.registerDesktopBackground('nature', {
            id: 'nature',
            name: '自然风格',
            description: '绿色和蓝色，自然清新，护眼舒适',
            path: 'assets/desktopBG/nature.svg'
        });
        
        // 宇宙背景
        ThemeManager.registerDesktopBackground('cosmic', {
            id: 'cosmic',
            name: '宇宙风格',
            description: '深蓝星空，星星闪烁，神秘深邃',
            path: 'assets/desktopBG/cosmic.svg'
        });
        
        // 温暖背景
        ThemeManager.registerDesktopBackground('warm', {
            id: 'warm',
            name: '温暖风格',
            description: '橙色和棕色，温暖舒适，适合夜间使用',
            path: 'assets/desktopBG/warm.svg'
        });
    }
    
    /**
     * 注册内置动画预设
     */
    static _registerBuiltinAnimationPresets() {
        // 预设1：流畅（Smooth）- 默认预设，平衡性能和流畅度
        ThemeManager.registerAnimationPreset('smooth', {
            id: 'smooth',
            name: '流畅',
            description: '平衡性能和流畅度，适合大多数用户，动画时长适中',
            config: {
                // 窗口动画
                WINDOW: {
                    OPEN: { duration: 150, easing: 'easeOutCubic' },
                    CLOSE: { duration: 120, easing: 'easeInCubic' },
                    MINIMIZE: { duration: 150, easing: 'easeInCubic' },
                    RESTORE: { duration: 150, easing: 'easeOutCubic' }
                },
                // 菜单动画
                MENU: {
                    OPEN: { duration: 100, easing: 'easeOutCubic' },
                    CLOSE: { duration: 100, easing: 'easeInCubic' }
                },
                // 对话框动画
                DIALOG: {
                    OPEN: { duration: 300, easing: 'easeOutCubic' },
                    CLOSE: { duration: 300, easing: 'easeInCubic' }
                },
                // 通知动画
                NOTIFICATION: {
                    SHOW: { duration: 400, easing: 'easeOutCubic' },
                    HIDE: { duration: 400, easing: 'easeInCubic' }
                },
                // 按钮动画
                BUTTON: {
                    CLICK: { duration: 150, easing: 'easeOutCubic' },
                    HOVER: { duration: 200, easing: 'easeOutCubic' }
                },
                // 面板动画
                PANEL: {
                    OPEN: { duration: 150, easing: 'easeOutCubic' },
                    CLOSE: { duration: 80, easing: 'easeInCubic' }
                }
            }
        });
        
        // 预设2：快速（Fast）- 快速响应，动画时长较短
        ThemeManager.registerAnimationPreset('fast', {
            id: 'fast',
            name: '快速',
            description: '快速响应，动画时长较短，适合追求效率的用户',
            config: {
                WINDOW: {
                    OPEN: { duration: 100, easing: 'easeOutCubic' },
                    CLOSE: { duration: 80, easing: 'easeInCubic' },
                    MINIMIZE: { duration: 100, easing: 'easeInCubic' },
                    RESTORE: { duration: 100, easing: 'easeOutCubic' }
                },
                MENU: {
                    OPEN: { duration: 60, easing: 'easeOutCubic' },
                    CLOSE: { duration: 60, easing: 'easeInCubic' }
                },
                DIALOG: {
                    OPEN: { duration: 200, easing: 'easeOutCubic' },
                    CLOSE: { duration: 200, easing: 'easeInCubic' }
                },
                NOTIFICATION: {
                    SHOW: { duration: 250, easing: 'easeOutCubic' },
                    HIDE: { duration: 250, easing: 'easeInCubic' }
                },
                BUTTON: {
                    CLICK: { duration: 100, easing: 'easeOutCubic' },
                    HOVER: { duration: 150, easing: 'easeOutCubic' }
                },
                PANEL: {
                    OPEN: { duration: 100, easing: 'easeOutCubic' },
                    CLOSE: { duration: 50, easing: 'easeInCubic' }
                }
            }
        });
        
        // 预设3：优雅（Elegant）- 较慢的动画，更优雅的过渡效果
        ThemeManager.registerAnimationPreset('elegant', {
            id: 'elegant',
            name: '优雅',
            description: '较慢的动画，更优雅的过渡效果，适合注重视觉体验的用户',
            config: {
                WINDOW: {
                    OPEN: { duration: 300, easing: 'easeOutCubic' },
                    CLOSE: { duration: 250, easing: 'easeInCubic' },
                    MINIMIZE: { duration: 300, easing: 'easeInCubic' },
                    RESTORE: { duration: 300, easing: 'easeOutCubic' }
                },
                MENU: {
                    OPEN: { duration: 200, easing: 'easeOutCubic' },
                    CLOSE: { duration: 200, easing: 'easeInCubic' }
                },
                DIALOG: {
                    OPEN: { duration: 400, easing: 'easeOutCubic' },
                    CLOSE: { duration: 400, easing: 'easeInCubic' }
                },
                NOTIFICATION: {
                    SHOW: { duration: 500, easing: 'easeOutCubic' },
                    HIDE: { duration: 500, easing: 'easeInCubic' }
                },
                BUTTON: {
                    CLICK: { duration: 250, easing: 'easeOutCubic' },
                    HOVER: { duration: 300, easing: 'easeOutCubic' }
                },
                PANEL: {
                    OPEN: { duration: 250, easing: 'easeOutCubic' },
                    CLOSE: { duration: 150, easing: 'easeInCubic' }
                }
            }
        });
        
        // 预设4：弹性（Bouncy）- 使用弹性缓动函数，更有活力的动画
        ThemeManager.registerAnimationPreset('bouncy', {
            id: 'bouncy',
            name: '弹性',
            description: '使用弹性缓动函数，更有活力的动画效果，充满动感',
            config: {
                WINDOW: {
                    OPEN: { duration: 200, easing: 'spring(1, 100, 8, 0)' },
                    CLOSE: { duration: 150, easing: 'easeInCubic' },
                    MINIMIZE: { duration: 150, easing: 'easeInCubic' },
                    RESTORE: { duration: 200, easing: 'spring(1, 100, 8, 0)' }
                },
                MENU: {
                    OPEN: { duration: 150, easing: 'spring(1, 80, 10, 0)' },
                    CLOSE: { duration: 100, easing: 'easeInCubic' }
                },
                DIALOG: {
                    OPEN: { duration: 350, easing: 'spring(1, 100, 8, 0)' },
                    CLOSE: { duration: 300, easing: 'easeInCubic' }
                },
                NOTIFICATION: {
                    SHOW: { duration: 400, easing: 'spring(1, 80, 10, 0)' },
                    HIDE: { duration: 400, easing: 'easeInCubic' }
                },
                BUTTON: {
                    CLICK: { duration: 200, easing: 'spring(1, 100, 8, 0)' },
                    HOVER: { duration: 200, easing: 'easeOutCubic' }
                },
                PANEL: {
                    OPEN: { duration: 200, easing: 'spring(1, 80, 10, 0)' },
                    CLOSE: { duration: 100, easing: 'easeInCubic' }
                }
            }
        });
        
        KernelLogger.info("ThemeManager", `已注册 ${ThemeManager._animationPresets.size} 个内置动画预设`);
    }
    
    /**
     * 注册动画预设
     * @param {string} presetId 预设ID
     * @param {Object} preset 预设配置 { id, name, description, config }
     * @returns {boolean} 是否注册成功
     */
    static registerAnimationPreset(presetId, preset) {
        if (!presetId || !preset) {
            KernelLogger.warn("ThemeManager", "注册动画预设失败：presetId 或 preset 为空");
            return false;
        }
        
        if (!preset.config || typeof preset.config !== 'object') {
            KernelLogger.warn("ThemeManager", `注册动画预设失败：预设 ${presetId} 缺少 config 配置`);
            return false;
        }
        
        ThemeManager._animationPresets.set(presetId, {
            id: presetId,
            name: preset.name || presetId,
            description: preset.description || '',
            config: preset.config
        });
        
        KernelLogger.debug("ThemeManager", `注册动画预设: ${presetId} - ${preset.name || presetId}`);
        return true;
    }
    
    /**
     * 设置动画预设
     * @param {string} presetId 预设ID
     * @param {boolean} save 是否保存到 LStorage（默认 true）
     * @returns {Promise<boolean>} 是否设置成功
     */
    static async setAnimationPreset(presetId, save = true) {
        if (!ThemeManager._initialized) {
            await ThemeManager.init();
        }
        
        if (!ThemeManager._animationPresets.has(presetId)) {
            KernelLogger.warn("ThemeManager", `动画预设不存在: ${presetId}`);
            return false;
        }
        
        // 应用动画预设
        ThemeManager._applyAnimationPreset(presetId);
        
        // 保存到 LStorage
        if (save && typeof LStorage !== 'undefined') {
            try {
                await LStorage.setSystemStorage(ThemeManager.STORAGE_KEY_ANIMATION_PRESET, presetId);
                KernelLogger.debug("ThemeManager", `动画预设已保存: ${presetId}`);
            } catch (e) {
                KernelLogger.warn("ThemeManager", `保存动画预设失败: ${e.message}`);
            }
        }
        
        // 通知监听器
        ThemeManager._notifyAnimationPresetChange(presetId);
        
        KernelLogger.info("ThemeManager", `动画预设已切换: ${presetId}`);
        return true;
    }
    
    /**
     * 应用动画预设到 AnimateManager
     * @param {string} presetId 预设ID
     */
    static _applyAnimationPreset(presetId) {
        const preset = ThemeManager._animationPresets.get(presetId);
        if (!preset) {
            KernelLogger.warn("ThemeManager", `应用动画预设失败：预设 ${presetId} 不存在`);
            return;
        }
        
        ThemeManager._currentAnimationPresetId = presetId;
        
        // 如果 AnimateManager 可用，更新其动画预设
        if (typeof AnimateManager !== 'undefined' && typeof POOL !== 'undefined') {
            try {
                // 获取 ANIMATION_PRESETS
                const animationPresets = POOL.__GET__("KERNEL_GLOBAL_POOL", "ANIMATION_PRESETS");
                if (animationPresets && typeof animationPresets === 'object') {
                    // 更新动画预设的时长和缓动函数
                    const presetConfig = preset.config;
                    for (const [category, actions] of Object.entries(presetConfig)) {
                        if (animationPresets[category]) {
                            for (const [action, config] of Object.entries(actions)) {
                                if (animationPresets[category][action]) {
                                    // 更新时长和缓动函数
                                    if (config.duration !== undefined) {
                                        animationPresets[category][action].duration = config.duration;
                                    }
                                    if (config.easing !== undefined) {
                                        animationPresets[category][action].easing = config.easing;
                                    }
                                }
                            }
                        }
                    }
                    KernelLogger.debug("ThemeManager", `动画预设已应用到 AnimateManager: ${presetId}`);
                }
            } catch (e) {
                KernelLogger.warn("ThemeManager", `应用动画预设到 AnimateManager 失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 获取当前动画预设ID
     * @returns {string} 当前动画预设ID
     */
    static getCurrentAnimationPresetId() {
        return ThemeManager._currentAnimationPresetId || 'smooth';
    }
    
    /**
     * 获取当前动画预设配置
     * @returns {Object|null} 当前动画预设配置
     */
    static getCurrentAnimationPreset() {
        const presetId = ThemeManager._currentAnimationPresetId || 'smooth';
        const preset = ThemeManager._animationPresets.get(presetId);
        // 如果预设不存在，尝试返回默认预设
        if (!preset && presetId !== 'smooth') {
            return ThemeManager._animationPresets.get('smooth') || null;
        }
        return preset || null;
    }
    
    /**
     * 获取所有动画预设列表
     * @returns {Array<Object>} 动画预设列表
     */
    static getAllAnimationPresets() {
        return Array.from(ThemeManager._animationPresets.values()).map(preset => ({
            id: preset.id,
            name: preset.name,
            description: preset.description
        }));
    }
    
    /**
     * 获取动画预设配置
     * @param {string} presetId 预设ID
     * @returns {Object|null} 动画预设配置
     */
    static getAnimationPreset(presetId) {
        return ThemeManager._animationPresets.get(presetId) || null;
    }
    
    /**
     * 添加动画预设变更监听器
     * @param {Function} listener 监听器函数
     * @returns {Function} 取消监听的函数
     */
    static onAnimationPresetChange(listener) {
        if (typeof listener !== 'function') {
            KernelLogger.warn("ThemeManager", "监听器必须是函数");
            return () => {};
        }
        
        ThemeManager._animationPresetChangeListeners.push(listener);
        
        // 立即调用一次，传递当前预设
        try {
            const currentPresetId = ThemeManager._currentAnimationPresetId || ThemeManager.getCurrentAnimationPresetId();
            const currentPreset = ThemeManager.getCurrentAnimationPreset();
            // 如果预设为 null，尝试使用默认预设
            if (!currentPreset && currentPresetId) {
                // 如果预设不存在，使用默认的 'smooth' 预设
                const defaultPreset = ThemeManager._animationPresets.get('smooth');
                if (defaultPreset) {
                    listener('smooth', defaultPreset);
                } else {
                    // 如果连默认预设都没有，传递 null
                    listener(currentPresetId, null);
                }
            } else {
                listener(currentPresetId, currentPreset);
            }
        } catch (e) {
            KernelLogger.warn("ThemeManager", `动画预设变更监听器初始化失败: ${e.message}`);
        }
        
        return () => {
            const index = ThemeManager._animationPresetChangeListeners.indexOf(listener);
            if (index > -1) {
                ThemeManager._animationPresetChangeListeners.splice(index, 1);
            }
        };
    }
    
    /**
     * 移除动画预设变更监听器
     * @param {Function} listener 监听器函数
     */
    static offAnimationPresetChange(listener) {
        const index = ThemeManager._animationPresetChangeListeners.indexOf(listener);
        if (index > -1) {
            ThemeManager._animationPresetChangeListeners.splice(index, 1);
        }
    }
    
    /**
     * 通知动画预设变更
     * @param {string} presetId 新预设ID
     */
    static _notifyAnimationPresetChange(presetId) {
        const preset = ThemeManager.getCurrentAnimationPreset();
        ThemeManager._animationPresetChangeListeners.forEach(listener => {
            try {
                // 确保 preset 不为 null，如果为 null 则传递默认预设
                if (preset) {
                    listener(presetId, preset);
                } else {
                    // 如果预设不存在，尝试使用默认预设
                    const defaultPreset = ThemeManager._animationPresets.get('smooth');
                    if (defaultPreset) {
                        listener('smooth', defaultPreset);
                    } else {
                        listener(presetId, null);
                    }
                }
            } catch (e) {
                KernelLogger.warn("ThemeManager", `动画预设变更监听器执行失败: ${e.message}`);
            }
        });
    }
    
    /**
     * 注册桌面背景图
     * @param {string} backgroundId 背景图ID
     * @param {Object} background 背景图配置 { id, name, description, path }
     * @returns {boolean} 是否注册成功
     */
    static registerDesktopBackground(backgroundId, background) {
        if (!backgroundId || typeof backgroundId !== 'string') {
            KernelLogger.warn("ThemeManager", `注册桌面背景失败：背景ID无效`);
            return false;
        }
        
        if (!background || typeof background !== 'object') {
            KernelLogger.warn("ThemeManager", `注册桌面背景失败：背景配置无效`);
            return false;
        }
        
        if (!background.path || typeof background.path !== 'string') {
            KernelLogger.warn("ThemeManager", `注册桌面背景失败：背景 ${backgroundId} 缺少 path 配置`);
            return false;
        }
        
        ThemeManager._desktopBackgrounds.set(backgroundId, {
            id: backgroundId,
            name: background.name || backgroundId,
            description: background.description || '',
            path: background.path
        });
        
        KernelLogger.debug("ThemeManager", `注册桌面背景: ${backgroundId} - ${background.name || backgroundId}`);
        return true;
    }
    
    /**
     * 设置桌面背景图
     * @param {string} backgroundId 背景图ID
     * @param {boolean} save 是否保存到 LStorage（默认 true）
     * @returns {Promise<boolean>} 是否设置成功
     */
    static async setDesktopBackground(backgroundId, save = true) {
        if (!ThemeManager._initialized) {
            await ThemeManager.init();
        }
        
        if (!ThemeManager._desktopBackgrounds.has(backgroundId)) {
            KernelLogger.warn("ThemeManager", `桌面背景不存在: ${backgroundId}`);
            return false;
        }
        
        // 应用桌面背景
        await ThemeManager._applyDesktopBackground(backgroundId);
        
        // 更新当前背景ID（立即更新，即使保存失败）
        ThemeManager._currentDesktopBackgroundId = backgroundId;
        
        // 保存到 LStorage
        if (save && typeof LStorage !== 'undefined') {
            try {
                // 确保 backgroundId 是字符串类型
                const backgroundIdToSave = String(backgroundId);
                const saveResult = await LStorage.setSystemStorage(ThemeManager.STORAGE_KEY_DESKTOP_BACKGROUND, backgroundIdToSave);
                if (saveResult) {
                    KernelLogger.info("ThemeManager", `桌面背景已保存: ${backgroundIdToSave}`);
                } else {
                    // setSystemStorage 返回 false，但数据已在内存中，LStorage 会安排延迟保存
                    KernelLogger.debug("ThemeManager", `桌面背景已更新，保存将在 D: 分区可用后自动完成: ${backgroundIdToSave}`);
                }
            } catch (e) {
                // 即使保存失败，背景已经应用，LStorage 会安排延迟保存
                if (e.message && e.message.includes('分区不存在')) {
                    KernelLogger.debug("ThemeManager", `桌面背景已更新，保存将在 D: 分区可用后自动完成: ${backgroundId}`);
                } else {
                    KernelLogger.warn("ThemeManager", `保存桌面背景失败: ${e.message}`);
                }
            }
        }
        
        KernelLogger.info("ThemeManager", `桌面背景已切换: ${backgroundId}`);
        return true;
    }
    
    /**
     * 应用桌面背景图到 DOM
     * @param {string} backgroundId 背景图ID
     */
    static async _applyDesktopBackground(backgroundId) {
        const background = ThemeManager._desktopBackgrounds.get(backgroundId);
        if (!background) {
            KernelLogger.warn("ThemeManager", `应用桌面背景失败：背景 ${backgroundId} 不存在`);
            // 回退到默认背景
            const defaultBackground = ThemeManager._desktopBackgrounds.get('default');
            if (defaultBackground) {
                KernelLogger.info("ThemeManager", "回退到默认背景");
                await ThemeManager._applyDesktopBackground('default');
            }
            return;
        }
        
        ThemeManager._currentDesktopBackgroundId = backgroundId;
        
        // 获取 GUI 容器
        const guiContainer = document.getElementById('gui-container');
        if (!guiContainer) {
            KernelLogger.warn("ThemeManager", "无法获取 GUI 容器，跳过桌面背景应用");
            return;
        }
        
        // 检查是否是本地图片路径（以 C: 或 D: 开头，或包含 /service/DISK/）
        const isLocalPath = background.path.startsWith('C:') || 
                           background.path.startsWith('D:') || 
                           background.path.includes('/service/DISK/');
        
        let imageUrl = background.path;
        
        // 如果是本地路径，转换为 PHP 服务 URL
        if (isLocalPath) {
            // 检查文件是否存在（支持图片和视频）
            const exists = await ThemeManager._checkImageExists(background.path);
            if (!exists) {
                KernelLogger.warn("ThemeManager", `本地文件不存在: ${background.path}，回退到默认背景`);
                const defaultBackground = ThemeManager._desktopBackgrounds.get('default');
                if (defaultBackground) {
                    await ThemeManager._applyDesktopBackground('default');
                }
                return;
            }
            
            // 转换为 PHP 服务 URL
            // 例如: C:/path/to/image.jpg -> /service/DISK/C/path/to/image.jpg
            // 例如: D:/path/to/image.jpg -> /service/DISK/D/path/to/image.jpg
            if (background.path.startsWith('C:')) {
                imageUrl = '/service/DISK/C' + background.path.substring(2).replace(/\\/g, '/');
            } else if (background.path.startsWith('D:')) {
                imageUrl = '/service/DISK/D' + background.path.substring(2).replace(/\\/g, '/');
            } else if (background.path.includes('/service/DISK/')) {
                imageUrl = background.path;
            }
        }
        
        // 检测文件类型（通过文件扩展名）
        const fileExtension = background.path.toLowerCase().split('.').pop() || '';
        const isGif = fileExtension === 'gif';
        const isVideo = fileExtension === 'mp4' || fileExtension === 'webm' || fileExtension === 'ogg';
        
        // 如果是视频，使用 video 元素作为背景
        if (isVideo) {
            // 移除旧的视频背景元素（如果存在）
            const oldVideo = guiContainer.querySelector('.desktop-background-video');
            if (oldVideo) {
                oldVideo.pause();
                oldVideo.remove();
            }
            
            // 移除旧的背景图片样式
            guiContainer.style.backgroundImage = '';
            guiContainer.style.backgroundSize = '';
            guiContainer.style.backgroundPosition = '';
            guiContainer.style.backgroundRepeat = '';
            guiContainer.style.backgroundAttachment = '';
            
            // 创建视频元素
            const video = document.createElement('video');
            video.className = 'desktop-background-video';
            video.src = imageUrl;
            video.autoplay = true;
            video.loop = true;
            video.muted = true; // 必须静音
            video.playsInline = true; // 在移动设备上内联播放
            video.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                object-fit: cover;
                z-index: 0;
                pointer-events: none;
            `;
            
            // 确保视频播放
            video.addEventListener('loadeddata', () => {
                video.play().catch(e => {
                    KernelLogger.warn("ThemeManager", `视频播放失败: ${e.message}`);
                });
            });
            
            // 处理视频加载错误
            video.addEventListener('error', (e) => {
                KernelLogger.warn("ThemeManager", `视频加载失败: ${backgroundId}，回退到默认背景`);
                const defaultBackground = ThemeManager._desktopBackgrounds.get('default');
                if (defaultBackground) {
                    ThemeManager._applyDesktopBackground('default');
                }
            });
            
            // 添加到容器
            guiContainer.appendChild(video);
            
            // 设置 CSS 变量
            const root = document.documentElement;
            if (root) {
                root.style.setProperty('--desktop-background-type', 'video');
                root.style.setProperty('--desktop-background-video-url', `url('${imageUrl}')`);
            }
            
            KernelLogger.debug("ThemeManager", `桌面视频背景已应用到DOM: ${backgroundId} (${imageUrl})`);
        } else {
            // 图片背景（包括 GIF）
            // 移除旧的视频背景元素（如果存在）
            const oldVideo = guiContainer.querySelector('.desktop-background-video');
            if (oldVideo) {
                oldVideo.pause();
                oldVideo.remove();
            }
            
            // 应用背景图
            guiContainer.style.backgroundImage = `url('${imageUrl}')`;
            guiContainer.style.backgroundSize = 'cover';  // 确保图片占满全屏
            guiContainer.style.backgroundPosition = 'center';
            guiContainer.style.backgroundRepeat = 'no-repeat';
            guiContainer.style.backgroundAttachment = 'fixed';
            
            // 对于 GIF 动图，确保动画能够播放
            // 注意：CSS background-image 中的 GIF 会自动播放动画，无需特殊处理
            if (isGif) {
                KernelLogger.debug("ThemeManager", `检测到 GIF 动图背景: ${backgroundId}`);
            }
            
            // 设置 CSS 变量（供其他地方使用）
            const root = document.documentElement;
            if (root) {
                root.style.setProperty('--desktop-background-image', `url('${imageUrl}')`);
                // 添加图片类型标记（供 CSS 使用）
                if (isGif) {
                    root.style.setProperty('--desktop-background-type', 'gif');
                } else {
                    root.style.setProperty('--desktop-background-type', 'static');
                }
            }
            
            KernelLogger.debug("ThemeManager", `桌面背景已应用到DOM: ${backgroundId} (${imageUrl}, 类型: ${isGif ? 'GIF动图' : '静态图片'})`);
        }
    }
    
    /**
     * 检查本地图片或视频是否存在
     * @param {string} imagePath 文件路径（C: 或 D: 开头的路径）
     * @returns {Promise<boolean>} 文件是否存在
     */ 
    static async _checkImageExists(imagePath) {
        try {
            // 转换为 PHP 服务路径
            let phpPath = imagePath;
            if (imagePath.startsWith('C:')) {
                phpPath = 'C:' + imagePath.substring(2).replace(/\\/g, '/');
            } else if (imagePath.startsWith('D:')) {
                phpPath = 'D:' + imagePath.substring(2).replace(/\\/g, '/');
            }
            
            // 确保路径格式正确
            if (/^[CD]:$/.test(phpPath)) {
                phpPath = phpPath + '/';
            }
            
            // 使用 PHP 服务检查文件是否存在
            const url = new URL('/service/FSDirve.php', window.location.origin);
            url.searchParams.set('action', 'exists');
            url.searchParams.set('path', phpPath);
            
            const response = await fetch(url.toString());
            if (!response.ok) {
                return false;
            }
            
            const result = await response.json();
            if (result.status === 'success' && result.data && result.data.exists && result.data.type === 'file') {
                // 检查文件扩展名，支持常见图片格式（包括 GIF）和视频格式（mp4）
                const extension = imagePath.toLowerCase().split('.').pop() || '';
                const supportedImageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
                const supportedVideoFormats = ['mp4', 'webm', 'ogg'];
                if (supportedImageFormats.includes(extension) || supportedVideoFormats.includes(extension)) {
                    return true;
                } else {
                    KernelLogger.warn("ThemeManager", `不支持的文件格式: ${extension}`);
                    return false;
                }
            }
            return false;
        } catch (e) {
            KernelLogger.warn("ThemeManager", `检查图片存在性失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 设置本地图片作为桌面背景
     * @param {string} imagePath 图片路径（C: 或 D: 开头的路径），支持 JPG、PNG、GIF、WebP、SVG 等格式
     * @param {boolean} save 是否保存到 LStorage（默认 true）
     * @returns {Promise<boolean>} 是否设置成功
     */
    static async setLocalImageAsBackground(imagePath, save = true) {
        if (!imagePath || typeof imagePath !== 'string') {
            KernelLogger.warn("ThemeManager", "设置本地图片背景失败：路径无效");
            return false;
        }
        
        // 检查文件扩展名，确认是支持的图片或视频格式
        const extension = imagePath.toLowerCase().split('.').pop() || '';
        const supportedImageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
        const supportedVideoFormats = ['mp4', 'webm', 'ogg'];
        const isVideo = supportedVideoFormats.includes(extension);
        const isImage = supportedImageFormats.includes(extension);
        
        if (!isImage && !isVideo) {
            KernelLogger.warn("ThemeManager", `不支持的文件格式: ${extension}，支持的图片格式: ${supportedImageFormats.join(', ')}，支持的视频格式: ${supportedVideoFormats.join(', ')}`);
            return false;
        }
        
        // 检查文件是否存在
        const exists = await ThemeManager._checkImageExists(imagePath);
        if (!exists) {
            KernelLogger.warn("ThemeManager", `本地文件不存在: ${imagePath}`);
            return false;
        }
        
        // 生成唯一的背景ID（使用路径的哈希或直接使用路径）
        const backgroundId = `local_${imagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // 从路径中提取文件名作为名称
        const fileName = imagePath.split(/[/\\]/).pop() || (isVideo ? '本地视频' : '本地图片');
        
        // 生成描述
        let description;
        if (isVideo) {
            description = `本地视频: ${imagePath}（静音循环播放）`;
        } else if (extension === 'gif') {
            description = `本地GIF动图: ${imagePath}`;
        } else {
            description = `本地图片: ${imagePath}`;
        }
        
        // 注册或更新本地背景
        ThemeManager.registerDesktopBackground(backgroundId, {
            id: backgroundId,
            name: fileName,
            description: description,
            path: imagePath
        });
        
        // 保存本地背景信息到存储（用于重启后恢复）
        if (save && typeof LStorage !== 'undefined') {
            try {
                // 获取现有的本地背景列表
                let localBackgrounds = await LStorage.getSystemStorage('system.localDesktopBackgrounds');
                if (!Array.isArray(localBackgrounds)) {
                    localBackgrounds = [];
                }
                
                // 检查是否已存在相同的背景
                const existingIndex = localBackgrounds.findIndex(bg => bg && bg.id === backgroundId);
                const localBgInfo = {
                    id: backgroundId,
                    name: fileName,
                    description: description,
                    path: imagePath
                };
                
                if (existingIndex >= 0) {
                    // 更新现有背景信息
                    localBackgrounds[existingIndex] = localBgInfo;
                } else {
                    // 添加新背景信息
                    localBackgrounds.push(localBgInfo);
                }
                
                // 保存到存储
                const saveResult = await LStorage.setSystemStorage('system.localDesktopBackgrounds', localBackgrounds);
                if (saveResult) {
                    KernelLogger.info("ThemeManager", `本地桌面背景信息已保存: ${backgroundId}`);
                } else {
                    KernelLogger.debug("ThemeManager", `本地桌面背景信息已更新，保存将在 D: 分区可用后自动完成: ${backgroundId}`);
                }
            } catch (e) {
                KernelLogger.warn("ThemeManager", `保存本地桌面背景信息失败: ${e.message}`);
            }
        }
        
        // 设置背景
        return await ThemeManager.setDesktopBackground(backgroundId, save);
    }
    
    /**
     * 设置本地视频作为桌面背景（支持 MP4、WebM、OGG 格式，必须静音）
     * @param {string} videoPath 视频路径（C: 或 D: 开头的路径），支持 MP4、WebM、OGG 格式
     * @param {boolean} save 是否保存到 LStorage（默认 true）
     * @returns {Promise<boolean>} 是否设置成功
     */
    static async setLocalVideoAsBackground(videoPath, save = true) {
        if (!videoPath || typeof videoPath !== 'string') {
            KernelLogger.warn("ThemeManager", "设置本地视频背景失败：路径无效");
            return false;
        }
        
        // 检查文件扩展名，确认是支持的视频格式
        const extension = videoPath.toLowerCase().split('.').pop() || '';
        const supportedVideoFormats = ['mp4', 'webm', 'ogg'];
        if (!supportedVideoFormats.includes(extension)) {
            KernelLogger.warn("ThemeManager", `不支持的视频格式: ${extension}，支持的格式: ${supportedVideoFormats.join(', ')}`);
            return false;
        }
        
        // 检查视频是否存在
        const exists = await ThemeManager._checkImageExists(videoPath);
        if (!exists) {
            KernelLogger.warn("ThemeManager", `本地视频不存在: ${videoPath}`);
            return false;
        }
        
        // 生成唯一的背景ID（使用路径的哈希或直接使用路径）
        const backgroundId = `local_${videoPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // 从路径中提取文件名作为名称
        const fileName = videoPath.split(/[/\\]/).pop() || '本地视频';
        
        // 生成描述
        const description = `本地视频: ${videoPath}（静音循环播放）`;
        
        // 注册或更新本地背景
        ThemeManager.registerDesktopBackground(backgroundId, {
            id: backgroundId,
            name: fileName,
            description: description,
            path: videoPath
        });
        
        // 保存本地背景信息到存储（用于重启后恢复）
        if (save && typeof LStorage !== 'undefined') {
            try {
                // 获取现有的本地背景列表
                let localBackgrounds = await LStorage.getSystemStorage('system.localDesktopBackgrounds');
                if (!Array.isArray(localBackgrounds)) {
                    localBackgrounds = [];
                }
                
                // 检查是否已存在相同的背景
                const existingIndex = localBackgrounds.findIndex(bg => bg && bg.id === backgroundId);
                const localBgInfo = {
                    id: backgroundId,
                    name: fileName,
                    description: description,
                    path: videoPath
                };
                
                if (existingIndex >= 0) {
                    // 更新现有背景信息
                    localBackgrounds[existingIndex] = localBgInfo;
                } else {
                    // 添加新背景信息
                    localBackgrounds.push(localBgInfo);
                }
                
                // 保存到存储
                const saveResult = await LStorage.setSystemStorage('system.localDesktopBackgrounds', localBackgrounds);
                if (saveResult) {
                    KernelLogger.info("ThemeManager", `本地桌面视频背景信息已保存: ${backgroundId}`);
                } else {
                    KernelLogger.debug("ThemeManager", `本地桌面视频背景信息已更新，保存将在 D: 分区可用后自动完成: ${backgroundId}`);
                }
            } catch (e) {
                KernelLogger.warn("ThemeManager", `保存本地桌面视频背景信息失败: ${e.message}`);
            }
        }
        
        // 设置背景
        return await ThemeManager.setDesktopBackground(backgroundId, save);
    }
    
    /**
     * 获取当前桌面背景图ID
     * @returns {string|null} 当前桌面背景图ID
     */
    static getCurrentDesktopBackground() {
        return ThemeManager._currentDesktopBackgroundId;
    }
    
    /**
     * 获取所有桌面背景图
     * @returns {Array<Object>} 桌面背景图数组
     */
    static getAllDesktopBackgrounds() {
        return Array.from(ThemeManager._desktopBackgrounds.values());
    }
    
    /**
     * 获取桌面背景图信息
     * @param {string} backgroundId 背景图ID
     * @returns {Object|null} 桌面背景图信息
     */
    static getDesktopBackground(backgroundId) {
        return ThemeManager._desktopBackgrounds.get(backgroundId) || null;
    }
    
    /**
     * 获取主题配置
     * @param {string} themeId 主题ID
     * @returns {Object|null} 主题配置
     */
    static getTheme(themeId) {
        return ThemeManager._themes.get(themeId) || null;
    }
    
    /**
     * 获取风格配置
     * @param {string} styleId 风格ID
     * @returns {Object|null} 风格配置
     */
    static getStyle(styleId) {
        return ThemeManager._styles.get(styleId) || null;
    }
    
    /**
     * 获取系统图标路径
     * @param {string} iconName 图标名称（如 'network', 'battery'）
     * @param {string} styleId 风格ID（可选，默认使用当前风格）
     * @returns {string} 图标文件路径
     */
    static getSystemIconPath(iconName, styleId = null) {
        const currentStyleId = styleId || ThemeManager._currentStyleId || 'ubuntu';
        // 图标路径：assets/icons/{styleId}/{iconName}.svg
        return `assets/icons/${currentStyleId}/${iconName}.svg`;
    }
    
    /**
     * 获取系统图标SVG内容（异步加载）
     * @param {string} iconName 图标名称
     * @param {string} styleId 风格ID（可选，默认使用当前风格）
     * @returns {Promise<string>} SVG内容
     */
    static async getSystemIconSVG(iconName, styleId = null) {
        const iconPath = ThemeManager.getSystemIconPath(iconName, styleId);
        try {
            // 使用 AbortController 设置超时，避免资源耗尽
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
            
            const response = await fetch(iconPath, { 
                signal: controller.signal,
                cache: 'no-cache' // 禁用缓存，确保获取最新图标
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                return await response.text();
            } else {
                KernelLogger.warn("ThemeManager", `无法加载图标: ${iconPath}，使用默认图标`);
                // 降级：返回内联SVG
                return ThemeManager._getDefaultIconSVG(iconName);
            }
        } catch (e) {
            // 如果是 AbortError（超时），记录更详细的错误
            if (e.name === 'AbortError') {
                KernelLogger.warn("ThemeManager", `加载图标超时: ${iconPath}，使用默认图标`);
            } else {
                KernelLogger.warn("ThemeManager", `加载图标失败: ${iconPath}, ${e.message}，使用默认图标`);
            }
            return ThemeManager._getDefaultIconSVG(iconName);
        }
    }
    
    /**
     * 获取默认图标SVG（降级方案）
     * @param {string} iconName 图标名称
     * @returns {string} SVG内容
     */
    static _getDefaultIconSVG(iconName) {
        const defaultIcons = {
            network: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" 
                      fill="currentColor" 
                      opacity="0.9"/>
            </svg>`,
            battery: `<svg width="24" height="12" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="2" width="18" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
                <rect x="19" y="4" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.5"/>
                <rect id="battery-fill" x="2" y="3" width="16" height="6" rx="0.5" fill="currentColor" opacity="0.9"/>
            </svg>`,
            minimize: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            maximize: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
            </svg>`,
            restore: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
                <rect x="5" y="5" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
            </svg>`,
            close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            power: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2V7z" 
                      fill="currentColor" 
                      opacity="0.9"/>
            </svg>`,
            restart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" 
                      fill="currentColor" 
                      opacity="0.9"/>
            </svg>`,
            shutdown: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.59-5.41L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z" 
                      fill="currentColor" 
                      opacity="0.9"/>
            </svg>`,
            'app-default': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M8 8h8v8H8z" fill="currentColor" opacity="0.5"/>
            </svg>`
        };
        return defaultIcons[iconName] || '';
    }
    
    /**
     * 添加主题变更监听器
     * @param {Function} listener 监听器函数
     * @returns {Function} 取消监听的函数
     */
    static onThemeChange(listener) {
        if (typeof listener !== 'function') {
            KernelLogger.warn("ThemeManager", "监听器必须是函数");
            return () => {};
        }
        
        ThemeManager._themeChangeListeners.push(listener);
        
        // 立即调用一次，传递当前主题
        try {
            listener(ThemeManager._currentThemeId, ThemeManager.getCurrentTheme());
        } catch (e) {
            KernelLogger.warn("ThemeManager", `主题变更监听器初始化失败: ${e.message}`);
        }
        
        return () => {
            const index = ThemeManager._themeChangeListeners.indexOf(listener);
            if (index > -1) {
                ThemeManager._themeChangeListeners.splice(index, 1);
            }
        };
    }
    
    /**
     * 添加风格变更监听器
     * @param {Function} listener 监听器函数
     * @returns {Function} 取消监听的函数
     */
    static onStyleChange(listener) {
        if (typeof listener !== 'function') {
            KernelLogger.warn("ThemeManager", "监听器必须是函数");
            return () => {};
        }
        
        ThemeManager._styleChangeListeners.push(listener);
        
        // 立即调用一次，传递当前风格
        try {
            listener(ThemeManager._currentStyleId, ThemeManager.getCurrentStyle());
        } catch (e) {
            KernelLogger.warn("ThemeManager", `风格变更监听器初始化失败: ${e.message}`);
        }
        
        return () => {
            const index = ThemeManager._styleChangeListeners.indexOf(listener);
            if (index > -1) {
                ThemeManager._styleChangeListeners.splice(index, 1);
            }
        };
    }
    
    /**
     * 移除主题变更监听器
     * @param {Function} listener 监听器函数
     */
    static offThemeChange(listener) {
        const index = ThemeManager._themeChangeListeners.indexOf(listener);
        if (index > -1) {
            ThemeManager._themeChangeListeners.splice(index, 1);
        }
    }
    
    /**
     * 移除风格变更监听器
     * @param {Function} listener 监听器函数
     */
    static offStyleChange(listener) {
        const index = ThemeManager._styleChangeListeners.indexOf(listener);
        if (index > -1) {
            ThemeManager._styleChangeListeners.splice(index, 1);
        }
    }
    
    /**
     * 通知主题变更
     * @param {string} themeId 新主题ID
     */
    static _notifyThemeChange(themeId) {
        const theme = ThemeManager.getCurrentTheme();
        ThemeManager._themeChangeListeners.forEach(listener => {
            try {
                listener(themeId, theme);
            } catch (e) {
                KernelLogger.warn("ThemeManager", `主题变更监听器执行失败: ${e.message}`);
            }
        });
    }
    
    /**
     * 通知风格变更
     * @param {string} styleId 新风格ID
     */
    static _notifyStyleChange(styleId) {
        const style = ThemeManager.getCurrentStyle();
        ThemeManager._styleChangeListeners.forEach(listener => {
            try {
                listener(styleId, style);
            } catch (e) {
                KernelLogger.warn("ThemeManager", `风格变更监听器执行失败: ${e.message}`);
            }
        });
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "ThemeManager", ThemeManager);
    } catch (e) {
        KernelLogger.error("ThemeManager", `注册到POOL失败: ${e.message}`);
    }
}

// 自动初始化（异步，不阻塞）
(async () => {
    try {
        await ThemeManager.init();
    } catch (e) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.error("ThemeManager", `自动初始化失败: ${e.message}`);
        } else {
            console.error("[ThemeManager] 自动初始化失败:", e);
        }
    }
})();

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/process/themeManager.js");
}
