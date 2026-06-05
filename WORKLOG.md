# Ipro 工作日志

> 日期：2026-05-26  
> 目的：记录本轮“先完善文档，再修复构建链路和代码”的已完成修改、验证状态和后续计划，方便下次继续。

## 1. 本轮目标

用户要求：按照前一轮代码阅读后的判断，先完善文档，再修复构建链路和代码。

执行顺序：

1. 完善项目文档。
2. 修复根构建链路。
3. 修复 API TypeScript 构建问题。
4. 修复 Web/Next 构建问题。
5. 继续补齐前后端接口契约。

## 2. 已修改文件

### 2.1 文档

- `README.md`
  - 从偏脚手架说明改成项目接手文档。
  - 明确当前包管理器是 npm workspaces，不再写 pnpm。
  - 补充技术栈、环境要求、安装、环境变量、数据库初始化、开发启动、常用命令、项目结构、当前模块和开发约定。

- `SPEC.md`
  - 状态从“规划中”改为“实现中”。
  - 新增“0. 当前实现状态”。
  - 记录本地验证命令、已落地模块、接口和前端认证约定。

- `WORKLOG.md`
  - 即本文档，用于交接本轮修改和下一步计划。

### 2.2 根构建链路

- `turbo.json`
  - 删除无效字段：`"ui": "turborepo"`。
  - 原因：当前 Turborepo 2.9.14 不接受该值，导致根 `npm run build` 无法解析配置。

- `package.json`
  - 增加：`"packageManager": "npm@11.9.0"`。
  - 原因：新版 Turborepo 解析 workspaces 时要求根包声明 `packageManager`。

### 2.3 API TypeScript 构建修复

- `apps/api/src/**/*`
  - 批量把相对 import 的 `.ts` 后缀改为 `.js` 后缀。
  - 原因：后端 package 是 ESM，`tsc` 输出后运行时需要 `.js` specifier；原来 `.ts` 后缀在当前 tsconfig 下触发 TS5097。

- `apps/api/src/config/index.ts`
  - 新增 `AuthUserPayload`。
  - 改用 `declare module '@fastify/jwt'` 扩展 JWT payload/user 类型。
  - 移除和 `@fastify/jwt` 冲突的 `FastifyRequest.user` 自定义声明。

- `apps/api/src/middlewares/auth.middleware.ts`
  - 移除重复的 `FastifyRequest.user` module augmentation。
  - `signToken` / `verifyToken` 改用 `FastifyInstance` 类型，避免 untyped generic 调用错误。

- `apps/api/src/types/ali-oss.d.ts`
  - 新增 `ali-oss` 最小本地类型声明。
  - 解决项目中缺少 `ali-oss` 类型声明导致的构建错误。

- `apps/api/src/routes/auth/index.ts`
  - 移除错误的 `AppError` import。
  - 后续又补了 `/me`、`/refresh`、`/logout` 路由，用于和前端认证 API 对齐。

- `apps/api/src/routes/character/index.ts`
  - 移除未定义的 `getOSSClient` 使用。
  - 上传照片统一走 `uploadFile`，由 `uploadFile` 自己决定 OSS 或本地存储 fallback。

- `apps/api/src/routes/story/index.ts`
  - 新增 `Scene` 类型。
  - 支持 `customTitle`。
  - 开始补齐前端需要的故事接口：
    - `GET /api/stories`
    - `GET /api/stories/:id/progress`
    - `PUT /api/stories/:id/segments`
    - `PATCH /api/stories/:id/segments/:segmentId`
    - `DELETE /api/stories/:id`
  - 增加模板不存在时的本地 fallback 故事生成逻辑。
  - 注意：这些新增故事路由是在 API 构建通过之后继续改的，尚未重新验证。

- `apps/api/src/jobs/illustration.job.ts`
  - 删除 Bull `JobOptions` 不支持的 `progress` 字段。
  - `job.id` 返回值统一 `String(job.id)`。
  - 批量任务补 `prompt: ''`。
  - `backoff.type` 改为 `as const`，匹配 Bull 类型。

- `apps/api/src/jobs/video.job.ts`
  - 删除 Bull `JobOptions` 不支持的 `progress` 字段。
  - `job.id` 返回值统一 `String(job.id)`。
  - 用 `getJob(...).remove()` 替代不存在的 `queue.removeJob(...)`。

