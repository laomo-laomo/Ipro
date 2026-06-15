import crypto from 'crypto';
import { buildStoryboardFromLegacyScenes, normalizeStoryboard, type Storyboard } from '../types/storyboard.js';
import { getLLMProvider } from './llm.service.js';
import { getStoryCostumeProfile, buildCostumePrompt } from '../config/story-costume-profiles.js';

// apiz.ai API configuration
const API_BASE = 'https://api.apiz.ai/api/v3';
function getApiKey(): string {
  return process.env.APIZ_API_KEY || '';
}

export interface ImageTaskParams {
  model: 'openai/gpt-image-2' | 'openai/gpt-image-2/edit';
  params: {
    prompt: string;
    image_urls?: string[];
    image_size?: 'auto' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '3:2' | '2:3';
    resolution?: '1K' | '2K' | '4K';
    quality?: 'low' | 'medium' | 'high';
    num_images?: number;
    mask_url?: string;
  };
  callback_url?: string;
}

export interface TaskStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  images?: string[];
  error?: string;
}

async function parseJsonSafely(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

function extractTaskId(result: any): string | undefined {
  return result?.data?.task_id || result?.data?.taskId || result?.task_id || result?.taskId;
}

function extractTaskStatus(task: any): TaskStatus['status'] {
  const status = String(task?.status || '').toLowerCase();

  if (status === 'success' || status === 'succeeded' || status === 'done' || status === 'completed') {
    return 'completed';
  }

  if (status === 'fail' || status === 'failed' || status === 'error') {
    return 'failed';
  }

  if (status === 'running' || status === 'processing' || status === 'in_progress') {
    return 'processing';
  }

  return 'pending';
}

function extractImages(task: any): string[] {
  const imageSources = [
    task?.output?.images,
    task?.result?.images,
    task?.images,
    task?.output,
    task?.result,
  ];

  for (const source of imageSources) {
    if (!Array.isArray(source)) {
      continue;
    }

    const images = source
      .map((img: any) => (typeof img === 'string' ? img : img?.url || img?.image_url || img?.imageUrl))
      .filter(Boolean);

    if (images.length > 0) {
      return images;
    }
  }

  return [];
}

/**
 * Create an image generation task
 */
export async function createImageTask(params: ImageTaskParams): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${API_BASE}/tasks/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`,
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const result = await parseJsonSafely(response) as any;
    if (!response.ok) {
      console.error('[apiz.ai] create image task http error:', response.status, JSON.stringify(result, null, 2));
      throw new Error(result?.message || result?.error || `Image provider HTTP ${response.status}`);
    }

    const taskId = extractTaskId(result);
    const success = result?.code === 200 || result?.success === true || Boolean(taskId);

    if (success && taskId) {
      return taskId;
    }

    // apiz.ai sometimes returns {code:200, message:"查询成功", data:null} from
    // task creation. That is a provider-side queue miss, not a successful task.
    console.error('[apiz.ai] create image task returned no task_id:', JSON.stringify(result, null, 2));
    const shape = `code=${result?.code} success=${result?.success} data=${result?.data ? 'present' : 'null'}`;
    lastError = new Error(`图片服务没有创建生成任务（${shape}）。请稍后重试。`);

    if (attempt < 3) {
      await sleep(1200 * attempt);
    }
  }

  throw lastError || new Error('图片服务没有创建生成任务，请稍后重试。');
}

/**
 * Query task status
 */
export async function queryTaskStatus(taskId: string): Promise<TaskStatus> {
  const response = await fetch(`${API_BASE}/tasks/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ task_id: taskId }),
  });

  const result = await parseJsonSafely(response) as any;
  if (!response.ok) {
    throw new Error(result?.message || result?.error || `Image provider HTTP ${response.status}`);
  }

  const task = result?.data || result;

  return {
    status: extractTaskStatus(task),
    images: extractImages(task),
    error: task?.error || (extractTaskStatus(task) === 'failed' ? (task?.message || result?.message) : undefined),
  };
}

/**
 * Wait for task to complete with polling
 */
export async function waitForTask(taskId: string, maxAttempts: number = 300): Promise<string[]> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await queryTaskStatus(taskId);
    if (result.status === 'completed') {
      const images = result.images || [];
      if (images.length === 0) {
        throw new Error('Image provider completed without returning an image URL');
      }
      return images;
    }
    if (result.status === 'failed') {
      throw new Error(result.error || 'Image generation failed');
    }
    await sleep(3000);  // 3s interval, 300 * 3 = 900s = 15min max
  }
  throw new Error('Image generation timeout');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRestrictedKeywords(): Promise<string[]> {
  return [];
}

/**
 * Generate scene background (standard mode)
 */
export async function generateSceneBackground(
  prompt: string,
  size: string = '4:3'
): Promise<string> {
  const taskId = await createImageTask({
    model: 'openai/gpt-image-2',
    params: {
      prompt,
      image_size: size as ImageTaskParams['params']['image_size'],
      resolution: '1K',
      quality: 'low',
      num_images: 1,
    },
  });

  const images = await waitForTask(taskId);
  return images[0];
}

/**
 * Composite illustration (Edit mode)
 * @param sourceImageUrl - The character image URL
 * @param sceneBackground - Background description
 * @param scene - Scene object with description and text
 */
