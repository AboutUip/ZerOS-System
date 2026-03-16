# 聊天服务 API 规范

**文档版本**：1.0  
**状态**：正式  
**适用范围**：后端实现方须按本规范实现接口；前端/客户端按本规范对接。  
**产品范围**：核心聊天能力，仅包含私聊与群聊；不包含朋友圈、公众号、支付及其他非聊天功能。

---

## 1. 文档说明

### 1.1 目的与范围

本规范定义聊天服务对外暴露的 HTTP API 的路径、请求与响应格式、以及**后端处理逻辑**。后端在实现时须按「处理逻辑」章节逐步执行；未在本规范中规定的实现细节（存储结构、缓存策略、ID 生成方式等）由实现方自行决定，但不得违反本规范中的安全要求与数据模型约束。

### 1.2 术语与定义

| 术语 | 定义 |
|------|------|
| 鉴权 token | 会话令牌，由 `POST /chat/auth/sessionToken` 签发；后续除该接口及 `revokeToken` 外，所有接口均须携带。 |
| conversationId | 会话唯一标识；私聊对应两人之间的对话，群聊对应一个群。 |
| 实现方 | 负责实现本规范所定义接口的后端团队或系统。 |
| 实现文档 | 实现方编写的、对本规范的补充说明（如 conversationId 生成规则、扩展错误码列表）。 |

### 1.3 通用约定

| 项 | 规定 |
|----|------|
| Base URL | 由部署环境确定；必须带版本前缀，例如 `/api/v1`。 |
| 传输 | 必须使用 HTTPS；生产环境禁止明文 HTTP。 |
| 请求体 | `Content-Type: application/json`；参数以 JSON body 传递。 |
| 鉴权方式 | 二选一：请求头 `Authorization: Bearer <sessionToken>`，或 body 中传 `token`（string）。下文中「鉴权 token」均指该会话令牌。 |
| 需鉴权接口 | 除 5.1.1 获取临时会话令牌、5.1.2 释放会话令牌 外，其余接口均需鉴权。 |

---

## 2. 请求处理通则

所有需鉴权的接口在执行业务逻辑前，须按以下顺序执行；任一步骤失败则立即返回错误响应，不再执行后续步骤。

### 2.1 处理顺序

1. **限流**  
   按 IP 与（若已解析）用户/Token 检查是否超过限流阈值。超限则返回 HTTP 429 或 400，body 中 `code` 为 `RATE_LIMITED`（若扩展该 code，须在实现文档中说明）。

2. **鉴权**  
   从请求头或 body 中取出鉴权 token；校验 token 是否存在、未过期、且绑定到有效用户。失败则返回 HTTP 401，`code`: `INVALID_TOKEN`。

3. **参数校验**  
   校验必填参数存在、类型正确、长度与枚举在约定范围内。失败则返回 HTTP 400，`code`: `PARAM_INVALID`，`message` 中可指出具体参数名。

4. **业务权限与存在性**  
   校验当前用户是否有权对该资源执行该操作（例如是否在群内、是否为群主）。资源不存在或无权限则返回 HTTP 403，`code`: `FORBIDDEN` 或 `NOT_FOUND`。

5. **业务逻辑**  
   按各接口「处理逻辑」执行；写库、发通知等由实现方在满足本规范前提下自行实现。

6. **响应**  
   按各接口规定的响应体结构返回 HTTP 200 与 JSON body。

### 2.2 错误响应格式

HTTP 状态码非 2xx 时，响应 body 必须为：

```json
{
  "error": true,
  "code": "INVALID_TOKEN",
  "message": "登录已过期，请重新登录"
}
```

`code` 取值规定为以下之一：`INVALID_TOKEN`、`FORBIDDEN`、`PARAM_INVALID`、`NOT_FOUND`、`SERVER_ERROR`。实现方新增客户端可识别的错误码时须先更新本规范或实现文档。

### 2.3 安全要求（后端必须满足）

