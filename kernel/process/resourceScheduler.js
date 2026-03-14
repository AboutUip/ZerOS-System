class ResourceScheduler {
    static _tokens = 0;
    static _lastRefillTime = Date.now();
    static _queue = [];
    static _stats = {
        totalCalls: 0,
        queuedCalls: 0,
        rejectedCalls: 0,
        byProcess: {}
    };
    static _history = [];
    static _maxHistoryLength = 120;
    
    static _netTokens = 0;
    static _netLastRefillTime = Date.now();
    static _netQueue = [];
    static _netStats = {
        totalCalls: 0,
        queuedCalls: 0,
        rejectedCalls: 0,
        byProcess: {}
    };
    static _netHistory = [];

    static get CONFIG() {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.CPU_CONFIG) {
            return SystemInformation.CPU_CONFIG;
        }
        return {
            tokensPerSecond: 20,
            maxQueueSize: 100,
            enableScheduling: true,
            refillInterval: 1000,
            netTokensPerSecond: 20,
            netMaxQueueSize: 100,
            enableNetScheduling: true
        };
    }

    static get NET_CONFIG() {
        const config = this.CONFIG;
        return {
            tokensPerSecond: config.netTokensPerSecond || 20,
            maxQueueSize: config.netMaxQueueSize || 100,
            enableScheduling: config.enableNetScheduling !== false,
            refillInterval: 1000
        };
    }

    static PRIORITY = {
        CRITICAL: 0,
        HIGH: 1,
        NORMAL: 2,
        LOW: 3
    };

    static API_PRIORITY = {
        'Window.setTitle': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.setSize': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.setPosition': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.show': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.hide': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.focus': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.close': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.minimize': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.maximize': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.unmaximize': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.setAlwaysOnTop': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.setResizable': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.setFullscreen': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.move': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.resize': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.setOpacity': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.setZIndex': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.flash': ResourceScheduler.PRIORITY.CRITICAL,
        'Window.requestAttention': ResourceScheduler.PRIORITY.CRITICAL,
        'Desktop.updateDesktop': ResourceScheduler.PRIORITY.HIGH,
        'Desktop.addIcon': ResourceScheduler.PRIORITY.HIGH,
        'Desktop.removeIcon': ResourceScheduler.PRIORITY.HIGH,
        'Desktop.updateIcon': ResourceScheduler.PRIORITY.HIGH,
        'Desktop.refresh': ResourceScheduler.PRIORITY.HIGH,
        'Taskbar.updateTaskbar': ResourceScheduler.PRIORITY.HIGH,
        'Taskbar.addProgram': ResourceScheduler.PRIORITY.HIGH,
        'Taskbar.removeProgram': ResourceScheduler.PRIORITY.HIGH,
        'Notification.create': ResourceScheduler.PRIORITY.HIGH,
        'Notification.show': ResourceScheduler.PRIORITY.HIGH,
        'FileSystem.read': ResourceScheduler.PRIORITY.NORMAL,
        'FileSystem.write': ResourceScheduler.PRIORITY.NORMAL,
        'FileSystem.delete': ResourceScheduler.PRIORITY.NORMAL,
        'FileSystem.mkdir': ResourceScheduler.PRIORITY.NORMAL,
        'FileSystem.readDir': ResourceScheduler.PRIORITY.NORMAL,
        'FileSystem.exists': ResourceScheduler.PRIORITY.LOW,
        'FileSystem.stat': ResourceScheduler.PRIORITY.LOW,
        'LocalStorage.get': ResourceScheduler.PRIORITY.LOW,
        'LocalStorage.set': ResourceScheduler.PRIORITY.LOW,
        'LocalStorage.delete': ResourceScheduler.PRIORITY.LOW,
        'LocalStorage.clear': ResourceScheduler.PRIORITY.LOW,
        'LocalStorage.keys': ResourceScheduler.PRIORITY.LOW,
        'LocalStorage.length': ResourceScheduler.PRIORITY.LOW,
        'Process.list': ResourceScheduler.PRIORITY.LOW,
        'Process.getInfo': ResourceScheduler.PRIORITY.LOW
    };

    static _init() {
        this._tokens = this.CONFIG.tokensPerSecond || 20;
        this._lastRefillTime = Date.now();
        this._queue = [];
        this._stats = {
            totalCalls: 0,
            queuedCalls: 0,
            rejectedCalls: 0,
            byProcess: {}
        };
        this._startRefillTimer();
    }

    static _startRefillTimer() {
        const config = this.CONFIG;
        const interval = config.refillInterval || 1000;
        setInterval(() => {
            this._refillTokens();
            this._processQueue();
        }, interval);
    }

    static _refillTokens() {
        const now = Date.now();
        const elapsed = now - this._lastRefillTime;
        const interval = this.CONFIG.refillInterval || 1000;
        if (elapsed >= interval) {
            this._tokens = this.CONFIG.tokensPerSecond || 20;
            this._lastRefillTime = now;
        }
    }

    static _processQueue() {
        if (this._queue.length === 0) return;

        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug('ResourceScheduler', `_processQueue: before, tokens=${this._tokens}, queueLen=${this._queue.length}`);
        }

        const toExecute = [];
        while (this._queue.length > 0 && this._tokens > 0) {
            const item = this._queue.shift();
            this._tokens--;
            toExecute.push(item);
        }

        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug('ResourceScheduler', `_processQueue: executing ${toExecute.length}, tokens left=${this._tokens}, remaining queue=${this._queue.length}`);
        }

        toExecute.forEach(item => {
            if (item.callback) {
                item.callback()
                    .then(result => {
                        if (item.resolve) item.resolve({ allowed: true, queued: false, result });
                    })
                    .catch(err => {
                        if (item.reject) item.reject(err);
                    });
            } else if (item.resolve) {
                item.resolve({ allowed: true, queued: false });
            }
        });
    }

    static _getApiPriority(apiName) {
        const parts = apiName.split('.');
        const categoryApi = parts[0] + '.*';
        if (this.API_PRIORITY[apiName] !== undefined) {
            return this.API_PRIORITY[apiName];
        }
        if (this.API_PRIORITY[categoryApi] !== undefined) {
            return this.API_PRIORITY[categoryApi];
        }
        return this.PRIORITY.NORMAL;
    }

    static schedule(apiCall, pid, apiName) {
        const config = this.CONFIG;
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug('ResourceScheduler', `schedule: api=${apiName}, pid=${pid}, tokens=${this._tokens}, queue=${this._queue.length}`);
        }
        
        if (!config.enableScheduling) {
            if (apiCall) {
                return apiCall().then(result => ({ allowed: true, queued: false, result }));
            }
            return { allowed: true, queued: false };
        }

        this._stats.totalCalls++;
        if (!this._stats.byProcess[pid]) {
            this._stats.byProcess[pid] = {
                calls: 0,
                queued: 0,
                rejected: 0
            };
        }
        this._stats.byProcess[pid].calls++;

        this._refillTokens();

        if (this._tokens > 0) {
            this._tokens--;
            this._recordHistory(pid, apiName, 'immediate');
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ResourceScheduler', `immediate: ${apiName}, tokens left=${this._tokens}`);
            }
            if (apiCall) {
                return apiCall().then(result => ({ allowed: true, queued: false, result }));
            }
            return { allowed: true, queued: false };
        }

        if (this._queue.length >= config.maxQueueSize) {
            this._stats.rejectedCalls++;
            this._stats.byProcess[pid].rejected++;
            this._recordHistory(pid, apiName, 'rejected');
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('ResourceScheduler', `rejected: ${apiName}, queue full`);
            }
            return { allowed: false, queued: false, reason: 'queue_full' };
        }

        const priority = this._getApiPriority(apiName);
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug('ResourceScheduler', `queued: ${apiName}, priority=${priority}`);
        }
        
        return new Promise((resolve, reject) => {
            const queueItem = {
                pid,
                apiName,
                priority,
                timestamp: Date.now(),
                callback: apiCall,
                resolve: resolve,
                reject: reject
            };

            const insertIndex = this._queue.findIndex(item => item.priority > priority);
            if (insertIndex === -1) {
                this._queue.push(queueItem);
            } else {
                this._queue.splice(insertIndex, 0, queueItem);
            }

            this._stats.queuedCalls++;
            this._stats.byProcess[pid].queued++;
            this._recordHistory(pid, apiName, 'queued');
        });
    }

    static recordCall(pid, apiName) {
        const config = this.CONFIG;
        
        if (!config.enableScheduling) {
            return;
        }

        this._stats.totalCalls++;
        if (!this._stats.byProcess[pid]) {
            this._stats.byProcess[pid] = {
                calls: 0,
                queued: 0,
                rejected: 0
            };
        }
        this._stats.byProcess[pid].calls++;
        
        this._recordHistory(pid, apiName, 'immediate');
    }

    static recordCallAsync(pid, apiName) {
        this.recordCall(pid, apiName);
    }

    static _recordHistory(pid, apiName, status) {
        const record = {
            timestamp: Date.now(),
            pid,
            apiName,
            status
        };
        this._history.push(record);
        if (this._history.length > this._maxHistoryLength) {
            this._history.shift();
        }
    }

    static getStats() {
        return {
            tokens: this._tokens,
            queueLength: this._queue.length,
            totalCalls: this._stats.totalCalls,
            queuedCalls: this._stats.queuedCalls,
            rejectedCalls: this._stats.rejectedCalls,
            byProcess: this._stats.byProcess,
            historyLength: this._history.length
        };
    }

    static getProcessStats(pid) {
        return this._stats.byProcess[pid] || null;
    }

    static getHistory() {
        return this._history;
    }

    static getQueueStatus() {
        const maxSize = this.CONFIG.maxQueueSize || 100;
        return {
            length: this._queue.length,
            maxSize: maxSize,
            utilization: this._queue.length / maxSize,
            items: this._queue.map(item => ({
                pid: item.pid,
                apiName: item.apiName,
                priority: item.priority,
                waitTime: Date.now() - item.timestamp
            }))
        };
    }

    static getTokensPerSecond() {
        return this.CONFIG.tokensPerSecond || 20;
    }

    static setTokensPerSecond(tokens) {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.CPU_CONFIG) {
            SystemInformation.CPU_CONFIG.tokensPerSecond = Math.max(1, Math.min(1000, tokens));
        }
    }

    static getMaxQueueSize() {
        return this.CONFIG.maxQueueSize || 100;
    }

    static setMaxQueueSize(size) {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.CPU_CONFIG) {
            SystemInformation.CPU_CONFIG.maxQueueSize = Math.max(10, Math.min(1000, size));
        }
    }

    static enableScheduling(enable) {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.CPU_CONFIG) {
            SystemInformation.CPU_CONFIG.enableScheduling = enable;
        }
    }

    static isSchedulingEnabled() {
        return this.CONFIG.enableScheduling !== false;
    }

    static clearQueue() {
        this._queue = [];
    }

    static clearHistory() {
        this._history = [];
    }

    static resetStats() {
        this._stats = {
            totalCalls: 0,
            queuedCalls: 0,
            rejectedCalls: 0,
            byProcess: {}
        };
    }

    static getCpuUsage() {
        const now = Date.now();
        const recentHistory = this._history.filter(r => now - r.timestamp < 1000);
        const processUsage = {};
        
        const tokensPerSecond = this.CONFIG.tokensPerSecond || 50;

        recentHistory.forEach(r => {
            if (!processUsage[r.pid]) {
                processUsage[r.pid] = { calls: 0, immediate: 0, queued: 0, rejected: 0 };
            }
            processUsage[r.pid].calls++;
            if (r.status === 'immediate') processUsage[r.pid].immediate++;
            else if (r.status === 'queued') processUsage[r.pid].queued++;
            else if (r.status === 'rejected') processUsage[r.pid].rejected++;
        });

        const result = {};

        Object.keys(processUsage).forEach(pid => {
            const calls = processUsage[pid].calls;
            const percentage = Math.min(100, (calls / tokensPerSecond * 100)).toFixed(1);
            result[pid] = {
                calls: calls,
                percentage: percentage,
                immediate: processUsage[pid].immediate,
                queued: processUsage[pid].queued,
                rejected: processUsage[pid].rejected
            };
        });

        return result;
    }
    
    static _initNetworkScheduler() {
        const config = this.NET_CONFIG;
        this._netTokens = config.tokensPerSecond || 20;
        this._netLastRefillTime = Date.now();
        this._netQueue = [];
        this._netStats = {
            totalCalls: 0,
            queuedCalls: 0,
            rejectedCalls: 0,
            byProcess: {}
        };
        this._startNetRefillTimer();
    }
    
    static _startNetRefillTimer() {
        const config = this.NET_CONFIG;
        const interval = config.refillInterval || 1000;
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug('NetworkScheduler', `_startNetRefillTimer: interval=${interval}ms`);
        }
        
        setInterval(() => {
            this._refillNetTokens();
            this._processNetQueue();
        }, interval);
    }
    
    static _refillNetTokens() {
        const now = Date.now();
        const elapsed = now - this._netLastRefillTime;
        const interval = this.NET_CONFIG.refillInterval || 1000;
        
        if (typeof KernelLogger !== 'undefined' && elapsed >= interval) {
            KernelLogger.debug('NetworkScheduler', `_refillNetTokens: elapsed=${elapsed}ms, oldTokens=${this._netTokens}, newTokens=${this.NET_CONFIG.tokensPerSecond}`);
        }
        
        if (elapsed >= interval) {
            this._netTokens = this.NET_CONFIG.tokensPerSecond || 20;
            this._netLastRefillTime = now;
        }
    }
    
    static _processNetQueue() {
        if (this._netQueue.length === 0) return;
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug('NetworkScheduler', `_processNetQueue: tokens=${this._netTokens}, queueLen=${this._netQueue.length}`);
        }
        
        const toExecute = [];
        while (this._netQueue.length > 0 && this._netTokens > 0) {
            const item = this._netQueue.shift();
            this._netTokens--;
            toExecute.push(item);
        }
        
        toExecute.forEach(item => {
            if (item.callback) {
                item.callback()
                    .then(result => {
                        if (item.resolve) item.resolve({ allowed: true, queued: false, result });
                    })
                    .catch(err => {
                        if (item.reject) item.reject(err);
                    });
            } else if (item.resolve) {
                item.resolve({ allowed: true, queued: false });
            }
        });
    }
    
    static _getNetApiPriority(apiName) {
        return this.PRIORITY.NORMAL;
    }
    
    static _recordNetHistory(pid, apiName, status) {
        const record = {
            timestamp: Date.now(),
            pid,
            apiName,
            status
        };
        this._netHistory.push(record);
        if (this._netHistory.length > this._maxHistoryLength) {
            this._netHistory.shift();
        }
    }
    
    static scheduleNetwork(apiCall, pid, apiName) {
        const config = this.NET_CONFIG;
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug('NetworkScheduler', `schedule: api=${apiName}, pid=${pid}, tokens=${this._netTokens}, queue=${this._netQueue.length}`);
        }
        
        if (!config.enableScheduling) {
            if (apiCall) {
                return apiCall().then(result => ({ allowed: true, queued: false, result }));
            }
            return { allowed: true, queued: false };
        }
        
        this._netStats.totalCalls++;
        if (!this._netStats.byProcess[pid]) {
            this._netStats.byProcess[pid] = {
                calls: 0,
                queued: 0,
                rejected: 0
            };
        }
        this._netStats.byProcess[pid].calls++;
        
        this._refillNetTokens();
        
        if (this._netTokens > 0) {
            this._netTokens--;
            this._recordNetHistory(pid, apiName, 'immediate');
            if (apiCall) {
                return apiCall().then(result => ({ allowed: true, queued: false, result }));
            }
            return { allowed: true, queued: false };
        }
        
        if (this._netQueue.length >= config.maxQueueSize) {
            this._netStats.rejectedCalls++;
            this._netStats.byProcess[pid].rejected++;
            this._recordNetHistory(pid, apiName, 'rejected');
            return { allowed: false, queued: false, reason: 'queue_full' };
        }
        
        const priority = this._getNetApiPriority(apiName);
        
        return new Promise((resolve, reject) => {
            const queueItem = {
                pid,
                apiName,
                priority,
                timestamp: Date.now(),
                callback: apiCall,
                resolve: resolve,
                reject: reject
            };
            
            const insertIndex = this._netQueue.findIndex(item => item.priority > priority);
            if (insertIndex === -1) {
                this._netQueue.push(queueItem);
            } else {
                this._netQueue.splice(insertIndex, 0, queueItem);
            }
            
            this._netStats.queuedCalls++;
            this._netStats.byProcess[pid].queued++;
            this._recordNetHistory(pid, apiName, 'queued');
        });
    }
    
    static getNetStats() {
        return {
            tokens: this._netTokens,
            queueLength: this._netQueue.length,
            totalCalls: this._netStats.totalCalls,
            queuedCalls: this._netStats.queuedCalls,
            rejectedCalls: this._netStats.rejectedCalls,
            byProcess: this._netStats.byProcess,
            historyLength: this._netHistory.length
        };
    }
    
    static getNetUsage() {
        const now = Date.now();
        const recentHistory = this._netHistory.filter(r => now - r.timestamp < 1000);
        const processUsage = {};
        
        const tokensPerSecond = this.NET_CONFIG.tokensPerSecond || 20;
        
        recentHistory.forEach(r => {
            if (!processUsage[r.pid]) {
                processUsage[r.pid] = { calls: 0, immediate: 0, queued: 0, rejected: 0 };
            }
            processUsage[r.pid].calls++;
            if (r.status === 'immediate') processUsage[r.pid].immediate++;
            else if (r.status === 'queued') processUsage[r.pid].queued++;
            else if (r.status === 'rejected') processUsage[r.pid].rejected++;
        });
        
        const result = {};
        
        Object.keys(processUsage).forEach(pid => {
            const calls = processUsage[pid].calls;
            const percentage = Math.min(100, (calls / tokensPerSecond * 100)).toFixed(1);
            result[pid] = {
                calls: calls,
                percentage: percentage,
                immediate: processUsage[pid].immediate,
                queued: processUsage[pid].queued,
                rejected: processUsage[pid].rejected
            };
        });
        
        return result;
    }
    
    static isNetSchedulingEnabled() {
        return this.NET_CONFIG.enableScheduling !== false;
    }
    
    static setNetTokensPerSecond(tokens) {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.CPU_CONFIG) {
            SystemInformation.CPU_CONFIG.netTokensPerSecond = Math.max(1, Math.min(1000, tokens));
        }
    }
    
    static setNetMaxQueueSize(size) {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.CPU_CONFIG) {
            SystemInformation.CPU_CONFIG.netMaxQueueSize = Math.max(10, Math.min(1000, size));
        }
    }
    
    static enableNetScheduling(enable) {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.CPU_CONFIG) {
            SystemInformation.CPU_CONFIG.enableNetScheduling = enable;
        }
    }
}

