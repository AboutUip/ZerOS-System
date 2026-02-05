class Particle{
    constructor(x,y,ax = 0,ay = 0,vx = 0,vy = 0){
        this.x = x;
        this.y = y;
        this.base = Math.sqrt(Config.ParticleNumber);
        this.G = Config.Gravity;
        this.restitution = 0.9;
        this.radius = 0.5;
        this.mass = 1;
        this.groundFriction = Config.GroundFriction ?? 0.15;
        this.groundThreshold = 1; // y <= 此值视为贴地，施加摩擦力
        this.V = { vx : vx, vy : vy };
        this.A = { ax : ax, ay : ay };
        this.lastUpdate = Config.GroupBaseTime;
    }
    // 反向粒子速度
    reverseX(){
        this.V.vx = -this.V.vx;
    }
    reverseY(){
        // 翻转并衰减速度
        this.V.vy = -this.V.vy * this.restitution;
        // 重置时间基准（避免数值累积导致抖动）
        this.lastUpdate = Config.GroupBaseTime;
    }
    // 信息获取：返回当前状态，控制台输出单行便于快速查看
    getState(){
        const gx = this.gridX(), gy = this.gridY();
        const state = {
            pos: [this.x.toFixed(2), this.y.toFixed(2)],
            grid: [gx, gy],
            vel: [this.V.vx.toFixed(2), this.V.vy.toFixed(2)],
            t: this.lastUpdate
        };
        console.log(`Particle | pos=(${state.pos.join(',')}) grid=(${gx},${gy}) vel=(${state.vel.join(',')}) t=${state.t}`);
        return state;
    }
    // 渲染粒子（坐标越界时 getParticleXY 返回 false，不设置 innerHTML）
    rander(x,y,display = false){
        const el = Util.getParticleXY(x, y);
        if (el === false) return false;
        if(display){
            el.innerHTML = `<div></div>`;
            return true;
        }
        el.innerHTML = '';
        return false;
    }
    gridX(){ return Math.floor(this.x); }
    gridY(){ return Math.floor(this.y); }

    // 仅清除当前格渲染
    clearRender(){
        this.rander(this.gridX(), this.gridY(), false);
    }
    // 仅在当前格绘制
    render(){
        this.rander(this.gridX(), this.gridY(), true);
    }
    // 在指定坐标格绘制（用于插值显示，不修改 this.x/this.y）
    renderAt(x, y){
        const gx = Math.floor(x);
        const gy = Math.floor(y);
        this.rander(gx, gy, true);
        return { gx, gy };
    }

    // 与另一粒子做碰撞响应（弹性碰撞 + 分离重叠）；两球心距 < 2*radius 时调用
    resolveCollision(other){
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const distSq = dx * dx + dy * dy;
        const sumR = this.radius + other.radius;
        if (distSq >= sumR * sumR || distSq < 1e-12) return;
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const vRel = (this.V.vx - other.V.vx) * nx + (this.V.vy - other.V.vy) * ny;
        if (vRel >= 0) return; // 正在分离，不处理
        const e = Math.min(this.restitution, other.restitution);
        const m1 = this.mass;
        const m2 = other.mass;
        const j = -(1 + e) * vRel / (1 / m1 + 1 / m2);
        this.V.vx += (j / m1) * nx;
        this.V.vy += (j / m1) * ny;
        other.V.vx -= (j / m2) * nx;
        other.V.vy -= (j / m2) * ny;
        const overlap = sumR - dist;
        const half = overlap * 0.5;
        this.x -= half * nx;
        this.y -= half * ny;
        other.x += half * nx;
        other.y += half * ny;
        const maxY = Math.min(this.base, other.base) - 1e-9; // 上边界，略小于 base 以保证格坐标有效
        if (this.y < 0) this.y = 0;
        if (other.y < 0) other.y = 0;
        if (this.y > maxY) this.y = maxY;
        if (other.y > maxY) other.y = maxY;
        // 贴地且仍在同一格时强制错行，避免全挤在 floor(y)=0 的一行
        const groundRow = 1;
        if (this.y <= groundRow && other.y <= groundRow && Math.floor(this.y) === Math.floor(other.y)) {
            if (this.y <= other.y) other.y = Math.min(maxY, Math.max(other.y, this.y + sumR));
            else this.y = Math.min(maxY, Math.max(this.y, other.y + sumR));
        }
    }

    // 仅做物理步进（重力、边界、横向），不渲染
    advance(dt){
        if(dt <= 0) return;

        // 真实物理：y=0 地面，y 向上为正；重力 a = -g（g>0），v' = v - g*dt，y' = y + v*dt - 0.5*g*dt^2
        const g = this.G;
        const e = this.restitution;
        const maxY = this.base - 1e-9; // 上边界，略小于 base 以保证格坐标 y < base 有效
        let y = this.y;
        let vy = this.V.vy;
        let tLeft = dt;
        let bounceLeft = 20;

        while (tLeft > 1e-9 && bounceLeft-- > 0) {
            // 自由落体：y_new = y + vy*t - 0.5*g*t^2，vy_new = vy - g*t
            const yNew = y + vy * tLeft - 0.5 * g * tLeft * tLeft;
            const vyNew = vy - g * tLeft;

            if (yNew >= 0 && yNew <= maxY) {
                y = yNew;
                vy = vyNew;
                break;
            }

            if (yNew < 0) {
                // 碰地：y + vy*t - 0.5*g*t^2 = 0 => t = (vy + sqrt(vy^2+2gy))/g（取正根，下落先着地）
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
                // 碰顶：求 t 使 y + vy*t - 0.5*g*t^2 = maxY
                const disc = vy * vy - 2 * g * (y - maxY);
                if (disc <= 0) {
                    y = maxY;
                    if (vy > 0) vy = -vy * e; // 已贴顶且仍向上，强制反弹向下，避免吸顶
                    break;
                }
                const tHit = (vy - Math.sqrt(disc)) / g;
                if (tHit >= tLeft || tHit <= 0) {
                    y = maxY;
                    if (vy > 0) vy = -vy * e; // tHit<=0 表示已在顶或穿出，强制向下
                    break;
                }
                const vImpact = vy - g * tHit;
                y = maxY;
                vy = -vImpact * e;
                tLeft -= tHit;
                continue;
            }
        }

        this.y = Math.max(0, Math.min(maxY, y));
        this.V.vy = vy;

        // 地面摩擦力：贴地时横向速度衰减
        if (this.y <= this.groundThreshold) {
            this.V.vx *= (1 - this.groundFriction);
            if (Math.abs(this.V.vx) < 1e-3) this.V.vx = 0;
        }

        // 横向运动：x' = x + vx*dt + 0.5*ax*dt^2，vx' = vx + ax*dt
        const ax = this.A.ax;
        let dx = this.V.vx * dt + 0.5 * ax * (dt ** 2);
        this.V.vx = this.V.vx + ax * dt;
        let newX = this.x + dx;
        const maxX = this.base;
        let wallBounce = 20;
        while ((newX < 0 || newX >= maxX) && wallBounce-- > 0) {
            if (newX < 0) {
                newX = -newX;
                this.V.vx = -this.V.vx * this.restitution;
            }
            if (newX >= maxX) {
                newX = 2 * maxX - newX;
                this.V.vx = -this.V.vx * this.restitution;
            }
        }
        this.x = newX;
        this.lastUpdate = Config.GroupBaseTime;
    }

    // 完整一帧：清格 → 物理步进 → 绘制；多粒子时由主循环统一 clear → advance → resolve → render
    update(){
        this.clearRender();
        const dt = Config.GroupBaseTime - this.lastUpdate;
        if(dt <= 0){
            this.render();
            return;
        }
        this.advance(dt);
        this.render();
    }
}