- **令牌**：会话 token 须随机且不可预测，服务端绑定用户与过期时间；敏感接口须校验 token 归属，越权返回 401。
- **限流**：对「获取 sessionToken」「发送消息」「同步消息」等接口按 IP 与用户/Token 限流，防止暴力枚举与 DoS。
- **输入**：字符串长度上限须在接口中明确（单条消息 ≤ 10KB）；类型字段须为枚举白名单；用户内容落库与输出须转义或使用安全格式，防止 XSS 与注入。
- **日志与隐私**：不得将 token、密钥、用户私聊内容写入明文日志；IP 以服务端连接或可信代理头为准，不以客户端传入 IP 作为唯一鉴权依据。

---

## 3. 数据模型（后端实现须符合）

- **用户**：userId、昵称、头像；与现有账号体系对接。
- **好友**：双向关系；删除即解除关系。解除后双方会话是否保留入口由实现方在实现文档中写明；若保留，历史消息可读但不可再发。
- **会话**：私聊会话由两个用户唯一确定，对应一个 conversationId；群聊会话一个群对应一个 conversationId。会话列表 = 当前用户参与的私聊并集当前用户所在群聊，按最后消息时间排序。
- **群**：群 id、群名、群头像、群公告、创建者（群主）、管理员列表、成员列表；群主可转让或解散群；群主与管理员可移除成员、审批入群申请。
- **消息**：messageId、会话 id、发送者、类型（text / image / file）、内容、时间。
- **申请**：好友申请（fromUserId → toUserId）、加群申请（userId → groupId）；状态为待处理、通过、拒绝 之一。

---

## 4. 接口规范

以下各接口除给出请求/响应外，均给出**处理逻辑**；后端须按该逻辑顺序执行。

---

### 4.1 鉴权与会话

#### 4.1.1 获取临时会话令牌

- **方法**：`POST`
- **路径**：`/chat/auth/sessionToken`
- **请求体**：
  - `hash`（string，必填）：客户端凭证（登录后下发的 secret 或 HMAC），服务端校验后签发会话 token；须防重放（绑定时间戳或 nonce）。
  - `ip`（string，可选）：客户端 IP，仅作日志与风控；鉴权以服务端获得的 IP 为准。
- **响应**：`token`（string）、`key`（string，可选；不采用端到端加密时不返回）。

**处理逻辑：**

1. 执行限流（按 IP）；超限则返回 429/400，`code`: `RATE_LIMITED`。
2. 校验 `hash` 必填、类型为 string；缺失或类型错误返回 400，`code`: `PARAM_INVALID`。
3. 使用现有账号体系校验 `hash` 是否合法、是否可解析出用户身份；不合法返回 401 或 400，`code`: `INVALID_TOKEN` 或 `PARAM_INVALID`。
4. 防重放：校验 nonce/时间戳未使用过且在有效窗口内；否则返回 400。
5. 生成随机、不可预测的会话 token，绑定当前用户与过期时间（约 30 分钟），持久化或写入缓存。
6. 若采用端到端加密，生成并返回 `key`；否则不返回 `key`。
7. 返回 HTTP 200，body：`{ "token": "<sessionToken>", "key": "<key>" }`（无 key 时省略 `key` 字段）。

---

#### 4.1.2 释放会话令牌

- **方法**：`POST`
- **路径**：`/chat/auth/revokeToken`
- **请求体**：`token`（string）
- **响应**：`valid`（boolean）

**处理逻辑：**

1. 校验 `token` 存在且为 string；缺失返回 400，`PARAM_INVALID`。
2. 查找该 token 对应的会话；存在则使该 token 失效（删除或标记过期），并返回 `{ "valid": true }`；不存在或已失效则仍返回 `{ "valid": true }`（幂等），或按实现方规定返回 `valid: false` 并在实现文档中说明。

---

### 4.2 用户信息

#### 4.2.1 获取当前用户信息

- **方法**：`POST`
- **路径**：`/chat/user/me`
- **请求体**：`token`（鉴权 token；或通过 Authorization 头传递）
- **响应**：至少包含 `userId`、`nickname`、`avatar`（string，头像 URL）。

**处理逻辑：**

1. 按 2.1 执行限流、鉴权；鉴权失败返回 401。
2. 从鉴权结果取得当前用户 id；查询用户表或现有账号体系，取出 userId、nickname、avatar。
3. 返回 HTTP 200，body 为上述字段组成的对象；字段名与类型须与规范一致。

