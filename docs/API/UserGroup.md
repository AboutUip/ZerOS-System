# UserGroup API 文档

## 概述

`UserGroup` 是 ZerOS 内核的用户组管理系统，负责管理用户组和管理员组，与 `UserControl` 兼容。支持创建组、添加/移除成员、查询组成员等操作，并提供严格的权限管控。

## 依赖

- `LStorage` - 本地存储（用于持久化组数据）
- `UserControl` - 用户控制系统（用于用户级别检查和用户验证）
- `PermissionManager` - 权限管理器（用于进程权限检查）
- `ProcessManager` - 进程管理器（用于获取当前进程 ID）

## 组类型

系统支持两种组类型：

- **USER_GROUP** (`GROUP_TYPE.USER_GROUP`): 普通用户组，包含普通用户
- **ADMIN_GROUP** (`GROUP_TYPE.ADMIN_GROUP`): 管理员组，包含管理员用户

## 默认组

系统会自动创建以下默认组：

- **admins**: 管理员组，包含所有管理员用户（ADMIN 和 DEFAULT_ADMIN 级别）
- **users**: 普通用户组，包含所有普通用户（USER 级别）

**注意**: 默认组不能被删除。

## 权限管控

### 进程级别权限检查

所有公共 API 方法都会进行进程权限检查：

- **写入操作**（创建组、删除组、添加/移除成员等）：需要 `SYSTEM_STORAGE_WRITE_USER_CONTROL` 权限
- **读取操作**（查询组、获取成员列表等）：需要 `SYSTEM_STORAGE_READ_USER_CONTROL` 权限
- **内核模块调用**：通过调用栈验证，允许访问（无需权限检查）

### 用户级别权限检查

- **创建组**：需要管理员权限
- **创建管理员组**：需要默认管理员权限
- **删除组**：需要默认管理员权限
- **管理组成员**：需要管理员权限
- **同步默认组**：需要管理员权限

### 存储保护

- 组数据存储在 `LStorage` 的 `userControl.groups` 键中
- `userControl.groups` 键被标记为危险键，需要相应的权限才能访问
- 只有 `UserGroup` 内核模块可以写入该键（通过调用栈验证）

## 初始化

用户组系统在系统启动时自动初始化：

```javascript
await UserGroup.init();
```

## API 方法

### 初始化

#### `init()`

初始化用户组系统，加载组数据并创建默认组。

**返回值**: `Promise<void>`

**示例**:
```javascript
await UserGroup.init();
```

#### `ensureInitialized()`

确保用户组系统已初始化。

**返回值**: `Promise<void>`

**示例**:
```javascript
await UserGroup.ensureInitialized();
```

### 组管理

#### `createGroup(groupName, type, description)`

创建新组（需要进程权限 + 管理员权限）。

**参数**:
- `groupName` (string): 组名
- `type` (string, 可选): 组类型（`GROUP_TYPE.USER_GROUP` 或 `GROUP_TYPE.ADMIN_GROUP`），默认为 `USER_GROUP`
- `description` (string, 可选): 组描述

**返回值**: `Promise<boolean>` - 是否创建成功

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：管理员权限（创建管理员组需要默认管理员权限）

**示例**:
```javascript
// 创建普通用户组
const success = await UserGroup.createGroup('developers', UserGroup.GROUP_TYPE.USER_GROUP, '开发人员组');

// 创建管理员组（需要默认管理员权限）
const success = await UserGroup.createGroup('superAdmins', UserGroup.GROUP_TYPE.ADMIN_GROUP, '超级管理员组');
```

#### `deleteGroup(groupName)`

删除组（需要进程权限 + 默认管理员权限）。

**参数**:
- `groupName` (string): 组名

**返回值**: `Promise<boolean>` - 是否删除成功

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：默认管理员权限

**注意**: 不能删除默认组（`admins` 和 `users`）。

**示例**:
```javascript
const success = await UserGroup.deleteGroup('developers');
```

#### `getGroup(groupName)`

获取组信息（需要读取权限）。

**参数**:
- `groupName` (string): 组名

**返回值**: `Promise<Object | null>` - 组信息对象，包含：
- `name` (string): 组名
- `type` (string): 组类型
- `members` (Array<string>): 成员列表
- `createdAt` (number): 创建时间戳
- `description` (string | null): 组描述

