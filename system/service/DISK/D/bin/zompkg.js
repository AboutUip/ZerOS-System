/* ZOM 打包程序
 * 功能：
 * - 将目录打包为 .zom 程序安装包（ZIP 格式）
 * - 支持源目录已有 application.json，或通过 --config / --name 等手动提供数据自动创建
 * - 用法: zompkg <源目录路径> [输出路径] [选项]
 */

(function(window) {
    'use strict';

    const ZOMPKG = {
        pid: null,
        terminal: null,
        _closing: false,

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'ZOMPack',
                type: 'CLI',
                version: '1.0.0',
                description: 'ZOM 程序打包工具',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.KERNEL_DISK_READ
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
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
                throw new Error('zompkg 程序需要终端环境');
            }

            const args = initArgs.args || [];

            setTimeout(async () => {
                try {
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    if (args.length === 0) {
                        this.terminal.write('zompkg: 错误: 缺少参数\n');
                        this.terminal.write('用法: zompkg <源目录路径> [输出路径] [选项]\n');
                        this.terminal.write('使用 -h 或 --help 查看帮助信息\n');
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    const parsed = this._parseArgs(args);
                    if (!parsed.sourceDir) {
                        this.terminal.write('zompkg: 错误: 缺少源目录路径\n');
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    let outputPath = parsed.outputPath;
                    if (!outputPath) {
                        outputPath = parsed.sourceDir + '.zom';
                    } else if (!outputPath.toLowerCase().endsWith('.zom')) {
                        outputPath = outputPath.replace(/\/+$/, '') + '.zom';
                    }

                    const extraApplicationJson = await this._buildApplicationJsonContent(parsed);
                    await this._packZom(parsed.sourceDir, outputPath, extraApplicationJson);
                    setTimeout(() => this._selfClose(), 300);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ZOMPack', `打包失败: ${error.message}`, error);
                    }
                    this.terminal.write(`zompkg: 错误: ${error.message}\n`);
                    setTimeout(() => this._selfClose(), 300);
                }
            }, 0);
        },

        /**
         * 读取文件内容（通过 FSDirve 服务）
         */
        _readFile: async function(filePath) {
            const normalizedPath = filePath.replace(/\\/g, '/');
            let dirPath, fileName;
            const lastSlash = normalizedPath.lastIndexOf('/');
            if (lastSlash >= 0) {
                dirPath = normalizedPath.substring(0, lastSlash) || (normalizedPath.match(/^[A-Za-z]:/) ? normalizedPath.substring(0, 2) : '');
                fileName = normalizedPath.substring(lastSlash + 1);
            } else {
                dirPath = '';
                fileName = normalizedPath;
            }

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
                throw new Error(`读取文件失败: HTTP ${response.status}`);
            }

            const result = await response.json();
            if (result.status !== 'success' || !result.data || !result.data.content) {
                throw new Error(result.message || '读取文件失败');
            }

            let content = result.data.content;
            if (result.data.isBase64) {
                try {
                    content = atob(content);
                } catch (e) {
                    throw new Error('Base64 解码失败');
                }
            }
            return content;
        },

        /**
         * 解析命令行参数（含 --config、--name 等）
         * @returns {{ sourceDir: string, outputPath?: string, extraApplicationJson?: string }}
         */
        _parseArgs: function(args) {
            const result = { sourceDir: '', outputPath: null, extraApplicationJson: null };
            const opts = {};
            let i = 0;
            if (args[i] && !args[i].startsWith('-')) {
                result.sourceDir = args[i].replace(/\\/g, '/').replace(/\/+$/, '');
                if (/^[a-z]:/.test(result.sourceDir)) {
                    result.sourceDir = result.sourceDir.charAt(0).toUpperCase() + result.sourceDir.slice(1);
                }
                i++;
            }
            if (args[i] && !args[i].startsWith('-')) {
                result.outputPath = args[i].replace(/\\/g, '/');
                if (/^[a-z]:/.test(result.outputPath)) {
                    result.outputPath = result.outputPath.charAt(0).toUpperCase() + result.outputPath.slice(1);
                }
                i++;
            }
            while (i < args.length) {
                const a = args[i];
                if (a === '--config' && args[i + 1]) {
                    opts.configPath = args[i + 1];
                    i += 2;
                    continue;
                }
                if (a === '--name' && args[i + 1]) { opts.name = args[i + 1]; i += 2; continue; }
                if (a === '--version' && args[i + 1]) { opts.version = args[i + 1]; i += 2; continue; }
                if (a === '--script' && args[i + 1]) { opts.script = args[i + 1]; i += 2; continue; }
                if (a === '--description' && args[i + 1]) { opts.description = args[i + 1]; i += 2; continue; }
                if (a === '--type' && args[i + 1]) { opts.type = args[i + 1]; i += 2; continue; }
                if (a === '--icon' && args[i + 1]) { opts.icon = args[i + 1]; i += 2; continue; }
                if (a === '--styles' && args[i + 1]) { opts.styles = args[i + 1]; i += 2; continue; }
                if (a === '--assets' && args[i + 1]) { opts.assets = args[i + 1]; i += 2; continue; }
                if (a === '--category' && args[i + 1]) { opts.category = args[i + 1]; i += 2; continue; }
                i++;
            }
            result._opts = opts;
            return result;
        },

        /**
         * 从 --config 或 --name 等生成 application.json 内容（用于注入）
         */
        _buildApplicationJsonContent: async function(parsed) {
            const opts = parsed._opts || {};
            if (opts.configPath) {
                const content = await this._readFile(opts.configPath);
                const json = JSON.parse(content);
                if (!json || typeof json.name !== 'string' || !String(json.name).trim()) {
                    throw new Error('--config 文件中的 application 必须包含 name 字段');
                }
                return JSON.stringify(json, null, 2);
            }
            if (opts.name) {
                const name = String(opts.name).trim();
                if (!name) throw new Error('--name 不能为空');
                const app = {
                    name: name,
                    version: opts.version || '1.0.0',
                    description: opts.description || '',
                    script: opts.script || (name + '.js'),
                    styles: opts.styles ? opts.styles.split(',').map(s => s.trim()).filter(Boolean) : [],
                    icon: opts.icon || null,
                    assets: opts.assets ? opts.assets.split(',').map(s => s.trim()).filter(Boolean) : [],
                    type: (opts.type && (opts.type.toUpperCase() === 'CLI' || opts.type.toUpperCase() === 'GUI')) ? opts.type.toUpperCase() : 'GUI',
                    autoStart: false,
                    priority: 5,
                    allowMultipleInstances: true,
                    category: opts.category || 'other'
                };
                return JSON.stringify(app, null, 2);
            }
            return null;
        },

        /**
         * 验证源目录是否包含 application.json（当未注入时）
         */
        _validateSourceDir: async function(sourceDir) {
            try {
                const content = await this._readFile(sourceDir + '/application.json');
                const json = JSON.parse(content);
                if (!json || typeof json.name !== 'string' || !json.name.trim()) {
                    throw new Error('application.json 必须包含 name 字段');
                }
                return json.name.trim();
            } catch (e) {
                if (e.message && e.message.indexOf('application.json') >= 0) {
                    throw new Error('源目录必须包含 application.json，或使用 --config / --name 等手动提供');
                }
                throw new Error('无法读取 application.json: ' + (e.message || e));
            }
        },

        /**
         * 打包 ZOM
         * @param {string} sourceDir - 源目录
         * @param {string} outputPath - 输出 .zom 路径
         * @param {string|null} extraApplicationJson - 要注入的 application.json 内容（可选）
         */
        _packZom: async function(sourceDir, outputPath, extraApplicationJson) {
            this.terminal.write(`zompkg: 正在打包...\n`);
            this.terminal.write(`  源目录: ${sourceDir}\n`);
            this.terminal.write(`  输出文件: ${outputPath}\n`);

            let programName = '';
            const options = {};

            if (extraApplicationJson) {
                const json = JSON.parse(extraApplicationJson);
                programName = json && json.name ? String(json.name).trim() : '';
                options.extraFiles = { 'application.json': extraApplicationJson };
                this.terminal.write(`  程序名: ${programName || '(来自注入)'}\n`);
                this.terminal.write('  使用手动提供的 application.json\n');
            } else {
                programName = await this._validateSourceDir(sourceDir);
                this.terminal.write(`  程序名: ${programName}\n`);
            }

            const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.COMPRESSION_DIRVE)
                : new URL('/system/service/CompressionDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin)
                    ? SystemInformation.getOrigin()
                    : window.location.origin);

            url.searchParams.set('action', 'compress_zip');

            this.terminal.write('  正在压缩...\n');

            let response;
            if (Object.keys(options).length > 0) {
                response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourcePath: sourceDir,
                        targetPath: outputPath,
                        options: options
                    })
                });
            } else {
                url.searchParams.set('sourcePath', sourceDir);
                url.searchParams.set('targetPath', outputPath);
                response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (!response.ok) {
                let msg = `压缩失败: HTTP ${response.status}`;
                try {
                    const text = await response.text();
                    try {
                        const err = JSON.parse(text);
                        if (err && err.message) msg = err.message;
                    } catch (_) {
                        if (text) msg = text;
                    }
                } catch (_) {}
                throw new Error(msg);
            }

            const result = await response.json();
            if (result.status !== 'success') {
                throw new Error(result.message || '压缩失败');
            }

            const size = result.data && result.data.size;
            const sizeStr = size != null ? ` (${this._formatSize(size)} bytes)` : '';
            this.terminal.write(`zompkg: 打包成功: ${outputPath}${sizeStr}\n`);
        },

        _formatSize: function(bytes) {
            if (bytes < 1024) return String(bytes);
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        },

        _showUsage: function() {
            this.terminal.write('用法: zompkg <源目录路径> [输出路径] [选项]\n');
            this.terminal.write('\n');
            this.terminal.write('将目录打包为 .zom 程序安装包。源目录可已有 application.json，\n');
            this.terminal.write('或通过 --config / --name 等手动提供数据自动创建 application.json。\n');
            this.terminal.write('\n');
            this.terminal.write('选项（手动提供 application.json 数据）:\n');
            this.terminal.write('  --config <路径>     从 JSON 文件读取完整配置（需含 name）\n');
            this.terminal.write('  --name <名称>       程序名（必需，与 --config 二选一）\n');
            this.terminal.write('  --version <版本>    版本号，默认 1.0.0\n');
            this.terminal.write('  --script <路径>     主脚本，默认 <name>.js\n');
            this.terminal.write('  --description <描述>\n');
            this.terminal.write('  --type GUI|CLI      程序类型，默认 GUI\n');
            this.terminal.write('  --icon <路径>       图标路径\n');
            this.terminal.write('  --styles <路径,...> 样式文件，逗号分隔\n');
            this.terminal.write('  --assets <路径,...> 资源路径，逗号分隔\n');
            this.terminal.write('  --category <分类>   system|utility|game|other\n');
            this.terminal.write('  -h, --help           显示此帮助信息\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  zompkg D:/dev/myapp\n');
            this.terminal.write('    -> 使用源目录内 application.json，生成 D:/dev/myapp.zom\n');
            this.terminal.write('  zompkg D:/dev/myapp --name myapp --script myapp.js\n');
            this.terminal.write('    -> 自动创建 application.json 并打包\n');
            this.terminal.write('  zompkg D:/dev/myapp C:/out.zom --config D:/dev/app.json\n');
            this.terminal.write('    -> 使用指定 JSON 作为 application.json 并打包\n');
        },

        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;
            await new Promise(r => setTimeout(r, 200));
            if (!this.pid) return;
            try {
                const api = this._initArgs && this._initArgs.kernelAPI;
                if (api && typeof api.call === 'function') {
                    await api.call('Process.requestSelfTermination', []);
                } else if (typeof ProcessManager !== 'undefined') {
                    await ProcessManager.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
                }
            } catch (e) {
                if (typeof ProcessManager !== 'undefined' && ProcessManager.killProgram) {
                    try { ProcessManager.killProgram(this.pid); } catch (_) {}
                }
            }
        }
    };

    // 保存 initArgs 供 _selfClose 使用
    const originalInit = ZOMPKG.__init__;
    ZOMPKG.__init__ = async function(pid, initArgs) {
        this._initArgs = initArgs;
        return originalInit.call(this, pid, initArgs);
    };

    if (typeof window !== 'undefined') window.ZOMPKG = ZOMPKG;
    if (typeof globalThis !== 'undefined') globalThis.ZOMPKG = ZOMPKG;
})(this);
