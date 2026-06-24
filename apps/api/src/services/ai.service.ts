import crypto from 'crypto';
import { existsSync } from 'fs';
import sharp from 'sharp';
import { buildStoryboardFromLegacyScenes, normalizeStoryboard, type Storyboard } from '../types/storyboard.js';
import { uploadFile } from '../config/oss.js';
import { getLLMProvider } from './llm.service.js';
import { getStoryCostumeProfile, buildCostumePrompt } from '../config/story-costume-profiles.js';

// ============================================================
// Character Identity — hard structural constraints
// ============================================================

/**
 * Hard identity of the user's uploaded character. These four fields are the
 * non-negotiable parts of "who is the protagonist" — every story-generation
 * and illustration prompt downstream reads from them and refuses to drift.
 *
 * Unlike `featureDesc` (a free-text appearance blurb the LLM is allowed to
 * paraphrase), this struct is the contract. If the LLM wants the protagonist
 * to be 小兔子朵朵, the upstream identity must literally say
 * `{ gender: 'female', subjectKind: 'animal' }`. Otherwise we don't write that.
 */
export type CharacterGender = 'male' | 'female' | 'unknown';
export type CharacterAgeBand = 'child' | 'teen' | 'adult' | 'unknown';
export type CharacterSubjectKind = 'human' | 'animal';

export interface CharacterIdentity {
  /** Free-text appearance description (hair, face, clothing style). Kept for backwards compat. */
  featureDesc: string;
  /** Protagonist's gender — drives Chinese pronouns (他/她) and name choice. */
  gender: CharacterGender;
  /** Age band — drives dialogue tone, danger level, vocabulary. */
  ageBand: CharacterAgeBand;
  /** Human vs animal — the LLM MUST NOT swap a human protagonist into an animal, or vice versa. */
  subjectKind: CharacterSubjectKind;
  /** Optional display name. When blank the story LLM is allowed to choose one. */
  characterName?: string;
}

export const UNKNOWN_IDENTITY: CharacterIdentity = {
  featureDesc: '',
  gender: 'unknown',
  ageBand: 'unknown',
  subjectKind: 'human', // Default to human — the safe choice for a children's book.
};

/**
 * Build the "hard identity" block that every story / illustration prompt
 * embeds. Centralised here so the rules live in exactly one place.
 */
export function buildCharacterIdentityBlock(identity: CharacterIdentity): string {
  const lines: string[] = [
    '【主角身份硬约束 — 违反 = 故事无效, 必须重写】',
    `主角 (TA) 必须严格满足以下身份, 任何与之冲突的写法都禁止:`,
    `- 性别: ${identity.gender}`,
    `- 年龄段: ${identity.ageBand}`,
    `- 主体类型: ${identity.subjectKind}${identity.subjectKind === 'human' ? ' (人类, 不可写成动物)' : ' (动物, 不可写成人)'}`,
    `- 名字: ${identity.characterName ? identity.characterName : '由你起一个符合性别 + 年龄 + 故事氛围的中文名字'}`,
    '',
    '【绝对禁止】',
    identity.subjectKind === 'human'
      ? '- 把主角从人类换成动物/动物的拟人形态 (这是最常见的错误, 严禁)'
      : '- 把主角从动物换成人类/小孩',
    '- 把主角换成另一个小孩或配角',
    '- 让主角在故事里缺席或变成旁观者',
    '- 给主角起异性名字 (gender=male 不能叫 "朵朵/莉莉/小美"; gender=female 不能叫 "小宝/建国/小帅")',
    '- 旁白/对话/字幕里用错性别代词 (男=他, 女=她, 未知=TA/主角)',
    '- imageDescription 里写出与上述身份冲突的形象',
  ];
  return lines.join('\n');
}

/**
 * Sanity-check a generated story for gender pronoun consistency.
 * Cheap regex sweep — if it trips, the caller should retry generation.
 */
export function checkGenderPronounConsistency(
  text: string,
  identity: CharacterIdentity
): { ok: true } | { ok: false; mismatch: 'pronoun-female' | 'pronoun-male' | 'unknown-gender' } {
  if (identity.gender === 'unknown' || identity.subjectKind !== 'human') {
    return { ok: true };
  }
  const hasFemalePronoun = /她|女生|女孩|小姑娘/.test(text);
  const hasMalePronoun = /他(?![/她])|男生|男孩|小伙子/.test(text);

  if (identity.gender === 'male' && hasFemalePronoun && !hasMalePronoun) {
    return { ok: false, mismatch: 'pronoun-female' };
  }
  if (identity.gender === 'female' && hasMalePronoun && !hasFemalePronoun) {
    return { ok: false, mismatch: 'pronoun-male' };
  }
  return { ok: true };
}

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
 * Build a [FORMAT] suffix for the prompt that pins the aspect ratio as text.
 *
 * Why: apiz.ai's `gpt-image-2` treats `image_size` as a *suggestion*, not a hard
 * constraint. If the scene prompt contains words like "panoramic", "wide bedroom",
 * "landscape view", the model happily generates a landscape image even when
 * `image_size: '3:4'` is set. Adding an explicit `[FORMAT]` line at the end of
 * the prompt pins the orientation much more reliably (still not 100% — this is
 * fundamentally a soft constraint of the model, not the API).
 */
function buildAspectRatioInstruction(size?: ImageTaskParams['params']['image_size']): string {
  if (!size || size === 'auto') return ''
  const map: Record<string, string> = {
    '1:1':   '\n\n[FORMAT] square composition, 1:1 aspect ratio.',
    '4:3':   '\n\n[FORMAT] horizontal composition, 4:3 aspect ratio.',
    '3:4':   '\n\n[FORMAT] vertical composition, portrait orientation, 3:4 aspect ratio. Do NOT generate landscape/horizontal images.',
    '16:9':  '\n\n[FORMAT] widescreen horizontal composition, 16:9 aspect ratio.',
    '9:16':  '\n\n[FORMAT] vertical mobile composition, 9:16 aspect ratio.',
    '3:2':   '\n\n[FORMAT] horizontal composition, 3:2 aspect ratio.',
    '2:3':   '\n\n[FORMAT] vertical composition, portrait orientation, 2:3 aspect ratio.',
  }
  return map[size] || ''
}