如果组不存在则返回 `null`。

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const group = await UserGroup.getGroup('admins');
console.log(group);
// {
//   name: 'admins',
//   type: 'ADMIN_GROUP',
//   members: ['root'],
//   createdAt: 1234567890000,
//   description: '系统管理员组，包含所有管理员用户'
// }
```

#### `getAllGroups()`

获取所有组（需要读取权限）。

**返回值**: `Promise<Array<Object>>` - 组列表，每个组对象包含：
- `name` (string): 组名
- `type` (string): 组类型
- `members` (Array<string>): 成员列表
- `createdAt` (number): 创建时间戳
- `description` (string | null): 组描述

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const groups = await UserGroup.getAllGroups();
console.log(groups);
// [
//   { name: 'admins', type: 'ADMIN_GROUP', members: ['root'], ... },
//   { name: 'users', type: 'USER_GROUP', members: ['TestUser'], ... }
// ]
```

#### `hasGroup(groupName)`

检查组是否存在（需要读取权限）。

**参数**:
- `groupName` (string): 组名

**返回值**: `Promise<boolean>` - 是否存在

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const exists = await UserGroup.hasGroup('developers');
if (exists) {
    console.log('组存在');
}
```

#### `getGroupType(groupName)`

获取组类型（需要读取权限）。

**参数**:
- `groupName` (string): 组名

**返回值**: `Promise<string | null>` - 组类型（`USER_GROUP` 或 `ADMIN_GROUP`），如果组不存在则返回 `null`

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const type = await UserGroup.getGroupType('admins');
console.log(type); // 'ADMIN_GROUP'
```

#### `updateGroupDescription(groupName, description)`

更新组描述（需要进程权限 + 管理员权限）。

**参数**:
- `groupName` (string): 组名
- `description` (string | null): 新描述（`null` 表示移除描述）

**返回值**: `Promise<boolean>` - 是否更新成功

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：管理员权限

**示例**:
```javascript
const success = await UserGroup.updateGroupDescription('developers', '开发人员组（更新）');
```

### 成员管理

#### `addMember(groupName, username)`

添加成员到组（需要进程权限 + 管理员权限）。

**参数**:
- `groupName` (string): 组名
- `username` (string): 用户名

**返回值**: `Promise<boolean>` - 是否添加成功

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：管理员权限

**注意**: 如果用户已存在于组中，返回 `true`（视为成功）。

**示例**:
```javascript
const success = await UserGroup.addMember('developers', 'NewUser');
```

#### `removeMember(groupName, username)`

从组中移除成员（需要进程权限 + 管理员权限）。

**参数**:
- `groupName` (string): 组名
- `username` (string): 用户名

**返回值**: `Promise<boolean>` - 是否移除成功

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：管理员权限

**注意**: 如果用户不存在于组中，返回 `true`（视为成功）。

**示例**:
```javascript
const success = await UserGroup.removeMember('developers', 'NewUser');
```

#### `getMembers(groupName)`

获取组成员列表（需要读取权限）。

**参数**:
- `groupName` (string): 组名

**返回值**: `Promise<Array<string>>` - 成员列表

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const members = await UserGroup.getMembers('admins');
console.log(members); // ['root']
```

#### `isMember(groupName, username)`

检查用户是否在组中（需要读取权限）。

**参数**:
- `groupName` (string): 组名
- `username` (string): 用户名

**返回值**: `Promise<boolean>` - 是否在组中

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const isMember = await UserGroup.isMember('admins', 'root');
if (isMember) {
    console.log('用户在组中');
}
```

#### `getUserGroups(username)`

获取用户所在的所有组（需要读取权限）。

**参数**:
- `username` (string): 用户名

**返回值**: `Promise<Array<string>>` - 组名列表

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const groups = await UserGroup.getUserGroups('root');
console.log(groups); // ['admins']
```

#### `getMemberCount(groupName)`

获取组中的成员数量（需要读取权限）。

**参数**:
- `groupName` (string): 组名

**返回值**: `Promise<number>` - 成员数量

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_READ_USER_CONTROL`

**示例**:
```javascript
const count = await UserGroup.getMemberCount('admins');
console.log(`管理员组有 ${count} 个成员`);
```

### 批量操作

#### `addMembers(groupName, usernames)`

批量添加成员到组（需要进程权限 + 管理员权限）。

**参数**:
- `groupName` (string): 组名
- `usernames` (Array<string>): 用户名列表

**返回值**: `Promise<Object>` - 操作结果对象，包含：
- `success` (number): 成功添加的成员数
- `failed` (number): 失败的成员数
- `errors` (Array<string>): 错误信息列表

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：管理员权限

