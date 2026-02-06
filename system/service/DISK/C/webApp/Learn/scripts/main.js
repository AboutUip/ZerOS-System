const MAX_PARTICLES = 1000;

function main(){
    View.__init__();

    const Parts = Util.createRandomParticles(100);

    /** 仿真 API：供 UI 动态添加/移除粒子 */
    window.Sim = {
        getParts: function () { return Parts; },
        addParticle: function () {
            if (Parts.length >= MAX_PARTICLES) return null;
            const p = Util.createRandomParticles(1)[0];
            Parts.push(p);
            return p;
        },
        removeParticle: function (index) {
            if (index < 0 || index >= Parts.length) return;
            Parts[index].clearRender();
            Parts.splice(index, 1);
        }
    };

    window.__simStartTime__ = performance.now() / 1000;
    UI.init(Parts);

    let lastTime = performance.now() / 1000;
    const maxDt = 0.05; // 单帧最大 dt，避免长时间未刷新时一步过大
    const groundThreshold = 1;

    function tick(){
        const now = performance.now() / 1000;
        let dt = now - lastTime;
        lastTime = now;
        if (dt <= 0) { requestAnimationFrame(tick); return; }
        if (dt > maxDt) dt = maxDt;

        Config.GroupBaseTime = now;
        Parts.forEach(p => { p.clearRender(); p.advance(dt); });
        const collisionPairs = resolveCollisions(Parts);
        Parts.forEach(p => p.render());

        // 性能与数据指标
        const frameMs = dt * 1000;
        const fps = 1 / dt;
        const uptime = now - window.__simStartTime__;
        let avgVel = 0;
        let groundCount = 0;
        if (Parts.length > 0) {
            let sumSpeed = 0;
            Parts.forEach(p => {
                sumSpeed += Math.sqrt(p.V.vx * p.V.vx + p.V.vy * p.V.vy);
                if (p.y <= groundThreshold) groundCount++;
            });
            avgVel = sumSpeed / Parts.length;
        }

        UI.update({
            fps,
            frameMs,
            particleCount: Parts.length,
            collisionPairs,
            uptime,
            avgVel,
            groundCount,
            parts: Parts
        });

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}
window.onload = main;