/**
 * Create an image generation task
 */
export async function createImageTask(params: ImageTaskParams): Promise<string> {
  // 修复 (2026-06-24): 强约束 [FORMAT] 行追加到 prompt 末尾, 把 image_size 钉死
  // (apiz.ai 的 gpt-image-2 把 image_size 当建议, prompt 文字约束才稳)
  if (params.params?.prompt && !params.params.prompt.includes('[FORMAT]')) {
    const instruction = buildAspectRatioInstruction(params.params.image_size)
    if (instruction) {
      params = {
        ...params,
        params: { ...params.params, prompt: params.params.prompt + instruction },
      }
    }
  }

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
      // 修复 (2026-06-18): apiz.ai 在失败时也返 {message: "查询成功"} 这种毫无意义的占位,
      // 直接抛出去用户根本看不懂。改用统一的诊断信息: HTTP 状态 + 响应形状 + 原始 message (如果有)。
      console.error('[apiz.ai] create image task http error:', response.status, JSON.stringify(result, null, 2));
      const shape = `code=${result?.code ?? '?'} success=${result?.success ?? '?'} data=${result?.data ? 'present' : 'null'}`;
      throw new Error(
        `图片服务创建任务失败（HTTP ${response.status} ${shape}）。` +
        `${result?.message && result.message !== '查询成功' ? ` apiz 返回: ${result.message}` : ''}` +
        ` 请稍后重试,或换个故事/风格试试。`,
      );
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
    // 同 createImageTask 的修复: apiz.ai 失败时返 "查询成功" 占位, 直接抛没意义
    const shape = `code=${result?.code ?? '?'} success=${result?.success ?? '?'} data=${result?.data ? 'present' : 'null'}`;
    throw new Error(
      `图片服务查询任务失败（HTTP ${response.status} ${shape}）。` +
      `${result?.message && result.message !== '查询成功' ? ` apiz 返回: ${result.message}` : ''}` +
      ` 请稍后重试。`,
    );
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
 *
 * 修复 (2026-06-18): 之前 maxAttempts = 300 × 3s = 15min, 但前端 stylizeCharacter 接口
 * timeout 只有 300000ms = 5min。后端比前端多等 10min, 导致用户端先超时看到"超时",
 * 但后端继续等, 最终图生成后也没人接收 (浪费 API 配额 + 体验差)。
 * 改成 100 × 3s = 5min, 跟前端 timeout 对齐, 行为一致:
 *   - 成功: 立即返回
 *   - 失败: 立即报错
 *   - 超时: 5min 后明确抛 "Image generation timeout", 前端拿到清晰错误
 */
export async function waitForTask(taskId: string, maxAttempts: number = 100): Promise<string[]> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await queryTaskStatus(taskId);
    if (result.status === 'completed') {
      const images = result.images || [];
      if (images.length === 0) {
        throw new Error('图片服务已完成但没有返回图片 URL, 请稍后重试');
      }
      return images;
    }
    if (result.status === 'failed') {
      // 修复 (2026-06-18): 同样过滤 apiz 的 "查询成功" 占位错误, 用户根本看不懂
      const realError = result.error && result.error !== '查询成功' ? result.error : '';
      throw new Error(
        `图片生成失败${realError ? `: ${realError}` : ', 请稍后重试或换个故事/风格试试。'}`,
      );
    }
    await sleep(3000);  // 3s interval, 100 * 3 = 300s = 5min max (跟前端 timeout 对齐)
  }
  throw new Error('图片生成超过 5 分钟未完成, 已超时。请稍后重试,或换个故事/风格试试。');
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
  // 默认改 3:4 与封面/内页一致 (修复 2026-06-18)
  size: string = '3:4'
): Promise<string> {
  const taskId = await createImageTask({
    model: 'openai/gpt-image-2',
    params: {
      prompt,
      image_size: size as ImageTaskParams['params']['image_size'],
      resolution: '2K',
      quality: 'low',
      num_images: 1,
    },
  });

  const images = await waitForTask(taskId);
  return images[0];
}

/**
 * Cover Design Brief — structured art direction produced by an LLM before any
 * cover image is rendered. It encodes the four universal principles of a good
 * picture-book cover (single visual focus, primary setting visible, restrained
 * supporting cast, unified mood) so the model can no longer "freestyle" extras
 * (angels, demons, candy shops, animal crowds, etc.).
 *
 * Source: `extractCoverDesignBrief()`. All fields are short English clauses
 * suitable for direct inclusion in an image-generation prompt.
 */
export interface CoverDesignBrief {
  /** One-sentence description of what this picture book is about. */
  coreSubject: string;
  /** The main setting that MUST be recognisable in the background. */
  primarySetting: string;
  /** The protagonist's iconic action / pose / moment on the cover. */
  heroAction: string;
  /** Emotional tone: warm / adventurous / mysterious / humorous / tender / etc. */
  mood: string;
  /** Visual symbols that must appear (≤3, tightly tied to the premise). */
  mustInclude: string[];
  /** Story-specific elements that would clash with the premise. */
  mustExclude: string[];
  /** ≤1 human + ≤1 animal supporting roles. Empty if premise has none. */
  supportingCast: string[];
  /** One-sentence layout hint: where the hero sits, where the prop goes. */
  compositionHint: string;
}

const EMPTY_BRIEF: CoverDesignBrief = {
  coreSubject: '',
  primarySetting: '',
  heroAction: '',
  mood: 'warm and child-friendly',
  mustInclude: [],
  mustExclude: [],
  supportingCast: [],
  compositionHint: 'Hero in lower third, focal prop near the hero.',
};

