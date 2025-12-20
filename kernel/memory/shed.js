// 实现存放资源的数据栈(用于存放资源数据)
KernelLogger.info("Shed", "模块初始化");
class Shed {
    // 日志级别: 使用 LogLevel.LEVEL 枚举
    static logLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;

    static setLogLevel(lvl) {
        this.logLevel = lvl;
    }

    static _log(level, methodName, instanceId, message, ...meta) {
        if (Shed.logLevel >= level) {
            const debugLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;
            const infoLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.INFO) ? LogLevel.LEVEL.INFO : 2;
            const errorLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.ERROR) ? LogLevel.LEVEL.ERROR : 1;
            const debugName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.DEBUG) ? LogLevel.NAME.DEBUG : "DEBUG";
            const infoName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.INFO) ? LogLevel.NAME.INFO : "INFO";
            const errorName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.ERROR) ? LogLevel.NAME.ERROR : "ERROR";
            const lvlName = level >= debugLevel ? debugName : level >= infoLevel ? infoName : errorName;
            const subsystem = "Shed";
            // 构建详细的日志消息
            let fullMessage = '';
            if (instanceId) {
                fullMessage = `[stackId=${instanceId}]`;
            }
            if (methodName) {
                fullMessage += `[${methodName}]`;
            }
            if (message) {
                fullMessage += ` ${message}`;
            }
            
            // 合并所有元数据
            const allMeta = meta.length > 0 ? meta : undefined;
            KernelLogger.log(lvlName, subsystem, fullMessage, allMeta);
            return;
        }
    }
    
    // 获取栈状态摘要（用于日志）
    _getStackStatus() {
        return {
            stackId: this.stackId,
            programManagementId: this.programManagementId,
            stackSize: this.stackSize,
            codeSize: this.codeArea.length,
            resourceLinkSize: this.resourceLinkArea.size,
            codeItems: this.codeArea.length,
            resourceItems: Array.from(this.resourceLinkArea.keys())
        };
    }

    static startAddress = 0;
    // 代码存放区(不可变)
    // codeArea = [Array<String>]
    // 资源链接区(可变)
    // resourceLinkArea = [Map<String,FileFormwork>]
    // 程序管理id
    // programManagementId = [int(16)]
    // 栈id
    // stackId = [int(16)]
    // 栈大小
    // stackSize = [long]
    constructor(programManagementId, stackId) {
        Shed._log(2, 'constructor', null, `初始化栈`, {
            stackId: stackId,
            programManagementId: programManagementId
        });
        
        this.codeArea = [];
        this.resourceLinkArea = new Map();
        const hexType = (typeof AddressType !== 'undefined' && AddressType.TYPE.HEX) ? AddressType.TYPE.HEX : 16;
        this.programManagementId = Heap.addressing(String(programManagementId), hexType);
        this.stackId = Heap.addressing(String(stackId), hexType);
        this.stackSize = 0; // 可变
        
        const status = this._getStackStatus();
        Shed._log(2, 'constructor', this.stackId, `初始化完成`, status);
    }
    // 查询栈大小
    queryStackSize() {
        // 移除成功日志，这是高频操作，会产生大量日志
        return this.stackSize;
    }
    // 查询代码大小
    queryCodeSize() {
        // 移除成功日志，这是高频操作，会产生大量日志
        return this.codeArea.length;
    }
    // 查询资源链接大小
    queryResourceLinkSize() {
        // 移除成功日志，这是高频操作，会产生大量日志
        return this.resourceLinkArea.size;
    }
    // 查询栈详细状态
    queryStackStatus() {
        const status = {
            stackSize: this.stackSize, // 栈大小
            codeSize: this.codeArea.length, // 代码大小
            resourceLinkSize: this.resourceLinkArea.size, // 资源链接大小
            programManagementId: this.programManagementId, // 程序管理id
            stackId: this.stackId // 栈id
        };
        // 移除成功日志，这是高频操作，会产生大量日志
        return status;
    }
    // 写入代码
    writeCode(code) {
        // 移除成功日志，这是高频操作，会产生大量日志
        let codeLength = 0;
        if (code !== null && code !== undefined) {
            if (typeof code === 'string') {
                codeLength = code.length;
            } else if (typeof code === 'number') {
                codeLength = String(code).length;
            } else if (Array.isArray(code)) {
                codeLength = code.length;
            } else {
                codeLength = String(code).length;
            }
        }
        
        // 确保 codeLength 是有效数字
        if (typeof codeLength !== 'number' || isNaN(codeLength)) {
            codeLength = 0;
            Shed._log(1, `写入代码: 计算长度失败，使用默认值 0`);
        }
        
        this.stackSize += codeLength;
        
        // 确保 stackSize 是有效数字
        if (typeof this.stackSize !== 'number' || isNaN(this.stackSize)) {
            Shed._log(1, `写入代码: stackSize 变成 NaN，重置为当前代码长度`);
            this.stackSize = codeLength;
        }
        
        this.codeArea.push(code);
        // 移除成功日志，这是高频操作，会产生大量日志
    }
    // 写入资源链接
    writeResourceLink(resourceName, resourceValue) {
        // 移除成功日志，这是高频操作，会产生大量日志
        // 只保留错误日志（序列化失败、计算长度失败、stackSize变成NaN时）
        
        // 计算资源长度：支持字符串、数字、对象等类型
        let resourceLength = 0;
        if (resourceValue !== null && resourceValue !== undefined) {
            if (typeof resourceValue === 'string') {
                resourceLength = resourceValue.length;
            } else if (typeof resourceValue === 'number') {
                // 数字转换为字符串计算长度
                resourceLength = String(resourceValue).length;
            } else if (Array.isArray(resourceValue)) {
                resourceLength = resourceValue.length;
            } else if (typeof resourceValue === 'object') {
                // 对象序列化为 JSON 字符串计算长度
                try {
                    resourceLength = JSON.stringify(resourceValue).length;
                } catch (e) {
                    // 如果序列化失败，使用默认值
                    resourceLength = 0;
                    Shed._log(1, `写入资源链接: 无法序列化对象 resourceName=${resourceName}`, e);
                }
            } else {
                // 其他类型转换为字符串
                resourceLength = String(resourceValue).length;
            }
        }
        
        // 确保 resourceLength 是有效数字
        if (typeof resourceLength !== 'number' || isNaN(resourceLength)) {
            resourceLength = 0;
            Shed._log(1, `写入资源链接: 计算长度失败，使用默认值 0 resourceName=${resourceName}`);
        }
        
        // 如果之前存在同名资源，先减去旧的大小
        const oldResource = this.resourceLinkArea.get(resourceName);
        if (oldResource !== undefined) {
            let oldLength = 0;
            if (oldResource !== null) {
                if (typeof oldResource === 'string') {
                    oldLength = oldResource.length;
                } else if (typeof oldResource === 'number') {
                    oldLength = String(oldResource).length;
                } else if (Array.isArray(oldResource)) {
                    oldLength = oldResource.length;
                } else if (typeof oldResource === 'object') {
                    try {
                        oldLength = JSON.stringify(oldResource).length;
                    } catch (e) {
                        oldLength = 0;
                    }
                } else {
                    oldLength = String(oldResource).length;
                }
            }
            if (typeof oldLength === 'number' && !isNaN(oldLength)) {
                this.stackSize -= oldLength;
            }
        }
        
        this.stackSize += resourceLength;
        this.resourceLinkArea.set(resourceName, resourceValue);
        
        // 确保 stackSize 是有效数字
        if (typeof this.stackSize !== 'number' || isNaN(this.stackSize)) {
            Shed._log(1, 'writeResourceLink', this.stackId, `stackSize 变成 NaN，重置为当前资源长度`, {
                resourceName: resourceName,
                resourceLength: resourceLength,
                stackSizeBefore: oldStatus.stackSize,
                error: 'stackSize is NaN'
            });
            this.stackSize = resourceLength; // 重置为当前资源长度
        }
        
        // 移除成功日志，这是高频操作，会产生大量日志
        // 只保留错误日志（序列化失败、计算长度失败、stackSize变成NaN时）
    }
    // 读取代码
    readCode(index) {
        // 移除成功日志，这是高频操作，会产生大量日志
        const code = this.codeArea[index];
        return code;
    }
    // 查询代码栈的偏移相对于栈起始地址的偏移
    queryCodeOffset() {
        // 移除成功日志，这是高频操作，会产生大量日志
        const hexType = (typeof AddressType !== 'undefined' && AddressType.TYPE.HEX) ? AddressType.TYPE.HEX : 16;
        const offset = Heap.addressing(this.codeArea.length - Shed.startAddress, hexType);
        return offset;
    }
    // 读取资源链接
    readResourceLink(resourceName) {
        // 移除成功日志，这是高频操作，会产生大量日志
        const resource = this.resourceLinkArea.get(resourceName);
        return resource;
    }
    // 删除代码
    deleteCode(index) {
        Shed._log(3, `删除代码 index=${index}`);
        if (index < 0 || index >= this.codeArea.length) {
            Shed._log(1, `删除代码失败: index=${index} 越界 数组长度=${this.codeArea.length}`);
            return false;
        }
        const codeItem = this.codeArea[index];
        if (codeItem !== undefined && codeItem !== null) {
            let codeLength = 0;
            if (typeof codeItem === 'string') {
                codeLength = codeItem.length;
            } else if (typeof codeItem === 'number') {
                codeLength = String(codeItem).length;
            } else if (Array.isArray(codeItem)) {
                codeLength = codeItem.length;
            } else {
                codeLength = String(codeItem).length;
            }
            
            // 确保 codeLength 是有效数字
            if (typeof codeLength !== 'number' || isNaN(codeLength)) {
                codeLength = 0;
            }
            
            this.stackSize -= codeLength;
            
            // 确保 stackSize 是有效数字
            if (typeof this.stackSize !== 'number' || isNaN(this.stackSize)) {
                Shed._log(1, `删除代码: stackSize 变成 NaN，重置为 0 index=${index}`);
                this.stackSize = 0;
            }
            
            this.codeArea.splice(index, 1);
            // 移除成功日志，这是高频操作，会产生大量日志
            return true;
        } else {
            Shed._log(1, `删除代码失败: index=${index} 不存在`);
            return false;
        }
    }
    // 删除资源链接
    deleteResourceLink(resourceName) {
        // 移除成功日志，这是高频操作，会产生大量日志
        const resourceItem = this.resourceLinkArea.get(resourceName);
        if (resourceItem !== undefined) {
            // 计算资源长度：支持字符串、数字、对象等类型
            let resourceLength = 0;
            if (resourceItem !== null) {
                if (typeof resourceItem === 'string') {
                    resourceLength = resourceItem.length;
                } else if (typeof resourceItem === 'number') {
                    resourceLength = String(resourceItem).length;
                } else if (Array.isArray(resourceItem)) {
                    resourceLength = resourceItem.length;
                } else if (typeof resourceItem === 'object') {
                    try {
                        resourceLength = JSON.stringify(resourceItem).length;
                    } catch (e) {
                        resourceLength = 0;
                    }
                } else {
                    resourceLength = String(resourceItem).length;
                }
            }
            
            // 确保 resourceLength 是有效数字
            if (typeof resourceLength !== 'number' || isNaN(resourceLength)) {
                resourceLength = 0;
            }
            
            this.stackSize -= resourceLength;
            
            // 确保 stackSize 是有效数字
            if (typeof this.stackSize !== 'number' || isNaN(this.stackSize)) {
                Shed._log(1, `删除资源链接: stackSize 变成 NaN，重置为 0 resourceName=${resourceName}`);
                this.stackSize = 0;
            }
            
            this.resourceLinkArea.delete(resourceName);
            // 移除成功日志，这是高频操作，会产生大量日志
            return true;
        } else {
            Shed._log(1, `删除资源链接失败: resourceName=${resourceName} 不存在`);
            return false;
        }
    }
    // 清空代码
    clearCode() {
        Shed._log(2, `清空代码`);
        let codeSize = 0;
        for (let i = 0; i < this.codeArea.length; i++) {
            const codeItem = this.codeArea[i];
            if (codeItem !== null && codeItem !== undefined) {
                let length = 0;
                if (typeof codeItem === 'string') {
                    length = codeItem.length;
                } else if (typeof codeItem === 'number') {
                    length = String(codeItem).length;
                } else if (Array.isArray(codeItem)) {
                    length = codeItem.length;
                } else {
                    length = String(codeItem).length;
                }
                
                if (typeof length === 'number' && !isNaN(length)) {
                    codeSize += length;
                }
            }
        }
        
        // 确保 codeSize 是有效数字
        if (typeof codeSize !== 'number' || isNaN(codeSize)) {
            codeSize = 0;
        }
        
        this.stackSize -= codeSize;
        
        // 确保 stackSize 是有效数字
        if (typeof this.stackSize !== 'number' || isNaN(this.stackSize)) {
            Shed._log(1, `清空代码: stackSize 变成 NaN，重置为 0`);
            this.stackSize = 0;
        }
        
        this.codeArea = [];
        Shed._log(2, `清空代码完成 释放大小=${codeSize} 剩余栈大小=${this.stackSize}`);
    }
    // 清空资源链接
    clearResourceLink() {
        Shed._log(2, `清空资源链接`);
        let resourceSize = 0;
        this.resourceLinkArea.forEach((value) => {
            if (value !== null && value !== undefined) {
                let length = 0;
                if (typeof value === 'string') {
                    length = value.length;
                } else if (typeof value === 'number') {
                    length = String(value).length;
                } else if (Array.isArray(value)) {
                    length = value.length;
                } else if (typeof value === 'object') {
                    try {
                        length = JSON.stringify(value).length;
                    } catch (e) {
                        length = 0;
                    }
                } else {
                    length = String(value).length;
                }
                
                if (typeof length === 'number' && !isNaN(length)) {
                    resourceSize += length;
                }
            }
        });
        
        // 确保 resourceSize 是有效数字
        if (typeof resourceSize !== 'number' || isNaN(resourceSize)) {
            resourceSize = 0;
        }
        
        this.stackSize -= resourceSize;
        
        // 确保 stackSize 是有效数字
        if (typeof this.stackSize !== 'number' || isNaN(this.stackSize)) {
            Shed._log(1, `清空资源链接: stackSize 变成 NaN，重置为 0`);
            this.stackSize = 0;
        }
        
        this.resourceLinkArea.clear();
        Shed._log(2, `清空资源链接完成 释放大小=${resourceSize} 剩余栈大小=${this.stackSize}`);
    }
}

// 不导出到全局作用域，交由POOL管理
// 通过POOL注册（如果POOL已加载）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        // 确保 KERNEL_GLOBAL_POOL 类别存在
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "Shed", Shed);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.Shed = Shed;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.Shed = Shed;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.Shed = Shed;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.Shed = Shed;
    }
}

DependencyConfig.publishSignal("../kernel/memory/shed.js");