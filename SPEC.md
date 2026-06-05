# Ipro 技术规格文档（SPEC）

> 版本：v1.0
> 日期：2026-05-25
> 状态：实现中

---

## 0. 当前实现状态

本项目当前采用 npm workspaces + Turborepo 管理 `apps/api` 和 `apps/web` 两个应用。根目录存在 `package-lock.json`，默认开发命令以 npm 为准。

### 0.1 本地验证命令

```bash
npm install
npm run db:generate --workspace=apps/api
npm run db:push
npm run build
```

也可以分别验证：

```bash
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```

### 0.2 已落地模块

| 模块 | 当前实现 |
|------|----------|
| 认证 | 微信 code 登录、手机号验证码登录、当前用户、刷新、退出 |
| 角色 | 上传、详情、列表、删除、风格化 |
| 故事 | 模板、生成、从模板创建、列表、详情、编辑、分段更新、删除、进度 |
| 插画 | 创建插画任务、插画列表、统计和状态查询 |
| 视频 | 创建视频任务、视频详情、任务状态、可用音色 |
| 声音 | 上传样本、克隆、列表、详情、删除 |
| 会员/订单 | 会员状态、套餐、购买入口、订单创建、订单查询、支付回调 |
| 管理后台 | 价格、订单、用户、统计 |

### 0.3 接口和前端约定

- 认证后的请求使用 `Authorization: Bearer <token>`，浏览器端 token 存储键为 `auth_token`。
- 兼容 `credentials: "include"`，但当前前端 API client 的主要认证通道是 Bearer token。
- 后端响应统一为 `{ success, data, message?, code? }`。
- 新增或修改接口时，必须同步更新 `apps/web/lib/api/*`、`apps/web/types/*` 和本文件。

## 1. 技术栈概览

| 层级 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 前端框架 | Next.js | 15.x | App Router，SSR + 静态导出 |
| 开发语言 | TypeScript | 5.x | 严格类型检查 |
| UI 框架 | TailwindCSS | 3.x | 原子化 CSS |
| 组件库 | shadcn/ui | latest | 基于 Radix + Tailwind |
| 后端框架 | Fastify | 4.x | 高性能 Node.js 框架 |
| 开发语言 | TypeScript | 5.x | 前后端统一语言 |
| ORM | Prisma | 5.x | 数据库 ORM |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） | 15.x / 16.x | 数据持久化 |
| 缓存 | Redis | 7.x | 会话缓存、队列 |
| AI 图像 | ChatGPT Images 2.0 / 2.0 Edit | - | 插画生成 |
| AI 语音 | Edge TTS + MiniMax | - | 配音 + 声音克隆 |
| 视频渲染 | Remotion | 4.x | MP4 导出 |
| 文件存储 | 阿里云 OSS | - | 图片/音频/视频 |
| 支付 | 微信支付 + 支付宝 + Stripe | - | 支付网关 |
| 部署 | Docker | 24.x | 容器化 |
| CI/CD | GitHub Actions / Gitea Actions | - | 自动化部署 |

---

## 2. 项目结构