/** Universal negative list — applies to every cover regardless of theme. */
const COVER_NEGATIVE_LIST: readonly string[] = [
  'religious figures (angel, halo, saint, devil, demon, crucifix)',
  'fantasy creatures (dragon, fairy, unicorn, monster, alien)',
  'candy shops, sweet shops, bakeries, modern branded packaging',
  'a second protagonist child (ONE main hero only)',
  'more than ONE small animal in total',
  'logos, watermarks, price stickers, barcodes, or readable foreign words',
  'cropped head, cropped feet, extra limbs, or duplicate main character',
  'photo-realistic look, 3D-toy look, anime poster style, cheap clipart',
  'busy collage / group-photo layout with 4+ figures',
];

export interface StoryCoverParams {
  title: string;
  summary?: string;
  sceneHints?: string[];
  characterImageUrl?: string | null;
  /**
   * Optional pre-computed cover design brief. When omitted, the cover
   * generator will call `extractCoverDesignBrief()` itself.
   */
  brief?: CoverDesignBrief | null;
  /**
   * Optional hard identity of the protagonist. When provided, the cover
   * prompt explicitly locks the protagonist's gender / age / species so the
   * cover image doesn't drift from the inner-page illustrations.
   */
  protagonistIdentity?: CharacterIdentity | null;
}

/**
 * Pull a structured Cover Design Brief out of the story using the LLM.
 * Falls back to a rule-based extraction from the first scene if the LLM call
 * fails or returns malformed JSON — the cover must still be generated, just
 * with a less precise brief.
 */