---

#### 4.2.2 获取指定用户信息

- **方法**：`POST`
- **路径**：`/chat/user/info`
- **请求体**：`token`、`userId`（string）
- **响应**：`userId`、`nickname`、`avatar`。不允许查看时返回 HTTP 403，或仅返回实现方规定的可展示字段。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `userId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询 `userId` 对应用户是否存在；不存在返回 403 或 404，`NOT_FOUND`。
4. 按实现方策略判断当前用户是否有权查看目标用户资料（例如是否好友、是否同群）；无权限则返回 403，`FORBIDDEN`，或仅返回允许对外展示的字段。
5. 返回 HTTP 200，body 包含 `userId`、`nickname`、`avatar`。

---

### 4.3 好友

#### 4.3.1 发送好友申请

- **方法**：`POST`
- **路径**：`/chat/friend/request`
- **请求体**：`token`、`targetUserId`（string）、`message`（string，可选，长度上限 200 字符）
- **响应**：`valid`（boolean）。已存在好友或已有待处理申请时须返回 `valid: false` 且 `code` 为 `ALREADY_FRIEND` 或 `REQUEST_PENDING`（或实现文档中定义的等价错误码）。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `targetUserId` 必填且为 string；`message` 若存在则长度 ≤ 200。否则返回 400，`PARAM_INVALID`。
3. 校验 `targetUserId` 不等于当前用户 id；相等返回 400。
4. 查询目标用户是否存在；不存在返回 404，`NOT_FOUND`。
5. 查询当前用户与目标用户是否已是好友；已是好友返回 200，`{ "valid": false }`，并可选在 body 或扩展 code 中带 `ALREADY_FRIEND`（或按实现文档约定）。
6. 查询是否已存在当前用户发给目标用户的、状态为待处理的好友申请；存在则返回 200，`{ "valid": false }`，并可选带 `REQUEST_PENDING`。
7. 创建一条好友申请记录：fromUserId = 当前用户，toUserId = targetUserId，message = 入参 message，状态 = 待处理，createTime = 当前时间。
8. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.3.2 获取好友申请列表（我收到的）

- **方法**：`POST`
- **路径**：`/chat/friend/requestList`
- **请求体**：`token`；可选 `limit`（number）、`offset`（number）
- **响应**：`list`（array）、`total`（number）。list 中每项包含 `requestId`、`fromUserId`、`fromNickname`、`fromAvatar`、`message`、`createTime`。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 解析 `limit`、`offset`；缺省时使用实现方默认值（例如 limit=20，offset=0）；若传参则校验为非负整数。
3. 查询 toUserId = 当前用户 id 且状态 = 待处理的好友申请，按 createTime 倒序；总数记为 total，按 offset/limit 分页。
4. 对每条申请的 fromUserId 查询昵称、头像，拼装为 fromNickname、fromAvatar。
5. 返回 HTTP 200，`{ "list": [ ... ], "total": total }`。

---

#### 4.3.3 通过好友申请

- **方法**：`POST`
- **路径**：`/chat/friend/accept`
- **请求体**：`token`、`requestId`（string）
- **响应**：`valid`（boolean）。通过后双方成为好友，并建立或复用一条私聊会话。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `requestId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询该 requestId 对应的好友申请；不存在返回 404，`NOT_FOUND`。
4. 校验申请状态为待处理、且 toUserId = 当前用户（即当前用户是收到申请的一方）；否则返回 403，`FORBIDDEN`。
5. 将申请状态更新为通过；在好友关系中建立双向关系（用户 A–用户 B）。
6. 若尚未存在两人之间的私聊会话，则创建 conversationId 并建立会话记录；若已存在则复用。
7. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.3.4 拒绝好友申请