```
ipro/
├── apps/
│   ├── web/                      # 前端应用
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── (auth)/          # 认证页面
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   ├── (app)/           # 应用页面
│   │   │   │   ├── dashboard/
│   │   │   │   ├── create/
│   │   │   │   │   ├── upload/
│   │   │   │   │   ├── stylize/
│   │   │   │   │   ├── story/
│   │   │   │   │   └── generate/
│   │   │   │   ├── gallery/
│   │   │   │   ├── voices/
│   │   │   │   ├── membership/
│   │   │   │   └── settings/
│   │   │   ├── admin/           # 管理后台
│   │   │   │   ├── users/
│   │   │   │   ├── orders/
│   │   │   │   ├── prices/
│   │   │   │   ├── templates/
│   │   │   │   └── stats/
│   │   │   ├── api/             # API 路由
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui 组件
│   │   │   ├── auth/            # 认证组件
│   │   │   ├── story/           # 故事相关组件
│   │   │   ├── illustration/    # 插画组件
│   │   │   ├── video/           # 视频组件
│   │   │   └── voice/           # 声音组件
│   │   ├── lib/
│   │   │   ├── api/             # API 客户端
│   │   │   ├── utils.ts         # 工具函数
│   │   │   └── constants.ts     # 常量定义
│   │   ├── hooks/               # React Hooks
│   │   ├── types/               # TypeScript 类型
│   │   ├── public/
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── tsconfig.json
│   │
│   └── api/                      # 后端应用
│       ├── src/
│       │   ├── index.ts         # 入口文件
│       │   ├── app.ts           # Fastify 实例
│       │   ├── config/          # 配置
│       │   │   ├── index.ts
│       │   │   ├── database.ts
│       │   │   ├── redis.ts
│       │   │   └── oss.ts
│       │   ├── routes/          # 路由
│       │   │   ├── auth/
│       │   │   ├── user/
│       │   │   ├── character/
│       │   │   ├── story/
│       │   │   ├── illustration/
│       │   │   ├── video/
│       │   │   ├── voice/
│       │   │   ├── order/
│       │   │   └── admin/
│       │   ├── services/       # 业务逻辑
│       │   │   ├── auth.service.ts
│       │   │   ├── user.service.ts
│       │   │   ├── character.service.ts
│       │   │   ├── story.service.ts
│       │   │   ├── illustration.service.ts
│       │   │   ├── video.service.ts
│       │   │   ├── voice.service.ts
│       │   │   ├── order.service.ts
│       │   │   ├── payment.service.ts
│       │   │   └── ai.service.ts
│       │   ├── jobs/           # 后台任务
│       │   │   ├── illustration.job.ts
│       │   │   └── video.job.ts
│       │   ├── middlewares/    # 中间件
│       │   │   ├── auth.middleware.ts
│       │   │   ├── rate-limit.middleware.ts
│       │   │   └── error.middleware.ts
│       │   ├── plugins/        # Fastify 插件
│       │   │   ├── cors.ts
│       │   │   ├── jwt.ts
│       │   │   └── swagger.ts
│       │   └── utils/          # 工具
│       │       ├── hash.ts
│       │       ├── random.ts
│       │       └── validation.ts
│       ├── prisma/
│       │   └── schema.prisma    # 数据库 Schema
│       ├── tests/              # 测试
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                  # 共享包
│       ├── types/               # 共享类型
│       ├── constants/           # 共享常量
│       └── utils/               # 共享工具
│
├── infra/                       # 基础设施
│   ├── docker/
│   │   ├── api/
│   │   │   └── Dockerfile
│   │   ├── web/
│   │   │   └── Dockerfile
│   │   └── docker-compose.yml
│   └── nginx/
│       └── nginx.conf
│
├── scripts/                     # 脚本
│   ├── dev.sh
│   ├── build.sh
│   └── deploy.sh
│
├── .env.example                # 环境变量示例
├── package.json                # 根包管理
├── turbo.json                  # Turborepo 配置
├── tsconfig.json               # TypeScript 根配置
└── README.md
```

---

## 3. 数据库设计

### 3.1 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id          String   @id @default(cuid())
  openid      String?  @unique
  phone       String?  @unique
  nickname    String?
  avatar      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  characters  Character[]
  stories     Story[]
  voices      UserVoice[]
  memberships Membership[]
  orders      Order[]
}

model UserVoice {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  audioUrl    String
  modelUrl    String?
  status      String   @default("processing") // processing, active, expired
  expiresAt   DateTime?
  createdAt   DateTime @default(now())

  @@index([userId])
}

model Character {
  id                 String   @id @default(cuid())
  userId             String
  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  originalPhotoUrl   String
  stylizedPhotoUrl   String?
  featureDesc        String?
  status             String   @default("pending") // pending, processing, completed
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([userId])
}

model Story {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  content     String
  scenes      String   // JSON: [{index, description, text}]
  source      String   @default("template") // template, custom
  status      String   @default("draft") // draft, processing, illustrated, completed
  totalCost   Float    @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  illustrations Illustration[]
  videos        Video[]

  @@index([userId])
}

model Illustration {
  id          String   @id @default(cuid())
  storyId     String
  story       Story    @relation(fields: [storyId], references: [id], onDelete: Cascade)
  sceneIndex  Int
  imageUrl    String?
  prompt      String?
  status      String   @default("pending") // pending, processing, completed, failed
  cost        Float    @default(0)
  createdAt   DateTime @default(now())

  @@unique([storyId, sceneIndex])
  @@index([storyId])
}