- `apps/api/src/services/queue.service.ts`
  - `job.id` 返回值统一 `String(job.id)`。
  - 插画批量任务补 `prompt: ''`。
  - 用 `getJob(...).remove()` 替代不存在的 `queue.removeJob(...)`。

- `apps/api/src/services/ai.service.ts`
  - `response.json()` 显式转为 `any`，解决 TS strict 下 JSON 为 `unknown` 的错误。
  - `compositeIllustration` 第三个参数改为可选，兼容现有调用。

- `apps/api/src/services/minimax.service.ts`
  - `response.json()` / error body 显式类型化。
  - 解决 MiniMax 响应被推断为 `unknown` 的错误。

- `apps/api/src/services/voice.service.ts`
  - MiniMax clone 响应显式转为 `any`。

- `apps/api/src/services/video.service.ts`
  - 删除不存在的 `userVoice.voiceId` 读取，改用 `userVoice.modelUrl || userVoice.id`。
  - Remotion/status 响应显式转为 `any`。

- `apps/api/src/services/tts.service.ts`
  - 在调用 `oss.put` 前检查 `getOSSClient()` 是否为 null。
  - OSS 未配置时抛出错误并进入原有本地 URL fallback。

- `apps/api/src/services/payment.service.ts`
  - 引入 `MembershipTier` 类型。
  - 支付回调创建会员时，将 `metadata.cardType` 显式收窄为 `MembershipTier`。

### 2.4 Web/Next 构建修复

- `apps/web/components/ui/photo-uploader.tsx`
  - `onDropRejected` 参数改用 `FileRejection[]`。
  - 解决 `react-dropzone` readonly errors 类型不兼容问题。

- `apps/web/components/voice/VoiceUploader.tsx`
  - `onDropRejected` 参数改用 `FileRejection[]`。
  - `accept` 扩展名保留 `.mp3` / `.wav` / `.ogg` / `.m4a` 格式，修复构建警告中提到的无效扩展名。

- `apps/web/types/story.ts`
  - `GenerateStoryRequest` 增加 `templateName?: string`。
  - 解决 `useStory` 调用 `generateStory({ templateName })` 的类型错误。

## 3. 已验证状态

### 3.1 已通过

在修复 API 类型错误后，曾成功执行：

```bash
npm run build --workspace=apps/api
```

结果：通过。

在修复 Web dropzone 和 `templateName` 类型后，曾成功执行：

```bash
npm run build --workspace=apps/web
```

结果：通过。  
当时仍有一条 dropzone accept 警告，随后已修 `VoiceUploader.tsx` 的扩展名格式，但修完后尚未重新跑 Web 构建。

### 3.2 尚未最终复验

以下修改发生在上述通过之后，因此需要下一轮继续验证：

- `apps/api/src/routes/auth/index.ts` 新增 `/me`、`/refresh`、`/logout`。
- `apps/api/src/routes/story/index.ts` 新增故事列表、进度、分段编辑、删除和模板 fallback。
- `apps/web/components/voice/VoiceUploader.tsx` accept 扩展名格式修复。

建议下一轮第一步运行：

```bash
npm run build --workspace=apps/api
npm run build --workspace=apps/web
npm run build
```

## 4. 本轮发现并准备继续修的问题

### 4.1 前后端接口契约仍需系统对齐

已开始补齐，但还没全部收尾。重点检查：

- 前端 `apps/web/lib/api/auth.ts`
  - 目前请求多数只带 `credentials: 'include'`，但登录后 token 存在 `localStorage.auth_token`。
  - 计划：封装统一 `authHeaders()`，让需要登录的请求自动带 `Authorization: Bearer <token>`。

- 前端 `apps/web/lib/api/story.ts`
  - 需要确认所有故事接口和后端返回结构一致。
  - 当前前端 `Story` 类型是 `segments`，后端数据库字段是 `scenes`。
  - 计划：在 API client 层做 `scenes -> segments` 映射，或统一后端响应兼容 `segments`。

- 前端 `apps/web/lib/api/character.ts`、`voice.ts`、`membership.ts`
  - 也需要统一加 Bearer token。