- **方法**：`POST`
- **路径**：`/chat/friend/reject`
- **请求体**：`token`、`requestId`（string）
- **响应**：`valid`（boolean）

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `requestId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询该 requestId 对应的好友申请；不存在返回 404，`NOT_FOUND`。
4. 校验申请状态为待处理、且 toUserId = 当前用户；否则返回 403，`FORBIDDEN`。
5. 将申请状态更新为拒绝。
6. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.3.5 获取好友列表

- **方法**：`POST`
- **路径**：`/chat/friend/list`
- **请求体**：`token`；可选 `limit`、`offset`
- **响应**：`list`（array，每项含 `userId`、`nickname`、`avatar`、`remark` 可选）、`total`（number）

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 解析并校验 `limit`、`offset`（非负整数，缺省用默认值）。
3. 查询与当前用户存在好友关系的所有用户 id，得到总数 total，按 offset/limit 分页。
4. 对每个好友 id 查询昵称、头像、备注（若实现方支持 remark）；拼装为 list。
5. 返回 HTTP 200，`{ "list": [ ... ], "total": total }`。

---

#### 4.3.6 删除好友

- **方法**：`POST`
- **路径**：`/chat/friend/delete`
- **请求体**：`token`、`friendUserId`（string）
- **响应**：`valid`（boolean）。删除后双方不再为好友；私聊会话是否保留、是否可查看历史由实现方在实现文档中规定。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `friendUserId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询当前用户与 friendUserId 是否存在好友关系；不存在返回 404，`NOT_FOUND`，或返回 200 `valid: false`（由实现方在实现文档中约定）。
4. 删除双向好友关系（删除两条记录或更新状态）。
5. 按实现方规定处理两人私聊会话：保留仅可读历史、或隐藏会话入口等；本规范不强制，须在实现文档中写明。
6. 返回 HTTP 200，`{ "valid": true }`。

---

### 4.4 群组

#### 4.4.1 创建群组

- **方法**：`POST`
- **路径**：`/chat/group/create`
- **请求体**：`token`、`name`（string，长度上限 50 字符）、`avatar`（string，可选）、`memberIds`（string[]，可选；不含创建者）
- **响应**：`groupId`（string）、`conversationId`（string）。若后端以 token 标识会话，则须同时返回 `chatToken`（string）；否则不返回 `chatToken`。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `name` 必填、为 string、长度 ≤ 50；`memberIds` 若存在须为 string 数组。否则返回 400，`PARAM_INVALID`。
3. 生成唯一 groupId；创建群记录：name、avatar、ownerId = 当前用户，memberCount = 1 + memberIds.length，创建时间等。
4. 将当前用户加入该群，角色为 owner（群主）。
5. 若 `memberIds` 非空，依次将各 userId 加入群（角色 member）；若某用户不存在或加入失败，按实现方规定记录并继续或中断；本规范不强制。
6. 生成或映射 conversationId（见第 5 节）；若使用 chatToken 则生成 chatToken 并绑定 conversationId。
7. 返回 HTTP 200，body 含 `groupId`、`conversationId`；若使用 chatToken 则含 `chatToken`。

---

#### 4.4.2 获取群信息

- **方法**：`POST`
- **路径**：`/chat/group/info`
- **请求体**：`token`、`groupId`（string）
- **响应**：`groupId`、`name`、`avatar`、`notice`（群公告）、`ownerId`、`memberCount`。仅当当前用户在群内时可调用；否则返回 HTTP 403。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在；不存在返回 404，`NOT_FOUND`。
4. 校验当前用户是否在该群成员列表中；不在则返回 403，`FORBIDDEN`。
5. 从群记录与成员表汇总 memberCount；拼装 name、avatar、notice、ownerId。
6. 返回 HTTP 200，body 含上述字段。

---

#### 4.4.3 获取群成员列表

- **方法**：`POST`
- **路径**：`/chat/group/members`
- **请求体**：`token`、`groupId`（string）；可选 `limit`、`offset`
- **响应**：`list`（array，每项含 `userId`、`nickname`、`avatar`、`role`：`"owner"`|`"admin"`|`"member"`）、`total`（number）

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填且为 string；解析 limit、offset。否则返回 400。
3. 查询群是否存在、当前用户是否在群内；不存在或不在群内返回 404/403。
4. 查询该群成员列表（含角色），总数 total，按 offset/limit 分页；对每个成员查昵称、头像。
5. 返回 HTTP 200，`{ "list": [ ... ], "total": total }`。

---

#### 4.4.4 邀请入群（拉人）