model Video {
  id          String   @id @default(cuid())
  storyId     String
  story       Story    @relation(fields: [storyId], references: [id], onDelete: Cascade)
  videoUrl    String?
  audioType   String   @default("tts") // tts, cloned
  voiceId     String?
  charCount   Int      @default(0)
  cost        Float    @default(0)
  status      String   @default("pending") // pending, processing, completed, failed
  createdAt   DateTime @default(now())

  @@index([storyId])
}

model Membership {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  cardType    String   // weekly, monthly, quarterly, yearly
  quota       Int      @default(0)
  usedQuota   Int      @default(0)
  expiresAt   DateTime
  status      String   @default("active") // active, expired
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}

model Order {
  id              String   @id @default(cuid())
  orderNo         String   @unique
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type            String   // image, story, membership, voice_clone, video
  amount          Float
  status          String   @default("pending") // pending, paid, refunded, cancelled
  paymentChannel  String?  // wechat, alipay, stripe
  transactionId   String?
  metadata        String?  // JSON: 额外数据
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}

model PriceConfig {
  id          String   @id @default(cuid())
  key         String   @unique
  value       Float
  description String?
  updatedAt   DateTime @updatedAt
  updatedBy   String?
}

model StoryTemplate {
  id          String   @id @default(cuid())
  title       String   @unique
  content     String
  scenes      String   // JSON: 预定义场景
  cover       String?
  status      String   @default("active") // active, disabled
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

---

## 4. 核心 API 规格

### 4.1 认证模块

#### POST /api/auth/wechat-login
微信一键登录

**Request:**
```json
{
  "code": "微信授权 code"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "cuid",
      "nickname": "用户昵称",
      "avatar": "头像URL",
      "hasMembership": false
    }
  }
}
```

#### POST /api/auth/phone-code
发送手机验证码

**Request:**
```json
{
  "phone": "13800138000"
}
```

**Response:**
```json
{
  "success": true,
  "message": "验证码已发送"
}
```

### 4.2 用户模块

#### GET /api/user/profile
获取用户信息

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cuid",
    "nickname": "用户昵称",
    "avatar": "头像URL",
    "phone": "138***0000",
    "membership": {
      "cardType": "monthly",
      "expiresAt": "2026-06-25",
      "remainingQuota": 5
    },
    "stats": {
      "totalStories": 12,
      "totalIllustrations": 120,
      "totalVideos": 8
    }
  }
}
```

### 4.3 角色模块

#### POST /api/characters/upload
上传照片

**Request:** multipart/form-data
- `photo`: 文件

**Response:**
```json
{
  "success": true,
  "data": {
    "characterId": "cuid",
    "originalPhotoUrl": "https://oss.xxx/photo.jpg",
    "featureDesc": "面部特征描述"
  }
}
```

#### POST /api/characters/:id/stylize
风格化角色

**Request:**
```json
{
  "style": "storybook" // storybook, ghibli, watercolor
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "characterId": "cuid",
    "stylizedPhotoUrl": "https://oss.xxx/stylized.jpg",
    "status": "completed"
  }
}
```

### 4.4 故事模块

#### GET /api/stories/templates
获取预设模板列表

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid",
      "title": "小红帽",
      "cover": "https://oss.xxx/cover.jpg",
      "sceneCount": 12
    }
  ]
}
```

#### POST /api/stories/generate
生成故事（用户输入）

**Request:**
```json
{
  "title": "小马过河",
  "characterId": "cuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "storyId": "cuid",
    "title": "小马过河",
    "content": "完整故事文本...",
    "scenes": [
      {
        "index": 0,
        "description": "小马站在河边发愁",
        "text": "小马来到了河边，河水哗哗地流..."
      }
    ]
  }
}
```

#### POST /api/stories/from-template
从模板创建故事

**Request:**
```json
{
  "templateId": "cuid",
  "characterId": "cuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "storyId": "cuid",
    "title": "小红帽",
    "content": "故事全文...",
    "scenes": [...]
  }
}
```

### 4.5 插画模块

#### POST /api/stories/:id/illustrate
生成插画（批量）

