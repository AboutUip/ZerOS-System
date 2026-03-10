/**
 * NodeLibs 脚本：perf
 * 采集宿主（运行 Node 的机器）的完整性能指标，单行 JSON 输出到 stdout。
 * 若已安装 systeminformation（npm install -g），会额外采集 CPU/内存/负载/显卡/系统等增强指标到 si 字段。
 * 由 nodeLibExec 白名单 scriptId=perf 调用，不接收参数；前端从接口返回的 data.stdout 解析 JSON。
 * @see docs/PLUGINS/nodeLibs/perf.md
 */
(function () {
    'use strict';

    function safe(fn, fallback) {
        try {
            var v = fn();
            return v !== undefined && v !== null ? v : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function safePromise(p, fallback) {
        if (p && typeof p.then === 'function') {
            return p.then(function (v) { return v; }).catch(function () { return fallback; });
        }
        return Promise.resolve(fallback);
    }

    var ts = Date.now();
    var tsHr = null;
    if (typeof process.hrtime.bigint === 'function') {
        tsHr = String(process.hrtime.bigint());
    }

    // ---------- process ----------
    var mem = null;
    if (typeof process.memoryUsage === 'function') {
        mem = safe(function () {
            var m = process.memoryUsage();
            return {
                rss: m.rss,
                heapTotal: m.heapTotal,
                heapUsed: m.heapUsed,
                external: m.external,
                arrayBuffers: typeof m.arrayBuffers === 'number' ? m.arrayBuffers : null
            };
        }, null);
    }

    var cpu = null;
    if (typeof process.cpuUsage === 'function') {
        cpu = safe(function () {
            var c = process.cpuUsage();
            return { user: c.user, system: c.system };
        }, null);
    }

    var processUptime = null;
    if (typeof process.uptime === 'function') {
        processUptime = safe(function () { return process.uptime(); }, null);
    }

    var resourceUsage = null;
    if (typeof process.resourceUsage === 'function') {
        resourceUsage = safe(function () {
            var r = process.resourceUsage();
            return {
                userCPUTime: r.userCPUTime,
                systemCPUTime: r.systemCPUTime,
                maxRSS: r.maxRSS,
                sharedMemorySize: r.sharedMemorySize,
                unsharedDataSize: r.unsharedDataSize,
                unsharedStackSize: r.unsharedStackSize,
                minorPageFault: r.minorPageFault,
                majorPageFault: r.majorPageFault,
                swappedOut: r.swappedOut,
                fsRead: r.fsRead,
                fsWrite: r.fsWrite,
                involuntaryContextSwitches: r.involuntaryContextSwitches
            };
        }, null);
    }

    var nodeVersion = safe(function () { return process.version; }, null);
    var nodeVersions = safe(function () { return process.versions; }, null);

    // ---------- os ----------
    var os = null;
    try {
        var osModule = require('os');
        var cpus = safe(function () { return osModule.cpus(); }, []);
        var cpusFlat = null;
        if (Array.isArray(cpus) && cpus.length > 0) {
            cpusFlat = cpus.map(function (c) {
                return {
                    model: c.model,
                    speed: c.speed,
                    times: c.times ? {
                        user: c.times.user,
                        nice: c.times.nice,
                        sys: c.times.sys,
                        idle: c.times.idle,
                        irq: c.times.irq
                    } : null
                };
            });
        }
        os = {
            platform: safe(function () { return osModule.platform(); }, null),
            release: safe(function () { return osModule.release(); }, null),
            type: safe(function () { return osModule.type(); }, null),
            arch: safe(function () { return osModule.arch(); }, null),
            hostname: safe(function () { return osModule.hostname(); }, null),
            uptime: safe(function () { return osModule.uptime(); }, null),
            freemem: safe(function () { return osModule.freemem(); }, null),
            totalmem: safe(function () { return osModule.totalmem(); }, null),
            loadavg: safe(function () { return osModule.loadavg(); }, null),
            cpusCount: Array.isArray(cpus) ? cpus.length : 0,
            cpus: cpusFlat,
            endianness: safe(function () { return osModule.endianness(); }, null),
            homedir: safe(function () { return osModule.homedir(); }, null),
            tmpdir: safe(function () { return osModule.tmpdir(); }, null)
        };
    } catch (e) {
        os = { error: e.message || String(e) };
    }

    var out = {
        ts: ts,
        tsHr: tsHr,
        process: {
            memory: mem,
            cpuUsage: cpu,
            uptime: processUptime,
            resourceUsage: resourceUsage,
            nodeVersion: nodeVersion,
            versions: nodeVersions
        },
        os: os
    };

    // ---------- 性能指标库 systeminformation（可选，已安装则增强输出） ----------
    var siModule = null;
    try {
        siModule = require('systeminformation');
    } catch (e) { /* 未安装则跳过 */ }

    if (siModule && typeof siModule.cpu === 'function') {
        Promise.all([
            safePromise(siModule.cpu(), null),
            safePromise(siModule.mem(), null),
            safePromise(siModule.currentLoad(), null),
            safePromise(siModule.graphics(), null),
            safePromise(siModule.osInfo(), null),
            safePromise(siModule.system(), null)
        ]).then(function (results) {
            out.si = {
                cpu: results[0],
                mem: results[1],
                currentLoad: results[2],
                graphics: results[3],
                osInfo: results[4],
                system: results[5]
            };
            try {
                console.log(JSON.stringify(out));
            } catch (err) {
                console.error(JSON.stringify({ error: err.message || String(err), ts: ts }));
                process.exit(1);
            }
        }).catch(function () {
            try {
                console.log(JSON.stringify(out));
            } catch (err) {
                console.error(JSON.stringify({ error: err.message || String(err), ts: ts }));
                process.exit(1);
            }
        });
    } else {
        try {
            console.log(JSON.stringify(out));
        } catch (e) {
            console.error(JSON.stringify({ error: e.message || String(e), ts: ts }));
            process.exit(1);
        }
    }
})();