export async function compositeIllustration(
  sourceImageUrl: string,
  sceneBackground: string,
  scene?: { description: string; text: string }
): Promise<string> {
  console.log(`[compositeIllustration] sourceImageUrl=${sourceImageUrl}`);
  const characterHint =
    'IMPORTANT: The person in the reference image IS the main character. ' +
    'You MUST keep their face structure, hair style, skin tone, and overall appearance the same so the character is recognizable. ' +
    'Do NOT change or replace the character. ' +
    'Do NOT make the main character stare at the camera unless the scene explicitly calls for it. ' +
    'The character must ACT inside the story: eyes should look toward the other character, animal, object, path, danger, or goal named in the scene; body direction, hands, feet, and head angle must follow the action. ' +
    'Use natural storybook acting poses such as side view, three-quarter profile, looking down at a prop, looking up at a threat, running toward a destination, turning toward someone speaking, or glancing back while moving. ' +
    'A full back view is allowed only when it is the clearest storytelling choice, but keep enough face/profile/costume cues for identity. ' +
    'IMPORTANT: The reference photo is only an IDENTITY reference (face/identity), NOT a pose or expression reference. ' +
    'Let the character\'s facial expression, body language, and pose match the SCENE\'s mood and story beat (e.g. afraid when facing a wolf, brave when rescuing, smiling when reuniting). ' +
    'It is NORMAL and DESIRED for the character to show different expressions, gaze directions, head turns, and action poses in different scenes — that is what makes a picture book. ';
  const scenePrompt = scene ? buildVisualScenePrompt(scene) : sceneBackground;
  const prompt = characterHint + scenePrompt;

  const taskId = await createImageTask({
    model: 'openai/gpt-image-2/edit',
    params: {
      prompt,
      image_urls: [sourceImageUrl],
      image_size: '4:3',
      resolution: '1K',
      quality: 'low',
      num_images: 1,
    },
  });

  const images = await waitForTask(taskId);
  return images[0];
}

/**
 * Build scene prompt for illustration generation
 */


export function deriveVisualBeat(scene: { description: string; text: string }, title?: string): string {
  const theme = title ? `Story theme: ${title}. ` : '';
  const summary = scene.description.replace(/^第\d+幕，故事围绕[“"]?|[”"]展开$/g, '').trim();
  const visualMoment = scene.text
    .replace(/TA/g, '主角')
    .replace(/真正需要改变的，不只是眼前的局面，还有自己面对困难时的方式。/g, '')
    .replace(/TA也第一次真正明白，成长并不是一下子变得了不起，而是在每一次认真尝试、每一次愿意帮助别人时，慢慢变成更好的自己。/g, '')
    .trim();

  return `${theme}关键画面：${summary}。聚焦一个最适合被画出来的瞬间，突出角色动作、表情、服装、道具、环境、光线和空间关系，避免抽象总结。参考情节：${visualMoment}`;
}

function truncatePromptText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function sanitizeSceneText(text: string): string {
  return truncatePromptText(
    text
      .replace(/TA/g, 'the main character')
      .replace(/主角/g, 'the main character')
      .replace(/他\/她/g, 'the child')
      .replace(/他她/g, 'the child'),
    220,
  );
}

function deriveSceneFocus(scene: { description: string; text: string }): string {
  const firstBeat = scene.text
    .replace(/TA/g, '主角')
    .split(/[。！？!?]/u)
    .map((item) => item.trim())
    .find(Boolean);

  return truncatePromptText(firstBeat || scene.description, 90);
}

function deriveSceneSetting(scene: { description: string; text: string }): string {
  const source = `${scene.description} ${scene.text}`;
  const matches = source.match(/森林|小路|木屋|花园|厨房|客厅|卧室|河边|湖边|山坡|院子|教室|操场|树后|窗边|门口|桥上|雪地|草地|夜空|村庄|城堡|海边/gu) || [];
  const unique = Array.from(new Set(matches));

  return unique.length > 0 ? unique.slice(0, 2).join(', ') : 'storybook environment';
}

function deriveSceneProps(scene: { description: string; text: string }): string {
  const source = `${scene.description} ${scene.text}`;
  const props = [
    '篮子', '红色帽子', '帽子', '披风', '花束', '礼物', '点心', '树叶', '门', '窗户',
    '桌子', '床', '灯笼', '雨伞', '星星', '月亮', '猎枪', '围裙', '书本', '玩具', '蛋糕',
  ].filter((item) => source.includes(item));

  return props.length > 0 ? props.slice(0, 4).join(', ') : 'scene-specific props';
}