**Request:**
```json
{
  "sceneIndices": [0, 1, 2, 3], // 指定场景索引，null 表示全部
  "force": false // 是否强制重新生成
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "storyId": "cuid",
    "totalScenes": 12,
    "queuePosition": 5,
    "estimatedTime": "2分钟"
  }
}
```

**WebSocket 事件:**
```
illustration:progress  // 进度更新
illustration:completed // 完成
illustration:failed    // 失败
```

#### GET /api/stories/:id/illustrations
获取插画列表

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid",
      "sceneIndex": 0,
      "imageUrl": "https://oss.xxx/0.jpg",
      "text": "小马来到了河边...",
      "status": "completed"
    }
  ]
}
```

### 4.6 视频模块

#### POST /api/stories/:id/video
生成视频

**Request:**
```json
{
  "audioType": "tts", // tts, cloned
  "voiceId": "cuid", // 克隆声音 ID（audioType=cloned 时必填）
  "voiceName": "xiaoming" // 克隆音色名称
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "videoId": "cuid",
    "status": "processing",
    "charCount": 1234,
    "estimatedCost": 0.25
  }
}
```

### 4.7 声音模块

#### POST /api/voices/upload
上传音频样本

**Request:** multipart/form-data
- `audio`: 文件（30s 以上）
- `name`: 音色名称

**Response:**
```json
{
  "success": true,
  "data": {
    "voiceId": "cuid",
    "name": "我的声音",
    "status": "processing"
  }
}
```

#### POST /api/voices/:id/clone
克隆声音（确认付费）

**Request:**
```json
{
  "orderId": "cuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "voiceId": "cuid",
    "status": "processing"
  }
}
```

### 4.8 订单模块

#### POST /api/orders/create
创建订单

**Request:**
```json
{
  "type": "voice_clone", // membership, voice_clone, video
  "metadata": {
    "cardType": "monthly" // 可选
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "cuid",
    "orderNo": "IP202605250001",
    "amount": 19.9,
    "paymentUrl": "https://pay.xxx/xxx"
  }
}
```

### 4.9 管理后台

#### GET /api/admin/prices
获取价格配置

**Response:**
```json
{
  "success": true,
  "data": {
    "image": 0.2,
    "voiceClone": 19.9,
    "clonedVoicePer1kChar": 0.2,
    "weeklyCard": 19.9,
    "monthlyCard": 59,
    "quarterlyCard": 159,
    "yearlyCard": 499
  }
}
```

#### PUT /api/admin/prices
修改价格配置

**Request:**
```json
{
  "key": "image",
  "value": 0.3
}
```

---

## 5. AI 服务集成

### 5.1 ChatGPT Images 2.0（apiz.ai）

```typescript
// 服务：illustration.service.ts
import crypto from 'crypto';

const API_BASE = 'https://api.apiz.ai/api/v3';
const API_KEY = process.env.APIZ_API_KEY; // sk-a09762406d0dd5c87a8f26de197ccc998e08152b358ad15d

interface ImageTaskParams {
  model: 'openai/gpt-image-2' | 'openai/gpt-image-2/edit';
  params: {
    prompt: string;
    image_urls?: string[];  // Edit 模式必填
    image_size?: 'auto' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '3:2' | '2:3';
    resolution?: '1K' | '2K' | '4K';
    quality?: 'low' | 'medium' | 'high';
    num_images?: number;
    mask_url?: string;
  };
  callback_url?: string;
}

/**
 * 创建图像生成任务
 */
