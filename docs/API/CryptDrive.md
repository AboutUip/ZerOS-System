# CryptDrive API 文档

## 概述

`CryptDrive` 是 ZerOS 内核的加密驱动管理器，提供完整的加密、解密和随机数生成功能。支持 RSA 加密/解密（基于 jsencrypt 库）、MD5 哈希、以及多种随机数生成方法。实现了密钥对的生命周期管理、有效期跟踪和持久化存储。

## 依赖

- `LStorage` - 本地存储管理器（用于密钥持久化）
- `DynamicManager` - 动态模块管理器（用于加载 jsencrypt 库）
- `KernelLogger` - 内核日志系统（用于日志记录）

## 初始化

加密驱动在系统启动时自动初始化，无需手动调用。

```javascript
// 自动初始化（在 BootLoader 中）
await CryptDrive.init();
```

## 权限要求

所有加密功能都通过 `ProcessManager.callKernelAPI` 调用，需要相应的权限：

- **CRYPT_GENERATE_KEY** (特殊权限): 生成密钥对
- **CRYPT_IMPORT_KEY** (特殊权限): 导入密钥对
- **CRYPT_DELETE_KEY** (特殊权限): 删除密钥
- **CRYPT_ENCRYPT** (特殊权限): 加密数据
- **CRYPT_DECRYPT** (特殊权限): 解密数据
- **CRYPT_MD5** (普通权限): MD5 哈希
- **CRYPT_RANDOM** (普通权限): 随机数生成

特殊权限需要用户确认，首次使用时弹出权限请求对话框。

## 通过 ProcessManager 调用

所有加密功能都通过 `ProcessManager.callKernelAPI` 调用：

```javascript
// 获取 ProcessManager
const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");

// 生成密钥对
const keyPair = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.generateKeyPair',
    [{ keySize: 1024, description: '我的密钥对' }]
);
```

## 密钥管理

### 密钥数据结构

密钥存储在 `D:/LocalSData.json` 的 `system.cryptDrive.keys` 中：

```javascript
{
    keys: {
        [keyId: string]: {
            publicKey: string,      // 公钥（PEM 格式）
            privateKey: string,    // 私钥（PEM 格式）
            createdAt: number,     // 创建时间戳
            expiresAt: number | null,  // 过期时间戳（null 表示永不过期）
            description: string,   // 描述
            tags: string[]         // 标签
        }
    },
    defaultKeyId: string | null   // 默认密钥ID
}
```

### 密钥生命周期管理

- 密钥支持设置过期时间，过期后自动清理
- 系统启动时自动清理过期密钥
- 密钥操作时会检查是否过期

## API 方法

### 密钥管理

#### `Crypt.generateKeyPair(options)`

生成 RSA 密钥对。

**参数**:
- `options` (Object, 可选): 选项
  - `keySize` (number, 默认 1024): 密钥长度（位）
  - `keyId` (string, 可选): 密钥ID（默认自动生成）
  - `expiresIn` (number, 可选): 过期时间（毫秒，null 表示永不过期）
  - `description` (string, 可选): 描述
  - `tags` (string[], 可选): 标签
  - `setAsDefault` (boolean, 默认 false): 是否设置为默认密钥

**返回值**: `Promise<Object>` - `{ keyId, publicKey, privateKey }`

**权限**: `CRYPT_GENERATE_KEY`

**示例**:
```javascript
const keyPair = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.generateKeyPair',
    [{
        keySize: 2048,
        description: '主密钥对',
        expiresIn: 365 * 24 * 60 * 60 * 1000,  // 1年后过期
        tags: ['main', 'production'],
        setAsDefault: true
    }]
);

console.log(`密钥ID: ${keyPair.keyId}`);
console.log(`公钥: ${keyPair.publicKey}`);
```

#### `Crypt.importKeyPair(publicKey, privateKey, options)`

导入密钥对。

**参数**:
- `publicKey` (string): 公钥（PEM 格式）
- `privateKey` (string): 私钥（PEM 格式）
- `options` (Object, 可选): 选项
  - `keyId` (string, 可选): 密钥ID（默认自动生成）
  - `expiresIn` (number, 可选): 过期时间（毫秒，null 表示永不过期）
  - `description` (string, 可选): 描述
  - `tags` (string[], 可选): 标签
  - `setAsDefault` (boolean, 默认 false): 是否设置为默认密钥

**返回值**: `Promise<string>` - 密钥ID

**权限**: `CRYPT_IMPORT_KEY`

**示例**:
```javascript
const keyId = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.importKeyPair',
    [
        '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
        '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
        {
            description: '导入的密钥对',
            setAsDefault: false
        }
    ]
);
```

#### `Crypt.getKeyInfo(keyId)`

获取密钥信息（不包含私钥）。

**参数**:
- `keyId` (string, 可选): 密钥ID（默认使用默认密钥）