export function buildVisualScenePrompt(
  scene: { description: string; text: string },
  options?: ScenePromptOptions
): string {
  const styleSuffix = options?.characterStyle
    ? `, ${options.characterStyle} style, cinematic children's picture book illustration`
    : ', warm children\'s picture book illustration, cinematic composition, soft light, richly detailed scene';

  const titleHint = options?.title ? `Story theme: ${options.title}. ` : '';
  const sceneLabel = typeof options?.sceneNumber === 'number'
    ? `Story page ${options.sceneNumber + 1}${typeof options?.totalScenes === 'number' ? ` of ${options.totalScenes}` : ''}. `
    : '';
  const sanitizedText = sanitizeSceneText(scene.text);
  const visualFocus = deriveSceneFocus(scene);
  const settingHint = deriveSceneSetting(scene);
  const propHint = deriveSceneProps(scene);

  // Check if there's text that should be rendered on the image. The model may
  // still miss Chinese glyphs, so this prompt also reserves a clean caption area
  // that the web reader can use as a deterministic fallback.
  const textOnImage = options?.textOnImage || '';
  const textInstruction = textOnImage
    ? `PICTURE-BOOK CAPTION AREA IS REQUIRED. Reserve a clean horizontal caption band inside the artwork, preferably the lower 26-32% of the page; if the subject/action fills the lower area, reserve the upper 22-28% instead. ` +
      `Keep faces, bodies, paws, hands, important props, and action OUT of this caption band. Do not crop or hide the main subject behind text. ` +
      `Inside that band, MUST RENDER this exact Chinese story text as large printed text: "${textOnImage}". ` +
      `Typography rules: Chinese 楷体 / warm hand-written picture-book font, thick and readable, 2-4 centered lines, occupying about 70-82% of image width, never a tiny corner label. ` +
      `Color rules: on bright scenes use warm red (#a82a3a) or deep brown text with a cream (#fff5e1) outline; on dark/night scenes use cream text with navy (#1f3a5f) outline; keep strong contrast. ` +
      `Decorate the band with a subtle parchment/scroll/cartouche background that matches the story mood, but keep it calm enough for reading. ` +
      `Do not omit the caption, do not translate it into English, do not invent other words, and do not scatter text across the image.`
    : '';

  return [
    `${titleHint}${sceneLabel}`,
    `Primary scene: ${scene.description}.`,
    `Specific visual beat: ${visualFocus}.`,
    `Narrative moment: ${sanitizedText}`,
    `Setting anchor: ${settingHint}. Props and costume anchor: ${propHint}.`,
    textInstruction,
    'Make this page visually distinct from the other scenes in the same story by emphasizing a unique pose, interaction, framing, and environment details.',
    'Direct the character like an actor in the story, not like a portrait: gaze, head turn, shoulders, hands, feet, and movement must point toward the active story beat instead of defaulting to camera-facing eye contact.',
    'Show only concrete, visible elements that can be illustrated: facial expression, gaze direction, body movement, subject relationships, foreground, midground, background, lighting, weather, and key props.',
    `Composition should feel suitable for a premium children\'s storybook${styleSuffix}.`,
  ].join(' ');
}

export function buildScenePrompt(
  scene: { description: string; text: string },
  characterStyle?: string
): string {
  const styleSuffix = characterStyle
    ? `, in ${characterStyle} style`
    : ', in a charming illustrated style';

  return `${scene.description}. ${scene.text}${styleSuffix}`;
}

/**
 * List all assets from apiz.ai素材库
 */
export async function listApizAssets(): Promise<Array<{ asset_id: string; name: string; image_url: string; group_id: string }>> {
  const API_KEY = getApiKey();
  if (!API_KEY) return [];

  const response = await fetch(`${API_BASE}/assets`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
  });

  const result = await response.json() as any;
  if (!result.items) return [];
  return result.items.map((item: any) => ({
    asset_id: item.asset_id,
    name: item.name || '',
    image_url: item.image_url || item.media_url || '',
    group_id: item.group_id,
  }));
}

/**
 * Stylize character image using Edit mode
 */

/**
 * Upload an image to apiz.ai素材库 via CDN URL.
 * Used to register AI-generated images so they can later be used for image-to-image edit.
 */
export async function uploadToApizAsset(imageUrl: string, name: string, groupName: string = 'ipro-characters'): Promise<string | null> {
  const API_KEY = getApiKey();
  if (!API_KEY) return null;

  // Find or create group
  let groupId: string | null = null;
  const groupsRes = await fetch(`${API_BASE}/assets/groups`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
  });
  const groupsData = await groupsRes.json() as any;
  const existingGroup = groupsData?.items?.find((g: any) => g.name === groupName);
  if (existingGroup) {
    groupId = existingGroup.group_id;
  } else {
    const createRes = await fetch(`${API_BASE}/assets/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ name: groupName, description: 'IPro generated characters' }),
    });
    const createData = await createRes.json() as any;
    groupId = createData.group_id;
  }

  // Upload asset
  const uploadRes = await fetch(`${API_BASE}/assets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ group_id: groupId, image_url: imageUrl, name }),
  });
  const uploadData = await uploadRes.json() as any;
  return uploadData?.media_url || uploadData?.image_url || null;
}

export interface EnsureCostumeResult {
  url: string;
  restyled: boolean;
  reason: 'cache-hit' | 'restyled' | 'fallback-after-error';
}

// Preset style keys. The web UI exposes 8 presets (4 originals + 4 added in
// the style-library rollout), but only this enum is what the AI service
// recognizes as a "known" preset. Custom user-defined styles go through the
// CustomStylePrompt object form.
export type PresetStyle = 'pixar' | 'ghibli' | 'clay' | 'handdrawn' | 'watercolor' | 'paper' | 'comic' | 'papercut';

// A custom user-defined style. The AI service injects `prompt` directly as
// the styleSuffix and skips the preset lookup. The optional `id` is a
// CustomStyle DB row id (purely for logging/audit) — not required.
export interface CustomStylePrompt {
  prompt: string;
  id?: string;
  name?: string;
}

export type StyleInput = PresetStyle | CustomStylePrompt;

/**
 * Ensure the character has a stylized photo whose costume matches the given
 * story title. Reuses the existing stylized photo when the title matches
 * `Character.lastStylizedTitle`; otherwise re-runs `stylizeCharacter` and
 * updates both the Character row and the Story row with the new URL.
 *
 * Title is used as the cache key (case-insensitive, trimmed). When title is
 * missing/empty, behaves like a no-op cache hit on the existing photo.
 */