async function createImageTask(params: ImageTaskParams): Promise<string> {
  const response = await fetch(`${API_BASE}/tasks/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(params),
  });
  
  const result = await response.json();
  if (result.code !== 200) throw new Error(result.message);
  return result.data.task_id;
}

/**
 * 查询任务状态
 */
async function queryTaskStatus(taskId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  images?: string[];
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/tasks/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ task_id: taskId }),
  });
  
  const result = await response.json();
  const task = result.data;
  
  return {
    status: task.status,
    images: task.result?.output?.images,
    error: task.error,
  };
}

/**
 * 生成场景背景（标准模式）
 */
async function generateSceneBackground(
  prompt: string,
  size: string = '4:3'
): Promise<string> {
  const taskId = await createImageTask({
    model: 'openai/gpt-image-2',
    params: {
      prompt,
      image_size: size,
      resolution: '1K',  // 低分辨率省钱
      quality: 'low',
      num_images: 1,
    },
  });
  
  // 轮询等待完成（生产环境建议用 Webhook）
  while (true) {
    const result = await queryTaskStatus(taskId);
    if (result.status === 'completed') {
      return result.images![0];
    }
    if (result.status === 'failed') {
      throw new Error(result.error);
    }
    await sleep(2000);
  }
}

/**
 * 角色+场景合成（Edit 模式）
 */
async function compositeIllustration(
  sourceImageUrl: string,
  prompt: string,
  size: string = '4:3'
): Promise<string> {
  const taskId = await createImageTask({
    model: 'openai/gpt-image-2/edit',
    params: {
      prompt,
      image_urls: [sourceImageUrl],
      image_size: size,
      resolution: '1K',
      quality: 'low',
      num_images: 1,
    },
  });
  
  while (true) {
    const result = await queryTaskStatus(taskId);
    if (result.status === 'completed') {
      return result.images![0];
    }
    if (result.status === 'failed') {
      throw new Error(result.error);
    }
    await sleep(2000);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**参数默认值：**
- `resolution`: 1K（省钱，适合草稿）
- `quality`: low（省钱，2K/high 用于最终输出）
- `image_size`: 4:3（适合绘本）

### 5.2 MiniMax 声音克隆

```typescript
// 服务：voice.service.ts
import crypto from 'crypto';

const API_KEY = process.env.MINIMAX_API_KEY;
const GROUP_ID = process.env.MINIMAX_GROUP_ID;

/**
 * 克隆声音
 */
async function cloneVoice(audioUrl: string, userId: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', API_KEY)
    .update(`${GROUP_ID}${timestamp}`)
    .digest('hex');

  const response = await fetch('https://api.minimax.io/v1/t2a_voice_clone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      group_id: GROUP_ID,
      voice_id: `ipro_${userId}_${timestamp}`,
      audio_url: audioUrl,
      signature,
    }),
  });

  const data = await response.json();
  return data.voice_id;
}
```

### 5.3 Edge TTS

```typescript
// 服务：tts.service.ts
import edgeTTS from 'edge-tts';

const VOICES = {
  'zh-CN-XiaoxiaoNeural': '女声（晓晓）',
  'zh-CN-YunxiNeural': '男声（云希）',
  'zh-CN-XiaoyiNeural': '女声（小艺）',
};

/**
 * 文字转语音
 */
async function textToSpeech(
  text: string,
  voice: string = 'zh-CN-XiaoxiaoNeural',
  outputPath: string
): Promise<void> {
  const tts = new edgeTTS.EdgeTTS();
  await tts.ttsPromise(text, outputPath, voice);
}
```

---

## 6. 消息队列设计

### 6.1 Bull 队列配置

```typescript
// services/queue.service.ts
import Bull from 'bull';

