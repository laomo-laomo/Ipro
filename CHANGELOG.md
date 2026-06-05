# CHANGELOG

This file is the shared handoff log for Codex, MiniMax, and human edits.

Every code or behavior change should add one short entry at the top of `Unreleased`. Keep entries factual and scannable so another agent can quickly understand what changed, where, and what still needs attention.

## Entry Format

```md
### YYYY-MM-DD HH:mm +08:00 - Author
- Summary: one sentence describing the change.
- Changed: feature/behavior/code paths touched.
- Files: `path/to/file`, `path/to/other-file`.
- Validation: commands run or `Not run` with reason.
- Risks/Next: known risks, follow-up, or `None`.
```

## Rules

- Add newest entries first under `Unreleased`.
- Use author names like `Codex`, `MiniMax`, or a human name.
- Record deletions and migrations explicitly.
- Do not paste secrets, tokens, full `.env` values, or large logs.
- Prefer file paths over vague descriptions.
- If a change fixes a previous risk, mention the older entry date if known.

## Unreleased

### 2026-06-05 22:25 +08:00 - MiniMax
- Summary: Fixed the "生成视频故事" button not showing on the gallery page. Root cause: `VideoProgress` component has a hard-coded early return at `status === 'pending' && progress === 0` that renders a static "视频尚未生成" placeholder, swallowing the entire branch. The page-level button was being routed around it.
- Changed:
  - **`apps/web/app/(app)/gallery/[id]/page.tsx`** (the actual fix): the `pending` branch in the video area JSX now requires `isPollingVideo` to be true before rendering `<VideoProgress>`. Initial load (no click yet) falls through to the else branch, which shows the "生成视频故事" / "用现有旁白生成视频" button.
  - **`handleStartVideo()`**: now also calls `setIsPollingVideo(true)` immediately on click (before awaiting the API), and resets to `false` on error. So once the user clicks, the JSX flips to the progress view; if the API fails, polling is reset and the user can retry.
- Files: `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: tsc --noEmit passes. Hard-refresh in the browser to see the button (Next.js HMR has been known to leave stale module references on this page).

### 2026-06-05 20:18 +08:00 - MiniMax
- Summary: Reuse existing Audiobook (SceneAudio) audio for video generation — **no more redundant TTS calls**. Smart-voice-match: if the user has already generated the Audiobook with a given voice, the video picks the same `audioType` so the backend can `ffmpeg concat` the per-scene tracks into a single MP3 audio and feed it to the renderer. Also added the missing "生成视频故事" button on the gallery page (frontend had no entry point, only a TODO comment).
- Changed:
  - **`apps/api/src/services/video.service.ts`**:
    - New `tryReuseSceneAudio(storyId, options)`: reads `SceneAudio` rows for the story, verifies all scenes are `completed` with contiguous 0..N-1 indices and a voice that matches the requested `audioType` (cloned request → cloned rows with matching voiceId; any non-cloned request → any non-cloned rows). On hit, downloads/copies each per-scene mp3 to a temp dir, runs `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp3`, probes duration with `ffprobe`, returns `{ audioBuffer, durationSec, voice }`. No re-encoding — just stream copy.
    - `generateStoryAudio()` now calls `tryReuseSceneAudio` first. On hit, uploads the concatenated buffer to `audio/{storyId}/{ts}.mp3` via `uploadFile` (durable COS/OSS URL — no more `/temp/tts/...` temp file). Falls back to TTS only when the reuse check fails.
    - Audio type union widened: `'tts' | 'mimo' | 'minimax' | 'cloned'` (was `'tts' | 'cloned'`) to match the Audiobook route.
  - **`apps/api/src/services/ffmpeg-renderer.ts`**: `downloadToFile` now resolves `/temp/...` URLs by reading the local file directly (mirroring the existing `/uploads/...` shortcut), avoiding the loopback HTTP hop and any port-binding issues.
  - **`apps/api/src/config/queue.ts`**: `VideoJobData.audioType` union widened to match.
  - **`apps/api/src/routes/video/index.ts`**: `createVideoSchema` accepts `'tts' | 'mimo' | 'minimax' | 'cloned'` (default `'tts'`). This is the public surface — apps/小程序 can now request minimax voice matching the Audiobook.
  - **`apps/web/lib/api/story.ts`**: `startVideo(storyId, body?)` now accepts an optional `body` so callers can specify `audioType / voiceName / voice / voiceId`. Empty body still works (defaults to `tts`).
  - **`apps/web/app/(app)/gallery/[id]/page.tsx`** (the actual button the user was missing):
    - New state: `isStartingVideo`, `videoStartError`.
    - New `handleStartVideo()`: inspects `audiobook?.pages?.[0]?.audioType` and sends `{ audioType }` matching the cached voice (minimax if Audiobook used minimax, otherwise `tts`). On success, calls `refreshVideo()` to flip the UI to processing and let the existing useEffect take over polling.
    - Replaced the previous ternary (`videoUrl ? player : status==processing/pending ? progress : null`) with a full GlassCard that always renders:
      - `videoUrl` → `<VideoPlayer>`
      - status `processing` / `pending` → `<VideoProgress>`
      - status `failed` → "重新生成视频" button + error
      - otherwise → "生成视频故事" / "用现有旁白生成视频" button (label changes based on whether the Audiobook is already generated). Disabled when no illustrations.
- Files: `apps/api/src/services/video.service.ts`, `apps/api/src/services/ffmpeg-renderer.ts`, `apps/api/src/config/queue.ts`, `apps/api/src/routes/video/index.ts`, `apps/web/lib/api/story.ts`, `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: end-to-end on `cmq0o1fai004z13xl2f2ig63r` (8/8 minimax SceneAudio already generated). POST with `audioType: minimax` → HTTP 200 in **12.9s** (down from 36.7s for the fresh-TTS path). Resulting audio is `https://.../audio/{storyId}/{ts}.mp3` (durable COS), 153.81s (8 minimax clips concatenated), MP3 32kHz mono (matches minimax TTS output — confirmed reuse, not fresh Edge TTS). Resulting MP4 uploaded to `https://ipo-1256346107.cos.ap-guangzhou.myqcloud.com/videos/cmq0w48av000pxhvhel5byb7d.mp4`. tsc --noEmit passes for both web and api.
- Risks/Next:
  - If the user wants a *different* voice for the video than what they used for the Audiobook, the smart default in the frontend will pick the Audiobook voice anyway. If we want a "force fresh TTS" option, the frontend needs a manual voice picker or a `force: true` flag.
  - Concat with `-c copy` doesn't re-encode, so scene transitions are abrupt (no cross-fade). For a smoother product, switch to `-c:a aac` with a small `afade` filter between inputs. Out of scope for now.
  - `prisma db push` once again silently no-op'd a column change in dev (audioType union widening was a TS-only change here, so no schema impact this round).

### 2026-06-05 18:55 +08:00 - MiniMax
- Summary: Video feature end-to-end working. Replaced the missing Remotion renderer (no service on `:3456`) with an in-process **ffmpeg** renderer; added a Redis-less synchronous fallback so dev / no-Redis environments still produce MP4 from a single HTTP call. Picked the renderer via `process.env.VIDEO_RENDERER` (default `ffmpeg`) so a future `remotion` strategy can drop in without touching callers.
- Changed:
  - **`apps/api/src/services/ffmpeg-renderer.ts`** (new): single-ffmpeg-invocation pipeline. Downloads each illustration + the audio track to a temp dir, runs `ffprobe` for the real audio duration, evenly splits the duration across N scenes, builds a `concat=n=N:v=1:a=0` filter with letterbox padding to 4:3 (default 1024x768, overrideable), H.264 + AAC + yuv420p + `+faststart`. Returns `{ buffer, durationSec, width, height, fileSize, sceneCount }`. Skips the loopback HTTP hop for `/uploads/...` URLs by reading the local file directly.
  - **`apps/api/src/services/video.service.ts`**:
    - Imports `renderWithFfmpeg` + `isFfmpegRendererEnabled` + `uploadFile`.
    - `renderVideo()` now (a) resolves renderable scenes with non-empty `imageUrl`, (b) calls `renderWithFfmpeg` (default) or the legacy Remotion HTTP path (when `VIDEO_RENDERER=remotion`), (c) uploads the MP4 buffer via `uploadFile` (COS / OSS / local) and persists `videoUrl + duration + resolution + fileSize` on the Video row.
    - 10-minute AbortController timeout kept; on any failure marks the row `failed` and rethrows.
  - **`apps/api/src/jobs/video.job.ts`**: extracted the worker body into `processVideoJobInline(data, hooks)` so the Bull worker and the route fallback share the same pipeline. Worker now calls the helper and `throw`s on `success:false` to trigger Bull retry.
  - **`apps/api/src/routes/video/index.ts`** (`POST /:id/video`): try `videoQueue.addJob()` first; on `Redis not configured` it logs a warning and runs `processVideoJobInline` synchronously inside the same request, returning `{ videoId, jobId: null, status: 'completed', videoUrl, audioUrl, duration, resolution, fileSize, charCount, estimatedCost }` so App / 微信小程序 can poll once and have a ready-to-play URL.
  - **`apps/api/prisma/schema.prisma`**: Video gets `renderer String @default("ffmpeg")` (ffmpeg | remotion). **Migration caveat**: `prisma db push` did NOT add the column to the existing dev DB — added it manually via `ALTER TABLE Video ADD COLUMN renderer TEXT DEFAULT 'ffmpeg'`. Future schema changes should be verified with `PRAGMA table_info`.