export async function ensureCharacterCostumeForStory(
  prisma: any,
  character: { id: string; originalPhotoUrl: string; stylizedPhotoUrl: string | null; lastStylizedTitle: string | null },
  storyId: string,
  title: string | null | undefined,
  style: PresetStyle | CustomStylePrompt = 'pixar'
): Promise<EnsureCostumeResult> {
  const normalizedTitle = (title ?? '').trim();
  const cachedTitle = (character.lastStylizedTitle ?? '').trim();

  if (!character.stylizedPhotoUrl) {
    throw new Error('Character has no stylized photo. Complete the style step first.');
  }
  if (normalizedTitle && normalizedTitle === cachedTitle) {
    // Cache hit: story's per-story URL may or may not be set; write it for symmetry.
    if (storyId) {
      await prisma.story.update({
        where: { id: storyId },
        data: { characterStylizedUrl: character.stylizedPhotoUrl },
      }).catch(() => { /* story row may not exist yet in some flows */ });
    }
    return { url: character.stylizedPhotoUrl, restyled: false, reason: 'cache-hit' };
  }

  // Cache miss: re-stylize for the new story context.
  try {
    const newUrl = await stylizeCharacter(character.originalPhotoUrl, style, normalizedTitle || undefined);
    if (!newUrl) {
      // Stylize returned nothing useful; keep the existing photo but don't
      // touch lastStylizedTitle so the next attempt will retry.
      return { url: character.stylizedPhotoUrl, restyled: false, reason: 'fallback-after-error' };
    }
    await prisma.character.update({
      where: { id: character.id },
      data: {
        stylizedPhotoUrl: newUrl,
        lastStylizedTitle: normalizedTitle || null,
        lastStylizedAt: new Date(),
      },
    });
    if (storyId) {
      await prisma.story.update({
        where: { id: storyId },
        data: { characterStylizedUrl: newUrl },
      });
    }
    return { url: newUrl, restyled: true, reason: 'restyled' };
  } catch (err) {
    // Don't break story creation on restyle failure; reuse the existing photo.
    console.warn(`[ensureCostume] restyle failed for character ${character.id}:`, err);
    return { url: character.stylizedPhotoUrl, restyled: false, reason: 'fallback-after-error' };
  }
}