export const illustrationQueue = new Bull('illustration', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

export const videoQueue = new Bull('video', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

// 插画生成任务
illustrationQueue.process(async (job) => {
  const { storyId, sceneIndex, characterId } = job.data;
  // 执行插画生成...
  // 更新数据库状态
  // 发送 WebSocket 通知
});

// 视频渲染任务
videoQueue.process(async (job) => {
  const { videoId, storyId } = job.data;
  // Remotion 渲染...
  // 更新数据库状态
  // 发送 WebSocket 通知
});
```

---

## 7. 安全设计

### 7.1 认证与授权

| 方案 | 说明 |
|------|------|
| JWT | Token 有效期 7 天，支持 refresh |
| 微信登录 | OAuth 2.0 授权码模式 |
| 手机号登录 | 短信验证码（60s 有效期） |

### 7.2 防护措施

| 防护 | 实现 |
|------|------|
| 请求限流 | 每 IP 100 次/分钟，每用户 1000 次/分钟 |
| CSRF | Token 验证 |
| XSS | 输入过滤 + CSP |
| SQL 注入 | Prisma ORM 参数化查询 |
| 文件上传 | 白名单格式（jpg/png），大小限制（10MB） |

---

## 8. 部署方案

### 8.1 Docker Compose

```yaml
version: '3.8'

services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/ipro
      - REDIS_HOST=redis
    depends_on:
      - db
      - redis

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - API_URL=http://api:3001

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### 8.2 环境变量

```bash
# .env
NODE_ENV=production

# 数据库
DATABASE_URL=postgresql://user:pass@db:5432/ipro

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# OpenAI
OPENAI_API_KEY=sk-xxx

# MiniMax
MINIMAX_API_KEY=xxx
MINIMAX_GROUP_ID=xxx

# 阿里云 OSS
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=ipro
OSS_REGION=cn-shanghai

# 微信支付
WECHAT_APP_ID=xxx
WECHAT_MCH_ID=xxx
WECHAT_API_KEY=xxx

# Stripe
STRIPE_SECRET_KEY=sk_xxx

# JWT
JWT_SECRET=xxx
```

---

## 9. 环境变量配置表

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `NODE_ENV` | 是 | 环境 | development/production |
| `DATABASE_URL` | 是 | 数据库连接 | postgresql://... |
| `REDIS_HOST` | 是 | Redis 主机 | localhost |
| `REDIS_PORT` | 是 | Redis 端口 | 6379 |
| `APIZ_API_KEY` | 是 | apiz.ai API Key（图像生成） | sk-a09762406d0dd5c87a8f26de197ccc998e08152b358ad15d |
| `MINIMAX_API_KEY` | 是 | MiniMax API Key | xxx |
| `MINIMAX_GROUP_ID` | 是 | MiniMax Group ID | xxx |
| `OSS_ACCESS_KEY_ID` | 是 | 阿里云 AccessKey | xxx |
| `OSS_ACCESS_KEY_SECRET` | 是 | 阿里云 Secret | xxx |
| `OSS_BUCKET` | 是 | OSS Bucket | ipro |
| `OSS_REGION` | 是 | OSS 区域 | cn-shanghai |
| `WECHAT_APP_ID` | 否 | 微信 AppID | wxxxx |
| `WECHAT_MCH_ID` | 否 | 微信商户号 | xxx |
| `WECHAT_API_KEY` | 否 | 微信 API Key | xxx |
| `STRIPE_SECRET_KEY` | 否 | Stripe Secret Key | sk_xxx |
| `JWT_SECRET` | 是 | JWT 密钥 | xxx |

---

## 10. 开发规范

### 10.1 Git Flow

| 分支 | 说明 |
|------|------|
| `main` | 生产环境 |
| `develop` | 开发分支 |
| `feature/*` | 功能分支 |
| `hotfix/*` | 热修复分支 |

### 10.2 代码规范

| 规范 | 工具 |
|------|------|
| TypeScript | TypeScript Strict Mode |
| ESLint | @typescript-eslint |
| Prettier | 代码格式化 |
| Husky | Git Hooks |

### 10.3 API 规范

| 规范 | 说明 |
|------|------|
| RESTful | URL 名词复数，HTTP 方法对应操作 |
| 统一响应 | `{ success: boolean, data: any, message?: string }` |
| 错误码 | 业务错误使用 `code`，系统错误使用 `status` |
| 分页 | `limit` + `offset`，返回 `total` |

---

## 11. 测试策略

| 测试类型 | 覆盖范围 | 工具 |
|---------|---------|------|
| 单元测试 | 工具函数、服务层 | Jest |
| 集成测试 | API 端点、数据库 | Supertest |
| E2E 测试 | 完整用户流程 | Playwright |
| 压力测试 | 高并发场景 | k6 |

---

## 12. 监控与日志

| 项目 | 工具 |
|------|------|
| 日志 | Winston + ELK |
| 监控 | Prometheus + Grafana |
| 告警 | 钉钉/飞书 Webhook |
| 错误追踪 | Sentry |

---

## 13. 里程碑检查点

| 阶段 | 完成标准 | 验证方式 |
|------|---------|---------|
| M1 | 单场景插画生成成功 | POST /api/characters/stylize |
| M2 | 完整故事插画批量生成 | POST /api/stories/:id/illustrate |
| M3 | 图文插画册 PDF 导出 | GET /api/stories/:id/illustrations |
| M4 | MP4 视频生成 | POST /api/stories/:id/video |
| M5 | 声音克隆集成 | POST /api/voices/:id/clone |
| M6 | 支付流程跑通 | 创建订单 → 支付回调 |
| M7 | 会员系统上线 | 订阅 → 权益验证 |
| M8 | 管理后台上线 | 价格配置、用户管理 |