### 4.2 后端故事路由需要复查

`apps/api/src/routes/story/index.ts` 已补接口，但需要下轮重点看：

- `GET /api/stories/:id` 是否会被 `GET /api/stories/:id/progress`、`PUT /segments` 等路由顺序影响。
- `templateId` 为前端内置模板 ID 时，当前 fallback 是否满足产品预期。
- `status` 是否应该从数据库的 `draft/processing/illustrated/completed` 转换为前端的 `pending/generating/illustrating/rendering/completed/failed`。
- `PATCH /segments/:segmentId` 当前用 `Number(segmentId.replace(/^\D+/, ''))` 推断 index，可能不够稳，建议改为显式支持前端 segment id 格式。

### 4.3 后端插画/视频队列在无 Redis 时可能运行时报错

`index.ts` 会在未配置 Redis 时跳过 worker，但路由里如果调用 `illustrationQueue.addBatchJobs` 或 `videoQueue.addJob`，`getIllustrationQueue()` / `getVideoQueue()` 仍会抛 `Redis not configured`。

计划：

- 开发环境无 Redis 时，插画/视频接口返回清晰错误。
- 或提供同步 fallback/mock job，便于本地联调。

### 4.4 认证中间件与前端 token 通道

后端 `authMiddleware` 使用 `request.jwtVerify()`，默认读取 Authorization header。前端当前主要存 localStorage。

计划：

- 前端统一带 `Authorization`。
- 后端可选兼容 cookie，但不是优先项。

### 4.5 API 运行时数据库实例重复

多个 service/routes 文件各自 `new PrismaClient()`：

- `auth.middleware.ts`
- `voice.routes`
- `story/illustration/video/payment/price` 等 service

这能构建，但长期建议统一用 `fastify.prisma` 或共享 Prisma 单例，避免开发热更新和连接数问题。

### 4.6 根构建还没最终通过

根构建链路已经能进入 workspace，但最后一次完整 `npm run build` 是在 API/Web 代码继续修改前失败的。下一轮需要重新跑根构建确认。

## 5. 下一轮建议执行顺序

1. 先跑 `npm run build --workspace=apps/api`，修 `story.routes` 新增代码可能带来的类型错误。
2. 跑 `npm run build --workspace=apps/web`，确认 `VoiceUploader` 警告消失。
3. 跑根 `npm run build`。
4. 给前端 API client 增加统一 Bearer token header。
5. 统一 `Story` 数据映射：后端 `scenes` 与前端 `segments`。
6. 补 Redis 未配置时的队列接口 fallback 或明确错误。
7. 视情况启动 API/Web 做一次手动冒烟：
   - `/health`
   - 手机验证码登录
   - 上传角色
   - 创建故事
   - 打开生成页和作品页

## 6. 重要注意

- 当前目录不是 Git 仓库，无法用 `git diff` 回溯本轮改动。
- 本文档是当前交接基准。
- 最后一次确认通过的构建并不代表当前工作区最终通过，因为后续又补了认证和故事路由。

## 7. 2026-05-26 续开发记录

### 7.1 已完成

- 修复 API 构建新错误：
  - `apps/api/src/config/index.ts` 移除与 `@fastify/jwt` 冲突的 `FastifyRequest.user` 重声明。
  - `apps/api/src/routes/character/index.ts` 将上传错误日志改为 Pino 兼容的对象日志参数。
  - `apps/api/src/services/auth.service.ts` 修复测试手机号登录分支返回结构，补齐 `hasMembership`。
- 对齐前端故事生成接口：
  - `apps/web/lib/api/story.ts` 根据 `templateId` 自动选择 `/api/stories/from-template` 或 `/api/stories/generate`。
  - 生成响应状态统一映射为前端 `StoryStatus`。
- 复查队列接口：
  - 插画和视频路由已对 Redis 未配置场景返回 `503` 和 `QUEUE_UNAVAILABLE`，无需本轮再补。

### 7.2 已验证

以下命令均已通过：

```bash
npm run build --workspace=apps/api
npm run build --workspace=apps/web
npm run build
```

根构建结果：Turborepo 范围内 `@ipro/api`、`@ipro/web` 两个 workspace 均成功。

### 7.3 下一步建议