- **方法**：`POST`
- **路径**：`/chat/group/invite`
- **请求体**：`token`、`groupId`（string）、`userIds`（string[]）
- **响应**：`valid`（boolean），必填。可包含 `successIds`（string[]）、`failIds`（string[]）及每项失败原因码；失败原因码由实现方在实现文档中定义并列出全部取值。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填、`userIds` 必填且为 string 数组；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在、当前用户是否在群内且角色为 owner 或 admin；否则返回 404/403，`NOT_FOUND`/`FORBIDDEN`。
4. 遍历 userIds：对每个 userId，若已在群内则记入 failIds 并记录原因码（如 ALREADY_IN_GROUP）；若不在群内则执行加入逻辑（直接加入或写入待确认邀请，按实现方策略）；成功则记入 successIds，失败则记入 failIds 及原因码。
5. 返回 HTTP 200，`{ "valid": true }`，并可包含 successIds、failIds 及原因码；若全部失败也可返回 valid: false 并带 failIds。

---

#### 4.4.5 申请入群

- **方法**：`POST`
- **路径**：`/chat/group/apply`
- **请求体**：`token`、`groupId`（string）、`message`（string，可选）
- **响应**：`valid`（boolean）。群为「需要审批」时进入待审批列表；群为「直接加入」时直接入群并返回成功。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在；不存在返回 404，`NOT_FOUND`。
4. 校验当前用户不在群内；已在群内返回 400 或 200 valid: false，并带适当 code。
5. 若群配置为「需要审批」：创建入群申请记录（userId、groupId、message、状态=待处理）；返回 HTTP 200，`{ "valid": true }`。
6. 若群配置为「直接加入」：将当前用户加入群成员；创建或复用该群对应会话；返回 HTTP 200，`{ "valid": true }`。

---

#### 4.4.6 获取入群申请列表（群主/管理员可见）

- **方法**：`POST`
- **路径**：`/chat/group/applyList`
- **请求体**：`token`、`groupId`（string）；可选 `limit`、`offset`
- **响应**：`list`（array，每项含 `applyId`、`userId`、`nickname`、`avatar`、`message`、`createTime`）、`total`（number）。仅群主或管理员可调用。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填且为 string；解析 limit、offset。否则返回 400。
3. 查询群是否存在、当前用户是否在群内且角色为 owner 或 admin；否则返回 404/403。
4. 查询该群下状态为待处理的入群申请，按 createTime 倒序；总数 total，分页；对每条申请的 userId 查昵称、头像。
5. 返回 HTTP 200，`{ "list": [ ... ], "total": total }`。

---

#### 4.4.7 通过/拒绝入群申请

- **方法**：`POST`
- **路径**：`/chat/group/applyReply`
- **请求体**：`token`、`applyId`（string）、`accept`（boolean，true=通过，false=拒绝）
- **响应**：`valid`（boolean）。仅群主或管理员可操作。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `applyId` 必填、`accept` 必填且为 boolean；否则返回 400，`PARAM_INVALID`。
3. 查询 applyId 对应的入群申请；不存在返回 404，`NOT_FOUND`。
4. 校验申请状态为待处理、且申请所属 groupId 的群中当前用户角色为 owner 或 admin；否则返回 403，`FORBIDDEN`。
5. 若 accept === true：将申请人加入该群成员；更新申请状态为通过；若 accept === false：仅更新申请状态为拒绝。
6. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.4.8 退出群聊

- **方法**：`POST`
- **路径**：`/chat/group/leave`
- **请求体**：`token`、`groupId`（string）
- **响应**：`valid`（boolean）。群主不可调用本接口；须先转让群主或解散群。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在、当前用户是否在群内；不存在或不在群内返回 404/403。
4. 校验当前用户角色不是 owner（群主）；群主调用则返回 403，`FORBIDDEN`，message 可提示先转让或解散。
5. 将当前用户从群成员中移除；更新群 memberCount。
6. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.4.9 移除群成员（踢人）

