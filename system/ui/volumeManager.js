// 音量管理器：在任务栏初始化阶段注入 Web Audio 拦截，维护系统音量（0-1）并统一缩放所有经 AudioContext 输出的音频

KernelLogger.info("VolumeManager", "模块初始化");

class VolumeManager {
    /** 系统音量，0-1，作为全局缩放系数 */
    static _systemVolume = 1;
    /** 已注入的 GainNode 列表，用于统一应用系统音量 */
    static _gainNodes = [];
    /** 是否已对 AudioContext 进行包装（仅执行一次） */
    static _patched = false;
    /** LStorage 存储键 */
    static VOLUME_STORAGE_KEY = 'system.volume';

    /**
     * 在任务栏初始化时调用：包装全局 AudioContext / webkitAudioContext，使所有输出经受控 GainNode
     */
    static init() {
        if (VolumeManager._patched) {
            KernelLogger.debug("VolumeManager", "AudioContext 已包装，跳过");
            return;
        }

        const NativeAudioContext = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!NativeAudioContext) {
            KernelLogger.warn("VolumeManager", "当前环境无 AudioContext，跳过音量拦截");
            return;
        }

        const self = VolumeManager;

        function WrappedAudioContext(...args) {
            const ctx = new NativeAudioContext(...args);
            const gainNode = ctx.createGain();
            gainNode.gain.value = self._systemVolume;
            gainNode.connect(ctx.destination); // 将受控增益节点接到真实扬声器出口
            self._gainNodes.push(gainNode);

            return new Proxy(ctx, {
                get(target, prop) {
                    if (prop === 'destination') return gainNode;
                    const v = target[prop];
                    if (typeof v === 'function') return v.bind(target);
                    return v;
                }
            });
        }

        // 保持构造函数名与静态属性，便于调试与兼容
        try {
            WrappedAudioContext.prototype = NativeAudioContext.prototype;
            if (NativeAudioContext.name) WrappedAudioContext.name = NativeAudioContext.name;
        } catch (e) { /* 忽略 */ }

        if (typeof window !== 'undefined') {
            window.AudioContext = WrappedAudioContext;
            if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioContext;
        }

        VolumeManager._patched = true;
        KernelLogger.info("VolumeManager", "AudioContext 已包装，系统音量将作用于所有经 Web Audio 输出的音频");

        // 异步从 LStorage 恢复音量并应用到已有 GainNode
        VolumeManager._loadAndApplyStoredVolume();
    }

    /**
     * 从 LStorage 读取 system.volume 并应用到当前系统音量及所有已注册 GainNode
     */
    static async _loadAndApplyStoredVolume() {
        if (typeof LStorage === 'undefined' || typeof LStorage.getSystemStorage !== 'function') return;
        try {
            const stored = await LStorage.getSystemStorage(VolumeManager.VOLUME_STORAGE_KEY);
            const v = typeof stored === 'number' && stored >= 0 && stored <= 1 ? stored : 1;
            VolumeManager._systemVolume = v;
            VolumeManager._applySystemVolumeToAll();
            KernelLogger.debug("VolumeManager", `已从存储恢复系统音量: ${v}`);
        } catch (e) {
            KernelLogger.debug("VolumeManager", `读取存储音量失败，使用默认 1: ${e && e.message}`);
        }
    }

    /**
     * 将当前 _systemVolume 应用到所有已注册的 GainNode
     */
    static _applySystemVolumeToAll() {
        const v = VolumeManager._systemVolume;
        for (let i = 0; i < VolumeManager._gainNodes.length; i++) {
            try {
                const g = VolumeManager._gainNodes[i];
                if (g && g.gain) g.gain.setValueAtTime(v, (g.context && g.context.currentTime) || 0);
            } catch (err) {
                KernelLogger.debug("VolumeManager", `应用音量到 GainNode 失败: ${err && err.message}`);
            }
        }
    }

    /**
     * 获取当前系统音量（0-1）
     * @returns {number}
     */
    static getSystemVolume() {
        return VolumeManager._systemVolume;
    }

    /**
     * 设置系统音量（0-1），并持久化到 LStorage，并应用到所有已注册 GainNode
     * @param {number} value 0-1
     */
    static setSystemVolume(value) {
        const v = Math.max(0, Math.min(1, Number(value)));
        if (Number.isNaN(v)) return;
        VolumeManager._systemVolume = v;
        VolumeManager._applySystemVolumeToAll();
        if (typeof LStorage !== 'undefined' && typeof LStorage.setSystemStorage === 'function') {
            LStorage.setSystemStorage(VolumeManager.VOLUME_STORAGE_KEY, v).catch(e => {
                KernelLogger.warn("VolumeManager", `持久化系统音量失败: ${e && e.message}`);
            });
        }
        if (typeof document !== 'undefined') {
            try {
                document.dispatchEvent(new CustomEvent('zeros-system-volume-change', { detail: { value: v } }));
            } catch (e) { /* 忽略 */ }
        }
    }
}

if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    POOL.__ADD__("KERNEL_GLOBAL_POOL", "VolumeManager", VolumeManager);
}

// 通知 DependencyConfig 模块已加载完成，避免 bootloader 等待超时
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../system/ui/volumeManager.js");
}
