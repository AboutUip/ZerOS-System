/**
 * 粒子计算线程：仅做物理步进（重力、边界、横向、粒子间碰撞），不访问 DOM。
 * 主线程传入 parts 与 dt，本线程返回更新后的 x,y,vx,vy,lastUpdate。
 */

function advanceOne(p, dt) {
    if (dt <= 0) return;
    const g = p.G;
    const e = p.restitution;
    const maxY = p.base;
    let y = p.y;
    let vy = p.vy;
    let tLeft = dt;

    while (tLeft > 1e-9) {
        const yNew = y + vy * tLeft - 0.5 * g * tLeft * tLeft;
        const vyNew = vy - g * tLeft;

        if (yNew >= 0 && yNew <= maxY) {
            y = yNew;
            vy = vyNew;
            break;
        }

        if (yNew < 0) {
            const disc = vy * vy + 2 * g * y;
            if (disc <= 0) { y = 0; vy = 0; break; }
            const tHit = (vy + Math.sqrt(disc)) / g;
            if (!(tHit > 0 && tHit < tLeft)) { y = yNew; vy = vyNew; break; }
            const vImpact = vy - g * tHit;
            y = 0;
            vy = -vImpact * e;
            tLeft -= tHit;
            continue;
        }

        if (yNew > maxY) {
            const disc = vy * vy - 2 * g * (y - maxY);
            if (disc <= 0) { y = yNew; vy = vyNew; break; }
            const tHit = (vy - Math.sqrt(disc)) / g;
            if (tHit >= tLeft || tHit <= 0) { y = yNew; vy = vyNew; break; }
            const vImpact = vy - g * tHit;
            y = maxY;
            vy = -vImpact * e;
            tLeft -= tHit;
            continue;
        }
    }

    p.y = Math.max(0, Math.min(maxY, y));
    p.vy = vy;

    let vx = p.vx;
    const groundFriction = p.groundFriction ?? 0.15;
    const groundThreshold = p.groundThreshold ?? 1;
    if (p.y <= groundThreshold) {
        vx *= (1 - groundFriction);
        if (Math.abs(vx) < 1e-3) vx = 0;
    }

    const ax = p.ax;
    const base = p.base;
    let dx = vx * dt + 0.5 * ax * (dt ** 2);
    vx = vx + ax * dt;
    let newX = p.x + dx;
    while (newX < 0 || newX >= base) {
        if (newX < 0) {
            newX = -newX;
            vx = -vx * e;
        }
        if (newX >= base) {
            newX = 2 * base - newX;
            vx = -vx * e;
        }
    }
    p.x = newX;
    p.vx = vx;
    p.lastUpdate = p.groupBaseTime;
}

function resolveCollisionsWorker(parts) {
    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i];
            const b = parts[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            const sumR = a.radius + b.radius;
            if (distSq >= sumR * sumR || distSq < 1e-12) continue;
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            const vRel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (vRel >= 0) continue;
            const e = Math.min(a.restitution, b.restitution);
            const m1 = a.mass;
            const m2 = b.mass;
            const impulse = -(1 + e) * vRel / (1 / m1 + 1 / m2);
            a.vx += (impulse / m1) * nx;
            a.vy += (impulse / m1) * ny;
            b.vx -= (impulse / m2) * nx;
            b.vy -= (impulse / m2) * ny;
            const overlap = sumR - dist;
            const half = overlap * 0.5;
            a.x -= half * nx;
            a.y -= half * ny;
            b.x += half * nx;
            b.y += half * ny;
        }
    }
}

self.onmessage = function (ev) {
    const { parts, dt, groupBaseTime } = ev.data;
    if (!parts || !parts.length) {
        self.postMessage({ parts: [] });
        return;
    }
    parts.forEach(p => {
        p.groupBaseTime = groupBaseTime;
        advanceOne(p, dt);
    });
    resolveCollisionsWorker(parts);
    self.postMessage({
        parts: parts.map(p => ({
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            lastUpdate: p.lastUpdate
        }))
    });
};