export async function stylizeCharacter(
  photoUrl: string,
  style: StyleInput = 'pixar',
  title?: string
): Promise<string> {
  const stylePrompts: Record<PresetStyle, string> = {
    pixar: 'Create a premium feature-animation hero portrait in a strongly recognizable Pixar-inspired 3D style: large expressive eyes, rounded appeal, polished subsurface skin shading, sculpted 3D face volumes, glossy believable materials, cinematic warm rim light, saturated but tasteful family-film color design, high-end animated-movie character turnaround energy, clean studio backdrop, vertical composition. The result must read immediately as a modern theatrical 3D animated character, not flat illustration or generic cartoon.',
    ghibli: 'Create a strongly recognizable Studio Ghibli-inspired hand-painted anime portrait: soft cel-animation linework, poetic natural color harmony, gentle painterly shading, airy whimsical atmosphere, calm storytelling expression, delicate facial features, light watercolor-and-gouache background handling, emotionally warm Japanese animated-film feeling, clean studio backdrop, vertical composition. The result must read immediately as classic hand-crafted anime cinema, not 3D render or generic cartoon.',
    clay: 'Create a strongly recognizable stop-motion clay animation portrait: obvious handmade clay texture, finger-molded surfaces, tactile plasticine materials, tiny imperfections, chunky cute silhouette, miniature set lighting, handcrafted studio stop-motion charm, soft but directional cinematic light, clean studio backdrop, vertical composition. The result must read immediately as real claymation, not smooth 3D or flat drawing.',
    handdrawn: 'Create a strongly recognizable premium hand-drawn children\'s book portrait: visible pencil linework, watercolor washes, ink-and-colored-pencil texture, paper grain, soft layered pigments, elegant illustration composition, warm editorial storybook atmosphere, handcrafted brush detail, clean studio backdrop, vertical composition. The result must read immediately as traditional illustration on paper, not 3D render or anime cel style.',
    watercolor: 'Create a strongly recognizable premium watercolor children\'s book portrait: loose flowing watercolor pigment, soft wet-on-wet color bleeds, visible brushwork, paper grain and deckled edges, luminous translucent washes, gentle color pooling and granulation, organic pigment spreads, hand-painted layered glazes, soft editorial illustration mood, clean studio backdrop, vertical composition. The result must read immediately as authentic traditional watercolor on cold-press paper, not flat cel illustration or 3D render.',
    paper: 'Create a strongly recognizable premium paper-craft / origami children\'s book portrait: clearly faceted low-poly paper construction, crisp folded paper edges, geometric planar surfaces, soft paper-grain texture, layered paper cutouts with subtle cast shadows, tactile handmade paper quality, gentle diffuse studio lighting, palette of warm paper tones with a few saturated accents, clean studio backdrop, vertical composition. The result must read immediately as a folded paper craft model, not flat illustration or smooth 3D render.',
    comic: 'Create a strongly recognizable American comic-book / graphic-novel children\'s hero portrait: bold clean ink outlines of varying weight, flat saturated color fills, Ben-Day halftone dot shading, dynamic pop-art speed lines, dramatic rim light, snap composition, punchy primary and secondary palette, clean studio backdrop, vertical composition. The result must read immediately as a printed comic-book panel, not soft watercolor or 3D render.',
    papercut: 'Create a strongly recognizable Chinese paper-cut / shadow-puppet children\'s book portrait: pure flat planar color shapes, no gradients, crisp cut-paper silhouettes, ornamental symmetrical decorative motifs (clouds, florals, auspicious patterns), warm vermillion and gold lacquer palette, bold black contour outlines, layered translucent paper depth, clean studio backdrop, vertical composition. The result must read immediately as a traditional Chinese paper-cut (剪纸) or shadow-play (皮影) artwork, not Western cartoon or 3D render.',
  };

  // When the caller passes a CustomStylePrompt, treat it as the entire
  // styleSuffix — the user's prompt fully describes the art direction.
  // The preset map is bypassed and we still call the same apiz.ai endpoint
  // with the same identity-preservation prefix, so the result is a custom
  // style applied on top of the user's face. We do not run costume-profile
  // analysis for custom styles — the prompt already encodes the world.
  const isCustomStyle = typeof style === 'object' && style !== null && 'prompt' in style;
  const customStyle: CustomStylePrompt | null = isCustomStyle
    ? (style as CustomStylePrompt)
    : null;
  const presetKey: PresetStyle | null = isCustomStyle
    ? null
    : (style as PresetStyle);

  // Look up story costume profile for this title
  let storyPrompt = '';
  if (customStyle) {
    // Custom style path: ignore title-based costume profile lookup; the
    // user's prompt is the full art direction. We still need a title-aware
    // costume description if a profile matches, so blend them.
    if (title) {
      const profile = getStoryCostumeProfile(title);
      if (profile) {
        const costumeClause = buildCostumePrompt(profile, undefined, 'pixar');
        storyPrompt = `${customStyle.prompt}. The character should also reflect this story's costume: ${costumeClause}`;
      } else {
        storyPrompt = customStyle.prompt;
      }
    } else {
      storyPrompt = customStyle.prompt;
    }
    console.log(`[Stylize] Using custom style${customStyle.name ? ` "${customStyle.name}"` : ''} (id=${customStyle.id ?? 'n/a'})`);
  } else if (title && presetKey) {
    const profile = getStoryCostumeProfile(title);
    if (profile) {
      // Use pre-defined costume profile (e.g. 愚公移山 → ancient Chinese farmer costume)
      storyPrompt = buildCostumePrompt(profile, undefined, presetKey);
      console.log(`[Stylize] Using costume profile for "${title}": ${storyPrompt.slice(0, 80)}...`);
    } else {
      // No preset profile → use LLM to analyze the story and generate costume description
      console.log(`[Stylize] No costume profile for "${title}", analyzing with LLM...`);
      const costumeDesc = await analyzeStoryCostumeProfile(title);
      if (costumeDesc) {
        const styleDesc = {
          pixar: ' rendered in a strongly recognizable Pixar-inspired feature-animation 3D look with polished volumetric shading, expressive eyes, rounded forms, cinematic lighting, and premium animated-film materials',
          ghibli: ' rendered in a strongly recognizable Studio Ghibli-inspired hand-painted anime look with delicate cel lines, poetic color harmony, gentle painterly shading, and whimsical cinematic warmth',
          clay: ' rendered in a strongly recognizable stop-motion claymation look with tactile plasticine texture, handmade imperfections, chunky silhouettes, and miniature studio lighting',
          handdrawn: ' rendered in a strongly recognizable traditional hand-drawn storybook illustration look with visible pencil lines, watercolor pigment, paper texture, and warm editorial charm',
          watercolor: ' rendered in a strongly recognizable premium watercolor look with flowing pigment washes, wet-on-wet bleeds, visible brushwork, paper grain, and translucent layered glazes',
          paper: ' rendered in a strongly recognizable paper-craft origami look with faceted low-poly geometry, crisp folded paper edges, geometric planar surfaces, and tactile handmade paper quality',
          comic: ' rendered in a strongly recognizable American comic-book look with bold ink outlines, flat saturated colors, Ben-Day halftone dots, dynamic pop-art speed lines, and a punchy primary palette',
          papercut: ' rendered in a strongly recognizable Chinese paper-cut / shadow-puppet look with flat planar shapes, ornamental symmetrical motifs, warm vermillion-and-gold lacquer palette, and bold black contour outlines',
        }[presetKey];
        storyPrompt = costumeDesc + styleDesc;
        console.log(`[Stylize] LLM costume analysis: ${costumeDesc.slice(0, 80)}...`);
      } else {
        // Final fallback: generic description
        storyPrompt = stylePrompts[presetKey] + `, dressed as a character from the children's story "${title}", fitting the story's world and costume`;
      }
    }
  } else if (presetKey) {
    storyPrompt = stylePrompts[presetKey];
  } else {
    // Defensive: neither custom nor preset matched (should not happen given
    // the StyleInput union). Fall back to pixar to keep behaviour identical
    // to the pre-style-library default.
    storyPrompt = stylePrompts.pixar;
  }

// Determine mode: edit (image-to-image) or text-to-image
  // Accept: CDN domains, localhost (dev), and any relative path (already resolved to absolute by frontend)
  const isCdnUrl = /^https?:\/\/(cdn|localhost|.*\.51sux\.com|.*\.cos\.|.*\.oss-)/i.test(photoUrl);
  console.log(`[Stylize] photoUrl=${photoUrl} isCdnUrl=${isCdnUrl}`);

  let taskId: string;
  if (isCdnUrl) {
    // Image-to-image edit: keep source face, apply costume/style from storyPrompt
    taskId = await createImageTask({
      model: 'openai/gpt-image-2/edit',
      params: {
        // Explicitly tell the model to preserve identity from source image
        prompt:
          'Keep the exact face identity, age, hairstyle, and key facial proportions from the source photo. Transform the person into a stylized story character with a visibly strong, unmistakable art direction. Re-dress and re-style the character as: ' +
          storyPrompt +
          '. Preserve identity, but push the rendering language hard so the chosen style is immediately obvious at first glance. Change costume, materials, color design, and rendering treatment to match the target style; do not output a weak semi-realistic photo paint-over.',
        image_urls: [photoUrl],
        image_size: '1:1',
        resolution: '1K',
        quality: 'low',
        num_images: 1,
      },
    });
  } else {
    // Text-to-image: generates a new stylized character from description
    taskId = await createImageTask({
      model: 'openai/gpt-image-2',
      params: {
        prompt: storyPrompt,
        image_size: '3:4',
        resolution: '1K',
        quality: 'low',
        num_images: 1,
      },
    });
  }

  const images = await waitForTask(taskId);
  return images[0];
}