export async function extractCoverDesignBrief(input: {
  title: string;
  summary?: string;
  scenes?: Array<{ imageDescription?: string; storyText?: string }>;
}): Promise<CoverDesignBrief> {
  const trimmedTitle = (input.title || '').trim();
  const trimmedSummary = (input.summary || '').trim().slice(0, 400);
  const sceneBlurbs = (input.scenes || [])
    .slice(0, 3)
    .map((scene) => (scene.imageDescription || scene.storyText || '').trim())
    .filter(Boolean)
    .map((text) => text.slice(0, 180));

  const fallback = buildFallbackBrief(trimmedTitle, sceneBlurbs);

  try {
    const { getLLMProvider } = await import('./llm.service.js');
    const llm = getLLMProvider();

    const userPayload = [
      `Story title: ${trimmedTitle || '(untitled)'}`,
      trimmedSummary ? `Story summary: ${trimmedSummary}` : '',
      sceneBlurbs.length > 0
        ? `First scene descriptions:\n- ${sceneBlurbs.join('\n- ')}`
        : '',
    ].filter(Boolean).join('\n\n');

    const result = await llm.chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are the art director for a premium children\'s picture book. ' +
            'Given a story, produce a structured "Cover Design Brief" as a single JSON object with EXACTLY these keys: ' +
            'coreSubject (one sentence), primarySetting (the main setting that MUST appear in the background), ' +
            'heroAction (the protagonist\'s iconic action/pose on the cover), mood (one emotional adjective phrase), ' +
            'mustInclude (array, ≤3 items: visual symbols tied to the premise), ' +
            'mustExclude (array, story-specific items that would clash with the premise; may be empty), ' +
            'supportingCast (array, ≤1 human + ≤1 animal; empty array if premise has none), ' +
            'compositionHint (one short sentence on layout). ' +
            'All values in concise English. Total visible cover elements must stay under 5 ' +
            '(hero + setting + ≤3 props + ≤2 supporting). ' +
            'Output ONLY the JSON object, no prose, no markdown fences.',
        },
        { role: 'user', content: userPayload },
      ],
      temperature: 0.4,
      max_tokens: 600,
    });

    const raw = (result.content || '').trim();
    const parsed = parseBriefJson(raw);
    if (parsed) {
      console.log(`[CoverBrief] LLM brief extracted for "${trimmedTitle}"`);
      return parsed;
    }
    console.warn(`[CoverBrief] LLM JSON parse failed, using rule-based fallback for "${trimmedTitle}"`);
    return fallback;
  } catch (error) {
    console.warn(
      `[CoverBrief] LLM call failed, using rule-based fallback for "${trimmedTitle}":`,
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}

function parseBriefJson(raw: string): CoverDesignBrief | null {
  if (!raw) return null;
  // Strip ```json fences if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  const json = fenced ? fenced[1] : raw;
  let candidate: any;
  try {
    candidate = JSON.parse(json);
  } catch {
    // Try to grab the first {...} block.
    const braceMatch = json.match(/\{[\s\S]*\}/);
    if (!braceMatch) return null;
    try {
      candidate = JSON.parse(braceMatch[0]);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;

  const arr = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, max)
      : [];

  const out: CoverDesignBrief = {
    coreSubject: typeof candidate.coreSubject === 'string' ? candidate.coreSubject.trim() : '',
    primarySetting: typeof candidate.primarySetting === 'string' ? candidate.primarySetting.trim() : '',
    heroAction: typeof candidate.heroAction === 'string' ? candidate.heroAction.trim() : '',
    mood: typeof candidate.mood === 'string' ? candidate.mood.trim() : 'warm and child-friendly',
    mustInclude: arr(candidate.mustInclude, 3),
    mustExclude: arr(candidate.mustExclude, 5),
    supportingCast: arr(candidate.supportingCast, 2),
    compositionHint: typeof candidate.compositionHint === 'string'
      ? candidate.compositionHint.trim()
      : 'Hero in lower third, focal prop near the hero.',
  };
  // Must have at least coreSubject or primarySetting; otherwise the LLM
  // basically returned nothing — fall back to rule-based.
  if (!out.coreSubject && !out.primarySetting) return null;
  return out;
}

/**
 * Rule-based fallback: build a minimal brief by reusing the first scene's
 * imageDescription as coreSubject + setting + action, and the story title as
 * mood context. Keeps the cover generation pipeline alive when the LLM is
 * down or returns garbage.
 */
function buildFallbackBrief(
  title: string,
  sceneBlurbs: string[]
): CoverDesignBrief {
  const first = sceneBlurbs[0] || title;
  return {
    coreSubject: first || title,
    primarySetting: first || title,
    heroAction: 'the protagonist acting out the story moment',
    mood: 'warm and child-friendly',
    mustInclude: sceneBlurbs.slice(0, 3),
    mustExclude: [],
    supportingCast: [],
    compositionHint: 'Hero in lower third, focal prop near the hero.',
  };
}

function buildStoryCoverPrompt(params: {
  title: string;
  storySummary: string;
  brief: CoverDesignBrief;
  hasCharacterReference: boolean;
  protagonistIdentity?: CharacterIdentity | null;
}): string {
  const brief = { ...EMPTY_BRIEF, ...params.brief };
  const identity = params.protagonistIdentity;
  const mustIncludeLine = brief.mustInclude.length > 0
    ? `Required visual anchors that MUST appear: ${brief.mustInclude.join('、')}.`
    : 'No specific prop is required beyond the protagonist and the setting.';
  const supportingLine = brief.supportingCast.length > 0
    ? `Supporting cast (≤1 human + ≤1 animal, total ≤2 figures besides the hero): ${brief.supportingCast.join('、')}.`
    : 'No supporting cast for this story — keep the cover focused on the single hero.';
  const storyExcludeLine = brief.mustExclude.length > 0
    ? `Story-specific exclusions: ${brief.mustExclude.join('、')}.`
    : '';
  const negativeList = COVER_NEGATIVE_LIST.join('; ');
  const protagonistLockLine = identity
    ? `PROTAGONIST IDENTITY LOCK (cover must match inner pages): gender=${identity.gender}; age=${identity.ageBand}; species=${identity.subjectKind}${identity.subjectKind === 'human' ? ' — DO NOT draw an animal as the protagonist' : ''}${identity.characterName ? `; name=${identity.characterName}` : ''}. `
    : '';

  return [
    // 1. Format & layout (preserve existing cover layout rules)
    'Create ONE finished front-cover illustration for a premium children\'s picture book, portrait 3:4.',
    'House style: warm hand-painted gouache and watercolor, delicate linework, soft paper texture, luminous golden light, charming expressive faces, polished published-book cover art.',
    'Keep the look consistent with a family reading app: elegant, gentle, magical, clean, emotionally warm, suitable for children ages 3-8.',
    'Fixed cover layout: reserve the top 24-30% as a calm clean title area with a blank cream or warm-gold title plaque, soft sky, or quiet open space. A backend compositor will add the exact title later, so DO NOT draw any letters or readable words.',
    protagonistLockLine,

    // 2. Cover Design Brief — single source of truth for "what to draw"
    `This picture book is about: ${brief.coreSubject}.`,
    `The story takes place in: ${brief.primarySetting} — this setting MUST be unmistakably visible in the background.`,
    `The protagonist is doing: ${brief.heroAction}.`,
    mustIncludeLine,
    supportingLine,
    storyExcludeLine,

    // 3. Hero composition (preserve existing rule, refined with brief.hint)
    'Hero composition: show the main child character clearly in the lower center or lower third, about 38-52% of image height, face visible, three-quarter or full-body pose, natural story action, strong silhouette, not a passport portrait.',
    brief.compositionHint
      ? `Composition directive from art director: ${brief.compositionHint}`
      : '',

    // 4. Character identity (preserve existing rule)
    params.hasCharacterReference
      ? 'The reference image is the main character identity and costume reference. Preserve the recognizable face, hair, age, skin tone, costume mood, and charm, while transforming it into the unified picture-book cover style.'
      : 'Design one appealing main child character who fits this story and make them the visual hero of the cover.',

    // 5. Mood (single unified tone — do not blend)
    `Emotional tone for this cover: ${brief.mood}. Do NOT blend in conflicting tones.`,

    // 6. Hard caps — crowd control (the core fix for "chaotic cover" bug)
    'Hard caps on cover elements:',
    '- Exactly ONE main protagonist child.',
    '- Supporting figures: at most 1 human AND at most 1 small animal, AND only when the premise naturally calls for them.',
    '- Distinct props / motifs in the scene: at most 3, each one must directly serve the premise.',
    '- Total visible figures (hero + supporting) MUST be ≤3. NEVER crowd the cover.',

    // 7. Universal negative list — cross-genre invariants
    `Universal exclusions (apply to EVERY cover, regardless of theme): ${negativeList}.`,

    // 8. Color & finish (preserve existing rule)
    'Color direction: warm cream, coral, rose, sage, teal, soft sky blue, and golden highlights with one deeper accent. Avoid muddy brown, heavy dark blue, dominant purple gradients, neon colors, and low-contrast grey.',

    // 9. Quality bar
    'The final image should look like a beautiful book cover first, not a random story scene screenshot. One clear focal point, one clear setting, one clear mood.',
  ]
    .filter(Boolean)
    .join(' ');
}

function normalizeCoverTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim() || '我的绘本';
}

function escapePangoMarkup(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function findCoverTitleFontFile(): string | undefined {
  const candidates = [
    process.env.COVER_TITLE_FONT_FILE,
    'C:\\Windows\\Fonts\\NotoSansSC-VF.ttf',
    'C:\\Windows\\Fonts\\msyhbd.ttc',
    'C:\\Windows\\Fonts\\msyh.ttc',
    'C:\\Windows\\Fonts\\simhei.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/System/Library/Fonts/PingFang.ttc',
  ].filter(Boolean) as string[];

  return candidates.find((file) => existsSync(file));
}

function buildCoverTitleLayout(width: number, height: number) {
  const plaqueWidth = Math.round(width * 0.82);
  const plaqueHeight = Math.round(height * 0.18);
  const plaqueX = Math.round((width - plaqueWidth) / 2);
  const plaqueY = Math.round(height * 0.055);
  const radius = Math.round(Math.min(width, height) * 0.034);
  const textWidth = Math.round(plaqueWidth * 0.86);
  const textHeight = Math.round(plaqueHeight * 0.66);

  return {
    plaqueX,
    plaqueY,
    plaqueWidth,
    plaqueHeight,
    radius,
    textWidth,
    textHeight,
  };
}

function createCoverTitlePlaqueSvg(width: number, height: number): Buffer {
  const layout = buildCoverTitleLayout(width, height);
  const strokeWidth = Math.max(3, Math.round(width * 0.0035));
  const accentY = layout.plaqueY + layout.plaqueHeight - Math.round(layout.plaqueHeight * 0.18);
  const accentX1 = layout.plaqueX + Math.round(layout.plaqueWidth * 0.18);
  const accentX2 = layout.plaqueX + Math.round(layout.plaqueWidth * 0.82);

  return Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="${Math.round(height * 0.01)}" stdDeviation="${Math.round(width * 0.012)}" flood-color="#5f3216" flood-opacity="0.20"/>
    </filter>
  </defs>
  <rect
    x="${layout.plaqueX}"
    y="${layout.plaqueY}"
    width="${layout.plaqueWidth}"
    height="${layout.plaqueHeight}"
    rx="${layout.radius}"
    fill="#fff2d2"
    fill-opacity="0.94"
    stroke="#c98a45"
    stroke-opacity="0.34"
    stroke-width="${strokeWidth}"
    filter="url(#softShadow)"
  />
  <path
    d="M ${accentX1} ${accentY} C ${Math.round(width * 0.42)} ${accentY + Math.round(height * 0.012)}, ${Math.round(width * 0.58)} ${accentY + Math.round(height * 0.012)}, ${accentX2} ${accentY}"
    fill="none"
    stroke="#d59b59"
    stroke-opacity="0.36"
    stroke-width="${Math.max(2, Math.round(width * 0.0025))}"
    stroke-linecap="round"
  />
</svg>`.trim());
}

async function renderCoverTitleText(title: string, width: number, height: number): Promise<{ buffer: Buffer; width: number; height: number }> {
  const layout = buildCoverTitleLayout(width, height);
  const fontFile = findCoverTitleFontFile();
  const markup = `<span foreground="#63331a" font_weight="900">${escapePangoMarkup(title)}</span>`;
  const textOptions = {
    text: markup,
    ...(fontFile ? { fontfile: fontFile } : { font: 'Noto Sans CJK SC Bold, Microsoft YaHei, SimHei, sans' }),
    width: layout.textWidth,
    height: layout.textHeight,
    align: 'centre' as const,
    rgba: true,
    spacing: Math.max(2, Math.round(height * 0.004)),
    wrap: 'char' as const,
  };

  const { data, info } = await sharp({ text: textOptions })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
  };
}

async function imageUrlToBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('data:image/')) {
    const [, payload = ''] = imageUrl.split(',', 2);
    return Buffer.from(payload, 'base64');
  }

  const fetchUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
  if (!/^https?:\/\//i.test(fetchUrl)) {
    throw new Error(`封面图片地址不可下载: ${imageUrl}`);
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`下载封面图片失败: HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function addExactTitleToCoverImage(imageUrl: string, title: string): Promise<string> {
  const imageBuffer = await imageUrlToBuffer(imageUrl);
  const basePng = await sharp(imageBuffer)
    .rotate()
    .png()
    .toBuffer();
  const metadata = await sharp(basePng).metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error('封面图片尺寸读取失败');
  }

  const layout = buildCoverTitleLayout(width, height);
  const plaque = createCoverTitlePlaqueSvg(width, height);
  const titleText = await renderCoverTitleText(normalizeCoverTitle(title), width, height);
  const titleLeft = Math.round((width - titleText.width) / 2);
  const titleTop = Math.round(layout.plaqueY + (layout.plaqueHeight - titleText.height) / 2);
  const finalBuffer = await sharp(basePng)
    .composite([
      { input: plaque, left: 0, top: 0 },
      { input: titleText.buffer, left: titleLeft, top: titleTop },
    ])
    .png()
    .toBuffer();

  const key = `covers/${Date.now()}-${crypto.randomUUID()}.png`;
  const { url } = await uploadFile(key, finalBuffer, { contentType: 'image/png' });
  return url;
}

/**
 * Generate a portrait picture-book cover for a completed story.
 *
 * The model reserves a clean title area. The backend composites the exact
 * story title into the final image so Chinese typography is never model noise.
 */
export async function generateStoryCoverImage(params: StoryCoverParams): Promise<string> {
  const coverTitle = normalizeCoverTitle(params.title || '我的绘本');
  const title = truncatePromptText(coverTitle, 40);
  const sceneHints = (params.sceneHints || [])
    .map((item) => truncatePromptText(item, 90))
    .filter(Boolean)
    .slice(0, 5);
  const storySummary = truncatePromptText(params.summary || sceneHints.join(' / '), 260);

  // Cover Design Brief: single source of truth for "what to draw" on the cover.
  // Caller may pre-supply it (e.g. for batch reuse); otherwise we extract it
  // here from the title + summary + scene hints.
  const brief = params.brief && (params.brief.coreSubject || params.brief.primarySetting)
    ? params.brief
    : await extractCoverDesignBrief({
        title,
        summary: storySummary,
        scenes: sceneHints.map((imageDescription) => ({ imageDescription })),
      });

  const prompt = buildStoryCoverPrompt({
    title,
    storySummary,
    brief,
    hasCharacterReference: Boolean(params.characterImageUrl),
    protagonistIdentity: params.protagonistIdentity ?? null,
  });

  const taskId = await createImageTask({
    model: params.characterImageUrl ? 'openai/gpt-image-2/edit' : 'openai/gpt-image-2',
    params: {
      prompt,
      ...(params.characterImageUrl ? { image_urls: [params.characterImageUrl] } : {}),
      image_size: '3:4',
      resolution: '2K',
      // 修复 (2026-06-18): medium 一张 cover 消耗 24 积分 (medium = low 的 6x).
      // apiz.ai 实际按 quality 分档计费, low + 2K = 4 积分/张, 跟其他生图调用统一.
      quality: 'low',
      num_images: 1,
    },
  });

  const images = await waitForTask(taskId);
  return addExactTitleToCoverImage(images[0], coverTitle);
}

/**
 * Composite illustration (Edit mode)
 * @param sourceImageUrl - The character image URL
 * @param sceneBackground - Background description
 * @param scene - Scene object with description and text
 * @param characterIdentity - Hard identity (gender / age / species / name).
 *   When provided, the prompt explicitly forbids the model from swapping the
 *   protagonist's identity. This is what prevents "user uploaded a boy but
 *   the picture shows a small rabbit" drift.
 */
export async function compositeIllustration(
  sourceImageUrl: string,
  sceneBackground: string,
  scene?: { description: string; text: string },
  characterIdentity?: CharacterIdentity | null
): Promise<string> {
  console.log(`[compositeIllustration] sourceImageUrl=${sourceImageUrl}`);
  const characterHint =
    'IMPORTANT: The person in the reference image IS the main character. ' +
    'You MUST keep their face structure, hair style, skin tone, AND COSTUME (clothing, accessories, signature props) the same as the reference image so the character is recognizable across all pages of the picture book. ' +
    'Do NOT change or replace the character. Do NOT re-dress the character in scene-specific clothing that differs from the reference — the reference image already encodes the per-story costume chosen for this character. ' +
    'Do NOT make the main character stare at the camera unless the scene explicitly calls for it. ' +
    'The character must ACT inside the story: eyes should look toward the other character, animal, object, path, danger, or goal named in the scene; body direction, hands, feet, and head angle must follow the action. ' +
    'Use natural storybook acting poses such as side view, three-quarter profile, looking down at a prop, looking up at a threat, running toward a destination, turning toward someone speaking, or glancing back while moving. ' +
    'A full back view is allowed only when it is the clearest storytelling choice, but keep enough face/profile/costume cues for identity. ' +
    'IMPORTANT: The reference photo is only an IDENTITY + COSTUME reference, NOT a pose or expression reference. ' +
    'Let the character\'s facial expression, body language, and pose match the SCENE\'s mood and story beat (e.g. afraid when facing a wolf, brave when rescuing, smiling when reuniting), but the clothing and props stay as in the reference. ' +
    'It is NORMAL and DESIRED for the character to show different expressions, gaze directions, head turns, and action poses in different scenes — that is what makes a picture book — but the COSTUME must remain consistent. ' +
    (characterIdentity
      ? buildIdentityLockForIllustration(characterIdentity)
      : 'CRITICAL — PROTAGONIST IDENTITY LOCK: The protagonist of this picture book must visually match the reference image in every scene. Keep the same gender, age band, and species as the reference. Do NOT turn a human protagonist into an animal or vice versa. Do NOT replace the protagonist with a different child. ')
    ;
  const scenePrompt = scene ? buildVisualScenePrompt(scene) : sceneBackground;
  const prompt = characterHint + scenePrompt;

  const taskId = await createImageTask({
    model: 'openai/gpt-image-2/edit',
    params: {
      prompt,
      image_urls: [sourceImageUrl],
      // 修复 (2026-06-18): 统一为 3:4 竖版 (与封面一致), 适配手机端绘本阅读
      image_size: '3:4',
      resolution: '2K',
      quality: 'low',
      num_images: 1,
    },
  });

  const images = await waitForTask(taskId);
  return images[0];
}

/**
 * Render the protagonist-identity lock as an English prompt block for the
 * illustration model. Kept separate from `buildCharacterIdentityBlock` so
 * the illustration model gets a single concise sentence rather than the full
 * Chinese structured contract (which is targeted at the story LLM).
 */
function buildIdentityLockForIllustration(identity: CharacterIdentity): string {
  const genderPhrase = identity.gender === 'male'
    ? 'male (boy) — must remain male / a boy'
    : identity.gender === 'female'
    ? 'female (girl) — must remain female / a girl'
    : 'gender as shown in the reference — do not flip';
  const speciesPhrase = identity.subjectKind === 'animal'
    ? 'animal — must remain an animal throughout'
    : 'human child — must remain a human child throughout, NEVER become an animal or animal-like creature';
  return `CRITICAL — PROTAGONIST IDENTITY LOCK: gender ${genderPhrase}; age band ${identity.ageBand}; species ${speciesPhrase}. The protagonist shown in the reference image is the ONLY main child of this story. Supporting figures may include at most 1 small animal; that animal is NOT the protagonist. `;
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

// Determine mode: edit (image-to-image) or text-to-image.
  // Any absolute HTTP(S) image URL is a usable source image. Restricting this
  // to known CDN hosts made LAN/local uploads fall back to text-to-image.
  const hasSourceImage = /^https?:\/\//i.test(photoUrl);
  console.log(`[Stylize] photoUrl=${photoUrl} hasSourceImage=${hasSourceImage}`);

  let taskId: string;
  if (hasSourceImage) {
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
        resolution: '2K',
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
        resolution: '2K',
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
 * Extract a full character identity (appearance + hard identity) from a photo
 * URL using vision LLM analysis. Returns a structured `CharacterIdentity`
 * instead of a free-text string — the story generator and illustration
 * pipeline depend on the structured fields to keep the protagonist from
 * drifting to a different gender/species/age.
 *
 * Falls back to `UNKNOWN_IDENTITY` (with empty featureDesc) if the LLM call
 * or JSON parse fails. Callers should treat `gender === 'unknown'` as a soft
 * signal to nudge the user toward a clearer source photo.
 */
export async function extractCharacterFeatures(photoUrl: string): Promise<CharacterIdentity> {
  try {
    const llm = getLLMProvider();
    const result = await llm.chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a vision analyst for a children\'s picture-book platform. ' +
            'Analyse the uploaded photo and return ONLY a JSON object with these exact keys: ' +
            '"featureDesc" (string, 2-3 Chinese sentences describing appearance: hair, face, expression, clothing style; no background), ' +
            '"gender" (one of: "male" | "female" | "unknown"), ' +
            '"ageBand" (one of: "child" | "teen" | "adult" | "unknown"), ' +
            '"subjectKind" (one of: "human" | "animal" — pick "animal" ONLY if the subject is clearly a non-human animal). ' +
            'If the photo is blurry, dark, or ambiguous on any field, use "unknown" rather than guessing. ' +
            'Output JSON only, no prose, no markdown fences.',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: photoUrl } },
            { type: 'text', text: '分析这张照片, 输出上述 JSON.' },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });
    const raw = (result.content || '').trim();
    const parsed = parseIdentityJson(raw);
    if (parsed) return parsed;
    console.warn('[extractCharacterFeatures] JSON parse failed, returning UNKNOWN_IDENTITY');
    return { ...UNKNOWN_IDENTITY };
  } catch (err) {
    console.warn('[extractCharacterFeatures] Failed:', err instanceof Error ? err.message : err);
    return { ...UNKNOWN_IDENTITY };
  }
}