**返回值**: `Promise<Object|null>` - 密钥信息或 null

**权限**: 无需权限（读取操作）

**示例**:
```javascript
const keyInfo = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.getKeyInfo',
    ['key_1234567890']
);

if (keyInfo) {
    console.log(`公钥: ${keyInfo.publicKey}`);
    console.log(`创建时间: ${new Date(keyInfo.createdAt)}`);
    console.log(`过期时间: ${keyInfo.expiresAt ? new Date(keyInfo.expiresAt) : '永不过期'}`);
    console.log(`描述: ${keyInfo.description}`);
    console.log(`标签: ${keyInfo.tags.join(', ')}`);
    console.log(`是否默认: ${keyInfo.isDefault}`);
}
```

#### `Crypt.listKeys()`

列出所有密钥（不包含私钥）。

**返回值**: `Promise<Array<Object>>` - 密钥信息数组

**权限**: 无需权限（读取操作）

**示例**:
```javascript
const keys = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.listKeys',
    []
);

keys.forEach(key => {
    console.log(`${key.keyId}: ${key.description} (${key.isDefault ? '默认' : ''})`);
});
```

#### `Crypt.deleteKey(keyId)`

删除密钥。

**参数**:
- `keyId` (string): 密钥ID

**返回值**: `Promise<boolean>` - 是否成功

**权限**: `CRYPT_DELETE_KEY`

**示例**:
```javascript
const success = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.deleteKey',
    ['key_1234567890']
);
```

#### `Crypt.setDefaultKey(keyId)`

设置默认密钥。

**参数**:
- `keyId` (string): 密钥ID

**返回值**: `Promise<boolean>` - 是否成功

**权限**: `CRYPT_DELETE_KEY`

**示例**:
```javascript
const success = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.setDefaultKey',
    ['key_1234567890']
);
```

### 加密/解密

#### `Crypt.encrypt(data, keyId, publicKey)`

RSA 加密数据。

**参数**:
- `data` (string): 要加密的数据
- `keyId` (string, 可选): 密钥ID（默认使用默认密钥）
- `publicKey` (string, 可选): 公钥（如果提供则使用此公钥，忽略 keyId）

**返回值**: `Promise<string>` - 加密后的数据（Base64）

**权限**: `CRYPT_ENCRYPT`

**示例**:
```javascript
// 使用默认密钥加密
const encrypted = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.encrypt',
    ['Hello, World!']
);

// 使用指定密钥加密
const encrypted2 = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.encrypt',
    ['Hello, World!', 'key_1234567890']
);

// 使用提供的公钥加密
const encrypted3 = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.encrypt',
    ['Hello, World!', null, '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----']
);
```

#### `Crypt.decrypt(encryptedData, keyId, privateKey)`

RSA 解密数据。

**参数**:
- `encryptedData` (string): 加密的数据（Base64）
- `keyId` (string, 可选): 密钥ID（默认使用默认密钥）
- `privateKey` (string, 可选): 私钥（如果提供则使用此私钥，忽略 keyId）

**返回值**: `Promise<string>` - 解密后的数据

**权限**: `CRYPT_DECRYPT`

**示例**:
```javascript
// 使用默认密钥解密
const decrypted = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.decrypt',
    [encrypted]
);

// 使用指定密钥解密
const decrypted2 = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.decrypt',
    [encrypted, 'key_1234567890']
);
```

### 哈希

#### `Crypt.md5(data)`

计算 MD5 哈希值。

**参数**:
- `data` (string): 要哈希的数据

**返回值**: `Promise<string>` - MD5 哈希值（十六进制）

**权限**: `CRYPT_MD5`

**示例**:
```javascript
const hash = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.md5',
    ['Hello, World!']
);

console.log(`MD5: ${hash}`);  // 输出: ed076287532e86365e841e92bfc50d8c
```

### 随机数生成

#### `Crypt.randomInt(min, max)`

生成随机整数。

**参数**:
- `min` (number): 最小值（包含）
- `max` (number): 最大值（包含）

**返回值**: `Promise<number>` - 随机整数

**权限**: `CRYPT_RANDOM`

**示例**:
```javascript
const random = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomInt',
    [1, 100]
);

console.log(`随机数: ${random}`);  // 输出: 1-100 之间的随机整数
```

#### `Crypt.randomFloat(min, max)`

生成随机浮点数。

**参数**:
- `min` (number): 最小值（包含）
- `max` (number): 最大值（不包含）

**返回值**: `Promise<number>` - 随机浮点数

**权限**: `CRYPT_RANDOM`

**示例**:
```javascript
const random = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomFloat',
    [0, 1]
);

console.log(`随机数: ${random}`);  // 输出: 0-1 之间的随机浮点数
```

#### `Crypt.randomBoolean()`