// Story generation interfaces
export interface StoryScene {
  index: number;
  description: string;
  text: string;
}

export interface GeneratedStory {
  content: string;
  scenes: StoryScene[];
  storyboard: Storyboard;
}

export interface ScenePromptOptions {
  title?: string;
  characterStyle?: string;
  sceneNumber?: number;
  totalScenes?: number;
  textOnImage?: string;  // Story text to render on the image
}

function splitStoryContentIntoScenes(content: string): StoryScene[] {
  const paragraphs = content
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const source = paragraphs.length > 0 ? paragraphs : [content.trim()].filter(Boolean);
  // No hard cap — the LLM is now expected to decide scene count from the story's beats.
  return source.map((text, index) => ({
    index,
    description: `第${index + 1}幕：${text.slice(0, 24)}的关键画面，突出人物动作、场景环境和主要道具`,
    text,
  }));
}

function extractRawModelText(data: any): string {
  const rawContent = data?.choices?.[0]?.message?.content || data?.output_text || '';
  return Array.isArray(rawContent)
    ? rawContent.map((item: any) => typeof item === 'string' ? item : item?.text || '').join('')
    : String(rawContent || '');
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function toStoryContent(storyboard: Storyboard): string {
  const paragraphs = storyboard.scenes
    .map((scene) => (scene.storyText || scene.voiceover || '').trim())
    .filter(Boolean);

  return paragraphs.join('\n\n') || storyboard.summary || '';
}

function storyboardToStoryScenes(storyboard: Storyboard): StoryScene[] {
  return storyboard.scenes.map((scene, index) => ({
    index: typeof scene.index === 'number' ? scene.index : index,
    description: scene.imageDescription,
    text: scene.storyText || scene.voiceover || '',
  }));
}

function recoverContentFromLegacyPayload(parsed: any): string {
  if (typeof parsed?.content === 'string' && parsed.content.trim()) {
    return parsed.content.trim();
  }

  if (typeof parsed?.summary === 'string' && parsed.summary.trim()) {
    return parsed.summary.trim();
  }

  if (Array.isArray(parsed?.scenes)) {
    return parsed.scenes
      .map((scene: any) => String(scene?.storyText || scene?.text || scene?.content || scene?.voiceover || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  return '';
}

function escapeControlCharsInJsonStrings(input: string): string {
  let output = '';
  let inString = false;
  let escaped = false;

  for (const char of input) {
    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (char === '\n') {
      output += '\\n';
      continue;
    }

    if (char === '\r') {
      output += '\\r';
      continue;
    }

    if (char === '\t') {
      output += '\\t';
      continue;
    }

    output += char;
  }

  return output;
}

function tryParseStoryPayload(normalizedContent: string): GeneratedStory | null {
  const fencedContent = stripCodeFence(normalizedContent);
  const jsonMatch = fencedContent.match(/\{[\s\S]*\}/);
  const jsonText = (jsonMatch ? jsonMatch[0] : fencedContent)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/"description":\s*([^"\{\[\r\n][^,\r\n]*?)(\s*,\s*"text")/g, (_match, value, suffix) => {
      const escaped = String(value).trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"description": "${escaped}"${suffix}`;
    })
    .replace(/"text":\s*([^"\{\[\r\n][^,\r\n]*?)(\s*[}\]])/g, (_match, value, suffix) => {
      const escaped = String(value).trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"text": "${escaped}"${suffix}`;
    });

  try {
    const parsed = JSON.parse(escapeControlCharsInJsonStrings(jsonText));
    const storyboard = normalizeStoryboard(JSON.stringify(parsed), parsed?.title || '');
    const content = recoverContentFromLegacyPayload(parsed) || toStoryContent(storyboard);

    if (!storyboard.scenes.length && !content) {
      return null;
    }

    return {
      content,
      scenes: storyboardToStoryScenes(storyboard),
      storyboard,
    };
  } catch {
    const contentMatch = fencedContent.match(/"content"\s*:\s*"([\s\S]*?)"\s*,\s*"scenes"/);
    if (!contentMatch?.[1]) {
      return null;
    }

    const recoveredContent = contentMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();

    if (!recoveredContent) {
      return null;
    }

    const fallbackScenes = splitStoryContentIntoScenes(recoveredContent);
    const storyboard = buildStoryboardFromLegacyScenes({
      title: '',
      scenes: fallbackScenes,
    });

    return {
      content: recoveredContent,
      scenes: fallbackScenes,
      storyboard,
    };
  }
}

/**
 * Extract character features from a photo URL using LLM vision analysis.
 * Falls back to empty string if analysis fails.
 */
export async function extractCharacterFeatures(photoUrl: string): Promise<string> {
  try {
    const llm = getLLMProvider();
    const result = await llm.chatCompletion({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: photoUrl },
            },
            {
              type: 'text',
              text: '请用2-3句话描述这张照片中人物的外貌特征，包括：发型、发色、面部特征、表情、穿着的大致风格。不要描述背景。请用中文回答。',
            },
          ],
        },
      ],
      max_tokens: 200,
    });
    const desc = (result.content || '').trim();
    return desc.length > 0 ? desc : '';
  } catch (err) {
    console.warn('[extractCharacterFeatures] Failed:', err instanceof Error ? err.message : err);
    return '';
  }
}