- **方法**：`POST`
- **路径**：`/chat/group/removeMember`
- **请求体**：`token`、`groupId`（string）、`userId`（string，被移除用户 id）
- **响应**：`valid`（boolean）

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId`、`userId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在、当前用户是否在群内且角色为 owner 或 admin；否则返回 404/403。
4. 校验被踢用户 userId 在群内；不在则返回 404 或 400。校验被踢用户角色不是 owner；不能踢群主。校验：若当前用户为 admin，则被踢用户不得为 owner 或 admin；否则返回 403，`FORBIDDEN`。
5. 将 userId 从群成员中移除；更新 memberCount。
6. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.4.10 设置/取消管理员

- **方法**：`POST`
- **路径**：`/chat/group/setAdmin`
- **请求体**：`token`、`groupId`（string）、`userId`（string）、`isAdmin`（boolean）
- **响应**：`valid`（boolean）。仅群主可操作。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId`、`userId`、`isAdmin` 必填，isAdmin 为 boolean；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在、当前用户是否为群主（owner）；否则返回 404/403。
4. 校验目标 userId 在群内且不是群主；否则返回 400/403。
5. 将 userId 在群内的角色更新为 admin（isAdmin true）或 member（isAdmin false）。
6. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.4.11 转让群主

- **方法**：`POST`
- **路径**：`/chat/group/transferOwner`
- **请求体**：`token`、`groupId`（string）、`newOwnerId`（string）
- **响应**：`valid`（boolean）。仅当前群主可操作；转让后原群主变为普通成员或管理员（由实现方规定）。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId`、`newOwnerId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在、当前用户是否为群主；否则返回 404/403。
4. 校验 newOwnerId 在群内且为成员（非群主）；否则返回 400/403。
5. 将群 ownerId 更新为 newOwnerId；将原群主角色改为 member 或 admin（实现方规定）。
6. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.4.12 解散群

- **方法**：`POST`
- **路径**：`/chat/group/dismiss`
- **请求体**：`token`、`groupId`（string）
- **响应**：`valid`（boolean）。解散后群不再存在，会话可标记为已解散。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在、当前用户是否为群主；否则返回 404/403。
4. 将群标记为已解散（或删除群记录、保留历史消息按实现方规定）；群成员列表、入群申请等按实现方策略归档或清理。
5. 返回 HTTP 200，`{ "valid": true }`。

---

#### 4.4.13 更新群信息

- **方法**：`POST`
- **路径**：`/chat/group/update`
- **请求体**：`token`、`groupId`（string）；可选 `name`、`notice`、`avatar`（只传需要修改的字段）
- **响应**：`valid`（boolean）。仅群主或管理员可操作。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `groupId` 必填；至少传 name、notice、avatar 之一；若传 name 则长度 ≤ 50。否则返回 400，`PARAM_INVALID`。
3. 查询群是否存在、当前用户是否在群内且角色为 owner 或 admin；否则返回 404/403。
4. 更新群记录的 name、notice、avatar 字段（仅更新入参中存在的字段）。
5. 返回 HTTP 200，`{ "valid": true }`。

---

### 4.5 会话与消息

会话：一条私聊或一个群聊的对话入口，用 `conversationId` 唯一标识。若后端使用 `chatToken` 与 conversationId 映射，须在实现文档中写明；本规范以 conversationId 为准。

#### 4.5.1 获取会话列表

- **方法**：`POST`
- **路径**：`/chat/conversation/list`
- **请求体**：`token`；可选 `limit`、`offset`
- **响应**：`list`（array）、`total`（number）。list 每项含 `conversationId`、`type`（`"private"`|`"group"`）、`targetId`、`title`、`avatar`、`lastMessage`（可选）、`lastMessageTime`（可选）、`unreadCount`（可选）。私聊时 targetId 为对方 userId，title/avatar 为对方昵称/头像；群聊时 targetId 为 groupId，title/avatar 为群名/群头像。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 解析 limit、offset；缺省用默认值，校验为非负整数。
3. 汇总当前用户的会话：所有与当前用户有关的私聊会话（好友且已建立会话）+ 当前用户所在的所有群对应会话；每条会话一个 conversationId，按最后消息时间倒序；总数 total，分页。
4. 对每条会话：若私聊则 targetId=对方 userId，查对方昵称/头像填 title、avatar；若群聊则 targetId=groupId，查群名/群头像填 title、avatar；可选查最后一条消息内容与时间、未读数。
5. 返回 HTTP 200，`{ "list": [ ... ], "total": total }`。

---

#### 4.5.2 获取会话详情

- **方法**：`POST`
- **路径**：`/chat/conversation/detail`
- **请求体**：`token`、`conversationId`（string）
- **响应**：私聊时为对方 `userId`、`nickname`、`avatar`；群聊时为群 `groupId`、`name`、`avatar`、`notice`、成员数；是否包含部分成员列表由实现方规定。无权访问时返回 HTTP 403。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `conversationId` 必填且为 string；否则返回 400，`PARAM_INVALID`。
3. 根据 conversationId 解析为私聊或群聊（按第 5 节约定）；校验当前用户参与该会话（私聊为其中一方，群聊为群成员）；未参与返回 403，`FORBIDDEN`。
4. 若私聊：取对方 userId，查昵称、头像；返回 body 含 userId、nickname、avatar。若群聊：取 groupId，查群 name、avatar、notice、memberCount；按实现方决定是否带部分成员列表。
5. 返回 HTTP 200，body 为上述结构。

---

#### 4.5.3 同步消息

- **方法**：`POST`
- **路径**：`/chat/message/sync`
- **请求体**：`token`、`conversationId`（string）、`afterMessageId`（string，可选）、`limit`（number，可选，默认 50）
- **响应**：`list`（array）。每项含 `messageId`、`senderId`、`senderName`、`senderAvatar`、`type`（`text`|`image`|`file`）、`content`、`time`（Unix 毫秒时间戳）。按时间正序排列。

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `conversationId` 必填且为 string；若传 `limit` 则校验为正整数。否则返回 400，`PARAM_INVALID`。
3. 根据 conversationId 确定会话；校验当前用户参与该会话；未参与返回 403，`FORBIDDEN`。
4. 查询该会话下的消息：若有 afterMessageId 则取该消息之后的消息（按时间或 id 排序）；若无则取最新一页。条数上限为 limit（默认 50）；按时间正序排列。
5. 对每条消息查发送者昵称、头像，拼装 senderName、senderAvatar；content 按存储格式返回（文本或文件 URL）；输出前须做安全转义或安全格式，防 XSS。
6. 返回 HTTP 200，`{ "list": [ ... ] }`。

---

#### 4.5.4 发送消息

- **方法**：`POST`
- **路径**：`/chat/message/send`
- **请求体**：`token`、`conversationId`（string）、`type`（string，取值 `text`|`image`|`file`）、`content`（string，长度上限 10KB）
- **响应**：`valid`（boolean）、`messageId`（string，新消息 id）

**处理逻辑：**

1. 限流、鉴权；鉴权失败返回 401。
2. 校验 `conversationId`、`type`、`content` 必填；type 属于白名单 `["text","image","file"]`；content 长度 ≤ 10KB。否则返回 400，`PARAM_INVALID`。
3. 根据 conversationId 确定会话；校验当前用户参与该会话；未参与返回 403，`FORBIDDEN`。
4. 生成唯一 messageId；将消息写入存储：conversationId、senderId=当前用户、type、content、time=当前时间（Unix 毫秒）；content 落库前须转义或安全格式，防 XSS/注入。
5. 更新该会话的「最后消息时间」等元数据，供会话列表排序；若有未读数逻辑则更新。
6. 返回 HTTP 200，`{ "valid": true, "messageId": "<messageId>" }`。

---

## 5. 会话与 conversationId 约定

- **私聊**：`conversationId` 由两方 userId 排序后生成的唯一标识表示（例如 `private_{smallId}_{bigId}`），或由后端分配唯一 id；实现方择一并在实现文档中写明。
- **群聊**：`conversationId` 等于 `groupId`，或与 groupId 一一映射；实现方择一并在实现文档中写明。
- **会话列表**：当前用户参与的私聊会话并集当前用户所在群聊；每条会话一个 conversationId；拉消息、发消息请求均须携带 conversationId。

---

## 6. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | — | 初版：鉴权、用户、好友、群组、会话与消息接口；补充请求处理通则与各接口处理逻辑；统一错误格式与安全要求。 |