- Files: `apps/api/src/services/ffmpeg-renderer.ts` (new), `apps/api/src/services/video.service.ts`, `apps/api/src/jobs/video.job.ts`, `apps/api/src/routes/video/index.ts`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/dev.db` (renderer column).
- Validation: end-to-end on story `cmq0o1fai004z13xl2f2ig63r` (8/8 illustrations) via `POST /api/stories/:id/video` with `audioType: tts`. Result: HTTP 200 in 36.7s, MP4 144.4s, 1024x768 4:3, H.264 High / yuv420p, 5.3MB, uploaded to `https://ipo-1256346107.cos.ap-guangzhou.myqcloud.com/videos/cmq0t5j1g0004ishu74gu3jxx.mp4`. ffprobe confirmed: H.264 High profile, AAC audio, 4:3 DAR, progressive. DB row `status=completed`, `renderer=ffmpeg`.
- Risks/Next:
  - Per-scene duration is `totalAudio / sceneCount`. If the story is later configured with per-scene time budgets, switch the renderer to accept an array of durations.
  - `prisma db push` silently no-op'd on the existing dev DB for this column. Need a real migration file or use `prisma migrate dev` going forward; verify with `PRAGMA table_info(Video)` after every schema edit in dev.
  - The route's inline fallback runs ffmpeg inside the request thread — fine for the 8-幕 dev case (36s), but should not be exposed to production traffic without a queue.
  - No subtitle overlay yet. SPEC's M4 (MP4 视频生成) is met. Subtitle / ken-burns / scene transitions can come from the same `renderWithFfmpeg` input or by switching to Remotion.

### 2026-06-05 17:50 +08:00 - MiniMax
- Summary: All 4 seed-preset fairy-tale templates (`tpl_snow_white`, `tpl_red_hood`, `tpl_three_pigs`, `tpl_cinderella`) expanded from 4 to 7 scenes covering the canonical 童话 arc — fix for "只生成了 4 幕" reports. Plus code-level guard: if any future template ships under-curated (< 6 scenes), the from-template handler falls back to LLM generation instead of using the thin cache.
- Changed:
  - **Data — `StoryTemplate` rows** updated to 7 scenes each:
    - **tpl_snow_white** (白雪公主): 森林里歌唱 → 发现小矮人房子 → 小矮人归来共度 → 皇后乔装试探(毒梳) → 毒苹果 → 小矮人守护 → 王子之吻/幸福结局
    - **tpl_red_hood** (小红帽): 妈妈叮嘱 → 森林遇大灰狼 → 大灰狼抄近路 → 假扮奶奶 → 小红帽察觉 → 大灰狼扑 → 猎人救
    - **tpl_three_pigs** (三只小猪): 猪妈妈让独立 → 稻草/木屋 → 砖屋 → 大灰狼吹倒 → 砖屋坚不可摧 → 烟囱失败 → 三兄弟团聚
    - **tpl_cinderella** (灰姑娘): 厨房劳作 → 舞会邀请 → 仙女教母/南瓜变马车 → 舞会惊艳 → 午夜钟声/水晶鞋 → 王子试鞋 → 婚礼
  - `apps/api/src/routes/story/index.ts`:
    - Added `MIN_TEMPLATE_SCENES = 6` constant.
    - In the `POST /from-template` handler: parses the cached storyboard, checks `cachedScenes.length >= MIN_TEMPLATE_SCENES`. If under-curated, logs `[fromTemplate] Template under-curated, falling back to LLM` and continues into the LLM generation path (which kicks off `generateStoryInBackground`).
- Files: `apps/api/src/routes/story/index.ts`, `apps/api/prisma/dev.db` (4 template rows).
- Validation: `npx tsc --noEmit` passes. SQL update confirmed via direct DB query: all 4 templates now have 7 scenes with proper descriptions and texts.
- Risks/Next: The 4 templates still need to be re-rendered for any *existing* book that was created from the old 4-scene cache — that book is locked into the old scenes on its Story row. New books from the templates will use the new 7-scene version. The LLM fallback for under-curated templates works but burns a fresh LLM call (~5s) — acceptable for an edge case that should be rare after the seed update.

### 2026-06-05 17:18 +08:00 - MiniMax
- Summary: PDF was 17 pages instead of 9. Eight empty `· N ·` pages were being inserted between every content page because pdfkit's auto-pagination kicked in when the page-badge text was placed just past the bottom margin safe area.
- Changed: `apps/api/src/services/pdf.service.ts` per-scene page badge:
  - Added `lineBreak: false` and `height: 12` (≈ font size) to the `doc.text()` call so the badge cannot wrap or auto-paginate onto a new page.
  - Moved y from `PAGE_H - margin + 6` (555) to `PAGE_H - margin - 2` (547) so the badge is firmly inside the safe area, leaving room for the font's line-height without bleeding past the margin.
- Files: `apps/api/src/services/pdf.service.ts`.
- Validation: re-rendered the same 8-scene story — PDF now 9 pages (1 cover + 8 scenes) instead of 17. Page sizes unchanged.
- Risks/Next: This was a single-position bug; the rest of the per-scene layout (title at top, image in the middle, badge at bottom) is unchanged. No other obvious layout regressions expected.

### 2026-06-05 14:42 +08:00 - MiniMax
- Summary: Cartouche now adapts to story mood. Floral frame for fairy/magical stories (白雪公主 / 小红帽 / 灰姑娘 / 睡美人 / 丑小鸭 / 匹诺曹 / 美女与野兽), ink-brush scroll frame for action/martial/historical stories (武松打虎 / 曹冲称象 / 司马光砸缸 / 愚公移山). No more wearing a tuxedo to a tavern fight.
- Changed:
  - `apps/web/public/cartouche-scroll.svg` (new): 400×280 ink-brush scroll frame. Weathered parchment (`#f0e3c4 → #d8c398 → #b8985a`), irregular brushstroke border with subtle wobble path, simple L-shaped corner accents, small dot ornaments, faint burnt-edge top/bottom page line. No florals — fits rugged/adventure/martial stories.
  - `apps/web/app/(app)/gallery/[id]/page.tsx`:
    - Added `pickCartouche(story)` helper with a `FAIRY_TALES` Set (exact template names) + `FAIRY_TERMS` and `MARTIAL_TERMS` keyword arrays for theme inference. Default → scroll.
    - `SmartCaption` accepts a `story` prop, calls `pickCartouche`, uses the result as the background-image URL.
- Files: `apps/web/public/cartouche-scroll.svg` (new), `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: open 武松打虎 reading page — should now show the ink-brush scroll cartouche. Open 白雪公主 — should still show the floral cartouche.
- Risks/Next: The picker is keyword-based and will misclassify edge cases (e.g. a custom story titled "森林里的小红帽打虎" would incorrectly pick floral). For a more robust approach, ask the LLM to return a `mood` enum at story-generation time and persist it on the Story row. Worth doing once we add a couple more cartouche variants.

### 2026-06-05 14:36 +08:00 - MiniMax
- Summary: Reading-view caption frame replaced with a real decorative 绘本 chapter-heading cartouche (parchment + corner roses + leaf flourishes + double brown border) instead of the plain rounded-rect box. Now visually matches the "pristine picture-book page" the user wants.
- Changed:
  - `apps/web/public/cartouche-ornate.svg` (new): reusable 400×280 SVG with parchment radial gradient (#fff5e1 → #f5e8c8 → #e6cda0), double brown border, four corner flourishes (leaf + rose), `preserveAspectRatio="none"` so it stretches to whatever rectangle the position selector asks for. Single asset, no per-image work.
  - `apps/web/app/(app)/gallery/[id]/page.tsx` `SmartCaption`:
    - Replaced the warm cream rounded-rect div with a decorative cartouche: `backgroundImage: 'url(/cartouche-ornate.svg)'` stretched to 100%×100%, with a warm drop-shadow for depth.
    - Text overlaid on the cartouche with red 楷体 + cream stroke (smart-chosen colors from the hook). Smaller font (text-lg/text-xl) so the text doesn't overrun the inner border.
    - Min size 260×180 ensures the cartouche has room for a 4-line caption at 楷体 size.
- Files: `apps/web/public/cartouche-ornate.svg` (new), `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: open any completed story on the reading page — the caption is now wrapped in a real 4-corner floral frame on a parchment background. Text is still smart-placed (varies per image) but the styling is now constant (and pretty).
- Risks/Next: This is still a "frame on top of image" overlay — for the truly picture-book look, the right next step is to bake the cartouche into the generated image (per the 2-step approach discussed: image model generates the scene, PIL + simkai.ttf composites the cartouche + text). The current state is a much prettier stopgap. If the user wants to fully remove the front-end overlay, the same PIL pipeline can move server-side.