// 网格空间分区：格大小须 ≤ 碰撞直径，否则会漏检；堆叠时多轮分离
const CELL_SIZE = 1;
const RESOLVE_PASSES = 2;
/** @returns {number} 本帧碰撞检测对数（供性能面板显示） */
function resolveCollisions(parts){
    if (parts.length <= 1) return 0;
    let pairCount = 0;
    for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
        const grid = Object.create(null);
        const key = (cx, cy) => cx + ',' + cy;
        parts.forEach(p => {
            const k = key(Math.floor(p.x / CELL_SIZE), Math.floor(p.y / CELL_SIZE));
            if (!grid[k]) grid[k] = [];
            grid[k].push(p);
        });
        for (const k in grid) {
            const list = grid[k];
            for (let i = 0; i < list.length; i++)
                for (let j = i + 1; j < list.length; j++) {
                    list[i].resolveCollision(list[j]);
                    pairCount++;
                }
            const [cx, cy] = k.split(',').map(Number);
            [[cx+1,cy],[cx,cy+1],[cx+1,cy+1],[cx-1,cy+1]].forEach(([nx,ny]) => {
                const nk = key(nx, ny);
                if (!grid[nk]) return;
                list.forEach(a => grid[nk].forEach(b => {
                    a.resolveCollision(b);
                    pairCount++;
                }));
            });
        }
    }
    return pairCount;
}