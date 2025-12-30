# UserControl API 文档

## 概述

`UserControl` 是 ZerOS 内核的用户控制系统，负责管理用户账户、权限级别和权限授权控制。支持用户级别管理、密码管理（MD5 加密）、头像管理和用户重命名等功能。

## 依赖

- `LStorage` - 本地存储（用于持久化用户数据）
- `CryptDrive` - 加密驱动（用于密码 MD5 加密）

## 用户级别

系统支持三种用户级别：

- **USER** (`USER_LEVEL.USER`): 普通用户，无法授权高风险权限给程序
- **ADMIN** (`USER_LEVEL.ADMIN`): 管理员，拥有完全控制权限
- **DEFAULT_ADMIN** (`USER_LEVEL.DEFAULT_ADMIN`): 默认管理员（系统最高权限），默认用户名为 `root`

## 高风险权限

普通用户无法授权以下高风险权限（只有管理员用户才能授权）：

- `CRYPT_GENERATE_KEY` - 生成密钥对
- `CRYPT_IMPORT_KEY` - 导入密钥对
- `CRYPT_DELETE_KEY` - 删除密钥
- `CRYPT_ENCRYPT` - 加密数据
- `CRYPT_DECRYPT` - 解密数据
- `PROCESS_MANAGE` - 管理进程
- `SYSTEM_STORAGE_WRITE_USER_CONTROL` - 写入用户控制相关存储（**注意：`userControl.users` 键只能由内核模块写入，用户程序即使获得此权限也无法写入该键**）
- `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` - 写入权限控制相关存储

## 初始化

用户控制系统在系统启动时自动初始化：

```javascript
await UserControl.init();
```

## API 方法

### 初始化

#### `init()`

初始化用户控制系统，加载用户数据并创建默认用户。

**返回值**: `Promise<void>`

**示例**:
```javascript
await UserControl.init();
```

#### `ensureInitialized()`

确保用户控制系统已初始化（公共方法）。

**返回值**: `Promise<void>`

**示例**:
```javascript
await UserControl.ensureInitialized();
```

### 用户登录

#### `login(username, password)`

登录用户。

**参数**:
- `username` (string): 用户名
- `password` (string, 可选): 密码（如果用户有密码则必须提供）

**返回值**: `Promise<boolean>` - 是否登录成功

**示例**:
```javascript
// 无密码用户登录
const success = await UserControl.login('root');

// 有密码用户登录
const success = await UserControl.login('TestUser', 'password123');
```

### 用户信息

#### `getCurrentUser()`

获取当前登录的用户名。

**返回值**: `string | null` - 当前用户名，如果未登录则返回 `null`

**示例**:
```javascript
const currentUser = UserControl.getCurrentUser();
console.log('当前用户:', currentUser); // 'root'
```

#### `getCurrentUserLevel()`

获取当前用户的级别。

**返回值**: `string | null` - 用户级别（`USER_LEVEL.USER`、`USER_LEVEL.ADMIN` 或 `USER_LEVEL.DEFAULT_ADMIN`），如果未登录则返回 `null`

**示例**:
```javascript
const level = UserControl.getCurrentUserLevel();
console.log('用户级别:', level); // 'DEFAULT_ADMIN'
```

#### `isAdmin()`

检查当前用户是否为管理员（包括默认管理员）。

**返回值**: `boolean` - 是否为管理员

**示例**:
```javascript
if (UserControl.isAdmin()) {
    console.log('当前用户是管理员');
}
```

#### `isDefaultAdmin()`

检查当前用户是否为默认管理员。

**返回值**: `boolean` - 是否为默认管理员

**示例**:
```javascript
if (UserControl.isDefaultAdmin()) {
    console.log('当前用户是默认管理员');
}
```

#### `getUserInfo(username)`

获取用户信息。

**参数**:
- `username` (string): 用户名

**返回值**: `Object | null` - 用户信息对象，包含：
- `level` (string): 用户级别
- `password` (string | null): MD5 加密后的密码（`null` 表示无密码）
- `avatar` (string | null): 头像文件名（存储在 `D:/cache/` 目录）
- `createdAt` (number): 创建时间戳
- `lastLogin` (number | null): 最后登录时间戳