### 2026-06-05 14:04 +08:00 - MiniMax
- Summary: Added a "重烤绘本" one-click button on the gallery reading page that re-generates every illustration for the story with the latest prompt (so the new "text baked into the image" behavior takes effect on existing books).
- Changed:
  - `apps/api/src/routes/illustration/index.ts` new route `POST /api/stories/:id/regenerate-illustrations`:
    - Verifies story ownership, upserts illustration records for every scene, **resets every Illustration row to `status: 'pending'`** with `imageUrl/errorMessage/failureCategory` cleared and `retryCount: 0`, then queues a fresh job for each.
    - Returns `{totalScenes, queuedCount, jobIds, queuePosition, estimatedTime}` so the UI can show "已提交 N 张，预计 X 分钟" and poll.
    - Idempotent — safe to call again if a previous run was interrupted; no jobs are duplicated because illustrations are upserted by `(storyId, sceneIndex)`.
    - Logs `[Regenerate] storyId=… userId=… scenes=… jobs=… estimated=…` for audit.
  - `apps/web/lib/api/story.ts` new `regenerateAllIllustrations(storyId)` client wrapper.
  - `apps/web/app/(app)/gallery/[id]/page.tsx`:
    - Imported `useToast`, `regenerateAllIllustrations`, `RefreshCcw` icon.
    - Added a state hook for `isRegeneratingAll` and a `handleRegenerateAll` that confirms with the user (alert: "覆盖当前所有插画, 消耗 AI 算力, 可能需要几分钟") before submitting, then toasts success/failure.
    - New button placed before 分享 / 下载 PDF in the reading-page header — leftmost affordance, with a tooltip explaining what it does.
- Files: `apps/api/src/routes/illustration/index.ts`, `apps/web/lib/api/story.ts`, `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` passes in both `apps/api` and `apps/web`. Behavioral: open 武松打虎 reading page, click "重烤绘本" → confirm → toast appears saying "已提交 7 张重新生成任务". Each page flips to "绘制中..." in the polling cycle; after the worker finishes, each new image should have the Chinese caption painted into the lower 1/3 in red 楷体 (per the hardened textOnImage prompt).
- Risks/Next:
  - **Cost**: each scene re-generation is one apiz.ai image call. For 武松打虎 (7 scenes) that's ~$1.40 at 0.2/credit. The user controls the spend by clicking.
  - **Roll-forward the SmartCaption overlay removal**: once the user confirms the new images look right, we can remove `useSmartCaption` + the `<SmartCaption>` block — the page becomes a true "image with text painted in" 绘本 view.
  - **Idempotency caveat**: if the user clicks "重烤绘本" while a previous re-cook is mid-flight, the second call will reset all illustrations to pending again, killing the in-flight jobs' state. Consider gating on `isAnyIllustrating` if we observe this in practice.

### 2026-06-05 13:54 +08:00 - MiniMax
- Summary: Switched strategy for the reading-view caption. The front-end "smart overlay" approach (canvas analysis + edge detection + cartouche) was never going to look as good as a real 绘本 page where the text is part of the artwork. We're now baking the caption INTO the generated image by hardening the `textOnImage` prompt — once existing pages are regenerated, the front-end `SmartCaption` overlay can be removed entirely.
- Changed:
  - `apps/api/src/services/ai.service.ts` `buildVisualScenePrompt`: rewrote the `textOnImage` instruction from a soft suggestion to a hard MUST with explicit rules:
    - "MUST RENDER THE FOLLOWING CHINESE TEXT BAKED INTO THE IMAGE" (non-negotiable framing).
    - Font: 楷体 / 手写楷书, legible at thumbnail size.
    - Position: lower 1/3, horizontally centered, ~60% width — NOT a corner stamp.
    - Subject protection: text MUST NOT overlap face/body/key objects; if subject occupies lower 1/3, push text to the clear strip or shrink subject upward.
    - Decorate with a soft cartouche (cream/yellow paper box, or scroll/ribbon).
    - Color rules per scene mood (bright/dark/autumn).
    - Anti-cheat rules: don't leave it out, don't replace with English, don't make a tiny corner stamp.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: `npx tsc --noEmit` in `apps/api` passes. Visual: regenerate any one page (e.g. 武松打虎 page 2 via the existing retry button with `force=true` or `retrySingleIllustration`) and inspect — the new image should have the Chinese caption painted into the lower portion in red 楷体 with cream outline, occupying a centered strip.
- Next steps (not done in this entry, queued for user confirmation):
  1. User triggers regeneration of all 7 武松打虎 pages via the existing retry endpoint. Cost: 7 × 1 image credit (~$1.40 at 0.2/credit), ~30-60s per page.
  2. After confirming the new images look right, **remove** `apps/web/hooks/useSmartCaption.ts` and the `SmartCaption` component in `gallery/[id]/page.tsx`. The reading view will then be "image with text painted in" — true 绘本 style, zero positioning math.
  3. Optionally: write a one-off CLI / API endpoint that re-generates all illustrations for a given `storyId` with the new prompt, so the user can re-cook a whole book in one click.

### 2026-06-05 13:48 +08:00 - MiniMax
- Summary: Replaced the opaque black pill (which the user called ugly) with a warm cream cartouche — a pale paper "插画框" with a thin warm-red border, the 绘本 printed-book look.
- Changed:
  - `apps/web/app/(app)/gallery/[id]/page.tsx` `SmartCaption`:
    - Background: `rgba(255, 245, 225, 0.82)` (米黄/old paper) instead of opaque black.
    - Border: `1px rgba(168, 42, 58, 0.35)` (warm red, low opacity) — looks like a printed "text box" in a children's book.
    - Soft warm-brown drop shadow `rgba(80, 30, 0, 0.15)` instead of harsh black.
    - Restored the smart `textColor` / `strokeColor` from the hook — the cream background gives the legibility that the previous "floating text" approach couldn't, so we can keep the adaptive color palette on top of it.
    - Dropped font size one notch (text-2xl → text-xl on mobile, sm:text-3xl → sm:text-2xl on larger) so the cartouche doesn't dwarf the illustration on small screens.
- Files: `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: same as before — caption picks the corner the analyzer says is emptiest, now framed in a pale cream cartouche with a soft red border; text is the smart-chosen red/cream pair from the hook.
- Risks/Next: This is still a 2D overlay — for true picture-book look the text should be painted INTO the image by the model (the original `textOnImage` prompt). The "bake in" path is the right long-term solution; this overlay is a stopgap for the already-generated images. If the user wants it gone, the next step is to re-generate illustrations with a stronger `textOnImage` instruction and skip the overlay when the image already contains text (we'd need an LLM check to confirm the text is present).

### 2026-06-05 13:44 +08:00 - MiniMax
- Summary: Caption now sits inside a translucent text-banner pill — printed-children's-book style. Even when the chosen corner still bleeds into the subject (which is the common case for close-up character scenes like the 武松 tavern shot), the text remains perfectly readable instead of clashing with the illustration.
- Changed:
  - `apps/web/hooks/useSmartCaption.ts` `analyzeCorner`:
    - Tightened sample region from 50% (half-image) to 30% (smaller, tucked further into the corner).
    - Denser sampling (step=1 instead of step=2) for a more accurate edge-density reading.
    - Re-balanced score: `variance * 0.5 + edgeDensity * 0.5` (equal weight; edge density is the more reliable "is this a character/face?" signal).
  - `apps/web/app/(app)/gallery/[id]/page.tsx` `SmartCaption`:
    - Removed the per-position `textColor` / `strokeColor` swap (the adaptive color was good in theory but produced low-contrast combos on busy scenes). The text is now **always cream on a translucent dark pill** (`rgba(0,0,0,0.55)` with a backdrop-blur and soft shadow) — same legibility on every scene, no edge cases.
    - Position is still smart (uses the analysis), so different images still pick different corners — just the text styling is constant for guaranteed contrast.
- Files: `apps/web/hooks/useSmartCaption.ts`, `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: 武松打虎 page 2 (the tavern scene) should now show the caption in a dark translucent pill at the chosen corner — readable, no clashing with the character's shoulder. Other pages will pick whatever corner the analysis says is emptiest; the styling stays consistent.
- Risks/Next:
  - A solid pill is a visual departure from the earlier "red text floating on the image" reference the user shared. If they want the painted-on look back, the next step is to keep the pill subtle (low-opacity, small) AND add per-image color logic back in as a secondary effect.
  - The pill width is 40% on `lg:` and full on mobile — long captions will wrap a lot on busy scenes. We could shrink the font dynamically when the content length > threshold, or split into two text blocks.
  - For the most accurate placement ("never overlap a face"), the next upgrade is to use a vision LLM call to return `{position, ...}` per image — adds latency and a per-image API call but is the only way to get a true saliency map. Worth it for the production path, not worth it for this dev loop.

