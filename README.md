# Ipro

> AI 童话故事、插画绘本和配音视频生成平台。

Ipro 是一个全栈 monorepo，面向亲子/家庭用户提供从照片上传、角色风格化、童话故事生成、批量插画、声音克隆到视频导出的完整创作流程。

## 协作变更日志

所有代码或功能变更都记录到 [`CHANGELOG.md`](./CHANGELOG.md)。Codex、MiniMax 和人工修改都使用同一个入口，按模板写明摘要、影响范围、触碰文件、验证命令和后续风险，方便下一位接手者快速判断最近改了什么。

## 技术栈

| 层级 | 技术 |
|------|------|
| Monorepo | npm workspaces + Turborepo |
| 前端 | Next.js 15 + React 19 + TypeScript + TailwindCSS |
| 后端 | Node.js 20 + Fastify + TypeScript |
| 数据库 | Prisma ORM + SQLite（开发）/ PostgreSQL（生产规划） |
| 队列 | Bull + Redis |
| AI 图像/故事 | apiz.ai ChatGPT Images 2.0 + LLM |
| AI 语音 | Edge TTS + MiniMax |
| 存储 | 阿里云 OSS |
| 支付 | 微信支付 + 支付宝 + Stripe |

## 快速开始

### 环境要求

- Node.js 20+
- npm 10+
- Redis（可选；未配置 `REDIS_HOST` 时后台任务 worker 会跳过）
- Docker（可选，用于生产部署规划）

### 安装依赖

```bash
npm install
```

### 配置环境变量

```bash
copy .env.example .env
```

编辑 `.env` 后至少确认：

- `DATABASE_URL=file:./dev.db`
- `JWT_SECRET=...`
- `NEXT_PUBLIC_API_URL=http://localhost:3001`（可选；前端默认同此地址）
- `OSS_*`、`APIZ_API_KEY`、`MINIMAX_*` 等外部服务变量按实际能力配置

### 初始化数据库

```bash
npm run db:generate --workspace=apps/api
npm run db:push
```

### 启动开发

```bash
# 同时启动前后端
npm run dev

# 或单独启动
npm run dev:web
npm run dev:api
```

默认地址：

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API health check: `http://localhost:3001/health`

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 通过 Turborepo 启动所有开发服务 |
| `npm run build` | 构建所有 workspace |
| `npm run build --workspace=apps/api` | 只构建 API |
| `npm run build --workspace=apps/web` | 只构建 Web |
| `npm run db:push` | 推送 Prisma schema 到开发数据库 |
| `npm run db:studio` | 打开 Prisma Studio |

## 项目结构

```text
ipro/
├── apps/
│   ├── api/                 # Fastify API 服务
│   │   ├── prisma/          # Prisma schema 与开发数据库
│   │   └── src/
│   │       ├── config/      # 数据库、OSS、MiniMax、队列、会员配置
│   │       ├── jobs/        # 插画/视频后台任务
│   │       ├── middlewares/ # 认证、管理员、错误处理
│   │       ├── routes/      # REST API 路由
│   │       ├── services/    # AI、支付、TTS、视频等业务服务
│   │       └── utils/       # 响应、随机数、hash 工具
│   └── web/                 # Next.js 前端应用
│       ├── app/             # App Router 页面
│       ├── components/      # UI、认证、故事、插画、声音组件
│       ├── hooks/           # 前端状态与 API 调用封装
│       ├── lib/             # API client 与通用工具
│       └── types/           # 前端类型
├── packages/
│   └── shared/              # 预留共享包
├── PRD.md                   # 产品需求文档
├── SPEC.md                  # 技术规格文档
└── turbo.json               # Turborepo 配置
```

## 当前模块

| 模块 | 主要能力 |
|------|----------|
| 认证 | 微信 code 登录、手机号验证码登录、当前用户、退出 |
| 角色 | 上传照片、OSS 存储、角色风格化、角色列表/详情 |
| 故事 | 模板故事、自定义标题生成、故事详情、编辑、列表、删除 |
| 插画 | 按故事场景创建插画记录、队列生成、状态查询 |
| 视频 | TTS/克隆声音生成音频、视频记录、渲染任务状态 |
| 声音 | 音频样本上传、MiniMax 克隆、声音列表/详情/删除 |
| 会员/订单 | 会员套餐、订单创建、支付回调、管理员价格配置 |

## 技术文档

- [PRD](PRD.md) - 产品需求文档
- [SPEC](SPEC.md) - 技术规格文档和接口约定

## 开发约定

- 后端统一响应格式：`{ success: boolean, data?: T, message?: string, code?: string }`
- 需要登录的请求使用 JWT，前端优先从 `localStorage.auth_token` 读取并发送 `Authorization: Bearer <token>`
- `node_modules`、`.next`、`dist` 和 `.opencode/node_modules` 都是生成/依赖目录，不属于项目源码评审范围
- 新增接口时需要同步更新 `apps/web/lib/api/*` 和 `SPEC.md`

## 许可证

MIT


