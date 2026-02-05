// 负责页面渲染
const View = {
    // 对象元素池
    __POOL__ : {
        // 粒子外层容器
        ParticleElem : (document.createElement('div')),
        // 微粒子容器
        ParticleColl : (document.createElement('div')),
        // 主容器
        MainColl : (document.querySelector('.Particle-Container'))
    },
    // 初始化
    __init__ : function(){
        // 初始化数据
        Config.ParticleNumber = (Config.GroupBaseNumber / Config.GroupBaseWidth) ** 2;
        // 初始化微粒子容器
        this.__POOL__.ParticleColl.className = 'Unit-Particle';
        this.__POOL__.ParticleElem.className = 'Particle-Container';
        this.__POOL__.ParticleColl.style.width = `${Config.GroupBaseWidth}px`;
        this.__POOL__.ParticleColl.style.height = `${Config.GroupBaseWidth}px`;
        this.__POOL__.MainColl.style.width = `${Config.GroupBaseNumber}px`;
        this.__POOL__.MainColl.style.height = `${Config.GroupBaseNumber}px`;
        for(let i = 0;i < Config.ParticleNumber;i++){
            this.__POOL__.ParticleElem.appendChild(
                // 采用克隆粒子容器
                this.__POOL__.ParticleColl.cloneNode(true)
            );
        }
        this.__POOL__.MainColl.innerHTML = this.__POOL__.ParticleElem.innerHTML;
        // 获取索引容器
        this.__POOL__.ParticleElem = document.querySelectorAll('.Unit-Particle');
    }
};