**示例**:
```javascript
const userInfo = UserControl.getUserInfo('root');
console.log('用户信息:', userInfo);
// {
//   level: 'DEFAULT_ADMIN',
//   password: null,
//   avatar: 'avatar_root_1234567890.jpg',
//   createdAt: 1234567890000,
//   lastLogin: 1234567890000
// }
```

#### `listUsers()`

列出所有用户。

**返回值**: `Array<Object>` - 用户列表，每个用户对象包含：
- `username` (string): 用户名
- `level` (string): 用户级别
- `hasPassword` (boolean): 是否有密码
- `avatar` (string | null): 头像文件名

**示例**:
```javascript
const users = UserControl.listUsers();
console.log('所有用户:', users);
// [
//   { username: 'root', level: 'DEFAULT_ADMIN', hasPassword: false, avatar: null },
//   { username: 'TestUser', level: 'USER', hasPassword: true, avatar: 'avatar_TestUser_1234567890.jpg' }
// ]
```

### 密码管理

#### `hasPassword(username)`

检查用户是否有密码。

**参数**:
- `username` (string): 用户名

**返回值**: `boolean` - 是否有密码

**示例**:
```javascript
const hasPassword = UserControl.hasPassword('TestUser');
if (hasPassword) {
    console.log('用户有密码');
}
```

#### `setPassword(username, password, currentPassword)`

设置用户密码。

**参数**:
- `username` (string): 用户名
- `password` (string | null): 新密码（`null` 表示移除密码）
- `currentPassword` (string, 可选): 当前密码（非管理员用户修改自己密码时必须提供）

**返回值**: `Promise<boolean>` - 是否设置成功

**注意**:
- 管理员可以设置任何用户的密码，无需提供当前密码
- 非管理员用户修改自己的密码时，如果已有密码，必须提供当前密码
- 密码使用 MD5 加密后存储

**示例**:
```javascript
// 管理员设置用户密码
await UserControl.setPassword('TestUser', 'newpassword123');

// 非管理员用户修改自己的密码（需要提供当前密码）
await UserControl.setPassword('TestUser', 'newpassword123', 'oldpassword');

// 移除密码
await UserControl.setPassword('TestUser', null);
```

### 头像管理

#### `setAvatar(username, avatarPath)`

设置用户头像。

**参数**:
- `username` (string): 用户名
- `avatarPath` (string): 头像文件名（存储在 `D:/cache/` 目录）

**返回值**: `Promise<boolean>` - 是否设置成功

**注意**: 头像文件应已存在于 `D:/cache/` 目录中。

**示例**:
```javascript
await UserControl.setAvatar('root', 'avatar_root_1234567890.jpg');
```

#### `getAvatarPath(username)`

获取用户头像的完整 URL 路径。

**参数**:
- `username` (string): 用户名

**返回值**: `string | null` - 头像 URL 路径，如果用户没有头像则返回 `null`

**示例**:
```javascript
const avatarPath = UserControl.getAvatarPath('root');
console.log('头像路径:', avatarPath); // '/system/service/FSDirve.php?action=read_file&path=D:/cache/&fileName=avatar_root_1234567890.jpg&asBase64=true'
```

### 用户管理

#### `createUser(username, level)`

创建新用户（仅管理员）。

**参数**:
- `username` (string): 用户名
- `level` (string): 用户级别（`USER_LEVEL.USER` 或 `USER_LEVEL.ADMIN`）

**返回值**: `Promise<boolean>` - 是否创建成功

**示例**:
```javascript
await UserControl.createUser('NewUser', UserControl.USER_LEVEL.USER);
```

#### `deleteUser(username)`

删除用户（仅管理员）。

**参数**:
- `username` (string): 用户名

**返回值**: `Promise<boolean>` - 是否删除成功

**注意**: 不能删除当前登录的用户。

**示例**:
```javascript
await UserControl.deleteUser('TestUser');
```

#### `renameUser(oldUsername, newUsername)`

重命名用户（仅管理员）。

**参数**:
- `oldUsername` (string): 旧用户名
- `newUsername` (string): 新用户名

**返回值**: `Promise<boolean>` - 是否重命名成功