function parseIdentityJson(raw: string): CharacterIdentity | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  const json = fenced ? fenced[1] : raw;
  let candidate: any;
  try {
    candidate = JSON.parse(json);
  } catch {
    const braceMatch = json.match(/\{[\s\S]*\}/);
    if (!braceMatch) return null;
    try {
      candidate = JSON.parse(braceMatch[0]);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;

  const gender = (['male', 'female', 'unknown'] as const).includes(candidate.gender)
    ? candidate.gender
    : 'unknown';
  const ageBand = (['child', 'teen', 'adult', 'unknown'] as const).includes(candidate.ageBand)
    ? candidate.ageBand
    : 'unknown';
  const subjectKind = (['human', 'animal'] as const).includes(candidate.subjectKind)
    ? candidate.subjectKind
    : 'unknown';
  // "unknown" subjectKind is risky — default to "human" for safety. Children
  // almost always upload people, and downstream prompts assume a protagonist
  // they can describe physically. If it really is an animal, the next
  // stylize pass will surface that to the user.
  const safeSubjectKind: CharacterSubjectKind = subjectKind === 'unknown' ? 'human' : subjectKind;

  return {
    featureDesc: typeof candidate.featureDesc === 'string' ? candidate.featureDesc.trim() : '',
    gender,
    ageBand,
    subjectKind: safeSubjectKind,
  };
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

  // Require at least 6 scenes for a proper picture-book arc. A fairy tale
  // typically has 6-9 key beats (opening → conflict → climax → resolution).
  // Stories with only 3-5 scenes are almost always truncated LLM output that
  // skipped canonical events. Floor raised to 6 (经典故事 prompt 要求 ≥ 8,
  // 但这里只卡底线防止 LLM 偷懒)。
  if (!Array.isArray(story.storyboard.scenes) || story.storyboard.scenes.length < 6) {
    return false;
  }

  if (story.storyboard.scenes.some((scene) => {
    const text = (scene?.storyText || scene?.voiceover || '').trim();
    const desc = (scene?.imageDescription || '').trim();
    if (!text || !desc) return true;
    // Warn if storyText is too short (<20 chars) — too brief, prompt says
    // 50-90 字展开, 短于 20 字基本是敷衍。
    if (text.length < 20) {
      console.warn(`[isStoryComplete] Scene ${scene.index} storyText too short (${text.length} chars): ${text.slice(0, 30)}...`);
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

const STORY_GENERATION_PROMPT = `{character_identity_block}

你是一个专业的儿童童话故事作家兼分镜编剧。请根据用户提供的标题，为{character_desc}创作一个温馨、有教育意义的原创童话故事，并且直接输出新的 storyboard JSON。不要输出旧的 content/scenes 简版结构，也不要输出任何解释文字。

请先再次确认上面【主角身份硬约束】中的每一项要求, 然后严格按其创作故事。任何与之冲突的写法(主角性别/年龄/物种/名字被替换)都将被视为无效输出, 系统会要求重写。

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
8. scenes 数量由 LLM 根据故事内容的广度和深度自行决定（参考第 3 条和第 17 条）。每幕 storyText 控制在 50-90 字（中文），写完整的、适合 3-8 岁儿童朗读的分镜句子，包含环境、角色动作和情绪展开，禁止一句话敷衍。每个场景都必须支持并尽量填写：id、index、title、titleEn、charactersInScene、storyText、storyTextEn、imageDescription、imageDescriptionEn、imagePrompt、charactersLayout、dialogue、narration、voiceover、voiceoverEn、subtitle、shot、durationSec、musicMood、sfx、image。
9. dialogue 是数组，每项包含：speakerId、text、textEn、displayOnImage、tts、emotion。
10. narration 对象包含：text、textEn、displayOnImage、tts、voiceId、voiceIdEn。
11. subtitle 必须直接输出双语字幕字符串，JSON 字符串内两行必须使用 \\n 转义，例如 "中文一句\\nEnglish sentence"。若暂时没有英文，请第二行留空字符串，但字段仍然保留。
12. storyText 和 voiceover 要写成适合配音和分镜的完整句子，不要只写摘要；imageDescription 要写成可直接绘制插画的具体画面（包含人物站位、表情、动作、背景细节）；imagePrompt 要是适合生成插画的英文提示词。
12.1 【关键一致性约束 - 2026-06-18 修复 audio/绘本文字不一致 bug】storyText (用户看绘本上的文字) 和 voiceover (audiobook 朗读文字) 内容必须高度一致. voiceover 可以加入语气词 (例如 "啊"、"呀"、"呢") 或少量过渡衔接让朗读更自然, 但核心事件、人物对话、关键道具、情感基调必须完全相同. 用户看到的文字 = 听到的 audio, 体验才对得上. 严禁 voiceover 写"另一个版本"的故事.
13. 每个场景都必须是不同的关键时刻，不能只是重复同一地点或动作的改写；每幕都要有明显不同的视觉焦点。
14. image 字段保留为空对象 {} 即可，不需要生成 URL。
15. 所有英文辅助字段 titleEn、summaryEn、themeEn、featureDescEn、storyTextEn、imageDescriptionEn、voiceoverEn、dialogue.textEn、narration.textEn、voiceIdEn、nameEn 如果暂时不确定，可以填空字符串，但结构必须存在。
16. 【经典故事改写规则】如果用户标题对应一个中国或世界经典童话/民间故事（如武松打虎、小红帽、丑小鸭、三只小猪、哪吒闹海、嫦娥奔月、匹诺曹、灰姑娘、卖火柴的小女孩、白雪公主等），你必须：
   - 先在脑内识别它属于哪一类经典（四大名著、格林童话、安徒生童话、中国民间故事、伊索寓言等），并列出该经典的所有标志性场景（不可省略任何关键转折，例如武松打虎必须包含：三碗不过冈酒店→上景阳冈→遇虎→搏斗→打死老虎→猎户庆功）。
   - 对每一个标志性场景，独立成一个 scene；如果某个标志场景可以拆成"遇到→反应→动作→结果"等子节拍，可以再拆成多个 scene，让情节有节奏感，避免一句带过。
   - 用 3-8 岁儿童能懂的语言重新叙述：保留经典结构、关键道具、关键转折，但把血腥、暴力、复仇等元素改成"勇气、智慧、友情、爱心"等正向表达，必要时加入动物朋友/小帮手/家长关怀等儿童化改编。
   - 主题强化为正向教育意义：勇气、诚实、善良、机智、友谊、家人之爱等。
17. 【场景数下限】无论经典还是原创标题，scenes 数量必须 ≥ 6。中国/世界经典故事 scenes 必须 ≥ 8（因为经典情节通常更多）。如果故事自然可以展开到 9-10 个场景，不要为了凑数而重复同地点同动作，但也不要为了省事只写 5 个。

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
 *
 * The protagonist's identity (`characterIdentity`) is a HARD contract: the
 * story LLM is forbidden from swapping gender / age / species / name away
 * from what we pass in. The contract is embedded directly into the prompt
 * (`buildCharacterIdentityBlock`) and verified post-generation by
 * `checkGenderPronounConsistency`; mismatches trigger a retry before we
 * give up and return the last attempt.
 */
export async function generateStory(
  title: string,
  characterIdentity: CharacterIdentity
): Promise<GeneratedStory> {
  const maxAttempts = 3;
  const characterDesc = characterIdentity.featureDesc || 'the main character';
  const identityBlock = buildCharacterIdentityBlock(characterIdentity);

  const restrictedKeywords = await getRestrictedKeywords();
  const restrictionHint = restrictedKeywords.length > 0
    ? `\n\n重要限制：请绝对避免在场景描述（imageDescription / imagePrompt）中使用以下词汇或类似表达，因为它们会导致插画生成被安全审核拦截：${restrictedKeywords.join('、')}。请用其他安全的描述替代，例如用"躺着不动"代替"死亡"，用"红色痕迹"代替"血"，用"闪亮的工具"代替"武器"等。`
    : '';
  const prompt = STORY_GENERATION_PROMPT
    .replace('{character_identity_block}', identityBlock)
    .replace('{character_desc}', characterDesc)
    .replace('{restriction_hint}', restrictionHint);

  let lastStory: GeneratedStory | null = null;
  let lastPronounMismatch: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // Use the unified LLM service (dynamic import to avoid circular dependency)
      const { getLLMProvider } = await import('./llm.service.js');
      const llm = getLLMProvider();

      const result = await llm.chatCompletion({
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的儿童童话故事作家兼分镜编剧。' +
              '你必须返回且仅返回一个可被 JSON.parse 解析的 storyboard JSON。' +
              '禁止输出 Markdown 解释、禁止输出旧的 content/scenes 简版结构。' +
              '每个 scenes 项都要包含 storyText、imageDescription、voiceover、subtitle，并尽量补齐中英文字段。' +
              'scenes 总数 ≥ 6（经典故事 ≥ 8），每幕 storyText 50-90 字中文，展开充分、有动作/情绪/环境细节。' +
              '【再次强调】主角的性别/年龄/主体类型/名字必须严格遵循用户提供的【主角身份硬约束】, 任何与之冲突的输出将被视为无效并要求重写.' +
              '【再次强调 - 2026-06-18 audio 一致性约束】每幕的 storyText 和 voiceover 内容必须高度一致. voiceover 可以加入语气词或朗读衔接, 但核心剧情、对话、道具、情感必须相同. 用户看到的绘本文字 = 听到的 audiobook, 不能对不上.',
          },
          { role: 'user', content: `标题：${title}\n\n${prompt}` },
        ],
        temperature: 1.0,
        max_tokens: 10000,
      });

      const storyData = tryParseStoryPayload(result.content);

      if (storyData && isStoryComplete(storyData)) {
        // Post-generation pronoun consistency check — scan the raw content
        // (and the scene storyText fields as a safety net).
        const pronounScanText = [
          storyData.content || '',
          ...((storyData.storyboard?.scenes || [])
            .map((scene: any) => scene?.storyText || scene?.storyTextEn || '')
            .filter(Boolean)),
        ].join('\n');
        const pronounCheck = checkGenderPronounConsistency(pronounScanText, characterIdentity);
        if (!pronounCheck.ok) {
          lastPronounMismatch = `gender pronoun mismatch (${pronounCheck.mismatch})`;
          console.warn(
            `[generateStory] Attempt ${attempt} failed: ${lastPronounMismatch} for "${title}"`
          );
          if (attempt < maxAttempts) continue;
          // Fall through to the post-loop return of lastStory, log mismatch once.
          lastStory = assembleStory(storyData, title, characterDesc);
          break;
        }

        return assembleStory(storyData, title, characterDesc);
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

  if (lastStory) {
    console.warn(
      `[generateStory] Returning last attempt for "${title}" despite ${lastPronounMismatch || 'pronoun check incomplete'}`
    );
    return lastStory;
  }
  throw new Error('Story generation failed after retries');
}

/**
 * Helper: normalise a `tryParseStoryPayload` result into a GeneratedStory.
 * Pulled out so the post-generation pronoun-mismatch path can build the
 * "fallback to last attempt" story the same way the happy path does.
 */
function assembleStory(
  storyData: any,
  title: string,
  characterDesc: string
): GeneratedStory {
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