1. 启动 API/Web 做手动冒烟：`/health`、手机号测试登录、上传角色、模板故事生成、自定义故事生成。
2. 检查故事生成后详情页是否立即加载新故事；如页面依赖 `segments`，确认生成后跳转会调用 `getStory` 获取完整数据。
3. 中期重构多个文件各自 `new PrismaClient()` 的问题，改为共享单例或 `fastify.prisma`。

### 7.4 PrismaClient 单例重构

将 14 处各自 `new PrismaClient()` 统一到 `config/database.ts` 共享单例：

- 升级 `config/database.ts`：使用 `globalThis` 缓存实例，避免开发热更新导致的连接数膨胀。
- 更新以下文件改为 `import { prisma } from '../../config/database.js'`：
  - `index.ts`、`middlewares/auth.middleware.ts`
  - `routes/admin/` `illustration/` `membership/` `order/` `video/` `voice/` 的 `index.ts`
  - `services/` `illustration` `payment` `price` `video` `voice` 的 `.service.ts`
- 保留 `import type { Order }`、`import type { Prisma }` 等独立类型导入。
- `api` 和 `web` 构建及根 `npm run build` 全部通过。
## 8. 2026-05-27 Fix Record

### 8.1 Story Route Auth Fix
- Problem: storyRoutes registered as public, but /generate, /from-template check request.user.id without authenticate preHandler
- Fix: Add conditional preHandler hook in story/index.ts that skips auth only for /templates route

### 8.2 apiz.ai Image URL Parsing Fix
- Problem: queryTaskStatus used task.result.output.images but API returns task.output.images[].url or task.result.images[].url
- Fix: Changed to extract URLs from correct path

### 8.3 Upload Progress Overlay Fix
- Problem: photo-uploader.tsx progress overlay used absolute inset-0 without relative parent
- Fix: Added relative class to parent div

### 8.4 Story Templates Seeded
- Inserted 4 templates: Little Red Riding Hood, Cinderella, Three Little Pigs, Snow White

### 8.5 Verified Endpoints
- GET /templates (public) - 4 templates
- POST /generate (auth) - story created
- POST /from-template (auth) - story from template  
- GET /:id (auth) - story details
- POST /upload (auth) - photo uploaded
- POST /:id/stylize (auth) - stylize completed in ~80s
- API/Web builds pass

## 9. 2026-05-30 全项目 Bug 清单（待统一修复）

### 9.1 高优先级（会导致功能错误或数据丢失）

- `apps/api/src/routes/story/index.ts`
  - `PATCH /:id/segments/:segmentId` 里大量使用 `||` 合并更新字段。
  - 后果：前端无法把字符串清空，也无法把数组改成空数组，例如 `subtitle: ""`、`charactersInScene: []`、`sfx: []` 会被静默回退成旧值。
  - 建议：所有可选字段改成 `!== undefined` 判断，数组和字符串分开处理。

- `apps/api/src/types/storyboard.ts`
  - `normalizeStoryboard()` 只要看到 `parsed.scenes` 但 `version !== 1`，就走 `buildStoryboardFromLegacyScenes()`。
  - 后果：未来版本或漏写 `version` 的新结构数据会被错误降级成旧结构，丢失 `titleEn`、`summaryEn`、`themeEn`、`voiceCast`、`dialogue`、`narration`、`voiceoverEn`、`subtitle` 等字段。
  - 建议：按字段特征判断是否为新结构，优先走 `normalizeScene()`，不要只靠 `version === 1`。

- `apps/api/src/services/video.service.ts`
  - `renderVideo()` 用 `story.illustrations.find(i => i.sceneIndex === index)` 关联插画，而不是按 `scene.index`。
  - 后果：场景顺序调整、索引不连续或手动重排后，视频可能出现图文错位。
  - 建议：用真实 `scene.index` 关联插画。

- `apps/web/lib/api/story.ts`
  - `getStoryVideo()` 期望后端返回 `{ url, status }`，但后端 `GET /api/stories/:id/video` 实际返回的是 `{ id, videoUrl, audioType, voiceId, charCount, cost, status, createdAt }`。
  - 后果：前端作品页 `videoUrl` 永远拿不到，视频区域不显示，轮询也无法正确更新。
  - 建议：前端映射 `videoUrl -> url`，或后端兼容返回 `url` 字段。