生成随机布尔值。

**返回值**: `Promise<boolean>` - 随机布尔值

**权限**: `CRYPT_RANDOM`

**示例**:
```javascript
const random = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomBoolean',
    []
);

console.log(`随机布尔值: ${random}`);  // 输出: true 或 false
```

#### `Crypt.randomString(length, charset)`

生成随机字符串。

**参数**:
- `length` (number): 长度
- `charset` (string, 可选): 字符集（默认: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'）

**返回值**: `Promise<string>` - 随机字符串

**权限**: `CRYPT_RANDOM`

**示例**:
```javascript
// 生成 16 位随机字符串
const random = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomString',
    [16]
);

// 生成只包含数字的随机字符串
const randomNum = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomString',
    [8, '0123456789']
);
```

#### `Crypt.randomChoice(array)`

从数组中随机选择一个元素。

**参数**:
- `array` (Array): 数组

**返回值**: `Promise<*>` - 随机元素

**权限**: `CRYPT_RANDOM`

**示例**:
```javascript
const choice = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomChoice',
    [['apple', 'banana', 'orange']]
);

console.log(`随机选择: ${choice}`);  // 输出: apple, banana 或 orange
```

#### `Crypt.shuffle(array)`

打乱数组（Fisher-Yates 洗牌算法）。

**参数**:
- `array` (Array): 数组

**返回值**: `Promise<Array>` - 打乱后的数组（新数组）

**权限**: `CRYPT_RANDOM`

**示例**:
```javascript
const shuffled = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.shuffle',
    [[1, 2, 3, 4, 5]]
);

console.log(`打乱后: ${shuffled}`);  // 输出: [3, 1, 5, 2, 4] 等随机顺序
```

## 完整示例

### 示例 1: 密钥对生成和加密/解密

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 生成密钥对
    const keyPair = await ProcessManager.callKernelAPI(
        pid,
        'Crypt.generateKeyPair',
        [{
            keySize: 2048,
            description: '应用密钥对',
            setAsDefault: true
        }]
    );
    
    this.keyId = keyPair.keyId;
    
    // 加密数据
    const encrypted = await ProcessManager.callKernelAPI(
        pid,
        'Crypt.encrypt',
        ['敏感数据']
    );
    
    // 解密数据
    const decrypted = await ProcessManager.callKernelAPI(
        pid,
        'Crypt.decrypt',
        [encrypted]
    );
    
    console.log(`原始: 敏感数据`);
    console.log(`加密: ${encrypted}`);
    console.log(`解密: ${decrypted}`);
}
```

### 示例 2: MD5 哈希和随机数生成

```javascript
// 计算文件哈希
const fileContent = await ProcessManager.callKernelAPI(
    this.pid,
    'FileSystem.read',
    ['D:/data/file.txt']
);

const hash = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.md5',
    [fileContent]
);

console.log(`文件 MD5: ${hash}`);

// 生成随机密码
const password = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomString',
    [16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*']
);

console.log(`随机密码: ${password}`);
```

### 示例 3: 密钥管理

```javascript
// 列出所有密钥
const keys = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.listKeys',
    []
);

console.log(`共有 ${keys.length} 个密钥:`);
keys.forEach(key => {
    console.log(`- ${key.keyId}: ${key.description} ${key.isDefault ? '(默认)' : ''}`);
});

// 设置默认密钥
if (keys.length > 0) {
    await ProcessManager.callKernelAPI(
        this.pid,
        'Crypt.setDefaultKey',
        [keys[0].keyId]
    );
}

// 删除过期密钥
for (const key of keys) {
    if (key.expiresAt && key.expiresAt < Date.now()) {
        await ProcessManager.callKernelAPI(
            this.pid,
            'Crypt.deleteKey',
            [key.keyId]
        );
    }
}
```

## 注意事项

1. **密钥安全**: 私钥存储在 `LocalSData.json` 中，请确保文件系统安全
2. **密钥长度**: RSA 密钥长度建议使用 2048 位或更高，1024 位仅用于测试
3. **数据长度限制**: RSA 加密有数据长度限制，建议加密的数据不超过密钥长度（字节）- 11 字节
4. **过期管理**: 系统启动时自动清理过期密钥，但建议定期检查密钥状态
5. **MD5 安全性**: MD5 已不再安全，仅用于数据完整性校验，不应用于密码哈希
6. **随机数质量**: 随机数生成使用浏览器原生 `Math.random()`，适合一般用途，但不适合加密用途

## 相关文档

- [ProcessManager API](./ProcessManager.md) - 进程管理和 API 调用
- [PermissionManager API](./PermissionManager.md) - 权限管理
- [LStorage API](./LStorage.md) - 本地存储管理
- [DynamicManager API](../DEVELOPER_GUIDE.md#动态模块管理器) - 动态模块加载