function isStoryComplete(story: GeneratedStory): boolean {
const content = (story.content || '').trim();
  const paragraphs = content.split(/\n\s*\n+/).map((item) => item.trim()).filter(Boolean);
  // Need at least 3 narrative paragraphs OR 3 scenes
  if (paragraphs.length < 3 && story.storyboard.scenes.length < 3) {
    return false;
  }

  const badEndingPatterns = [
    /[""''（【《]$/,
    /[，、：；,\-]\s*$/,
    /我们再去帮助别人\s*$/,
    /未完\s*$/,
    /to be continued\s*$/i,
  ];

  if (badEndingPatterns.some((pattern) => pattern.test(content))) {
    return false;
  }

  // Require at least 5 scenes for a proper picture-book arc. A fairy tale
  // typically has 6-9 key beats (opening → conflict → climax → resolution).
  // Stories with only 3-4 scenes are almost always truncated LLM output that
  // skipped canonical events. Raise the floor from 3 to 5 so the retry loop
  // catches incomplete outputs while still allowing genuinely short stories.
  if (!Array.isArray(story.storyboard.scenes) || story.storyboard.scenes.length < 5) {
    return false;
  }

  if (story.storyboard.scenes.some((scene) => {
    const text = (scene?.storyText || scene?.voiceover || '').trim();
    const desc = (scene?.imageDescription || '').trim();
    if (!text || !desc) return true;
    // Warn if storyText is too long (>50 chars) - should be split into multiple scenes
    if (text.length > 50) {
      console.warn(`[isStoryComplete] Scene ${scene.index} storyText too long (${text.length} chars): ${text.slice(0, 30)}...`);
    }
    return false;
  })) {
    return false;
  }

  return true;
}

