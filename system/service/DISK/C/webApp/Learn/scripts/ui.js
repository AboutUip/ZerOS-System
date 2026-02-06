/**
 * UI 模块：性能分析、数据报告、粒子状态检查
 */
const UI = (function () {
    const ids = {
        fps: 'ui-fps',
        frameMs: 'ui-frame-ms',
        particleCount: 'ui-particle-count',
        collisionPairs: 'ui-collision-pairs',
        uptime: 'ui-uptime',
        avgVel: 'ui-avg-vel',
        groundCount: 'ui-ground-count',
        exportBtn: 'ui-export-report',
        particleSelect: 'ui-particle-select',
        addParticle: 'ui-add-particle',
        removeParticle: 'ui-remove-particle',
        pos: 'ui-pos',
        grid: 'ui-grid',
        vel: 'ui-vel',
        lastT: 'ui-last-t'
    };

    let partsRef = [];
    const groundThreshold = 1;

    function el(id) { return document.getElementById(id); }

    function formatNum(v, decimals) {
        if (v == null || Number.isNaN(v)) return '—';
        return Number(v).toFixed(decimals);
    }

    /**
     * 初始化：填充粒子下拉框、绑定导出与选择变更
     * @param {Particle[]} parts
     */
    function init(parts) {
        partsRef = parts;
        const select = el(ids.particleSelect);
        if (!select) return;

        select.innerHTML = '';
        parts.forEach((_, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = '粒子 ' + i;
            select.appendChild(opt);
        });

        select.addEventListener('change', function () {
            updateStateDetail(partsRef[parseInt(select.value, 10)]);
        });

        el(ids.exportBtn).addEventListener('click', exportReport);

        el(ids.addParticle).addEventListener('click', onAddParticle);
        el(ids.removeParticle).addEventListener('click', onRemoveParticle);

        refreshParticleSelect();
    }

    /** 根据当前 partsRef 重填粒子下拉框并保持选中有效 */
    function refreshParticleSelect() {
        const select = el(ids.particleSelect);
        if (!select) return;
        const parts = partsRef;
        const prevIdx = parseInt(select.value, 10);
        select.innerHTML = '';
        parts.forEach((_, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = '粒子 ' + i;
            select.appendChild(opt);
        });
        if (parts.length === 0) {
            updateStateDetail(null);
            return;
        }
        const newIdx = (Number.isNaN(prevIdx) || prevIdx >= parts.length) ? 0 : Math.min(prevIdx, parts.length - 1);
        select.selectedIndex = newIdx;
        updateStateDetail(parts[newIdx]);
    }

    function onAddParticle() {
        if (!window.Sim || typeof window.Sim.addParticle !== 'function') return;
        const p = window.Sim.addParticle();
        if (!p) return; // 已达上限
        refreshParticleSelect();
        el(ids.particleSelect).selectedIndex = partsRef.length - 1;
        updateStateDetail(partsRef[partsRef.length - 1]);
    }

    function onRemoveParticle() {
        if (!window.Sim || typeof window.Sim.removeParticle !== 'function') return;
        const select = el(ids.particleSelect);
        const idx = parseInt(select.value, 10);
        if (partsRef.length === 0 || Number.isNaN(idx) || idx < 0 || idx >= partsRef.length) return;
        window.Sim.removeParticle(idx);
        refreshParticleSelect();
    }

    /**
     * 更新单个粒子的状态详情区域（不调用 getState，避免控制台刷屏）
     */
    function updateStateDetail(p) {
        if (!p) {
            el(ids.pos).textContent = '—';
            el(ids.grid).textContent = '—';
            el(ids.vel).textContent = '—';
            el(ids.lastT).textContent = '—';
            return;
        }
        el(ids.pos).textContent = `(${formatNum(p.x, 2)}, ${formatNum(p.y, 2)})`;
        el(ids.grid).textContent = `(${p.gridX()}, ${p.gridY()})`;
        el(ids.vel).textContent = `(${formatNum(p.V.vx, 2)}, ${formatNum(p.V.vy, 2)})`;
        el(ids.lastT).textContent = String(p.lastUpdate);
    }

    /**
     * 每帧更新所有面板数据
     * @param {Object} m - { fps, frameMs, particleCount, collisionPairs, uptime, avgVel, groundCount, parts }
     */
    function update(m) {
        if (m.fps != null) el(ids.fps).textContent = formatNum(m.fps, 1);
        if (m.frameMs != null) el(ids.frameMs).textContent = formatNum(m.frameMs, 2);
        if (m.particleCount != null) el(ids.particleCount).textContent = m.particleCount;
        if (m.collisionPairs != null) el(ids.collisionPairs).textContent = m.collisionPairs;
        if (m.uptime != null) el(ids.uptime).textContent = formatNum(m.uptime, 1);
        if (m.avgVel != null) el(ids.avgVel).textContent = formatNum(m.avgVel, 2);
        if (m.groundCount != null) el(ids.groundCount).textContent = m.groundCount;

        const idx = parseInt(el(ids.particleSelect).value, 10);
        if (!Number.isNaN(idx) && m.parts && m.parts[idx]) {
            updateStateDetail(m.parts[idx]);
        }
    }

    /**
     * 导出当前数据报告（JSON + 文本摘要）
     */
    function exportReport() {
        const parts = partsRef;
        const now = performance.now() / 1000;
        let uptime = 0;
        let avgVel = 0;
        let groundCount = 0;
        if (typeof window.__simStartTime__ === 'number') {
            uptime = now - window.__simStartTime__;
        }
        if (parts.length > 0) {
            let sumSpeed = 0;
            parts.forEach(p => {
                sumSpeed += Math.sqrt(p.V.vx * p.V.vx + p.V.vy * p.V.vy);
                if (p.y <= groundThreshold) groundCount++;
            });
            avgVel = sumSpeed / parts.length;
        }

        const report = {
            exportTime: new Date().toISOString(),
            uptimeSeconds: Math.round(uptime * 10) / 10,
            particleCount: parts.length,
            groundCount,
            averageVelocity: Math.round(avgVel * 100) / 100,
            particles: parts.map((p, i) => ({
                index: i,
                x: Math.round(p.x * 100) / 100,
                y: Math.round(p.y * 100) / 100,
                gridX: p.gridX(),
                gridY: p.gridY(),
                vx: Math.round(p.V.vx * 100) / 100,
                vy: Math.round(p.V.vy * 100) / 100,
                lastUpdate: p.lastUpdate
            }))
        };

        const json = JSON.stringify(report, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'particle-report-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    return { init, update };
})();