**注意**: 不能重命名当前登录的用户。

**示例**:
```javascript
await UserControl.renameUser('TestUser', 'NewTestUser');
```

### 权限控制

#### `isHighRiskPermission(permission)`

检查权限是否为高风险权限。

**参数**:
- `permission` (string): 权限名称

**返回值**: `boolean` - 是否为高风险权限

**示例**:
```javascript
const isHighRisk = UserControl.isHighRiskPermission('CRYPT_GENERATE_KEY');
if (isHighRisk) {
    console.log('这是高风险权限');
}
```

#### `canGrantPermission(userLevel, permissionLevel)`

检查用户级别是否可以授权指定级别的权限。

**参数**:
- `userLevel` (string): 用户级别
- `permissionLevel` (string): 权限级别（`NORMAL`、`SPECIAL` 或 `DANGEROUS`）

**返回值**: `boolean` - 是否可以授权

**示例**:
```javascript
const canGrant = UserControl.canGrantPermission(
    UserControl.USER_LEVEL.USER,
    'DANGEROUS'
);
if (!canGrant) {
    console.log('普通用户无法授权高风险权限');
}
```

#### `getPermissionGrantMessage(userLevel, permissionLevel)`

获取权限授权的提示消息。

**参数**:
- `userLevel` (string): 用户级别
- `permissionLevel` (string): 权限级别

**返回值**: `string` - 提示消息

**示例**:
```javascript
const message = UserControl.getPermissionGrantMessage(
    UserControl.USER_LEVEL.USER,
    'DANGEROUS'
);
console.log(message); // '普通用户无法授权高风险权限'
```

## 使用示例

### 完整的用户管理流程

```javascript
// 1. 确保用户控制系统已初始化
await UserControl.ensureInitialized();

// 2. 登录用户
const success = await UserControl.login('root');
if (success) {
    console.log('登录成功');
}

// 3. 检查用户级别
if (UserControl.isAdmin()) {
    // 4. 创建新用户
    await UserControl.createUser('NewUser', UserControl.USER_LEVEL.USER);
    
    // 5. 设置用户密码
    await UserControl.setPassword('NewUser', 'password123');
    
    // 6. 设置用户头像
    await UserControl.setAvatar('NewUser', 'avatar_NewUser_1234567890.jpg');
    
    // 7. 列出所有用户
    const users = UserControl.listUsers();
    console.log('所有用户:', users);
}
```

### 权限控制示例

```javascript
// 检查当前用户是否可以授权高风险权限
const currentLevel = UserControl.getCurrentUserLevel();
const canGrant = UserControl.canGrantPermission(currentLevel, 'DANGEROUS');

if (!canGrant) {
    const message = UserControl.getPermissionGrantMessage(currentLevel, 'DANGEROUS');
    console.warn(message);
    // 输出: '普通用户无法授权高风险权限'
}
```

## 注意事项

1. **密码加密**: 所有密码使用 MD5 加密后存储，不会以明文形式保存
2. **默认用户**: 系统会自动创建默认管理员 `root`（无密码）和测试用户 `TestUser`（无密码）
3. **数据持久化**: 用户数据存储在 `LStorage` 的 `userControl.users` 键中
4. **头像存储**: 用户头像文件存储在 `D:/cache/` 目录，文件名格式为 `avatar_{username}_{timestamp}.{ext}`
5. **权限限制**: 普通用户无法授权高风险权限，只有管理员可以授权所有权限
6. **初始化顺序**: 用户控制系统依赖 `LStorage`，确保 `LStorage` 已初始化后再使用
7. **`userControl.users` 键保护**: `userControl.users` 键只能由 `UserControl` 内核模块写入，用户程序无法直接修改，即使获得相关权限也不行。这是为了防止权限提升攻击
8. **用户组管理**: 可以使用 `UserGroup` 模块管理用户组，详见 [UserGroup API](./UserGroup.md)

## 相关文档

- [UserGroup.md](./UserGroup.md) - 用户组管理系统 API
- [LStorage.md](./LStorage.md) - 本地存储 API
- [CryptDrive.md](./CryptDrive.md) - 加密驱动 API
- [PermissionManager.md](./PermissionManager.md) - 权限管理 API

