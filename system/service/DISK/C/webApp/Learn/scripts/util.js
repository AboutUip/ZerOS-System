// 负责通用工具类
const Util = {
    // 获取对应微粒子容器
    getParticleXY : function(x,y){
        // 确定范围
        const baseMaxNumber = Math.sqrt(Config.ParticleNumber);
        const baseMinNumber = 0;
        if(
            (x < baseMinNumber || x >= baseMaxNumber) ||
            (y < baseMinNumber || y >= baseMaxNumber) 
        ){
            // 无效范围
            return false;
        }
        // 计算总数
        let count = 0;
        y = y * baseMaxNumber;
        x = baseMaxNumber - x;
        count = Config.ParticleNumber - (y + x);
        return View.__POOL__.ParticleElem.item(count);
    },
    // 创建粒子
    createParticle : function(){

    },
    /**
     * 调试用：生成 N 个随机粒子（需在 View.__init__() 之后调用）
     * @param {number} N 粒子数量
     * @param {object} opt 可选：{ vxMax, vyMax } 速度范围，默认 ±5
     * @returns {Particle[]}
     */
    createRandomParticles : function(N, opt){
        const base = Math.sqrt(Config.ParticleNumber);
        const margin = 1;
        const vxMax = (opt && opt.vxMax != null) ? opt.vxMax : 5;
        const vyMax = (opt && opt.vyMax != null) ? opt.vyMax : 5;
        const list = [];
        for (let i = 0; i < N; i++) {
            const x = margin + Math.random() * (base - 2 * margin);
            const y = margin + Math.random() * (base - 2 * margin);
            const vx = (Math.random() * 2 - 1) * vxMax;
            const vy = (Math.random() * 2 - 1) * vyMax;
            list.push(new Particle(x, y, 0, 0, vx, vy));
        }
        return list;
    }
};