function summarizeStoryGenerationIssue(reason: string, rawContent: string): string {
  const titleMatch = rawContent.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const title = titleMatch?.[1] ? ` title=${titleMatch[1]}` : '';
  const hasScenes = /"scenes"\s*:\s*\[/.test(rawContent);
  const hint = rawContent.includes('\n') ? ' Raw response may contain unescaped newlines inside JSON strings.' : '';
  return `${reason}.${title}${hasScenes ? ' scenes=array-present' : ''}${hint}`.trim();
}

const STORY_GENERATION_PROMPT = `你是一个专业的儿童童话故事作家兼分镜编剧。请根据用户提供的标题，为{character_desc}创作一个温馨、有教育意义的原创童话故事，并且直接输出新的 storyboard JSON。不要输出旧的 content/scenes 简版结构，也不要输出任何解释文字。

要求：
1. 故事适合3-8岁儿童，内容要展开充分，情节完整，有清晰的起因、发展、转折和结尾。
2. 故事结构必须完整，必须包含以下要素：
   - 开端：介绍主角和故事起因
   - 发展：遇到问题或挑战
   - 高潮：矛盾最激烈的时刻
   - 结局：问题解决，温馨收尾
3. 【关键】先在脑内列出该经典故事的所有关键情节（必须包括广为人知的主要事件，不可省略任何标志性场景），再决定 scenes 数量。如果该故事有 N 个广为人知的关键情节，scenes 必须 ≥ N。一般童话（小红帽、丑小鸭、三只小猪等）应有 6-9 个场景。
4. 必须输出单一 JSON 对象，顶层字段只使用并优先填写这些字段：version、title、titleEn、summary、summaryEn、theme、themeEn、audienceAge、character、voiceCast、scenes。
5. version 固定为 1。
6. character 结构支持：characterId、featureDesc、featureDescEn、style、originalPhotoUrl、stylizedPhotoUrl。已知的人物描述请放进 featureDesc，英文版放进 featureDescEn，没有就填空字符串。
7. voiceCast 是数组，每项支持：speakerId、name、nameEn、role、voiceId、voiceIdEn。若故事主要只有旁白，也至少提供一个 narrator 角色。
8. scenes 数量由 LLM 根据故事内容的广度和深度自行决定（参考第 3 条），但每幕 storyText 控制在 30 字以内。每个场景都必须支持并尽量填写：id、index、title、titleEn、charactersInScene、storyText、storyTextEn、imageDescription、imageDescriptionEn、imagePrompt、charactersLayout、dialogue、narration、voiceover、voiceoverEn、subtitle、shot、durationSec、musicMood、sfx、image。
9. dialogue 是数组，每项包含：speakerId、text、textEn、displayOnImage、tts、emotion。
10. narration 对象包含：text、textEn、displayOnImage、tts、voiceId、voiceIdEn。
11. subtitle 必须直接输出双语字幕字符串，JSON 字符串内两行必须使用 \\n 转义，例如 "中文一句\\nEnglish sentence"。若暂时没有英文，请第二行留空字符串，但字段仍然保留。
12. storyText 和 voiceover 要写成适合配音和分镜的完整句子，不要只写摘要；imageDescription 要写成可直接绘制插画的具体画面；imagePrompt 要是适合生成插画的英文提示词。
13. 每个场景都必须是不同的关键时刻，不能只是重复同一地点或动作的改写；每幕都要有明显不同的视觉焦点。
14. image 字段保留为空对象 {} 即可，不需要生成 URL。
15. 所有英文辅助字段 titleEn、summaryEn、themeEn、featureDescEn、storyTextEn、imageDescriptionEn、voiceoverEn、dialogue.textEn、narration.textEn、voiceIdEn、nameEn 如果暂时不确定，可以填空字符串，但结构必须存在。

{restriction_hint}
请直接返回 JSON：
{
  "version": 1,
  "title": "中文标题",
  "titleEn": "English title",
  "summary": "中文故事总结",
  "summaryEn": "English summary",
  "theme": "中文主题",
  "themeEn": "English theme",
  "audienceAge": "3-8",
  "character": {
    "characterId": "main-character",
    "featureDesc": "中文人物特征",
    "featureDescEn": "English character description",
    "style": "storybook",
    "originalPhotoUrl": "",
    "stylizedPhotoUrl": ""
  },
  "voiceCast": [
    {
      "speakerId": "narrator",
      "name": "旁白",
      "nameEn": "Narrator",
      "role": "narrator",
      "voiceId": "",
      "voiceIdEn": ""
    }
  ],
  "scenes": [
    {
      "id": "scene-0",
      "index": 0,
      "title": "中文场景标题",
      "titleEn": "English scene title",
      "charactersInScene": ["main-character"],
      "storyText": "中文故事文本",
      "storyTextEn": "English story text",
      "imageDescription": "中文画面描述",
      "imageDescriptionEn": "English image description",
      "imagePrompt": "English prompt for illustration generation",
      "charactersLayout": "角色站位和前后景关系",
      "dialogue": [
        {
          "speakerId": "main-character",
          "text": "中文对白",
          "textEn": "English dialogue",
          "displayOnImage": false,
          "tts": true,
          "emotion": "curious"
        }
      ],
      "narration": {
        "text": "中文旁白",
        "textEn": "English narration",
        "displayOnImage": true,
        "tts": true,
        "voiceId": "",
        "voiceIdEn": ""
      },
      "voiceover": "中文配音稿",
      "voiceoverEn": "English voiceover",
      "subtitle": "中文一句\nEnglish sentence",
      "shot": {
        "type": "wide",
        "angle": "eye-level",
        "focus": "main-action",
        "movement": "static"
      },
      "durationSec": 6,
      "musicMood": "warm",
      "sfx": ["wind", "footsteps"],
      "image": {}
    }
  ]
}`;

/**
 * Generate a complete story using LLM
 * @param title - Story title
 * @param characterDesc - Character description for the story
 */
export async function generateStory(title: string, characterDesc: string): Promise<GeneratedStory> {
  const maxAttempts = 3;

  const restrictedKeywords = await getRestrictedKeywords();
  const restrictionHint = restrictedKeywords.length > 0
    ? `\n\n重要限制：请绝对避免在场景描述（imageDescription / imagePrompt）中使用以下词汇或类似表达，因为它们会导致插画生成被安全审核拦截：${restrictedKeywords.join('、')}。请用其他安全的描述替代，例如用"躺着不动"代替"死亡"，用"红色痕迹"代替"血"，用"闪亮的工具"代替"武器"等。`
    : '';
  const prompt = STORY_GENERATION_PROMPT.replace('{character_desc}', characterDesc).replace('{restriction_hint}', restrictionHint);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // Use the unified LLM service (dynamic import to avoid circular dependency)
      const { getLLMProvider } = await import('./llm.service.js');
      const llm = getLLMProvider();

      const result = await llm.chatCompletion({
        messages: [
          {
            role: 'system',
            content: '你是一个专业的儿童童话故事作家兼分镜编剧。你必须返回且仅返回一个可被 JSON.parse 解析的 storyboard JSON。禁止输出 Markdown 解释、禁止输出旧的 content/scenes 简版结构。每个 scenes 项都要包含 storyText、imageDescription、voiceover、subtitle，并尽量补齐中英文字段。',
          },
          { role: 'user', content: `标题：${title}\n\n${prompt}` },
        ],
        temperature: 1.0,
        max_tokens: 10000,
      });

      const storyData = tryParseStoryPayload(result.content);

      if (storyData && isStoryComplete(storyData)) {
        const storyboard = normalizeStoryboard(JSON.stringify({
          ...storyData.storyboard,
          title: storyData.storyboard.title || title,
          summary: storyData.storyboard.summary || storyData.content.slice(0, 120),
          character: {
            ...storyData.storyboard.character,
            featureDesc: storyData.storyboard.character?.featureDesc || characterDesc,
            featureDescEn: storyData.storyboard.character?.featureDescEn || '',
          },
        }), title);

        return {
          content: storyData.content || toStoryContent(storyboard),
          scenes: storyboardToStoryScenes(storyboard),
          storyboard,
        };
      }

      if (attempt === maxAttempts) {
        throw new Error(summarizeStoryGenerationIssue('Incomplete story generated after retries', result.content));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCause = error instanceof Error && error.cause ? JSON.stringify(error.cause) : '';
      console.error(`[generateStory] Attempt ${attempt} failed: ${errorMessage}`, errorCause);

      if (attempt === maxAttempts) {
        throw new Error(`Story generation failed: ${errorMessage} ${errorCause}`);
      }
      // Continue to retry
    }
  }

  throw new Error('Story generation failed after retries');
}

// ============================================================
// Story Costume Analysis (for custom stories not in the preset list)
// ============================================================

/**
 * Use LLM to analyze a story title and generate costume/appearance description.
 * This is called for custom stories that don't have a pre-defined profile.
 */
export async function analyzeStoryCostumeProfile(title: string): Promise<string> {
  try {
    const { getLLMProvider } = await import('./llm.service.js');
    const llm = getLLMProvider();

    const result = await llm.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `You are a professional children's story character designer.
When given a story title in Chinese or English, describe ONE main character's costume and appearance that fits the story's world and era.
Focus on: era/time period, clothing style, accessories/props, and overall mood.
Keep the description concise and AI-image-generation-friendly (3-5 sentences).
Output ONLY the costume description in English, no explanations.`,
        },
        {
          role: 'user',
          content: `Analyze this story and describe the main character's costume and appearance:\n\nStory: ${title}\n\nProvide: setting era, appearance, costume, key prop, and mood.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return result.content?.trim() || '';
  } catch (error) {
    console.error('[analyzeStoryCostumeProfile] LLM call failed:', error);
    return '';
  }
}
