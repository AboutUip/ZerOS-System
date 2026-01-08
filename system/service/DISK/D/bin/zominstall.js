/* ZOM 安装程序
 * 功能：
 * - 接收 .zom 文件（实际上是 zip 压缩包）
 * - 自动解压到 D:/cache/temp/ 目录
 * - 读取 application.json 文件
 * - 复制程序资源到 D:/application/ 并注册
 * - 执行 setup.js（如果存在）
 * - 清理临时文件
 * - 不支持多实例
 */

(function(window) {
    'use strict';

    const ZOMINSTALL = {
        pid: null,
        terminal: null,
        _closing: false,

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'ZOMInstall',
                type: 'CLI',
                version: '1.0.0',
                description: 'ZOM 程序安装工具',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.APPLICATION_INSTALL,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: false  // 不支持多实例
                }
            };
        },

        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;

            if (!this.terminal) {
                throw new Error('ZOMInstall 程序需要终端环境');
            }

            // 保存参数供后续使用
            const args = initArgs.args || [];

            // 使用 setTimeout 延迟执行命令逻辑
            setTimeout(async () => {
                try {
                    // 检查帮助选项
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    // 检查参数
                    if (args.length === 0) {
                        this.terminal.write('zominstall: 错误: 缺少参数\n');
                        this.terminal.write('用法: zominstall <zom文件路径>\n');
                        this.terminal.write('使用 -h 或 --help 查看帮助信息\n');
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    const zomFilePath = args[0];

                    // 验证文件路径
                    if (!zomFilePath || typeof zomFilePath !== 'string') {
                        this.terminal.write('zominstall: 错误: 无效的文件路径\n');
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    // 验证文件扩展名
                    if (!zomFilePath.toLowerCase().endsWith('.zom')) {
                        this.terminal.write('zominstall: 错误: 文件必须是 .zom 格式\n');
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    // 开始安装流程
                    await this._installZom(zomFilePath);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("ZOMInstall", `安装失败: ${error.message}`, error);
                    }
                    this.terminal.write(`zominstall: 错误: ${error.message}\n`);
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                }
            }, 0);
        },

        /**
         * 显示使用说明
         */
        _showUsage: function() {
            this.terminal.write('用法: zominstall <zom文件路径>\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -h, --help    显示帮助信息\n');
            this.terminal.write('\n');
            this.terminal.write('说明:\n');
            this.terminal.write('  ZOM 文件是 ZerOS 程序安装包（实际上是 ZIP 压缩包）\n');
            this.terminal.write('  安装程序会自动解压、注册并执行安装脚本\n');
        },

        /**
         * 安装 ZOM 文件
         */
        _installZom: async function(zomFilePath) {
            const tempDir = 'D:/cache/temp';
            let extractedFiles = [];

            try {
                this.terminal.write(`正在安装: ${zomFilePath}\n`);

                // 步骤 1: 解压 ZOM 文件到临时目录
                this.terminal.write('步骤 1/6: 解压文件...\n');
                extractedFiles = await this._extractZom(zomFilePath, tempDir);
                this.terminal.write(`解压完成，共 ${extractedFiles.length} 个文件\n`);
                
                // 列出解压后的文件（用于调试）
                if (extractedFiles.length > 0) {
                    this.terminal.write(`解压后的文件列表（共 ${extractedFiles.length} 个文件）:\n`);
                    extractedFiles.forEach((file, index) => {
                        const isApplicationJson = file.toLowerCase().endsWith('application.json') || 
                                                  file.toLowerCase() === 'application.json';
                        const marker = isApplicationJson ? ' [application.json]' : '';
                        this.terminal.write(`  ${index + 1}. ${file}${marker}\n`);
                    });
                    
                    // 检查是否包含 application.json
                    const applicationJsonFiles = extractedFiles.filter(file => {
                        const normalized = file.replace(/\\/g, '/').toLowerCase();
                        return normalized === 'application.json' || normalized.endsWith('/application.json');
                    });
                    
                    if (applicationJsonFiles.length === 0) {
                        this.terminal.write('警告: 解压后的文件中未找到 application.json\n');
                    } else {
                        this.terminal.write(`✓ 找到 ${applicationJsonFiles.length} 个 application.json 文件:\n`);
                        applicationJsonFiles.forEach(file => {
                            this.terminal.write(`    - ${file}\n`);
                        });
                    }
                } else {
                    this.terminal.write('警告: 解压后的文件列表为空\n');
                }

                // 步骤 2: 读取 application.json
                this.terminal.write('步骤 2/6: 读取程序配置...\n');
                // 等待一下，确保解压的文件完全写入磁盘
                this.terminal.write('等待文件系统同步...\n');
                await new Promise(resolve => setTimeout(resolve, 300));
                const appConfig = await this._readApplicationJson(tempDir, extractedFiles);
                if (!appConfig) {
                    throw new Error('未找到 application.json 文件或文件格式错误');
                }
                this.terminal.write(`程序名称: ${appConfig.name || '未知'}\n`);
                this.terminal.write(`版本: ${appConfig.version || '未知'}\n`);

                // 步骤 3: 检查安装冲突
                this.terminal.write('步骤 3/6: 检查安装冲突...\n');
                const checkResult = await this._checkInstallationConflict(appConfig);
                if (checkResult.hasConflict) {
                    if (checkResult.isUpdate) {
                        this.terminal.write(`检测到程序更新: ${appConfig.name}\n`);
                        this.terminal.write(`当前版本: ${checkResult.existingVersion}\n`);
                        this.terminal.write(`新版本: ${appConfig.version || '未知'}\n`);
                        this.terminal.write('将执行更新安装...\n');
                    } else if (checkResult.isDuplicate) {
                        this.terminal.write(`警告: 检测到重复安装\n`);
                        this.terminal.write(`程序 ${appConfig.name} 已安装，版本: ${checkResult.existingVersion}\n`);
                        this.terminal.write(`当前安装包版本: ${appConfig.version || '未知'}\n`);
                        throw new Error(`程序 ${appConfig.name} 已安装相同版本，无法重复安装`);
                    } else if (checkResult.isNameConflict) {
                        this.terminal.write(`错误: 检测到程序名冲突\n`);
                        this.terminal.write(`程序名 ${appConfig.name} 已被其他开发者使用\n`);
                        this.terminal.write(`已安装程序信息:\n`);
                        this.terminal.write(`  作者: ${checkResult.existingAuthor || '未知'}\n`);
                        this.terminal.write(`  版权: ${checkResult.existingCopyright || '未知'}\n`);
                        this.terminal.write(`  版本: ${checkResult.existingVersion || '未知'}\n`);
                        this.terminal.write(`当前安装包信息:\n`);
                        this.terminal.write(`  作者: ${appConfig.author || '未知'}\n`);
                        this.terminal.write(`  版权: ${appConfig.copyright || '未知'}\n`);
                        this.terminal.write(`  版本: ${appConfig.version || '未知'}\n`);
                        throw new Error(`程序名冲突: ${appConfig.name} 已被其他开发者使用，请使用不同的程序名称`);
                    }
                } else {
                    this.terminal.write('未检测到安装冲突，可以继续安装\n');
                }

                // 步骤 4: 复制文件到 application/ 目录并注册
                this.terminal.write('步骤 4/6: 复制文件并注册程序...\n');
                try {
                    await this._copyAndRegister(tempDir, appConfig, extractedFiles);
                    this.terminal.write('文件复制完成，程序已注册\n');
                    
                    // 验证文件是否成功复制
                    this.terminal.write('验证文件复制结果...\n');
                    const verifyResult = await this._verifyFileCopy(appConfig);
                    if (verifyResult.success) {
                        this.terminal.write(`✓ 验证成功: ${verifyResult.verifiedCount} 个文件已复制\n`);
                    } else {
                        this.terminal.write(`警告: 文件验证失败: ${verifyResult.error}\n`);
                        this.terminal.write('继续安装，但某些文件可能未正确复制\n');
                    }
                } catch (error) {
                    this.terminal.write(`错误: 文件复制失败: ${error.message}\n`);
                    throw error;
                }

                // 步骤 5: 执行 setup.js（如果存在）
                this.terminal.write('步骤 5/6: 执行安装脚本...\n');
                const setupExecuted = await this._executeSetup(tempDir);
                if (setupExecuted) {
                    this.terminal.write('安装脚本执行完成\n');
                } else {
                    this.terminal.write('未找到 setup.js，跳过安装脚本\n');
                }

                // 步骤 6: 清理临时文件
                this.terminal.write('步骤 6/6: 清理临时文件...\n');
                await this._cleanupTemp(tempDir, extractedFiles);
                this.terminal.write('临时文件清理完成\n');

                this.terminal.write('\n安装成功！\n');
            } catch (error) {
                // 发生错误时也尝试清理临时文件
                try {
                    await this._cleanupTemp(tempDir, extractedFiles);
                } catch (cleanupError) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("ZOMInstall", `清理临时文件失败: ${cleanupError.message}`);
                    }
                }
                throw error;
            } finally {
                // 延迟关闭，确保输出完成
                setTimeout(async () => {
                    await this._selfClose();
                }, 500);
            }
        },

        /**
         * 解压 ZOM 文件
         */
        _extractZom: async function(zomFilePath, targetDir) {
            // .zom 文件实际上是 zip 格式，PHP 压缩服务现在支持直接处理 .zom 文件
            try {
                this.terminal.write('准备解压文件...\n');
                this.terminal.write(`源文件: ${zomFilePath}\n`);
                this.terminal.write(`目标目录: ${targetDir}\n`);

                // 构建压缩服务 URL（直接使用 .zom 文件）
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.COMPRESSION_DIRVE)
                    : new URL('/system/service/CompressionDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                
                url.searchParams.set('action', 'extract_zip');
                url.searchParams.set('sourcePath', zomFilePath);
                url.searchParams.set('targetPath', targetDir);
                url.searchParams.set('overwrite', 'true');

                this.terminal.write(`开始解压...\n`);
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    // 尝试获取详细的错误信息
                    let errorMessage = `解压失败: HTTP ${response.status}`;
                    try {
                        const errorText = await response.text();
                        try {
                            const errorResult = JSON.parse(errorText);
                            if (errorResult && errorResult.message) {
                                errorMessage = `解压失败: ${errorResult.message}`;
                            }
                        } catch (e) {
                            // 如果不是 JSON，使用原始文本
                            if (errorText) {
                                errorMessage = `解压失败: ${errorText}`;
                            }
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                    this.terminal.write(`错误: ${errorMessage}\n`);
                    throw new Error(errorMessage);
                }

                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(`解压失败: ${result.message || '未知错误'}`);
                }

                this.terminal.write(`解压成功，共 ${result.data.extractedCount || 0} 个文件\n`);
                return result.data.extractedFiles || [];
            } catch (error) {
                throw error;
            }
        },

        /**
         * 复制文件（支持二进制文件）
         */
        _copyFile: async function(sourcePath, targetPath) {
            // 解析源路径和目标路径
            const sourcePathParts = sourcePath.split('/');
            const sourceFileName = sourcePathParts[sourcePathParts.length - 1];
            const sourceDirPath = sourcePathParts.slice(0, -1).join('/') || (sourcePath.split(':')[0] + ':');
            
            const targetPathParts = targetPath.split('/');
            const targetFileName = targetPathParts[targetPathParts.length - 1];
            const targetDirPath = targetPathParts.slice(0, -1).join('/') || (targetPath.split(':')[0] + ':');
            
            // 规范化路径（确保根路径格式正确）
            const normalizePath = (path) => {
                if (/^[CD]:$/.test(path)) {
                    return path + '/';
                }
                return path;
            };
            
            const normalizedSourceDir = normalizePath(sourceDirPath);
            const normalizedTargetDir = normalizePath(targetDirPath);
            
            // 优先使用文件系统服务的 copy_file API（支持二进制文件）
            try {
                // 先尝试删除目标文件（如果存在），以便支持覆盖
                try {
                    await this._deleteFile(targetPath);
                } catch (e) {
                    // 忽略删除失败（文件可能不存在）
                }
                
                // 使用 PHP 服务的 copy_file API（直接复制二进制文件，避免文本编码问题）
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                
                url.searchParams.set('action', 'copy_file');
                url.searchParams.set('sourcePath', normalizedSourceDir);
                url.searchParams.set('sourceFileName', sourceFileName);
                url.searchParams.set('targetPath', normalizedTargetDir);
                url.searchParams.set('targetFileName', targetFileName);
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`复制文件失败: HTTP ${response.status}`);
                }
                
                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(`复制文件失败: ${result.message || '未知错误'}`);
                }
                return; // 复制成功
            } catch (error) {
                // 如果文件系统服务不可用或复制失败，降级到读取-写入方式
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ZOMInstall', `使用文件系统服务复制失败，降级到读取-写入方式: ${error.message}`);
                }
                // 继续执行降级方案
            }
            
            // 降级方案：读取源文件内容并写入目标文件（适用于文本文件，二进制文件可能有问题）
            // 对于二进制文件（如 ZIP），应该使用上面的 copy_file API
            const content = await this._readFile(sourcePath);
            if (content === null) {
                throw new Error(`无法读取源文件: ${sourcePath}`);
            }

            // 写入目标文件
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [targetPath, content, 'OVERWRITE']);
            } else {
                // 降级方案：使用 PHP 服务
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                
                url.searchParams.set('action', 'write_file');
                url.searchParams.set('path', normalizedTargetDir);
                url.searchParams.set('fileName', targetFileName);
                url.searchParams.set('writeMod', 'overwrite');

                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: content })
                });

                if (!response.ok) {
                    throw new Error(`写入文件失败: HTTP ${response.status}`);
                }

                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(`写入文件失败: ${result.message || '未知错误'}`);
                }
            }
        },

        /**
         * 删除文件
         */
        _deleteFile: async function(filePath) {
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                await ProcessManager.callKernelAPI(this.pid, 'FileSystem.delete', [filePath]);
            } else {
                // 降级方案：使用 PHP 服务
                const pathParts = filePath.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const dirPath = pathParts.slice(0, -1).join('/');

                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                
                url.searchParams.set('action', 'delete_file');
                url.searchParams.set('path', dirPath);
                url.searchParams.set('fileName', fileName);

                await fetch(url.toString());
            }
        },

        /**
         * 读取 application.json
         * 支持在根目录或子目录中查找
         * @param {string} tempDir 临时目录路径
         * @param {Array<string>} extractedFiles 解压后的文件列表（相对路径）
         */
        _readApplicationJson: async function(tempDir, extractedFiles = []) {
            // 首先从解压文件列表中查找 application.json
            let jsonRelativePath = null;
            
            if (extractedFiles && extractedFiles.length > 0) {
                // 在解压文件列表中查找 application.json
                jsonRelativePath = extractedFiles.find(file => {
                    const normalized = file.replace(/\\/g, '/').toLowerCase();
                    return normalized === 'application.json' || normalized.endsWith('/application.json');
                });
                
                if (jsonRelativePath) {
                    this.terminal.write(`在解压文件列表中找到: ${jsonRelativePath}\n`);
                }
            }
            
            // 如果解压文件列表中没有找到，尝试直接查找
            if (!jsonRelativePath) {
                this.terminal.write(`在解压文件列表中未找到，尝试直接查找...\n`);
                // 首先尝试根目录
                jsonRelativePath = 'application.json';
            }
            
            // 构建完整路径
            // 规范化路径分隔符
            const normalizedPath = jsonRelativePath.replace(/\\/g, '/');
            let jsonPath = `${tempDir}/${normalizedPath}`;
            this.terminal.write(`查找配置文件: ${jsonPath}\n`);

            let content = null;

            // 由于解压后的文件可能还没有同步到 nodeTree，优先使用 PHP 服务直接读取
            // 这样可以避免 nodeTree 缓存问题
            const usePHPFirst = true; // 优先使用 PHP 服务
            
            if (usePHPFirst || typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
                // 使用 PHP 服务直接读取（绕过 nodeTree，直接从文件系统读取）
                // 解析路径：分离目录和文件名
                const pathParts = jsonPath.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const dirPath = pathParts.slice(0, -1).join('/') || tempDir;
                
                this.terminal.write(`使用 PHP 服务读取（直接读取文件系统）: 目录=${dirPath}, 文件名=${fileName}\n`);
                
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                
                url.searchParams.set('action', 'read_file');
                url.searchParams.set('path', dirPath);
                url.searchParams.set('fileName', fileName);

                const response = await fetch(url.toString());
                if (!response.ok) {
                    this.terminal.write(`错误: HTTP ${response.status}\n`);
                    throw new Error(`读取 application.json 失败: HTTP ${response.status}`);
                }

                const result = await response.json();
                this.terminal.write(`PHP 服务响应: status=${result.status}\n`);
                
                if (result.status !== 'success') {
                    this.terminal.write(`错误: 服务返回失败: ${result.message || '未知错误'}\n`);
                    return null;
                }
                
                if (!result.data) {
                    this.terminal.write(`错误: 服务返回数据为空\n`);
                    return null;
                }
                
                this.terminal.write(`文件信息: 大小=${result.data.size || '未知'} 字节, isBase64=${result.data.isBase64 || false}\n`);
                
                if (!result.data.content) {
                    this.terminal.write(`错误: 文件内容字段为空\n`);
                    return null;
                }

                content = result.data.content;
                
                // 如果是 base64 编码，需要解码
                if (result.data.isBase64) {
                    this.terminal.write(`检测到 base64 编码，尝试解码...\n`);
                    try {
                        content = atob(content);
                    } catch (e) {
                        this.terminal.write(`base64 解码失败: ${e.message}\n`);
                    }
                }
            } else {
                // 使用 FileSystem.read API（可能从 nodeTree 读取，可能有缓存问题）
                try {
                    // 先等待一下，确保文件写入完成
                    this.terminal.write(`等待文件系统同步...\n`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // 先检查文件是否存在
                    this.terminal.write(`尝试读取文件: ${jsonPath}\n`);
                    
                    // 尝试使用 exists API 检查文件（如果可用）
                    try {
                        const checkUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                            ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                            : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                                ? SystemInformation.getOrigin()
                                : window.location.origin);
                        checkUrl.searchParams.set('action', 'exists');
                        checkUrl.searchParams.set('path', jsonPath);
                        
                        const checkResponse = await fetch(checkUrl.toString());
                        if (checkResponse.ok) {
                            const checkResult = await checkResponse.json();
                            if (checkResult.status === 'success' && checkResult.data) {
                                if (checkResult.data.exists) {
                                    this.terminal.write(`文件存在，类型: ${checkResult.data.type}, 大小: ${checkResult.data.size || '未知'} 字节\n`);
                                } else {
                                    this.terminal.write(`错误: 文件不存在\n`);
                                    return null;
                                }
                            }
                        }
                    } catch (e) {
                        this.terminal.write(`文件存在性检查失败: ${e.message}，继续尝试读取...\n`);
                    }
                    
                    content = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.read', [jsonPath]);
                    
                    // 详细检查返回的内容
                    this.terminal.write(`读取结果类型: ${typeof content}\n`);
                    if (content === null || content === undefined) {
                        this.terminal.write(`错误: 文件内容为 null 或 undefined\n`);
                        return null;
                    }
                    
                    if (typeof content !== 'string') {
                        this.terminal.write(`警告: 内容不是字符串类型，尝试转换...\n`);
                        content = String(content);
                    }
                    
                    // 验证内容不为空字符串
                    if (content.trim().length === 0) {
                        this.terminal.write(`错误: 文件内容为空字符串（去除空白后长度为 0）\n`);
                        this.terminal.write(`原始内容长度: ${content.length} 字符\n`);
                        this.terminal.write(`原始内容预览（前100字符）: ${JSON.stringify(content.substring(0, 100))}\n`);
                        throw new Error('application.json 文件内容为空');
                    }
                    this.terminal.write(`文件读取成功，内容长度: ${content.length} 字符\n`);
                    this.terminal.write(`内容预览（前200字符）: ${content.substring(0, 200).replace(/\n/g, '\\n')}\n`);
                } catch (error) {
                    this.terminal.write(`读取文件失败: ${error.message}\n`);
                    this.terminal.write(`错误堆栈: ${error.stack || '无'}\n`);
                    throw new Error(`读取 application.json 失败: ${error.message}`);
                }
            }
            
            // 统一处理读取到的内容（无论是从 PHP 还是 FileSystem.read）
            // 详细检查返回的内容
            this.terminal.write(`读取结果类型: ${typeof content}\n`);
            if (content === null || content === undefined) {
                this.terminal.write(`错误: 文件内容为 null 或 undefined\n`);
                return null;
            }
            
            if (typeof content !== 'string') {
                this.terminal.write(`警告: 内容不是字符串类型，尝试转换...\n`);
                content = String(content);
            }
            
            // 验证内容不为空字符串
            if (content.trim().length === 0) {
                this.terminal.write(`错误: 文件内容为空字符串（去除空白后长度为 0）\n`);
                this.terminal.write(`原始内容长度: ${content.length} 字符\n`);
                this.terminal.write(`原始内容预览（前100字符）: ${JSON.stringify(content.substring(0, 100))}\n`);
                throw new Error('application.json 文件内容为空');
            }
            this.terminal.write(`文件读取成功，内容长度: ${content.length} 字符\n`);
            this.terminal.write(`内容预览（前200字符）: ${content.substring(0, 200).replace(/\n/g, '\\n')}\n`);

            // 解析 JSON
            try {
                // 去除 BOM 和空白字符
                const trimmedContent = content.trim();
                if (trimmedContent.length === 0) {
                    throw new Error('application.json 文件内容为空');
                }
                
                // 尝试解析 JSON
                const parsed = JSON.parse(trimmedContent);
                this.terminal.write(`JSON 解析成功\n`);
                return parsed;
            } catch (parseError) {
                // 提供更详细的错误信息
                const preview = content.substring(0, 200).replace(/\n/g, '\\n');
                this.terminal.write(`JSON 解析失败: ${parseError.message}\n`);
                this.terminal.write(`文件内容预览: ${preview}...\n`);
                throw new Error(`解析 application.json 失败: ${parseError.message}。文件内容预览: ${preview}...`);
            }
        },

        /**
         * 检查安装冲突
         * @param {Object} appConfig 应用程序配置
         * @returns {Promise<Object>} 检查结果 { hasConflict, isUpdate, isDuplicate, isNameConflict, existingVersion, existingAuthor, existingCopyright }
         */
        _checkInstallationConflict: async function(appConfig) {
            const programName = appConfig.name;
            if (!programName) {
                return { hasConflict: false };
            }

            const result = {
                hasConflict: false,
                isUpdate: false,
                isDuplicate: false,
                isNameConflict: false,
                existingVersion: null,
                existingAuthor: null,
                existingCopyright: null
            };

            try {
                // 1. 检查动态安装的程序
                let existingApp = null;
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                    // 使用 ProcessManager API，这样 LStorage 可以正确获取 PID
                    existingApp = await ProcessManager.callKernelAPI(this.pid, 'Application.get', [programName]);
                } else if (typeof LStorage !== 'undefined') {
                    existingApp = await LStorage.getInstalledApplication(programName);
                }

                // 2. 检查静态程序（通过 ApplicationAssetManager 或 APPLICATION_ASSETS）
                let staticApp = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    staticApp = ApplicationAssetManager.getProgram(programName);
                } else if (typeof APPLICATION_ASSETS !== 'undefined' && APPLICATION_ASSETS[programName]) {
                    staticApp = APPLICATION_ASSETS[programName];
                }

                // 如果找到静态程序，检查是否为静态程序（不允许覆盖静态程序）
                if (staticApp && !existingApp) {
                    // 静态程序不能被动态安装的程序覆盖
                    result.hasConflict = true;
                    result.isNameConflict = true;
                    result.existingAuthor = 'ZerOS System';
                    result.existingCopyright = '© ZerOS';
                    result.existingVersion = null;
                    
                    // 尝试从静态程序获取版本信息
                    if (typeof staticApp === 'object' && staticApp !== null) {
                        if (staticApp.metadata && staticApp.metadata.version) {
                            result.existingVersion = staticApp.metadata.version;
                        } else if (staticApp.version) {
                            result.existingVersion = staticApp.version;
                        }
                    }
                    
                    return result;
                }

                // 如果找到已安装的程序（优先使用动态安装的程序）
                const installedApp = existingApp || staticApp;
                if (installedApp) {
                    result.hasConflict = true;

                    // 提取已安装程序的信息
                    let installedVersion = null;
                    let installedAuthor = null;
                    let installedCopyright = null;

                    if (typeof installedApp === 'object' && installedApp !== null) {
                        // 从 metadata 中提取信息
                        if (installedApp.metadata) {
                            installedVersion = installedApp.metadata.version || null;
                            installedAuthor = installedApp.metadata.author || installedApp.author || null;
                            installedCopyright = installedApp.metadata.copyright || installedApp.copyright || null;
                        } else {
                            // 如果没有 metadata，尝试从顶层获取
                            installedVersion = installedApp.version || null;
                            installedAuthor = installedApp.author || null;
                            installedCopyright = installedApp.copyright || null;
                        }
                    }

                    result.existingVersion = installedVersion;
                    result.existingAuthor = installedAuthor;
                    result.existingCopyright = installedCopyright;

                    // 提取当前安装包的信息
                    const currentVersion = appConfig.version || null;
                    const currentAuthor = appConfig.author || null;
                    const currentCopyright = appConfig.copyright || null;

                    // 比较作者和版权信息（用于判断是否为同一开发者）
                    const sameAuthor = this._compareStrings(installedAuthor, currentAuthor);
                    const sameCopyright = this._compareStrings(installedCopyright, currentCopyright);
                    const isSameDeveloper = sameAuthor && sameCopyright;

                    // 判断冲突类型
                    if (isSameDeveloper) {
                        // 同一开发者的程序
                        if (this._compareVersions(currentVersion, installedVersion) === 0) {
                            // 版本相同，是重复安装
                            result.isDuplicate = true;
                        } else {
                            // 版本不同，是更新安装
                            result.isUpdate = true;
                        }
                    } else {
                        // 不同开发者的程序，是名称冲突
                        result.isNameConflict = true;
                    }
                }

                return result;
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("ZOMInstall", `检查安装冲突失败: ${error.message}`, error);
                }
                // 检查失败时，为了安全起见，假设有冲突
                return {
                    hasConflict: true,
                    isNameConflict: true,
                    error: error.message
                };
            }
        },

        /**
         * 比较两个字符串（忽略大小写和空白）
         * @param {string|null|undefined} str1
         * @param {string|null|undefined} str2
         * @returns {boolean} 是否相同
         */
        _compareStrings: function(str1, str2) {
            if (!str1 && !str2) {
                return true; // 都为空，视为相同
            }
            if (!str1 || !str2) {
                return false; // 一个为空一个不为空，视为不同
            }
            return str1.toString().trim().toLowerCase() === str2.toString().trim().toLowerCase();
        },

        /**
         * 比较版本号
         * @param {string|null|undefined} version1
         * @param {string|null|undefined} version2
         * @returns {number} -1: version1 < version2, 0: version1 === version2, 1: version1 > version2
         */
        _compareVersions: function(version1, version2) {
            if (!version1 && !version2) {
                return 0; // 都为空，视为相同
            }
            if (!version1) {
                return -1; // version1 为空，视为较小
            }
            if (!version2) {
                return 1; // version2 为空，视为较小
            }

            // 简单的版本号比较（支持 x.y.z 格式）
            const v1Parts = version1.toString().split('.').map(part => parseInt(part) || 0);
            const v2Parts = version2.toString().split('.').map(part => parseInt(part) || 0);

            const maxLength = Math.max(v1Parts.length, v2Parts.length);
            for (let i = 0; i < maxLength; i++) {
                const v1Part = v1Parts[i] || 0;
                const v2Part = v2Parts[i] || 0;

                if (v1Part < v2Part) {
                    return -1;
                } else if (v1Part > v2Part) {
                    return 1;
                }
            }

            return 0; // 版本相同
        },

        /**
         * 复制文件并注册程序
         */
        _copyAndRegister: async function(tempDir, appConfig, extractedFiles = []) {
            const programName = appConfig.name;
            if (!programName) {
                throw new Error('application.json 中缺少程序名称 (name)');
            }

            // 构建程序资源对象
            const asset = {
                script: appConfig.script || `${programName}.js`,
                styles: appConfig.styles || [],
                icon: appConfig.icon || null,
                assets: appConfig.assets || [],
                metadata: {
                    description: appConfig.description || '',
                    version: appConfig.version || '1.0.0',
                    type: appConfig.type || 'GUI',
                    autoStart: appConfig.autoStart || false,
                    priority: appConfig.priority !== undefined ? appConfig.priority : 5,
                    alwaysShowInTaskbar: appConfig.alwaysShowInTaskbar || false,
                    allowMultipleInstances: appConfig.allowMultipleInstances !== undefined ? appConfig.allowMultipleInstances : true,
                    supportsPreview: appConfig.supportsPreview !== undefined ? appConfig.supportsPreview : true,
                    category: appConfig.category || 'other'
                }
            };

            // 收集所有需要复制的文件（排除 application.json 和 setup.js）
            // 注意：uninstall.js 需要被复制到程序目录，因为卸载时会从程序目录读取并执行它
            const sourceFiles = {};
            // 排除的文件名（无论路径）
            const filesToExclude = ['application.json', 'setup.js'];

            // 优先使用解压服务返回的文件列表，如果为空则尝试列出目录
            let files = [];
            this.terminal.write(`[调试] extractedFiles 参数: ${extractedFiles ? `存在, 长度=${extractedFiles.length}` : '不存在'}\n`);
            if (extractedFiles && extractedFiles.length > 0) {
                // 使用解压服务返回的文件列表（已经是相对路径）
                this.terminal.write(`[调试] extractedFiles 内容预览: ${JSON.stringify(extractedFiles.slice(0, 5))}${extractedFiles.length > 5 ? '...' : ''}\n`);
                files = extractedFiles.map(file => {
                    // 规范化路径（统一使用正斜杠）
                    return file.replace(/\\/g, '/');
                });
                this.terminal.write(`使用解压文件列表，共 ${files.length} 个文件\n`);
            } else {
                // 降级方案：尝试列出目录
                this.terminal.write(`解压文件列表为空，尝试列出目录: ${tempDir}\n`);
                try {
                    files = await this._listFiles(tempDir);
                    this.terminal.write(`目录列表返回 ${files.length} 个文件\n`);
                } catch (error) {
                    this.terminal.write(`列出目录失败: ${error.message}\n`);
                    throw new Error(`无法获取文件列表: ${error.message}`);
                }
            }
            
            this.terminal.write(`[调试] 最终文件列表 (前10个): ${JSON.stringify(files.slice(0, 10))}\n`);
            this.terminal.write(`找到 ${files.length} 个文件，开始读取...\n`);
            
            let readSuccessCount = 0;
            let readFailCount = 0;
            
            for (const file of files) {
                this.terminal.write(`[处理文件] 当前文件: ${file}\n`);
                
                // 排除 application.json 和 setup.js（检查文件名，无论路径）
                const fileName = file.split('/').pop(); // 获取文件名（处理子目录情况）
                this.terminal.write(`[处理文件] 文件名: ${fileName}\n`);
                
                if (filesToExclude.includes(fileName)) {
                    this.terminal.write(`跳过文件: ${file} (排除列表)\n`);
                    continue;
                }

                // 读取文件内容
                // 构建完整路径：如果 file 已经是绝对路径，直接使用；否则拼接 tempDir
                let filePath;
                if (file.startsWith('D:/') || file.startsWith('C:/')) {
                    filePath = file;
                    this.terminal.write(`[处理文件] 文件已经是绝对路径: ${filePath}\n`);
                } else {
                    filePath = `${tempDir}/${file}`;
                    this.terminal.write(`[处理文件] 构建相对路径: tempDir=${tempDir}, file=${file}, 完整路径=${filePath}\n`);
                }
                
                try {
                    this.terminal.write(`[处理文件] 开始读取文件: ${filePath}\n`);
                    const content = await this._readFile(filePath);
                    if (content !== null && content !== undefined) {
                        sourceFiles[file] = content;
                        readSuccessCount++;
                        const contentLength = typeof content === 'string' ? content.length : 'N/A';
                        this.terminal.write(`✓ 读取成功: ${file} (${contentLength} 字符)\n`);
                    } else {
                        readFailCount++;
                        this.terminal.write(`警告: 无法读取文件: ${file} (返回 ${content === null ? 'null' : 'undefined'})\n`);
                    }
                } catch (error) {
                    readFailCount++;
                    this.terminal.write(`错误: 读取文件失败: ${file} - ${error.message}\n`);
                    if (error.stack) {
                        this.terminal.write(`错误堆栈: ${error.stack.substring(0, 300)}\n`);
                    }
                }
            }
            
            this.terminal.write(`文件读取完成: 成功 ${readSuccessCount} 个，失败 ${readFailCount} 个\n`);
            
            if (Object.keys(sourceFiles).length === 0) {
                throw new Error('没有成功读取任何文件，无法安装程序');
            }
            
            this.terminal.write(`准备复制 ${Object.keys(sourceFiles).length} 个文件到 application/ 目录...\n`);

            // 使用 ProcessManager API 安装程序（通过内核 API，确保权限验证正确）
            if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
                throw new Error('ProcessManager 不可用，无法安装程序');
            }

            await ProcessManager.callKernelAPI(this.pid, 'Application.install', [programName, asset, sourceFiles]);
        },

        /**
         * 列出目录中的所有文件（递归）
         */
        _listFiles: async function(dirPath) {
            const files = [];

            // 使用 FileSystem.list API
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                try {
                    this.terminal.write(`[调试] 使用 FileSystem.list API 列出目录: ${dirPath}\n`);
                    const items = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.list', [dirPath]);
                    this.terminal.write(`[调试] FileSystem.list 返回 ${Array.isArray(items) ? items.length : 0} 个项目\n`);
                    if (Array.isArray(items)) {
                        for (const item of items) {
                            if (typeof item === 'string') {
                                // 简单格式：直接是文件名
                                const fullPath = `${dirPath}/${item}`;
                                const isDir = await this._isDirectory(fullPath);
                                if (isDir) {
                                    // 递归列出子目录
                                    const subFiles = await this._listFiles(fullPath);
                                    for (const subFile of subFiles) {
                                        files.push(`${item}/${subFile}`);
                                    }
                                } else {
                                    files.push(item);
                                }
                            } else if (typeof item === 'object' && item !== null) {
                                // 对象格式：{ name, type, ... }
                                const itemName = item.name || item.fileName;
                                const itemType = item.type || 'file';
                                if (itemType === 'directory' || itemType === 'dir') {
                                    const subFiles = await this._listFiles(`${dirPath}/${itemName}`);
                                    for (const subFile of subFiles) {
                                        files.push(`${itemName}/${subFile}`);
                                    }
                                } else {
                                    files.push(itemName);
                                }
                            }
                        }
                    }
                } catch (error) {
                    throw new Error(`列出文件失败: ${error.message}`);
                }
            } else {
                // 降级方案：使用 PHP 服务
                this.terminal.write(`[调试] 使用 PHP 服务列出目录: ${dirPath}\n`);
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                
                url.searchParams.set('action', 'list_dir');
                url.searchParams.set('path', dirPath);

                this.terminal.write(`[调试] PHP 服务 URL: ${url.toString()}\n`);
                const response = await fetch(url.toString());
                if (!response.ok) {
                    const errorText = await response.text();
                    this.terminal.write(`[调试] PHP 服务响应失败: HTTP ${response.status}, ${errorText}\n`);
                    throw new Error(`列出文件失败: HTTP ${response.status}`);
                }

                const result = await response.json();
                this.terminal.write(`[调试] PHP 服务响应: status=${result.status}, data类型=${Array.isArray(result.data) ? 'array' : typeof result.data}, 数据长度=${Array.isArray(result.data) ? result.data.length : 'N/A'}\n`);
                if (result.status === 'success' && Array.isArray(result.data)) {
                    for (const item of result.data) {
                        if (typeof item === 'string') {
                            files.push(item);
                        } else if (typeof item === 'object' && item !== null) {
                            const itemName = item.name || item.fileName;
                            const itemType = item.type || 'file';
                            if (itemType === 'directory' || itemType === 'dir') {
                                const subFiles = await this._listFiles(`${dirPath}/${itemName}`);
                                for (const subFile of subFiles) {
                                    files.push(`${itemName}/${subFile}`);
                                }
                            } else {
                                files.push(itemName);
                            }
                        }
                    }
                } else {
                    this.terminal.write(`[调试] PHP 服务返回非成功状态或非数组数据: ${JSON.stringify(result)}\n`);
                }
            }
            
            this.terminal.write(`[调试] _listFiles 最终返回 ${files.length} 个文件\n`);

            return files;
        },

        /**
         * 检查路径是否为目录
         */
        _isDirectory: async function(path) {
            try {
                // 尝试列出该路径，如果能列出则可能是目录
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                    await ProcessManager.callKernelAPI(this.pid, 'FileSystem.list', [path]);
                    return true;
                }
            } catch (error) {
                // 如果失败，可能是文件
                return false;
            }
            return false;
        },

        /**
         * 读取文件内容（直接使用 PHP 后端服务）
         */
        _readFile: async function(filePath) {
            try {
                this.terminal.write(`[读取文件] 开始读取: ${filePath}\n`);
                
                // 直接使用 PHP 服务读取文件
                // 规范化路径：统一使用正斜杠
                const normalizedPath = filePath.replace(/\\/g, '/');
                
                // 分离目录和文件名
                let dirPath, fileName;
                
                if (normalizedPath.match(/^[CD]:/)) {
                    // 绝对路径，如 D:/cache/temp/piano.js
                    const lastSlashIndex = normalizedPath.lastIndexOf('/');
                    if (lastSlashIndex > 1) {
                        // 有目录部分
                        dirPath = normalizedPath.substring(0, lastSlashIndex);
                        fileName = normalizedPath.substring(lastSlashIndex + 1);
                    } else if (lastSlashIndex === 1) {
                        // 根路径，如 D:/file.js
                        dirPath = normalizedPath.substring(0, 2); // D:
                        fileName = normalizedPath.substring(3); // file.js
                    } else {
                        // 没有斜杠，如 D:file.js（异常情况）
                        dirPath = normalizedPath.substring(0, 2); // D:
                        fileName = normalizedPath.substring(2); // file.js
                    }
                } else {
                    // 相对路径
                    const lastSlashIndex = normalizedPath.lastIndexOf('/');
                    if (lastSlashIndex >= 0) {
                        dirPath = normalizedPath.substring(0, lastSlashIndex);
                        fileName = normalizedPath.substring(lastSlashIndex + 1);
                    } else {
                        // 只有文件名
                        dirPath = '';
                        fileName = normalizedPath;
                    }
                }
                
                // 确保 dirPath 格式正确（D:/cache/temp 而不是 D:/cache/temp/）
                if (dirPath && dirPath.endsWith('/') && dirPath.length > 3) {
                    dirPath = dirPath.slice(0, -1);
                }

                this.terminal.write(`[读取文件] 原始路径: ${filePath}\n`);
                this.terminal.write(`[读取文件] 规范化路径: ${normalizedPath}\n`);
                this.terminal.write(`[读取文件] 解析结果 - 目录: "${dirPath}", 文件名: "${fileName}"\n`);

                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                
                url.searchParams.set('action', 'read_file');
                url.searchParams.set('path', dirPath);
                url.searchParams.set('fileName', fileName);

                this.terminal.write(`[读取文件] 请求 URL: ${url.toString()}\n`);

                const response = await fetch(url.toString());
                this.terminal.write(`[读取文件] HTTP 响应状态: ${response.status} ${response.statusText}\n`);
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => '无法读取错误信息');
                    this.terminal.write(`[读取文件] HTTP 错误响应: ${errorText.substring(0, 300)}\n`);
                    return null;
                }

                const contentType = response.headers.get('content-type');
                this.terminal.write(`[读取文件] 响应 Content-Type: ${contentType || '未知'}\n`);

                const result = await response.json();
                this.terminal.write(`[读取文件] PHP 响应状态: ${result.status}, 消息: ${result.message || '无'}\n`);
                
                if (result.status === 'success' && result.data) {
                    if (result.data.content !== undefined) {
                        let content = result.data.content;
                        
                        // 如果是 base64 编码，需要解码
                        if (result.data.isBase64) {
                            this.terminal.write(`[读取文件] 检测到 base64 编码，尝试解码...\n`);
                            try {
                                content = atob(content);
                                this.terminal.write(`[读取文件] base64 解码成功\n`);
                            } catch (e) {
                                this.terminal.write(`[读取文件] base64 解码失败: ${e.message}，使用原始内容\n`);
                                // 解码失败，使用原始内容（可能不是 base64）
                            }
                        }
                        
                        const contentLength = typeof content === 'string' ? content.length : 'N/A';
                        const contentPreview = typeof content === 'string' 
                            ? content.substring(0, 100).replace(/\n/g, '\\n') 
                            : 'N/A';
                        this.terminal.write(`[读取文件] 读取成功，内容长度: ${contentLength}, 预览: ${contentPreview}...\n`);
                        return content;
                    } else {
                        this.terminal.write(`[读取文件] 响应数据中没有 content 字段，数据键: ${JSON.stringify(Object.keys(result.data))}\n`);
                        this.terminal.write(`[读取文件] 完整响应数据: ${JSON.stringify(result.data).substring(0, 500)}\n`);
                    }
                } else {
                    this.terminal.write(`[读取文件] PHP 服务返回失败: ${result.message || '未知错误'}\n`);
                    if (result.data) {
                        this.terminal.write(`[读取文件] 错误数据: ${JSON.stringify(result.data).substring(0, 300)}\n`);
                    }
                }
                
                return null;
            } catch (error) {
                this.terminal.write(`[读取文件] 异常: ${error.message}\n`);
                if (error.stack) {
                    this.terminal.write(`[读取文件] 堆栈: ${error.stack.substring(0, 500)}\n`);
                }
                return null;
            }
        },

        /**
         * 执行 setup.js（作为 ZerOS 程序启动）
         */
        _executeSetup: async function(tempDir) {
            const setupPath = `${tempDir}/setup.js`;

            // 检查文件是否存在
            try {
                this.terminal.write(`检查 setup.js 文件: ${setupPath}\n`);
                
                // 等待一下，确保文件系统同步
                await new Promise(resolve => setTimeout(resolve, 200));
                
                const content = await this._readFile(setupPath);
                if (!content) {
                    this.terminal.write(`警告: setup.js 文件不存在或无法读取: ${setupPath}\n`);
                    // 尝试列出目录，看看文件是否真的存在
                    try {
                        const files = await this._listFiles(tempDir);
                        const hasSetup = files.some(f => f.toLowerCase().endsWith('setup.js'));
                        if (hasSetup) {
                            this.terminal.write(`注意: 目录列表中包含 setup.js，但读取失败，可能是文件系统同步问题\n`);
                        } else {
                            this.terminal.write(`确认: 目录列表中未找到 setup.js\n`);
                        }
                    } catch (e) {
                        // 忽略列表错误
                    }
                    return false;  // 文件不存在
                }
                
                this.terminal.write(`setup.js 文件读取成功，内容长度: ${content.length} 字符\n`);

                // 尝试解析 application.json 获取程序名称
                let programName = null;
                try {
                    const appConfig = await this._readApplicationJson(tempDir);
                    if (appConfig && appConfig.name) {
                        programName = appConfig.name;
                    }
                } catch (e) {
                    // 忽略错误
                }

                if (!programName) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("ZOMInstall", "无法获取程序名称，跳过 setup.js 执行");
                    }
                    return false;
                }

                // 使用 ProcessManager 启动 setup.js 作为 ZerOS 程序
                if (typeof ProcessManager === 'undefined' || typeof ProcessManager.startProgram !== 'function') {
                    throw new Error('ProcessManager 不可用，无法执行 setup.js');
                }

                // 创建临时程序配置
                const tempAsset = {
                    script: content,  // 直接传入脚本内容
                    styles: [],
                    assets: [],
                    metadata: {
                        type: 'GUI',
                        autoStart: false,
                        allowMultipleInstances: false,
                        description: `${programName} 安装脚本`
                    }
                };

                // 启动 setup.js 程序
                // 注意：setup.js 应该是一个 IIFE 包装的程序，它会将程序对象注册到 window 或 POOL 中
                // 程序对象名称应该是 'SETUP'（大写）
                try {
                    // 先检查 setup.js 内容是否包含程序对象注册
                    // 如果 setup.js 没有正确注册程序对象，ProcessManager 会超时
                    // 为了支持这种情况，我们需要确保 setup.js 正确注册了程序对象
                    
                    const setupPid = await ProcessManager.startProgram('setup', {
                        tempAsset: tempAsset,
                        args: [programName, tempDir],
                        metadata: {
                            installContext: {
                                programName: programName,
                                tempDir: tempDir,
                                terminal: this.terminal,
                                installerPid: this.pid
                            }
                        }
                    });

                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info("ZOMInstall", `setup.js 已启动 (PID: ${setupPid})`);
                    }

                    // 等待 setup 程序完成（通过检查进程状态）
                    // 需要等待 setup 程序完成后再继续，避免临时文件被过早删除
                    this.terminal.write(`等待 setup.js 程序完成 (PID: ${setupPid})...\n`);
                    
                    const maxWaitTime = 30000; // 最多等待 30 秒
                    const checkInterval = 500; // 每 500ms 检查一次
                    const startTime = Date.now();
                    
                    while (Date.now() - startTime < maxWaitTime) {
                        try {
                            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getProcessInfo === 'function') {
                                const processInfo = ProcessManager.getProcessInfo(setupPid);
                                if (!processInfo) {
                                    // 进程不存在，可能已经退出
                                    this.terminal.write('setup.js 程序已退出\n');
                                    return true;
                                }
                                
                                if (processInfo.status === 'exited' || processInfo.status === 'exiting') {
                                    this.terminal.write('setup.js 程序已完成\n');
                                    return true;
                                }
                                
                                // 进程仍在运行，继续等待
                            } else {
                                // ProcessManager 不可用，无法检查进程状态
                                // 等待一段时间后假设完成
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                return true;
                            }
                        } catch (e) {
                            // 检查失败，等待一段时间后假设完成
                            this.terminal.write(`无法检查 setup.js 状态，等待后继续: ${e.message}\n`);
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            return true;
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                    }
                    
                    // 超时，但继续安装（不中断）
                    this.terminal.write('警告: setup.js 程序等待超时，继续安装\n');
                    return true;
                } catch (error) {
                    // 如果是加载超时错误，可能是 setup.js 没有正确注册程序对象
                    // 这种情况下，我们仍然允许安装继续，但记录警告
                    if (error.message && error.message.includes('failed to load within timeout')) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("ZOMInstall", `setup.js 加载超时，可能未正确注册程序对象，跳过 setup.js 执行`);
                        }
                        this.terminal.write('警告: setup.js 加载超时，跳过安装脚本\n');
                        return false;  // 返回 false 表示未执行
                    }
                    throw new Error(`启动 setup.js 程序失败: ${error.message}`);
                }
            } catch (error) {
                if (error.message && (error.message.includes('启动 setup.js') || error.message.includes('执行 setup.js'))) {
                    throw error;
                }
                return false;  // 文件不存在或其他错误
            }
        },

        /**
         * 验证文件复制结果
         */
        _verifyFileCopy: async function(appConfig) {
            const programName = appConfig.name;
            if (!programName) {
                return { success: false, error: '程序名称无效' };
            }
            
            const targetBasePath = `D:/application/${programName}`;
            let verifiedCount = 0;
            const missingFiles = [];
            
            try {
                // 检查主脚本文件
                const scriptFile = appConfig.script || `${programName}.js`;
                const scriptPath = scriptFile.startsWith('D:/') || scriptFile.startsWith('C:/') 
                    ? scriptFile 
                    : `${targetBasePath}/${scriptFile}`;
                
                try {
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                        await ProcessManager.callKernelAPI(this.pid, 'FileSystem.read', [scriptPath]);
                        verifiedCount++;
                    }
                } catch (e) {
                    missingFiles.push(scriptFile);
                }
                
                // 检查样式文件
                if (Array.isArray(appConfig.styles)) {
                    for (const style of appConfig.styles) {
                        const stylePath = style.startsWith('D:/') || style.startsWith('C:/')
                            ? style
                            : `${targetBasePath}/${style}`;
                        try {
                            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                                await ProcessManager.callKernelAPI(this.pid, 'FileSystem.read', [stylePath]);
                                verifiedCount++;
                            }
                        } catch (e) {
                            missingFiles.push(style);
                        }
                    }
                }
                
                // 检查图标文件
                if (appConfig.icon) {
                    const iconPath = appConfig.icon.startsWith('D:/') || appConfig.icon.startsWith('C:/')
                        ? appConfig.icon
                        : `${targetBasePath}/${appConfig.icon}`;
                    try {
                        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                            await ProcessManager.callKernelAPI(this.pid, 'FileSystem.read', [iconPath]);
                            verifiedCount++;
                        }
                    } catch (e) {
                        missingFiles.push(appConfig.icon);
                    }
                }
                
                if (missingFiles.length > 0) {
                    return { 
                        success: false, 
                        error: `以下文件未找到: ${missingFiles.join(', ')}`,
                        verifiedCount,
                        missingFiles
                    };
                }
                
                return { success: true, verifiedCount };
            } catch (error) {
                return { success: false, error: error.message, verifiedCount };
            }
        },
        
        /**
         * 清理临时文件（直接使用 PHP 后端服务，避免权限问题）
         */
        _cleanupTemp: async function(tempDir, extractedFiles) {
            if (!extractedFiles || extractedFiles.length === 0) {
                this.terminal.write('没有需要清理的临时文件\n');
                return;
            }
            
            this.terminal.write(`开始清理 ${extractedFiles.length} 个临时文件...\n`);
            
            // 直接使用 PHP 服务删除文件（避免权限问题）
            for (const file of extractedFiles) {
                // 构建完整路径
                let filePath;
                if (file.startsWith('D:/') || file.startsWith('C:/')) {
                    filePath = file;
                } else {
                    const normalizedTempDir = tempDir.replace(/\/+$/, '');
                    const normalizedFile = file.replace(/^\/+/, '');
                    filePath = `${normalizedTempDir}/${normalizedFile}`;
                }
                
                try {
                    // 解析路径
                    const normalizedPath = filePath.replace(/\\/g, '/');
                    const lastSlashIndex = normalizedPath.lastIndexOf('/');
                    
                    let dirPath, fileName;
                    if (normalizedPath.match(/^[CD]:/)) {
                        if (lastSlashIndex > 1) {
                            dirPath = normalizedPath.substring(0, lastSlashIndex);
                            fileName = normalizedPath.substring(lastSlashIndex + 1);
                        } else if (lastSlashIndex === 1) {
                            dirPath = normalizedPath.substring(0, 2);
                            fileName = normalizedPath.substring(3);
                        } else {
                            dirPath = normalizedPath.substring(0, 2);
                            fileName = normalizedPath.substring(2);
                        }
                    } else {
                        if (lastSlashIndex >= 0) {
                            dirPath = normalizedPath.substring(0, lastSlashIndex);
                            fileName = normalizedPath.substring(lastSlashIndex + 1);
                        } else {
                            dirPath = '';
                            fileName = normalizedPath;
                        }
                    }
                    
                    // 使用 PHP 服务删除文件
                    const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                        : new URL('/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                            ? SystemInformation.getOrigin()
                            : window.location.origin);
                    
                    url.searchParams.set('action', 'delete_file');
                    url.searchParams.set('path', dirPath);
                    url.searchParams.set('fileName', fileName);

                    const response = await fetch(url.toString());
                    if (response.ok) {
                        const result = await response.json();
                        if (result.status === 'success') {
                            this.terminal.write(`✓ 已删除: ${file}\n`);
                        } else {
                            // 文件可能不存在，忽略
                            this.terminal.write(`- 跳过: ${file} (${result.message || '文件不存在'})\n`);
                        }
                    } else {
                        // HTTP 错误，忽略
                        this.terminal.write(`- 跳过: ${file} (HTTP ${response.status})\n`);
                    }
                } catch (error) {
                    // 忽略单个文件删除失败（不影响安装成功）
                    this.terminal.write(`- 跳过: ${file} (${error.message})\n`);
                }
            }
            
            this.terminal.write('临时文件清理完成\n');
        },

        /**
         * 自关闭
         */
        _selfClose: async function() {
            if (this._closing) {
                return;
            }
            this._closing = true;

            try {
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.requestSelfTermination === 'function') {
                    await ProcessManager.requestSelfTermination(this.pid);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("ZOMInstall", `自关闭失败: ${error.message}`, error);
                }
            }
        },

        /**
         * 退出方法
         */
        __exit__: async function() {
            // 清理资源
            this._closing = true;
        }
    };

    // 导出到全局
    if (typeof window !== 'undefined') {
        window.ZOMINSTALL = ZOMINSTALL;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.ZOMINSTALL = ZOMINSTALL;
    }

    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "ZOMINSTALL", ZOMINSTALL);
        } catch (e) {
            // 忽略错误
        }
    }
})(window);