if (typeof window !== 'undefined') {
    window.ResourceScheduler = ResourceScheduler;
    
    // 立即初始化网络调度器
    ResourceScheduler._initNetworkScheduler();
    
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.debug('ResourceScheduler', '开始包装 window.fetch');
    }
    
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        const rs = ResourceScheduler;
        if (typeof KernelLogger !== 'undefined') {
            const url = typeof input === 'string' ? input : (input.url || 'unknown');
            KernelLogger.debug('ResourceScheduler', `fetch intercepted: ${url}, scheduleNetwork=${!!(rs && rs.scheduleNetwork)}, isNetSchedulingEnabled=${rs ? rs.isNetSchedulingEnabled() : 'N/A'}`);
        }
        if (rs && typeof rs.scheduleNetwork === 'function' && rs.isNetSchedulingEnabled()) {
            const url = typeof input === 'string' ? input : (input.url || 'unknown');
            const pid = 0;
            return new Promise((resolve, reject) => {
                const scheduleResult = rs.scheduleNetwork(
                    async () => {
                        return await originalFetch(input, init);
                    },
                    pid,
                    'fetch'
                );
                if (scheduleResult instanceof Promise) {
                    scheduleResult.then(result => resolve(result.result)).catch(reject);
                } else if (scheduleResult && scheduleResult.result) {
                    resolve(scheduleResult.result);
                } else {
                    reject(new Error('Network scheduling failed'));
                }
            });
        }
        return originalFetch(input, init);
    };
    
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.debug('ResourceScheduler', 'window.fetch 包装完成');
    }
    
    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../kernel/process/resourceScheduler.js");
    }
}
