/* Whois 命令实现
 * 功能：
 * - 调用远程 API 查询域名 whois 信息（uapis.cn）
 * - 支持指定域名和 -h/--help
 * - 程序执行完成后自动关闭
 */

(function(window) {
    'use strict';

    const WHOIS_API_URL = 'https://uapis.cn/api/v1/network/whois';

    const WHOIS = {
        pid: null,
        terminal: null,
        _closing: false,

        __info__: function() {
            return {
                name: 'Whois',
                type: 'CLI',
                version: '1.0.0',
                description: '域名 Whois 查询（远程 API）',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.NETWORK_ACCESS,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
                }
            };
        },

        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;

            if (!this.terminal) {
                throw new Error('Whois 程序需要终端环境');
            }

            const args = initArgs.args || [];

            setTimeout(async () => {
                try {
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    let domain = null;
                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i];
                        if (arg !== '-h' && arg !== '--help' && !arg.startsWith('-')) {
                            domain = arg;
                            break;
                        }
                    }

                    if (!domain || !domain.trim()) {
                        this.terminal.write('whois: 请指定域名\n');
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    domain = domain.trim();
                    this.terminal.write(`正在查询 ${domain} 的 Whois 信息 ...\n\n`);

                    await this._fetchAndDisplay(domain);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('Whois', `执行失败: ${error.message}`, error);
                    }
                    this.terminal.write(`whois: 错误: ${error.message || '未知错误'}\n`);
                } finally {
                    setTimeout(() => this._selfClose(), 300);
                }
            }, 0);
        },

        _showUsage: function() {
            this.terminal.write('用法: whois [选项] <域名>\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -h, --help  显示此帮助信息\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  whois baidu.com\n');
            this.terminal.write('  whois google.com\n');
        },

        _fetchAndDisplay: async function(domain) {
            const url = `${WHOIS_API_URL}?domain=${encodeURIComponent(domain)}&format=json`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    this.terminal.write(`whois: 请求失败 HTTP ${response.status} ${response.statusText}\n`);
                    return;
                }
                const text = await response.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    this.terminal.write('whois: 响应解析失败\n');
                    return;
                }
                const whoisData = data && data.whois ? data.whois : null;
                if (!whoisData) {
                    this.terminal.write('whois: 响应中无 whois 数据\n');
                    return;
                }

                const d = whoisData.domain || {};
                const reg = whoisData.registrar || {};
                const regtant = whoisData.registrant || {};
                const tech = whoisData.technical || {};

                this.terminal.write('=== 域名 ===\n');
                this.terminal.write(`  域名: ${d.domain || '--'}\n`);
                if (d.whois_server) this.terminal.write(`  Whois 服务器: ${d.whois_server}\n`);
                if (d.created_date) this.terminal.write(`  创建日期: ${d.created_date}\n`);
                if (d.updated_date) this.terminal.write(`  更新日期: ${d.updated_date}\n`);
                if (d.expiration_date) this.terminal.write(`  过期日期: ${d.expiration_date}\n`);
                if (Array.isArray(d.status) && d.status.length > 0) {
                    this.terminal.write(`  状态: ${d.status.join(', ')}\n`);
                }
                if (Array.isArray(d.name_servers) && d.name_servers.length > 0) {
                    this.terminal.write(`  域名服务器:\n`);
                    d.name_servers.forEach(ns => this.terminal.write(`    ${ns}\n`));
                }

                this.terminal.write('\n=== 注册商 ===\n');
                if (reg.name) this.terminal.write(`  名称: ${reg.name}\n`);
                if (reg.id) this.terminal.write(`  ID: ${reg.id}\n`);
                if (reg.phone) this.terminal.write(`  电话: ${reg.phone}\n`);
                if (reg.email) this.terminal.write(`  邮箱: ${reg.email}\n`);
                if (reg.referral_url) this.terminal.write(`  链接: ${reg.referral_url}\n`);

                this.terminal.write('\n=== 注册人 ===\n');
                if (regtant.organization) this.terminal.write(`  组织: ${regtant.organization}\n`);
                if (regtant.country) this.terminal.write(`  国家: ${regtant.country}\n`);
                if (regtant.email) this.terminal.write(`  邮箱: ${regtant.email}\n`);

                if (tech && (tech.email || Object.keys(tech).length > 0)) {
                    this.terminal.write('\n=== 技术联系 ===\n');
                    if (tech.email) this.terminal.write(`  邮箱: ${tech.email}\n`);
                }

                this.terminal.write('\n');
            } catch (err) {
                this.terminal.write(`whois: 请求错误: ${err.message || '未知错误'}\n`);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('Whois', '远程 whois 失败', err);
                }
            }
        },

        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;
            await new Promise(r => setTimeout(r, 200));

            if (!this.pid) return;
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {}
            }
            if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                try {
                    await ProcessMgr.killProgram(this.pid, false);
                } catch (e) {}
            }
        },

        __exit__: async function() {
            this.terminal = null;
        }
    };

    if (typeof window !== 'undefined') {
        window.WHOIS = WHOIS;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.WHOIS = WHOIS;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__('APPLICATION_SHARED_POOL')) {
                POOL.__INIT__('APPLICATION_SHARED_POOL');
            }
            POOL.__ADD__('APPLICATION_SHARED_POOL', 'WHOIS', WHOIS);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('Whois', `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }
})(window);