- `apps/web/types/storyboard.ts`
  - 前端 storyboard 类型仍是旧版，缺少 `titleEn`、`summaryEn`、`themeEn`、`featureDescEn`、`voiceCast`、`storyTextEn`、`imageDescriptionEn`、`voiceoverEn`、`subtitle`、`narration` 等新字段。
  - 后果：前端 TypeScript 无法正确承接后端新结构，后续 UI 使用双语字段时只能绕过类型系统或丢字段。
  - 建议：前端类型与 `apps/api/src/types/storyboard.ts` 对齐。

- `apps/web/lib/api/story.ts`
  - `normalizeStoryboardScene()` 仍按旧结构裁剪字段，双语和配音信息都没有保留。
  - 后果：后端已经返回新 storyboard，前端在 client 层就把英文字幕、旁白、voiceCast 等信息抹掉了。
  - 建议：完整保留新结构，只在兼容旧数据时做 fallback。

### 9.2 中优先级（逻辑不一致、用户可见异常、结构风险）

- `apps/web/lib/api/story.ts`
  - 多处错误提示文案出现乱码，例如 `鐢熸垚鏁呬簨澶辫触`。
  - 后果：接口失败时用户看到乱码，影响可用性和定位问题。
  - 建议：统一用 UTF-8 正常中文文案替换，并检查文件编码来源。

- `apps/web/hooks/useGallery.ts`
  - 当故事状态不是 `completed/failed` 就持续轮询，但前端 `mapStoryStatus()` 把后端 `illustrated` 直接映射成 `completed`。
  - 后果：插画完成但视频未开始时，页面会误判为“已完成”，不再继续轮询其他状态变化。
  - 建议：重新梳理后端 story status 与前端 StoryStatus 的映射语义。

- `apps/api/src/routes/story/index.ts`
  - `storyContentFromStoryboard()` 只拼中文 `storyText/voiceover`，英文内容不进入聚合文本。
  - 后果：双语内容更新后，`story.content` 与真实 storyboard 长期不一致。
  - 建议：明确 `content` 是否只代表中文正文；若不是，应增加英文聚合字段或改写聚合策略。

- `apps/api/src/routes/story/index.ts`
  - `mergeStoryboard()` 结构上只适合“整稿替换”，但接口名和 schema 容易让人误以为支持部分嵌套 patch。
  - 后果：前端如果提交不完整 `storyboard.scenes`，容易出现局部字段被整体覆盖或丢失。
  - 建议：拆分“完整覆盖”和“局部 patch”接口，或在 schema/注释中明确约束。

- `apps/web/types/story.ts`
  - `STORY_TEMPLATES` 的 `coverImage` 与实际 `public/templates` 资源不一致，例如类型里是 `/templates/red-hood.svg`、`/templates/snow-princess.svg`、`/templates/pigs-house.svg`，实际资源是 `little-red.png`、`snow-white.png`、`three-pigs.png` 等。
  - 后果：模板封面在真实 UI 中可能 404 或始终不显示。
  - 建议：统一模板静态资源命名，或把模板元数据改成真实可访问路径。

- `apps/web/types/character.ts`
  - `STYLE_OPTIONS` 里使用 `/styles/pixar.jpg`、`/styles/ghibli.jpg` 等，但 `public/styles` 目录实际是 `.svg` 文件。
  - 后果：风格选择预览图可能 404。
  - 建议：改成真实资源路径。

- `apps/web/components/story/story-preview.tsx`
  - 编辑故事只改 `segment.content`，没有同步到 storyboard 的 `storyText / voiceover / subtitle` 语义层。
  - 后果：前端显示层和后端新结构之间仍然是“旧 segments 代理模型”，继续演化会越来越难维护。
  - 建议：编辑层逐步切换为直接编辑 storyboard scene。

### 9.3 低优先级（代码结构不佳、维护成本高）

- `apps/api/src/services/video.service.ts`
  - 存在未使用导入：`generateMiniMaxTTS`、`getOSSClient`。
  - 建议：删除未使用导入，避免误导后续维护者。

- `apps/web/lib/api/voice.ts`
  - `RequestOptions` 定义了但未使用。
  - 建议：删除死代码，降低噪音。