**示例**:
```javascript
const result = await UserGroup.addMembers('developers', ['User1', 'User2', 'User3']);
console.log(`成功: ${result.success}, 失败: ${result.failed}`);
// 成功: 3, 失败: 0
```

#### `removeMembers(groupName, usernames)`

批量从组中移除成员（需要进程权限 + 管理员权限）。

**参数**:
- `groupName` (string): 组名
- `usernames` (Array<string>): 用户名列表

**返回值**: `Promise<Object>` - 操作结果对象，包含：
- `success` (number): 成功移除的成员数
- `failed` (number): 失败的成员数
- `errors` (Array<string>): 错误信息列表

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：管理员权限

**示例**:
```javascript
const result = await UserGroup.removeMembers('developers', ['User1', 'User2']);
console.log(`成功: ${result.success}, 失败: ${result.failed}`);
// 成功: 2, 失败: 0
```

### 同步操作

#### `syncDefaultGroups()`

同步默认组（根据 UserControl 中的用户级别更新默认组）（需要进程权限 + 管理员权限）。

将管理员用户添加到 `admins` 组，将普通用户添加到 `users` 组。

**返回值**: `Promise<boolean>` - 是否同步成功

**权限要求**:
- 进程权限：`SYSTEM_STORAGE_WRITE_USER_CONTROL`
- 用户权限：管理员权限

**示例**:
```javascript
const success = await UserGroup.syncDefaultGroups();
if (success) {
    console.log('默认组已同步');
}
```

## 使用示例

### 完整的组管理流程

```javascript
// 1. 确保用户组系统已初始化
await UserGroup.ensureInitialized();

// 2. 创建新组
const success = await UserGroup.createGroup('developers', UserGroup.GROUP_TYPE.USER_GROUP, '开发人员组');
if (success) {
    console.log('组创建成功');
}

// 3. 添加成员
await UserGroup.addMember('developers', 'User1');
await UserGroup.addMember('developers', 'User2');

// 4. 获取组信息
const group = await UserGroup.getGroup('developers');
console.log('组信息:', group);

// 5. 检查用户是否在组中
const isMember = await UserGroup.isMember('developers', 'User1');
if (isMember) {
    console.log('User1 在开发人员组中');
}

// 6. 获取用户所在的所有组
const userGroups = await UserGroup.getUserGroups('User1');
console.log('User1 所在的组:', userGroups);

// 7. 批量添加成员
const result = await UserGroup.addMembers('developers', ['User3', 'User4']);
console.log(`批量添加结果: 成功 ${result.success}, 失败 ${result.failed}`);

// 8. 同步默认组
await UserGroup.syncDefaultGroups();
```

### 权限检查示例

```javascript
// 检查程序是否有权限访问 UserGroup API
// 需要先通过 PermissionManager 获得相应权限

// 在程序的 __info__ 中声明所需权限
__info__: {
    permissions: [
        PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL,  // 读取组信息
        PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL  // 管理组
    ]
}

// 使用 UserGroup API
await UserGroup.ensureInitialized();

// 尝试创建组（如果缺少权限，会返回 false 并记录警告日志）
const success = await UserGroup.createGroup('testGroup');
if (!success) {
    console.error('创建组失败：可能是权限不足');
}
```

## 注意事项

1. **权限要求**: 所有操作都需要相应的进程权限（通过 `PermissionManager`）和用户权限（通过 `UserControl`）
2. **默认组**: 系统会自动创建 `admins` 和 `users` 默认组，这些组不能被删除
3. **数据持久化**: 组数据存储在 `LStorage` 的 `userControl.groups` 键中
4. **与 UserControl 的兼容性**: UserGroup 与 UserControl 完全兼容，会自动验证用户是否存在
5. **初始化顺序**: 用户组系统依赖 `LStorage` 和 `UserControl`，确保这些模块已初始化后再使用
6. **存储保护**: `userControl.groups` 键只能由 `UserGroup` 内核模块写入（通过调用栈验证），用户程序无法直接修改
7. **成员验证**: 添加成员时会自动检查用户是否存在于 `UserControl` 中
8. **进程权限检查**: 所有公共 API 方法都会进行进程权限检查，只有通过 `PermissionManager` 获得相应权限的程序才能访问

## 相关文档

- [UserControl.md](./UserControl.md) - 用户控制系统 API
- [LStorage.md](./LStorage.md) - 本地存储 API
- [PermissionManager.md](./PermissionManager.md) - 权限管理 API
- [ProcessManager.md](./ProcessManager.md) - 进程管理 API