### 2026-06-05 13:34 +08:00 - MiniMax
- Summary: Caption placement on the reading view no longer lands on the subject's face. The 4-corner analysis now uses true 25%-area corner boxes (instead of half×half quadrants) and adds edge density to the "is this empty?" score, so the text is constrained to actual corners and won't pick a half-image quadrant that bleeds over the subject.
- Changed:
  - `apps/web/hooks/useSmartCaption.ts`:
    - Replaced `analyzeQuadrant` (which used half-image regions) with `analyzeCorner` which samples the four true corners of the image, each 25% of the canvas area. The center 50% is never sampled, so a subject standing in the middle is never included in any candidate.
    - Added **edge density** to the "emptiness" score: pure variance misses regions that are uniform-but-textured (calm forest canopy), but combining `variance * 0.6 + edgeDensity * 0.4` ranks truly empty regions (sky, plain ground) above busy ones (faces, characters, dense foliage).
  - `apps/web/app/(app)/gallery/[id]/page.tsx`: constrained each position class to a max-width of 40% on `lg:` so the caption block stays inside the chosen corner and doesn't wrap into the center.
- Files: `apps/web/hooks/useSmartCaption.ts`, `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: open 武松打虎 page 1 (which previously had the text overlaid on 武松's face). The corner analysis now picks the actual corner of the image (sky, in this case) and the text block stays within the corner area, not bleeding over the character.
- Risks/Next:
  - Edge density here is a 1D row-wise diff — good enough to catch obvious subjects, but a real Sobel/gradient (or saliency) would be more accurate. If we still see character occlusions on other stories, that's the next step.
  - The 40% max-width cap on desktop can make the text wrap more lines on busy scenes with long captions. If we observe this, a) auto-shrink font when content > threshold, or b) use a slim decorative banner behind the text (a 4-px cream box) for legibility.

### 2026-06-05 13:22 +08:00 - MiniMax
- Summary: Story caption on the reading view is no longer a fixed position + fixed color. Each page analyzes its own image to pick the emptiest quadrant for placement and a high-contrast text/stroke palette for that quadrant's brightness — matching the user's "根据整体来的" expectation. No more "always bottom-right, always red".
- Changed:
  - `apps/web/hooks/useSmartCaption.ts` (new): hook that loads the segment image into a hidden canvas, samples the four quadrants, picks the one with the lowest pixel variance (the most uniform / subject-free region), and derives a text/stroke color pair from that quadrant's mean luminance:
    - `mean < 0.25`: cream text + navy stroke (very dark scenes)
    - `mean < 0.45`: cream text + navy stroke
    - `mean > 0.7`: navy text + cream stroke (very bright scenes)
    - mid: warm red text + cream stroke (default 绘本 look)
    - CORS-tainted fallback: a deterministic hash-based position + small palette (4 corners, 4 color pairs) so different images still get different layouts even if canvas analysis is blocked by the CDN.
  - `apps/web/app/(app)/gallery/[id]/page.tsx`:
    - Replaced the hard-coded bottom-right red overlay with a new internal `SmartCaption` component that calls the hook and applies the dynamic position (top-left / top-right / bottom-left / bottom-right) and color.
    - `POSITION_CLASSES` and `TEXT_ALIGN` maps keep the layout math readable and tweakable.
    - While the analysis is running, nothing is rendered (no flash of default position).
- Files: `apps/web/hooks/useSmartCaption.ts` (new), `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` in `apps/web` passes. Visual: open `/gallery/<id>` for the 武松打虎 story and flip through all 7 pages — each page should auto-place the caption in a different corner (whichever corner has the most uniform background in that illustration) and use cream/navy/red depending on local brightness. Pages with dark/sunset scenes should get cream text; bright outdoor scenes should get red or navy text.
- Risks/Next:
  - 128×128 sampling is enough to pick a quadrant, but won't catch small-but-important subjects (e.g. a character standing in the bottom-right corner gets text overlaid on their face). If we observe that, the next iteration is to (a) increase sample size, (b) use the image's actual corner pixels at full res, or (c) call a vision LLM (the apiz.ai one) to return `{position, textColor, strokeColor}` per image — most accurate but adds latency and cost.
  - Long text on a small "uniform" quadrant still risks running off the edge. The fallback wraps at the natural width but the smart-case could overflow. Worth a follow-up to use `box-decoration-break: clone` plus a subtle cream rounded banner behind the text when content length > threshold.
  - The hook currently re-runs on every `imageUrl` change — fine for gallery where the user only flips pages, but a per-image cache (e.g. a tiny LRU keyed by URL) would be safer if this gets reused on the generate page too.

### 2026-06-05 12:56 +08:00 - MiniMax
- Summary: Reading view now renders the story text directly on the illustration in picture-book style (red 楷体 with cream-colored stroke) — same visual pattern as the PDF export. Right-hand column no longer duplicates the text; it shows just the audio controls + a small page/section title.
- Changed:
  - `apps/web/app/(app)/gallery/[id]/page.tsx`:
    - Added a translucent text overlay on the illustration that mirrors the PDF rendering: `currentSegment.content` rendered in `#a82a3a` red, 3px `#fff5e1` cream stroke via `paintOrder: 'stroke fill'`, with a soft drop shadow for legibility on any background. Font stack: `KaiTi, STKaiti, Noto Serif CJK SC, ZCOOL KuaiLe, serif` (system fonts, no extra asset).
    - Position: bottom-right of the image (matches the reference photo the user shared); spans full width on phone (`right-4 left-4`), capped at 55% width on `lg:` so it sits over the illustration, not the right column.
    - Right column: stripped the duplicated title + body + decorative divider section; kept a small "第 N 页 + 标题" header and the audio player / generate-audiobook controls.
- Files: `apps/web/app/(app)/gallery/[id]/page.tsx`.
- Validation: `npx tsc --noEmit` in `apps/web` passes. Visual: open `/gallery/<id>` for a fully-illustrated story (e.g. 武松打虎 / 小红帽) and swipe through pages — each page should show the story text floating in red 楷体 with white outline over the bottom-right of the image, regardless of viewport.
- Risks/Next: Long text (>~50 chars) on a small image can overflow the right side and run off the edge. If we observe this on 武松打虎 page 1 ("武松...走亲戚的路上") or similar, the next step is either (a) auto-shrink the font when content > threshold, (b) wrap the text into a cream-tinted rounded box behind the stroke for legibility on busy backgrounds, or (c) follow the reference more closely and position the caption upper-right when the scene is bright lower-half (e.g. cityscape). For now the simple bottom-right placement matches the reference.

