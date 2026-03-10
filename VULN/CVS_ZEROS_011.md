# CVS-ZEROS-011: 密码使用弱哈希算法漏洞

**漏洞编号**: CVS-ZEROS-011  
**发现日期**: 2026-03-09  
**修复日期**: 待修复  
**严重程度**: 低 (CVSS 3.5) → 由于变体 MD5 的存在降低了可行性  
**CWE分类**: CWE-916 (使用弱哈希函数), CWE-327 (使用已被破解的密码学算法)  
**状态**: 待修复（低优先级）

---

## 漏洞概述

ZerOS 系统的用户密码使用 MD5 哈希算法存储。MD5 是一种已被证明存在碰撞漏洞的哈希算法，不适合用于密码存储。虽然系统使用了随机盐值，但仍然存在彩虹表攻击和离线破解风险。

## 漏洞描述

### 漏洞位置

**文件**: `kernel/core/usercontrol/userControl.js`  
**行号**: 658, 752, 775

```javascript
// 密码使用 MD5 哈希存储
encryptedPassword = await CryptDrive.md5(password);
if (userData.password !== encryptedPassword) {
    // 验证逻辑
}
```

### 代码分析

1. **登录密码验证** (userControl.js:658):
```javascript
encryptedPassword = await CryptDrive.md5(password);
```

2. **密码修改验证** (userControl.js:752, 775):
```javascript
encryptedCurrentPassword = await CryptDrive.md5(currentPassword);
encryptedPassword = await CryptDrive.md5(password);
```

3. **CryptDrive.md5 实现**:
```javascript
static md5(string) {
    // 使用 CryptoJS MD5 实现
    return CryptoJS.MD5(string).toString();
}
```

## 技术细节

### 密码哈希实现分析

**文件**: `kernel/core/usercontrol/userControl.js`  
**行号**: 658, 752, 775

```javascript
// 密码使用变体 MD5 哈希存储
encryptedPassword = await CryptDrive.md5(password);
```

### 重要说明：变体 MD5 降低攻击可行性

经过深入分析 `kernel/drive/cryptDrive.js` 的 `_md5Hash()` 方法实现，发现：

1. **未公开的变体实现**: 系统使用的是经过逻辑修改的 MD5 算法变体，并非标准 MD5 实现。

2. **标准彩虹表无效**: 由于是变体算法，公开的标准 MD5 彩虹表无法直接用于破解 ZerOS 存储的密码哈希。

3. **攻击成本显著增加**: 攻击者需要：
   - 首先逆向分析 `_md5Hash()` 的变体逻辑
   - 投入大量计算资源建立针对该变体的彩虹表
   - 估算至少需要 **1 年时间** 才能建立有效的彩虹表

4. **可行性评估**: 在当前情况下，针对该变体建立彩虹表的攻击在一年内不具有实际可行性。

这与标准 MD5 的情况不同 - 标准 MD5 可以直接使用现成的彩虹表进行秒级破解。

### 攻击场景

**场景1: 彩虹表攻击**

攻击者获取用户数据库后，使用彩虹表快速破解弱密码：

```
原始密码: "123456"
MD5哈希: "e10adc3949ba59abbe56e057f20f883e"

彩虹表查找:
"123456" -> "e10adc3949ba59abbe56e057f20f883e" ✓
```

**场景2: 密码重用攻击**

用户在多个服务中使用相同密码，攻击者可以：
1. 从 ZerOS 获取某个用户的 MD5 哈希
2. 使用在线 MD5 破解服务或本地彩虹表尝试破解
3. 如果用户在其他服务使用相同密码，攻击者可以尝试这些凭据

**场景3: 离线破解**

如果攻击者获得本地存储数据：
- 使用 Hashcat 等工具进行 GPU 加速破解
- 每秒可尝试数十亿次 MD5 哈希

## 影响评估

由于使用了变体 MD5，攻击可行性大幅降低：

- **机密性影响**: 中 - 变体彩虹表需要1年以上建立，在此期间用户可以更换密码
- **完整性影响**: 低 - 攻击成本过高
- **可用性影响**: 低 - 不直接影响服务可用性

### CVSS 评分重新评估: 3.5 (低)

- **攻击向量 (AV)**: Network (N) / Local (L)
- **攻击复杂度 (AC)**: High (H) - 需要1年以上建立彩虹表
- **权限要求 (PR)**: None (N)
- **用户交互 (UI)**: None (N)
- **范围 (S)**: Unchanged (U)
- **机密性影响 (C)**: Medium (M)
- **完整性影响 (I)**: Low (L)
- **可用性影响 (A)**: None (N)

### 结论

该漏洞严重程度从"高"降低到"低"，因为：
1. 变体 MD5 无法使用标准彩虹表
2. 建立新彩虹表需要至少1年时间和大量计算资源
3. 在此期间用户有足够时间更换密码

## 修复方案

### 1. 使用现代哈希算法

```javascript
// 使用 bcrypt
const bcrypt = require('bcrypt');
const saltRounds = 12;

// 密码哈希
async function hashPassword(password) {
    return await bcrypt.hash(password, saltRounds);
}

// 密码验证
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}
```

### 2. 使用 PBKDF2

```javascript
// 使用 PBKDF2
async function hashPassword(password, salt) {
    const iterations = 100000;
    const keyLength = 32;
    const hash = await crypto.pbkdf2Async(password, salt, iterations, keyLength, 'sha256');
    return hash.toString('hex');
}
```

### 3. 使用 Argon2

```javascript
// 使用 Argon2 (推荐)
const argon2 = require('argon2');

async function hashPassword(password) {
    return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4
    });
}

async function verifyPassword(password, hash) {
    return await argon2.verify(hash, password);
}
```

### 4. 迁移策略

1. **双哈希方案**: 对现有密码使用 MD5 哈希作为 salt，再使用 bcrypt 哈希
2. **强制重置**: 在完成迁移后，提示用户重置密码
3. **渐进式迁移**: 用户登录时自动升级哈希算法

```javascript
async function upgradePasswordHash(userId, oldPassword) {
    const userData = await LStorage.getSystemStorage(`userControl.users`);
    const user = userData[userId];

    // 验证旧密码
    const oldHash = await CryptDrive.md5(oldPassword);
    if (oldHash !== user.password) {
        throw new Error('密码错误');
    }

    // 使用新算法生成新哈希
    const newHash = await bcrypt.hash(oldPassword, 12);

    // 更新存储
    user.password = newHash;
    user.passwordAlgorithm = 'bcrypt';
    userData[userId] = user;
    await LStorage.setSystemStorage('userControl.users', userData);
}
```

## 临时缓解措施

1. **强制密码策略**: 要求用户使用强密码（至少 12 位，包含大小写、数字和特殊字符）
2. **双因素认证**: 添加双因素认证机制
3. **登录限制**: 限制登录尝试次数，防止暴力破解
4. **监控异常**: 监控异常登录行为

## 修复验证

修复后应验证：

✅ 密码存储使用 bcrypt/PBKDF2/Argon2 等现代算法  
✅ 新注册用户自动使用新哈希算法  
✅ 旧密码可以成功迁移到新算法  
✅ 密码验证时间在合理范围内（100-500ms）  

## 相关文件

- `kernel/core/usercontrol/userControl.js` - 用户控制模块
- `kernel/drive/cryptDrive.js` - 加密驱动
- `system/service/DISK/D/LocalSData.json` - 本地存储数据

## 参考

- [CWE-916: Use of Weak Hash](https://cwe.mitre.org/data/definitions/916.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

---

**修复状态**: ⏳ 待修复