- `apps/web/lib/api/character.ts`
  - `RequestOptions` 与 `uploadCharacterFetch` 的 `onProgress` 参数未实际使用。
  - 建议：删除未使用参数或补上真正实现。

- `apps/api/src/routes/story/index.ts`
  - 仍然保留 `buildStoryboardFromLegacyScenes`、`toSceneArray` 等偏旧结构过渡逻辑，路由文件职责偏重。
  - 建议：把 storyboard 归一化/转换逻辑继续下沉到独立 helper，减轻 route 复杂度。

### 9.4 下一轮建议修复顺序

1. 修复后端 `PATCH segment` 的 `||` 合并问题，避免静默写入失败。
2. 修复 `normalizeStoryboard()` 的新结构误降级问题。
3. 修复 `video.service.ts` 场景与插画错配问题。
4. 对齐前端 `types/storyboard.ts` 与 `lib/api/story.ts`，完整接住新双语结构。
5. 修复 `getStoryVideo()` 返回值映射，打通作品页视频显示。
6. 批量清理前端乱码文案和错误的静态资源路径。

## 10. 2026-05-30 Bug 修复执行记录

- 已修复后端 `storyboard.ts` 对未来/缺失 version 的新结构误降级问题。
- 已修复后端 `PATCH /stories/:id/segments/:segmentId` 无法清空字符串和数组字段的问题。
- 已修复 `video.service.ts` 渲染时按数组位置关联插画的问题，改为按真实 `scene.index`。
- 已对齐前端 `types/storyboard.ts` 到新的双语 storyboard 结构。
- 已修复前端 `lib/api/story.ts` 对 storyboard 新字段的裁剪问题，并补充视频接口 `videoUrl -> url` 兼容映射。
- 已修复前端故事接口中的乱码默认错误文案。
- 已修复模板封面路径与风格预览图路径和实际 `public` 资源不一致的问题。
- 已清理前端部分未使用类型/参数，降低噪音。

## 11. 2026-06-02 视频服务完善

### 11.1 已完成功能

1. **进度推送机制 (SSE)**
   - 新增 `video-event-emitter.ts` 服务
   - 新增 `video-events.ts` SSE 路由 (`GET /api/videos/events/:videoId`)
   - 进度阶段：audio_generating(10%) -> audio_done(40%) -> rendering(50%) -> video_done(90%) -> completed(100%)

2. **Remotion 健康检查**
   - `checkRemotionHealth()` 函数，带 1 分钟缓存
   - `initRemotionHealthCheck()` 启动时调用
   - 不阻止启动，仅记录警告

3. **10 分钟超时处理**
   - `RENDER_TIMEOUT_MS = 600000`
   - `AbortController` 实现超时控制
   - 超时后自动标记视频为 failed

4. **自动重试 (503/504)**
   - `callRemotionAPI()` 函数
   - `MAX_RETRIES = 2`，间隔 10 秒
   - 同时处理网络错误重试

5. **视频元数据**
   - Prisma schema 新增字段：`audioUrl`, `duration`, `resolution`, `fileSize`
   - `markVideoCompleted()` 支持元数据参数
   - `getVideoDetails()` / `getStoryVideos()` 返回元数据

### 11.2 修改文件

- `apps/api/src/services/video-event-emitter.ts` (新增)
- `apps/api/src/routes/video-events.ts` (新增)
- `apps/api/src/services/video.service.ts` (重写)
- `apps/api/src/jobs/video.job.ts` (重写)
- `apps/api/src/index.ts` (注册 SSE 路由 + 健康检查初始化)
- `apps/api/prisma/schema.prisma` (新增字段)

### 11.3 SSE 事件格式

```typescript
// 前端订阅示例
const eventSource = new EventSource(`/api/videos/events/${videoId}`);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: 'video:audio_generating' | 'video:audio_done' | ...
  // data.progress: 10 | 40 | 50 | 90 | 100
  // data.videoUrl, data.audioUrl, data.errorMessage, etc.
};
```

### 11.4 验证状态

- `npm run build --workspace=apps/api` ✓
- `npm run build --workspace=apps/web` ✓
- `npm run build` (根构建) ✓