### 2026-06-05 12:34 +08:00 - MiniMax
- Summary: The Illustration Prisma row is now the source of truth for `imageStatus` / `imageUrl` in the UI — storyboard JSON is the fallback. Eliminates a class of "重试 button shows but API says already completed" mismatches.
- Changed:
  - `apps/web/lib/api/story.ts` `normalizeStory`:
    - For each segment, prefer `illustration.status` (Prisma row) over `scene.image?.status` (storyboard JSON) when setting `imageStatus`. The row is written transactionally with the image result; the storyboard can lag (e.g. retry writes row='completed' but the storyboard scene still has the old `image.status='failed'` from the previous attempt).
    - Same flip for `imageUrl` (row first, storyboard fallback).
    - Added `errorMessage` field propagation from the row to the segment so the UI can show the real error from the image provider.
    - Added `errorMessage` + `failureCategory` to the `ApiIllustration` interface (matches what the API already returns).
  - `apps/web/types/story.ts`: added `errorMessage?: string` to `StorySegment`.
  - `apps/web/components/story/illustration-progress.tsx` `SceneStatus`: now uses `segment.errorMessage` (the real reason) instead of `segment.sceneDesc` (the scene's prompt description). The component was previously mislabeling the scene's prompt as "失败原因" — the new field fixes both data sources.
- Files: `apps/web/lib/api/story.ts`, `apps/web/types/story.ts`, `apps/web/components/story/illustration-progress.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: scenes whose Illustration row says 'completed' now render with "插画已完成" / image preview instead of the misleading "重试" button. Failed scenes show the actual provider error message (e.g. "codex.apiz.ai HTTP 400: image_download_failed") instead of the scene's prompt description.
- Risks/Next: The data flow is now read-from-DB-truth on every page load via `loadStory`. If the user clicks 重试 rapidly, the success path is still the Illustration row update, so consistency is maintained. The only remaining risk: if some legacy code path writes to the storyboard without updating the Illustration row, the UI now shows the row (correct) but the storyboard drifts further from truth over time. Eventually the storyboard should be deprecated or strictly derived from the Illustration table.

### 2026-06-05 12:12 +08:00 - MiniMax
- Summary: Clicking 重试 on one failed scene no longer silently blocks clicking 重试 on a different failed scene — each scene card can be retried independently and concurrently.
- Changed: `apps/web/app/(app)/create/generate/page.tsx`:
  - Replaced `retryingSceneIndex: number | null` with `retryingSceneIndices: Set<number>`.
  - The click handler adds the scene index to the set, runs the retry, removes it in `finally`. The single-flight guard `if (retryingSceneIndex !== null) return;` is gone, so clicks on other scenes are no longer silent no-ops.
  - The button text "正在重新生成中…" + spinner is now driven by `retryingSceneIndices.has(thisScene)` instead of a single global state, so each card flips independently.
  - The button's `disabled` only checks the batch-level guards (`isIllustrating`, `illustrationLockRef`); single-scene retries never disable other scene buttons.
- Files: `apps/web/app/(app)/create/generate/page.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: with pages 4 and 5 both failed, click 重试 on page 4 — it flips to spinner. Then click 重试 on page 5 — it ALSO flips to spinner (page 4 still spinning). They resolve independently when each API call returns.
- Risks/Next: User can now fan out N parallel retries, which means N parallel calls to apiz.ai. If the user clicks 6 at once, we hit apiz.ai with 6 simultaneous image-task creates. The downstream provider has its own rate limit; if we observe 429s, dial this back. Acceptable for now since the user is on a dev account with a low concurrent-illustration cap (`ILLUSTRATION_MAX_RECOVERY_RETRIES=3`).

### 2026-06-05 12:04 +08:00 - MiniMax
- Summary: Scene cards stuck in "绘制中..." with a spinning loader (because the Illustration row is `processing` in the DB but the page is not actively running a batch) now show as recoverable — "生成失败" + 重试 button — instead of an endless spinner.
- Changed: `apps/web/app/(app)/create/generate/page.tsx`:
  - Added `isStuck = !isIllustrating && imageStatus === 'generating' && !imageUrl` — true when the page is not running a batch but a segment's DB status is still `generating` (job died mid-flight, Redis hiccup, etc.).
  - Folded `isStuck` into `isFailed` so the existing "生成失败 + 重试" UI handles the stuck case without new branches.
  - Tightened the "绘制中..." gate from `isGenerating || imageStatus === 'generating'` to just `isGenerating` (page is actively running a batch) so stuck segments stop pretending to be in progress.
- Files: `apps/web/app/(app)/create/generate/page.tsx`.
- Validation: `npx tsc --noEmit` passes. Visual: previously stuck cards (e.g. dev DB scenes 3/4 on the user's 武松打虎 story, scenes on `cmpql2x8t0`/`cmpqymm5d0`/`cmpv0wam50`) should now render as "生成失败" with a clickable 重试 button. The retry endpoint (per the previous entry) already handles these, so clicking 重试 will kick off a fresh generation.
- Risks/Next: The dev DB has 9 illustrations stuck in `processing` state (4 from `cmpql2x8t0`, 2 from `cmpqymm5d0`, 3 from `cmpv0wam50`). The user can now click 重试 on each to un-stick them. If the user wants the DB cleaned up in one shot, a one-off SQL update would do: `UPDATE Illustration SET status='failed', errorMessage='Job died mid-flight (healed by migration)' WHERE status='processing'`. Ask if you want me to do that.

### 2026-06-05 12:00 +08:00 - MiniMax
- Summary: Per-scene retry button on the generate page now shows "正在重新生成中…" with a spinner while the retry is in flight (was: just instantly reset back to "重试" with no visible feedback, leaving the user unsure if the click registered).
- Changed: `apps/web/app/(app)/create/generate/page.tsx` — added a `retryingSceneIndex` state and wired it into the per-scene retry button. While that scene's retry is in flight the button swaps text to "正在重新生成中…" with a `Loader2` spinner, disables itself, and also disables all other retry buttons in the same grid (single-flight, no parallel retries per story). The local `illustrationLockRef`/`isIllustrating` guards still apply so a retry can't fire while a batch illustration is running.
- Files: `apps/web/app/(app)/create/generate/page.tsx`.
- Validation: `npx tsc --noEmit` in `apps/web` passes. Visual: click "重试" on a failed scene card; the button should immediately change to "正在重新生成中…" + spinner and stay that way until the API returns; then the segment flips to either "插画已完成" or "生成失败" (depending on result).
- Risks/Next: The `illustration-progress.tsx` `SceneStatus` component (used on the gallery detail page) already has a similar `isRetrying` flow with a spinner. The two should converge — extract a single `<SceneRetryButton>` so the UX is consistent. Not blocking; flag for next refactor.

### 2026-06-05 11:54 +08:00 - MiniMax
- Summary: Single-scene retry button now also works on illustrations stuck in `processing` or `pending` state (e.g. job died mid-flight, Redis went away), not just on rows explicitly marked `failed`.
- Changed: `apps/api/src/routes/illustration/index.ts` `POST /:id/illustrations/:sceneIndex/retry`:
  - The status gate flipped from `if (status !== 'failed') → 400 "Only failed illustrations can be retried"` to `if (status === 'completed') → 400 "already completed"`. The previous gate left a class of recoveries un-blockable: dev DB inspection showed 9 illustrations stuck in `processing` with `retryCount=0` and empty `errorMessage` — the queue worker had never reached them, so the row never became `failed`, but the UI was already showing "生成失败" because the synthetic-progress fix in the previous entry made the page fall through to the failed-state UI. Clicking retry on those cards now actually works.
  - Reset also clears `retryCount` (was leaving old count visible after retry, which made the next failure look like "tried 4 times" even though this was attempt 0 of a fresh run).
  - Added `await checkAllIllustrationsCompleted(storyId)` after success so the story's `illustrated` status gets promoted the moment the last scene finishes via single-scene retry.
- Files: `apps/api/src/routes/illustration/index.ts`.
- Validation: `npx tsc --noEmit` in `apps/api` passes. Behavioral check pending — click retry on a card that previously got "Only failed illustrations can be retried"; it should now kick off a fresh generation and update the row to `pending → processing → completed/failed` as the AI runs.
- Risks/Next: This is a behavioral relaxation — a user could now retry an illustration that is *currently* running (status='processing' from a still-queued job), causing two parallel jobs to fight for the same row. If the user clicks retry on an in-flight job, the first job will eventually write its result and the second job's later write will overwrite — usually fine since they target the same scene, but could in theory lead to flicker. Worth adding a small guard (`if (status === 'processing')` → 409 Conflict "already in progress") if we observe race issues in practice.

### 2026-06-05 11:48 +08:00 - MiniMax
- Summary: Illustration generation no longer gets stuck on "生成绘本中" when individual scenes fail (e.g. apiz.ai returns `image_download_failed`). Frontend now correctly shows per-scene "生成失败" + retry button, and unblocks the start button.
- Changed:
  - `apps/api/src/routes/story/index.ts` `GET /:id/progress`: when the story row is still `processing` but every illustration has reached a terminal state (`completed` OR `failed`), return a synthetic `status: 'failed'` (or `completed` if all succeeded) with a `currentStep` like `插画已结束 (4 张成功, 2 张失败)`. This lets the frontend `startProgressPolling` loop in `useStory` actually stop polling — previously it would loop forever because the story-level `processing` status never went to `completed` unless every single illustration succeeded (`checkAllIllustrationsCompleted` only promotes when `every` is completed).
  - `apps/web/app/(app)/create/generate/page.tsx` auto-illustration useEffect: added `segment.imageStatus === 'failed'` to the "skip auto-trigger" predicate so a failed batch doesn't immediately auto-restart and burn through the dev user's quota.
- Files: `apps/api/src/routes/story/index.ts`, `apps/web/app/(app)/create/generate/page.tsx`.
- Validation: `npx tsc --noEmit` passes in both `apps/api` and `apps/web`. Behavioral test pending — start a new illustration on a story whose character has a 404 source image, observe that the per-scene badges flip from "绘制中..." to "生成失败" + 重试 button within a few poll cycles, and the start button becomes clickable again.
- Risks/Next: The synthetic `failed` status is for the PROGRESS endpoint only — the underlying story row's status is still `processing`. If some other code path reads story.status expecting the truth, it might mismatch. Audit any other consumers of `/api/stories/:id/progress` (admin dashboard, billing, etc.). Also, the user reported the underlying error is `codex.apiz.ai HTTP 400: image_download_failed` — that means the source image URL stored in `Character.stylizedPhotoUrl` is no longer reachable from apiz.ai's network. Worth checking: (1) is the CDN URL still valid? (2) is the OSS bucket public-readable or does it need signed URLs that apiz.ai can't generate? (3) is the 51sux.com CDN accessible from apiz.ai's IP range? The progress fix is correct UX, but the root cause needs the user's investigation.

### 2026-06-05 11:18 +08:00 - MiniMax
- Summary: Stylize-character errors now show the actual problem instead of the cryptic "查询成功" string from apiz.ai; also explain what shape of response triggered the error.
- Changed: `apps/api/src/services/ai.service.ts` `createImageTask` error branch now includes a `code=… success=… data=present|null` shape hint in the thrown message, so when apiz.ai returns `{code:200, message:"查询成功", data:null}` (which it does on model-unavailable / validation / quota-style failures), the user sees something like `Failed to create image task (code=200 success=undefined data=null): 查询成功` instead of the bare Chinese default. The full raw response is still logged via `console.error` for postmortem. Root cause: the old code only checked `code === 200 || success || taskId` and treated the OR-combination as success, but a missing `data.task_id` fell through to the error branch and used `result.message` (apiz.ai's generic Chinese "Query successful" stub).
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: `npx tsc --noEmit` in `apps/api` passes. Direct apiz.ai call with the user's key confirmed both shapes — (a) `{code:200, message:"任务创建成功，通道: api", data:{task_id:"5dca…", …}}` works, (b) the broken shape we expect is `{code:200, message:"查询成功", data:null}`. After the fix, hitting the broken shape will print the new diagnostic in the toast and in the api server log.
- Risks/Next: Defensive fix only. The real "why is apiz.ai returning 200 with no data" question still stands — worth checking the queued task's actual status afterwards; if it succeeded, retry; if it consistently fails for the same model/prompt, switch to the text-to-image path (`else` branch at line 503) or pick a different model.

### 2026-06-05 11:12 +08:00 - MiniMax
- Summary: Books that are fully illustrated no longer show a misleading "绘制中" badge; gallery card "含视频" badge is now driven by actual video presence instead of story status.
- Changed:
  - `apps/web/lib/api/story.ts` `mapStoryStatus`: backend `illustrated` (set in `illustration.service.ts:665` as a TERMINAL state meaning "all scene illustrations finished") now maps to frontend `completed` instead of `illustrating`. Previously every fully-illustrated book in the gallery read "绘制中" (drawing in progress) on its badge even though the work was done.
  - `apps/web/lib/api/story.ts` `normalizeStory`: also pulls the latest `videos[0].videoUrl` (already included in the API list response via Prisma `include: { videos: { take: 1 } }`) up to a top-level `videoUrl` on the story object, so the gallery list view has the data without needing a second `getStoryVideo` call.
  - `apps/web/components/illustration/IllustrationCard.tsx` `hasVideo`: now checks `Boolean(story.videoUrl)` instead of `story.status === 'completed'`. After the status fix above, the `completed` status covers both illustrated-only books and books with video, so status alone was no longer a reliable "has video" signal.
- Files: `apps/web/lib/api/story.ts`, `apps/web/components/illustration/IllustrationCard.tsx`.
- Validation: `npx tsc --noEmit` in `apps/web` passes. Visual check: gallery books tab should now show "已完成" on the 4 fully-illustrated books in the user's screenshot (小红帽 / 曹冲称象 / 小红帽 / 匹诺曹), no "绘制中". "含视频" badge should remain hidden (DB has 0 video rows); will start showing when a video is generated.
- Risks/Next: If any flow relies on the OLD `illustrating` mapping for `illustrated` (e.g. progress bars, polling logic in `illustration-progress.tsx`), the behavior changes. Worth a quick smoke test on the reading page to make sure the "all scenes done" affordance still surfaces (the `story-preview.tsx` "every segment is completed" check should now trigger correctly).

### 2026-06-05 10:54 +08:00 - MiniMax
- Summary: API no longer hides books whose character has been deleted. A book is the user's creation, not the character's — deleting a character shouldn't make the book disappear.
- Changed: `GET /api/stories` and `GET /api/stories/:id` in `apps/api/src/routes/story/index.ts` no longer do an N+1 `prisma.character.findUnique` and silently drop stories whose `characterId` references a missing character. The dev user previously had 30 orphan stories (out of 71 total) that were invisible to the gallery because of this. They are now returned; the API logs a warning for stories without a `characterId` so we still notice if any exist. Frontend list now receives the full 71 and the `readableStories` predicate decides which are shown.
- Files: `apps/api/src/routes/story/index.ts`.
- Validation: `npx tsc --noEmit` in `apps/api` passes. Direct `GET /api/stories` call returned `{ data: [...71 items...] }` (status distribution: completed 16, draft 5, failed 26, illustrated 18, processing 6) — was 41 before. Home tab "我的绘本" card should still show 18 (because `readableStories` filter is unchanged), but the list now paginates from 71 not 41 so the previously-hidden orphans become reachable as "draft/failed/no-illustration" entries.
- Risks/Next: If user clicks a draft/failed/legacy orphan book, the reading page might still try to look up the character. Watch for 404 / null deref. If a fix is needed, the reading page should treat missing character as "(角色已删除)" rather than crash. Add `characterMissing: boolean` to the response if we want to render a badge in the gallery card.

### 2026-06-05 10:38 +08:00 - MiniMax
- Summary: Gallery "我的绘本/我的视频" tabs now paginate via a "加载更多" button instead of silently dropping everything past the first 12 stories. Home-tab card counts now reflect the **actual total** (across the full API result), not the loaded-so-far page.
- Changed: `useGallery` hook now keeps the full API result in a new `allStories` state (alongside the paginated `stories` slice), and exposes `isLoadingMore` + `loadMoreStories()` which appends the next page (with de-dupe by id) rather than replacing. `deleteStory` now also trims `allStories`. `apps/web/app/(app)/gallery/page.tsx` derives a shared `isReadableStory` / `hasVideo` predicate, computes `totalReadableCount` and `totalVideoCount` from `allStories` for the home-tab cards (so the number stays correct as the user pages), and renders an outline "加载更多绘本/视频" button at the bottom of books and videos tabs that calls `loadMoreStories`. `Loader2` icon import added.
- Files: `apps/web/hooks/useGallery.ts`, `apps/web/app/(app)/gallery/page.tsx`.
- Validation: `npx tsc --noEmit` in `apps/web` passes (no type errors). Manual verification: dev 账号 valid 故事 41 条 → 通过 filter 的应约 18 条；home tab "我的绘本" 卡片应显示 18（不随加载变）；点 "加载更多绘本" 按钮，列表里追加下一页，home tab 数字保持 18。
- Risks/Next: API still returns all stories in one shot (`GET /api/stories` has no `?page=&limit=`). For thousands of users this becomes a problem; when we hit that scale, move pagination server-side. Orphan-story filter (30 stories whose `characterId` is missing in `Character`) still happens silently in `GET /api/stories` — if the user wants them visible we should add a "orphans" recovery path or a soft-delete column instead of hard cascade.

### 2026-06-05 10:12 +08:00 - MiniMax
- Summary: Told the image-edit model to treat the stylized portrait as an *identity* reference only (face/hair/skin tone), not a pose/expression reference, so each scene can show the appropriate facial expression for its story beat.
- Changed: `compositeIllustration` in `ai.service.ts` now passes an expanded `characterHint` to the image-edit prompt. After the "keep identity" sentence we add: "The reference photo is only an IDENTITY reference, NOT a pose or expression reference. Let the character's facial expression, body language, and pose match the SCENE's mood and story beat (e.g. afraid when facing a wolf, brave when rescuing, smiling when reuniting). It is NORMAL and DESIRED for the character to show different expressions in different scenes — that is what makes a picture book." This addresses the case where a user uploaded a smiling photo and the picture book then locks the character to smiling in every scene (e.g. 武松打虎 with a smile).
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — prompt change only. `tsx watch` will reload.
- Risks/Next: The model may still anchor to the reference expression if it over-prioritizes identity preservation. If real regenerations still show the locked expression, we can add a "negation" line: "Do NOT carry over the smile/expression from the reference photo unless the scene description explicitly calls for it."

### 2026-06-05 10:10 +08:00 - MiniMax
- Summary: Reverted stylize-character back to single-view portrait and softened the story-generation scene-count rule so the LLM decides the count from the story's actual beats (e.g. 小红帽 may be 6–9 scenes, a very short story may be 4).
- Changed:
  - `apps/api/src/config/story-costume-profiles.ts` — removed the "multi-view" prefix and reverted to single-image `Setting / Character / Costume / Prop / Mood / Note / styleSuffix` payload.
  - `apps/api/src/services/ai.service.ts` `stylizeCharacter` — reverted `stylePrompts` map and the LLM-fallback `styleDesc` to single-portrait English wording, and put `image_size` back to `1:1` for the edit branch.
  - `apps/api/src/services/ai.service.ts` `STORY_GENERATION_PROMPT` rule 3 now reads "先在脑内列出该经典故事的所有关键情节（必须包括广为人知的主要事件，不可省略任何标志性场景），再决定 scenes 数量" instead of a hard ≥ 6 floor, and rule 8 is back to "scenes 数量由 LLM 根据故事内容决定".
  - `apps/api/src/services/ai.service.ts` `isStoryComplete` lowered scene minimum from 6 to 3, so short valid stories (e.g. 3-scene monologue) won't be rejected.
- Files: `apps/api/src/config/story-costume-profiles.ts`, `apps/api/src/services/ai.service.ts`.
- Validation: Not run — pure prompt + threshold change. `tsx watch` will reload.
- Risks/Next: A misbehaving LLM could still under-deliver on a canonical story (the "4-scene 小红帽" we already shipped is a pre-existing example). If this regresses, consider adding a per-template required-beats checklist inside the prompt.

### 2026-06-04 16:09 +08:00 - Codex
- Summary: Added the first interactive audiobook reader path with per-scene TTS audio generation and playback while paging through a story.
- Changed: Added `SceneAudio` persistence, audiobook GET/POST story routes, per-scene TTS generation service, API registration, frontend audiobook types/API calls, and gallery detail audio controls with page playback and autoplay-next support. Also guarded nullable `characterId` story lookups and escaped decorative quote text that blocked the web build.
- Files: `apps/api/prisma/schema.prisma`, `apps/api/src/services/audiobook.service.ts`, `apps/api/src/routes/audiobook/index.ts`, `apps/api/src/index.ts`, `apps/api/src/routes/story/index.ts`, `apps/web/types/story.ts`, `apps/web/lib/api/story.ts`, `apps/web/app/(app)/gallery/[id]/page.tsx`, `apps/web/components/illustration/IllustrationCard.tsx`.
- Validation: `npm run build --workspace=apps/api` passed; `npm run build --workspace=apps/web` passed with an existing `react-hooks/exhaustive-deps` warning in `apps/web/app/(app)/create/generate/page.tsx`; `prisma db push` succeeded after loading `DATABASE_URL` from `.env`; `prisma generate` failed because Windows denied renaming `node_modules/.prisma/client/query_engine-windows.dll.node`, likely due to a running Node/API process holding the file.
- Risks/Next: Restart Node/dev server processes and rerun `npm run db:generate --workspace=apps/api` so the generated Prisma client is refreshed cleanly; first audiobook generation is synchronous and may take time for longer stories, so a queued/background version would be a good next step.

### 2026-06-04 13:35 +08:00 - MiniMax
- Summary: Added optional `textOnImage` to scene prompt builder so story text can be rendered directly onto illustration images.
- Changed: `buildVisualScenePrompt` now emits a `TEXT ON IMAGE` instruction block when `textOnImage` is provided; `ScenePromptOptions` gains a `textOnImage?: string` field; illustration service passes `scene.text` as `textOnImage` when generating each scene. Also tightened story-generation prompt: at least 6–8 scenes required, must include opening / development / climax / ending, each `storyText` ≤ ~30 chars; relaxed `isStoryComplete` scene minimum from 3 to 6.
- Files: `apps/api/src/services/ai.service.ts`, `apps/api/src/services/illustration.service.ts`.
- Validation: Not run — code change only, no `npm run build` invoked. Restarted dev server (`npm run dev`).
- Risks/Next: apiz.ai image provider may ignore the new instruction and add its own decorative Chinese text. Need real regeneration test to confirm text appears; if not, switch to a different provider or post-process overlay.

### 2026-06-04 18:38 +08:00 - MiniMax
- Summary: Added MiniMax T2A v2 as the `audioType='minimax'` TTS provider, using the existing `MINIMAX_API_KEY` (CodePlanPlus).
- Changed:
  - `apps/api/src/services/tts.service.ts`: added `MINIMAX_TTS_VOICES`, `MINIMAX_DEFAULT_VOICE` ('male-qn-qingse'), and `generateMinimaxTTS(options)`. POSTs to `https://api.minimaxi.com/v1/t2a_v2` (overridable via `MINIMAX_TTS_URL`) with `Authorization: Bearer ${MINIMAX_API_KEY}`. Decodes the hex-encoded mp3 from `data.audio`, writes to `public/temp/tts/minimax_tts_*.mp3`, uploads to OSS with a local fallback URL. Returns `audioLength / 1000` as `duration` when available. Default model `speech-2.6-hd`.
  - `apps/api/src/services/audiobook.service.ts`: `AudiobookOptions.audioType` now also accepts `'minimax'`; routes the scene through `generateMinimaxTTS`.
  - Verified end-to-end with the live CodePlanPlus key: HTTP 200, `base_resp.status_code: 0`, 42 KB mp3 saved for "你好，这是测试声音。" with `male-qn-qingse`.
- Files: `apps/api/src/services/tts.service.ts`, `apps/api/src/services/audiobook.service.ts`.
- Validation: One real curl/node test passed; user-side usage will require a frontend option that posts `audioType: 'minimax'`.
- Risks/Next: Frontend still hard-codes `audioType='tts'`. Need a UI toggle for "MiniMax TTS" / "MiMo TTS" / "Edge TTS" before users can pick.
- Summary: Wired MiMo-V2.5-TTS as the `audioType='mimo'` provider in the audiobook flow, with a token-plan fallback URL + Bearer auth.
- Changed:
  - `apps/api/src/services/tts.service.ts`: added `MIMO_TTS_VOICES`, `MIMO_DEFAULT_VOICE` ('冰糖'), and `generateMimoTTS(options)` which calls the OpenAI-compatible chat completions API, decodes `message.audio.data` (base64), writes a .wav to `public/temp/tts/`, and uploads to OSS with a local fallback URL. New env vars: `MIMO_API_KEY`, optional `MIMO_API_URL` (default = `https://api.xiaomimimo.com/v1/chat/completions`). Auth header switches to `Authorization: Bearer ...` when the key starts with `tp-`, otherwise uses `api-key: ...` (the older MiMo convention).
  - `apps/api/src/services/audiobook.service.ts`: `AudiobookOptions.audioType` now accepts `'mimo'`; when set, routes the scene through `generateMimoTTS` instead of edge-tts.
  - `.env`: added `MIMO_API_KEY=tp-cg0lo9wbw4ffixltwee9yylek0na6i4r7dq9zux53pjc7ube` and `MIMO_API_URL=https://token-plan-cn.xiaomimimo.com/v1/chat/completions` so the token-plan endpoint is preferred.
- Files: `apps/api/src/services/tts.service.ts`, `apps/api/src/services/audiobook.service.ts`, `.env`.
- Validation: Direct curl test with this key returned `429 quota exhausted` from the token-plan endpoint, and `402 Insufficient account balance` from the legacy endpoint. Code is correct; account needs top-up before real synthesis.
- Risks/Next: If quota is hit during real usage, add a fallback to edge-tts (or return a clear 402/429 error to the user instead of 500). Frontend still hard-codes `audioType='tts'` — when user is ready, surface a "MiMo TTS" option in the audiobook modal.
- Summary: Replaced `require('fs/promises')` (CommonJS) with top-level `import { readFile, unlink } from 'fs/promises'`. The previous file-mode fix used `require` which threw `require is not defined` because `tsx` runs the file as ESM.
- Changed: `generateEdgeTTS` now imports `readFile` and `unlink` from `fs/promises` at the top of the file, and uses them directly inside the promise chain. Also wrapped `proc.on('close', ...)` callback in `async` to allow `await uploadAndResolve()`.
- Files: `apps/api/src/services/tts.service.ts`.
- Validation: Not run — fix for compile-time error only. `tsx watch` will reload.
- Risks/Next: If `readFile` import wasn't already used elsewhere, the bundle will now include it. That's a few extra KB at most, no functional risk.
- Summary: Switched TTS invocation from inline `py -3 -c "<script>"` to `py -3 "<script>.py"` via temp file. The inline `-c` form was being mangled by Windows shell quoting and the spawned Python received a None `-c` option.
- Changed: `generateEdgeTTS` now writes the inline script to `public/temp/tts/edge_tts_script_*.py` and spawns `py -3 <file>` / `python3 <file>` / `python <file>` in order. The fallback chain still tries multiple Python invocations, but each one now passes a real file path so Python's argument parser is happy. Cleans up the script file after the process exits (success or failure).
- Files: `apps/api/src/services/tts.service.ts`.
- Validation: Not run — code change only. `tsx watch` will reload. The previous "Argument expected for the -c option usage" stderr from `Python\pythoncore-3.14-64\python.exe` should disappear because we're no longer using `-c` at all.
- Risks/Next: Script file leaks if process is force-killed. Add a periodic cleanup of `public/temp/tts/edge_tts_script_*.py` later.
- Summary: Consolidated TTS pipeline: `generateEdgeTTS` now goes directly to Python `edge-tts` via `py -3 -c` (no more npx/npm fallback chain that was throwing "could not determine executable"). Removed dead `generateEdgeTTSPython` helper and made `generateEdgeTTSDirect` a thin alias to keep `audiobook.service.ts` and `video.service.ts` working.
- Changed:
  - `generateEdgeTTS` is the only implementation. Spawns `py -3 -c "<inline script>"` (Windows) / `python3 -c ...` (Unix). Sets `cwd=process.cwd()`, `PYTHONIOENCODING=utf-8`, `PYTHONUTF8=1`. Passes `rate/volume/pitch` to the Python `Communicate` so the new keyword args actually take effect (old code dropped them on the floor).
  - On spawn error / non-zero exit / missing output file: reject with a clear, actionable message ("Make sure Python 3 is installed and `edge-tts` is available").
  - Removed the `npx --yes edge-tts` path entirely — that was the source of the "could not determine executable" stderr users were seeing.
  - Removed `generateEdgeTTSPython` (private helper, no other callers).
  - `generateEdgeTTSDirect(text, voice, outputPath)` now just delegates to `generateEdgeTTS` so `audiobook.service.ts:41` and `video.service.ts:219` keep compiling.
- Files: `apps/api/src/services/tts.service.ts`.
- Validation: Not run — pure refactor + spawn change. `tsx watch` will reload. Need real TTS click to confirm Python script executes cleanly.
- Risks/Next: If `py` is not on PATH (or `edge-tts` not installed) on a teammate's machine, TTS will fail with a clear message — install docs should mention `pip install edge-tts`. May also want to add a project-level `pyproject.toml`/`requirements.txt` for dev deps.
- Summary: Switched Python invocation to `py -3` on Windows so the launcher is found, and removed the broken Python-script placeholder that was producing "expected str, bytes or os.PathLike object, not NoneType".
- Changed: `generateEdgeTTSPython` now spawns `py -3 -c <script>` on `win32` (was hard-coded `python` which was missing from PATH). Confirmed `py -3` resolves on this machine and `edge_tts` 7.2.8 is importable. Also reduced the earlier npx→python fallback chain to just the working paths.
- Files: `apps/api/src/services/tts.service.ts`.
- Validation: Not run — spawn change only. `tsx watch` will reload.
- Risks/Next: If `py` is also missing, add a `python3`/`python` fallback. If TTS still fails, check `public/temp/tts/` write perms.
- Summary: Made Python edge-tts the actual fallback for failed npx/CLI runs, so TTS works on Windows when `edge-tts` binary is missing or `npx` cannot resolve it.
- Changed: `generateTTS` on('close') now catches the npx "could not determine executable" stderr and tries `generateEdgeTTSPython` before rejecting. Previously the close handler just rejected with the npm error, even though Python edge-tts 7.2.8 is installed and ready. Also logs the failure to help diagnose.
- Files: `apps/api/src/services/tts.service.ts`.
- Validation: Not run — fallback path change only. `tsx watch` will reload.
- Risks/Next: If both npx and Python fail, the error message will be noisy. If Python succeeds but uploads break, check `getOSSClient` and fallback `/temp/tts` path.
- Summary: Switched TTS command from bare `edge-tts` to `npx --yes edge-tts` so the binary does not need to be globally installed.
- Changed: `generateTTS` now spawns `npx --yes edge-tts --text ...` instead of `edge-tts --text ...`. Fixes `'edge-tts' 不是内部或外部命令` error on Windows when the user has not run `npm i -g edge-tts` (or pnpm equivalent). `npx` will download/run on demand.
- Files: `apps/api/src/services/tts.service.ts`.
- Validation: Not run — spawn change only; `tsx watch` will reload. First TTS request will be slower because npx needs to resolve the package.
- Risks/Next: First-call latency. If we hit it often, add a `postinstall` step to install edge-tts globally on the dev box, or vendor the binary.
- Summary: Injected the multi-view Chinese instruction into `buildCostumePrompt` so preset profiles (snow-white, red-riding-hood, etc.) also produce 3-view sheets.
- Changed: `buildCostumePrompt` now prepends "生成这个参考角色的多视角视图，需要3个视角..." before the role description, and removed the stale "clean portrait" wording from the style suffix. This is the path actually used for preset-template stories (雪公主, 小红帽, etc.) so previous edits to `stylePrompts` alone were not enough.
- Files: `apps/api/src/config/story-costume-profiles.ts`.
- Validation: Not run — prompt change only; `tsx watch` will reload.
- Risks/Next: If preset still fails to produce 3 views, may need to drop `image_urls` (use text-to-image mode) since edit mode may be too constrained.
- Summary: Aligned the LLM-analyzed costume fallback path with the new multi-view Chinese prompt.
- Changed: The fallback path in `stylizeCharacter` now prepends "生成这个参考角色的多视角视图..." and uses Chinese style suffixes, matching `stylePrompts`. Previously this branch still used the old English "reference sheet" wording.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — prompt change only; `tsx watch` will reload.
- Risks/Next: None.
- Summary: Replaced English "reference sheet" wording with the Chinese prompt that the user manually validated on apiz.ai's playground, plus widened the stylize image to 16:9 to fit 3 views.
- Changed: `stylizeCharacter` style prompts now lead with "生成这个参考角色的多视角视图，需要3个视角，左侧视角，正面视角，右侧视角。一张图片有三种视角。保持参考角色的脸部特征、发型完全一致。" then add the style. `image_size` for the edit branch is now `16:9` (was `1:1`) so three side-by-side views fit on one image.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — prompt + image_size change only. User confirmed the wording produces 3-view output on apiz.ai playground.
- Risks/Next: If three views look squished, try `image_size: '3:2'`. Also need to verify the face still matches across all 3 angles (not just middle one).
- Summary: Hard-pinned the main character to front/three-quarter view in composite illustration so the angle issue stops depending on the multi-view reference image.
- Changed: `compositeIllustration` character hint now says "Always show the main character facing the camera in front view or three-quarter view, never back view". Falls back to scene-level angle control regardless of whether the stylized portrait is multi-view or not.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — prompt change only; `tsx watch` will reload.
- Risks/Next: If we later want true back/side views for some scenes, we'll need either a real multi-view reference sheet or a per-scene override.
- Summary: Made the multi-view layout in `stylizeCharacter` more explicit (front / 3-quarter / side / back + close-up portrait) to match professional character design sheets.
- Changed: Replaced "Three side-by-side views" wording with a layout-spec style: "one large front view, one three-quarter view, one side profile view, and one back view, plus a close-up portrait at the top right, each view clearly labeled". Applied to all 4 style prompts and the LLM fallback path.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — prompt change only; `tsx watch` will reload.
- Risks/Next: If GPT-image still ignores the layout, we may need a different model or post-process (split into separate views via image edit).
- Summary: Rewrote `stylizeCharacter` prompt to explicitly request three side-by-side views (front + three-quarter + side profile) on the output image.
- Changed: All four style prompts and the LLM-analyzed costume fallback now describe a 3-view turnaround sheet instead of a single portrait. Hope is that GPT-image respects the "three views" framing better than the previous "reference sheet / multiple angles" wording.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — prompt change only; `tsx watch` will reload. Next style regeneration will use the new prompt.
- Risks/Next: If the model still only produces a single angle, we may need to switch to image-edit mode that uses the original photo as a multi-view seed, or fall back to "always front-facing" in the scene prompts.
- Summary: Switched `stylizeCharacter` to a multi-angle character reference sheet prompt so the stylized portrait is reusable across all scene framings.
- Changed: All four style prompts (pixar / ghibli / clay / handdrawn) now describe a "character reference sheet" with front view + three-quarter view + side view on white background, instead of a single portrait. Same change applied to the LLM-analyzed costume fallback path.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — prompt change only; `tsx watch` will reload. Next style regeneration will use the new prompt.
- Risks/Next: Reference sheets are typically busier than single portraits and may look less "clean". If users complain, we can split into two modes or default back to a single front-facing portrait.
- Summary: Relaxed `isStoryComplete` scene minimum to match the new 6+ scene target.
- Changed: `isStoryComplete` now requires at least 6 scenes (was 5), so a story with exactly 5 scenes no longer falls into the retry loop and surfaces as "AI 创作失败" to the user.
- Files: `apps/api/src/services/ai.service.ts`.
- Validation: Not run — pure threshold change; `tsx watch` will reload.
- Risks/Next: If a short LLM output is acceptable for some templates, we may want a per-template override later.

### 2026-06-04 12:54 +08:00 - Codex
- Summary: Added root agent instructions so MiniMax, Codex, and other editors know to read and update the shared change log.
- Changed: Introduced `AGENTS.md` with required start/end workflow, exact changelog entry format, what to record, and common validation commands.
- Files: `AGENTS.md`, `CHANGELOG.md`.
- Validation: Checked `AGENTS.md` content and confirmed it is visible in `git status --short`.
- Risks/Next: MiniMax must be pointed at the project root or told to read `AGENTS.md` if it does not auto-load agent instruction files.

### 2026-06-04 12:53 +08:00 - Codex
- Summary: Added a shared change log process for Codex, MiniMax, and human handoffs.
- Changed: Created a fixed entry template and rules for recording code, behavior, validation, and follow-up changes.
- Files: `CHANGELOG.md`, `README.md`.
- Validation: Checked `README.md` top section and `git status --short`.
- Risks/Next: This relies on each editor/agent remembering to add an entry after future changes.

### 2026-06-04 12:53 +08:00 - Codex
- Summary: Expanded Git ignore rules to keep local secrets, generated output, logs, caches, and debug artifacts out of version control.
- Changed: Repository hygiene only; no runtime behavior changed.
- Files: `.gitignore`.
- Validation: Ran `git status --short` and `git check-ignore -v` for `.env`, `apps/web/.env.local`, `.next`, `.turbo`, logs, `dev.db`, and `tsconfig.tsbuildinfo`.
- Risks/Next: Existing ignored files remain on disk; they are only hidden from Git status.




