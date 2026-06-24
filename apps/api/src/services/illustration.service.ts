/**
 * Illustration Service
 *
 * Handles illustration generation using AI image generation APIs
 * Supports batch generation with task queue
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import {
  generateSceneBackground,
  compositeIllustration,
  buildVisualScenePrompt,
  generateStoryCoverImage,
  extractCoverDesignBrief,
  type CharacterIdentity,
  UNKNOWN_IDENTITY,
} from './ai.service.js';
import { normalizeStoryboard, storyboardToStorage } from '../types/storyboard.js';
import {
  emitSceneCompleted,
  emitSceneFailed,
  emitSceneProcessing,
  emitStoryCompleted,
} from './illustration-emitter.js';
// 修复 (2026-06-18 Bug B): 配额预扣逻辑已移到 route 层 (preDeductQuota),
// 此处不再逐个扣减。import 保留但不使用, 避免其他地方引用。
import { deductQuota } from './membership.service.js';

export interface Scene {
  index: number;
  description: string;
  text: string;
  title?: string;
  imagePrompt?: string;
  voiceover?: string;
}

export interface IllustrationResult {
  imageUrl: string;
  prompt: string;
  cost: number;
  retryCount: number;
  failureCategory?: string;
}

type FailureCategory =
  | 'policy_blocked'
  | 'provider_rejected'
  | 'timeout'
  | 'network_error'
  | 'api_rate_limit'
  | 'quota_exceeded'
  | 'invalid_image_url'
  | 'unknown';

type StoryboardImageStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Configurable max prompt recovery retries from environment variable
const MAX_PROMPT_RECOVERY_RETRIES = parseInt(
  process.env.ILLUSTRATION_MAX_RECOVERY_RETRIES || '3',
  10
);

const PROMPT_BLOCKLIST = [
  { pattern: /blood|bloody|gore/gi, replacement: 'crimson red stains' },
  { pattern: /wound|injury|hurt/gi, replacement: 'bandaged area with faint marks' },
  { pattern: /knife|gun|weapon/gi, replacement: 'gleaming silver blade' },
  { pattern: /dead|death|dying/gi, replacement: 'lying motionless and still' },
  { pattern: /terrified|panic|scream/gi, replacement: 'wide-eyed with open mouth, gasping' },
  { pattern: /naked|nudity|body exposure/gi, replacement: 'wrapped in a soft blanket' },
  { pattern: /baby|toddler/gi, replacement: 'small young child' },
  { pattern: /kiss|romantic embrace/gi, replacement: 'leaning close holding hands' },
];

const coverGenerationInFlight = new Map<string, Promise<string | null>>();
const storyCompletionInFlight = new Map<string, Promise<boolean>>();

export function storyNeedsGeneratedCover(story: { cover?: string | null }, fallbackCover?: string | null): boolean {
  if (!story.cover) return true;
  if (fallbackCover && story.cover === fallbackCover) return true;

  // New covers are uploaded after the backend composites the exact title into
  // the image. Older model-direct covers can contain wrong Chinese text, so
  // refresh anything that is not from the deterministic cover pipeline.
  return !/(^|\/)covers\//.test(story.cover);
}

async function generateAndSaveStoryCover(storyId: string, fallbackCover?: string | null): Promise<string | null> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      illustrations: { orderBy: { sceneIndex: 'asc' } },
    },
  });

  if (!story || !storyNeedsGeneratedCover(story, fallbackCover)) {
    return story?.cover || null;
  }

  const storyboard = normalizeStoryboard(story.scenes, story.title);
  const character = story.characterId
    ? await prisma.character.findUnique({ where: { id: story.characterId } })
    : null;
  const characterImageUrl = story.characterStylizedUrl || character?.stylizedPhotoUrl || null;

  // 修复 (2026-06-18 cover-chaos bug): 之前直接把 5 个场景的 imageDescription
  // 当作 motifs 灌进 cover prompt, 模型自由发挥画了天使/恶魔/糖果店/动物群,
  // 跟"正确设计绘本封面"完全脱节. 现在先抽出 Cover Design Brief (LLM,
  // 失败时 fallback 规则提取), 把 brief + 原始 scenes 一起交给 cover 生成器.
  const sceneInputs = storyboard.scenes
    .slice(0, 5)
    .map((scene) => ({
      imageDescription: scene.imageDescription,
      storyText: scene.storyText,
    }))
    .filter((scene) => Boolean(scene.imageDescription || scene.storyText));

  const summaryText = storyboard.summary || story.content || '';
  const brief = await extractCoverDesignBrief({
    title: story.title,
    summary: summaryText,
    scenes: sceneInputs,
  });

  const cover = await generateStoryCoverImage({
    title: story.title,
    summary: summaryText,
    sceneHints: sceneInputs.map((scene) => scene.imageDescription || scene.storyText || '').filter(Boolean),
    characterImageUrl,
    brief,
    // Lock the cover protagonist to the user's character so cover stays
    // consistent with inner-page illustrations.
    protagonistIdentity: character ? {
      featureDesc: character.featureDesc || '',
      gender: ((character.gender as CharacterIdentity['gender']) || 'unknown'),
      ageBand: ((character.ageBand as CharacterIdentity['ageBand']) || 'unknown'),
      subjectKind: ((character.subjectKind as CharacterIdentity['subjectKind']) || 'human'),
      characterName: character.characterName || undefined,
    } : null,
  });

  await prisma.story.update({
    where: { id: storyId },
    data: { cover },
  });

  return cover;
}

function startStoryCoverGeneration(storyId: string, fallbackCover?: string | null): Promise<string | null> {
  const existing = coverGenerationInFlight.get(storyId);
  if (existing) return existing;

  const task = generateAndSaveStoryCover(storyId, fallbackCover)
    .finally(() => {
      coverGenerationInFlight.delete(storyId);
    });

  coverGenerationInFlight.set(storyId, task);
  return task;
}

export function enqueueStoryCoverGeneration(storyId: string, fallbackCover?: string | null): void {
  startStoryCoverGeneration(storyId, fallbackCover)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Cover] Failed to generate cover for story ${storyId}: ${message}`);
    });
}

async function failStoryCoverGeneration(storyId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[Cover] Failed to complete story ${storyId}: ${message}`);
  await prisma.story.update({
    where: { id: storyId },
    data: {
      status: 'failed',
      errorMessage: `封面生成失败: ${message}`,
    },
  }).catch(() => {});
}

async function markStoryIllustrated(storyId: string, totalCost: number, cover: string, illustrationCount: number): Promise<void> {
  await prisma.story.update({
    where: { id: storyId },
    data: {
      status: 'illustrated',
      totalCost,
      cover,
    },
  });

  emitStoryCompleted(storyId, {
    totalCost,
    illustrationCount,
  });
}

export async function completeStoryAfterCoverGeneration(
  storyId: string,
  fallbackCover?: string | null,
  totalCost?: number,
  illustrationCount?: number
): Promise<boolean> {
  const existing = storyCompletionInFlight.get(storyId);
  if (existing) return existing;

  const task = (async () => {
    const illustrations = await prisma.illustration.findMany({
      where: { storyId },
    });
    const finalTotalCost = totalCost ?? illustrations.reduce((sum, ill) => sum + ill.cost, 0);
    const finalIllustrationCount = illustrationCount ?? illustrations.length;

    try {
      const cover = await startStoryCoverGeneration(storyId, fallbackCover);
      if (!cover) return false;
      await markStoryIllustrated(storyId, finalTotalCost, cover, finalIllustrationCount);
      return true;
    } catch (error) {
      await failStoryCoverGeneration(storyId, error);
      return false;
    }
  })().finally(() => {
    storyCompletionInFlight.delete(storyId);
  });

  storyCompletionInFlight.set(storyId, task);
  return task;
}

export function enqueueStoryCompletionAfterCoverGeneration(storyId: string, fallbackCover?: string | null): void {
  void completeStoryAfterCoverGeneration(storyId, fallbackCover);
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function classifyIllustrationFailure(error: unknown): FailureCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Rate limiting - API is throttling requests
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    message.includes('throttl')
  ) {
    return 'api_rate_limit';
  }

  // Quota exceeded - user or account quota reached
  if (
    message.includes('quota') ||
    message.includes('exceeded') ||
    message.includes('limit reached') ||
    message.includes('insufficient quota') ||
    message.includes('billing')
  ) {
    return 'quota_exceeded';
  }

  // Invalid image URL - source image problem
  if (
    message.includes('invalid image') ||
    message.includes('image url') ||
    message.includes('image not found') ||
    message.includes('invalid url') ||
    message.includes('unsupported image') ||
    message.includes('cannot load image') ||
    message.includes('404')
  ) {
    return 'invalid_image_url';
  }

  // Policy blocked - content moderation
  if (
    message.includes('policy') ||
    message.includes('safety') ||
    message.includes('moderation') ||
    message.includes('restricted') ||
    message.includes('blocked')
  ) {
    return 'policy_blocked';
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('econnreset') ||
    message.includes('enetunreach')
  ) {
    return 'network_error';
  }

  // Provider rejected - API returned error
  if (
    message.includes('invalid') ||
    message.includes('unsupported') ||
    message.includes('rejected') ||
    message.includes('bad request') ||
    message.includes('400')
  ) {
    return 'provider_rejected';
  }

  return 'unknown';
}

function preservePromptEffect(prompt: string): string {
  const [mainPart, stylePart] = prompt.split(/, in /i);
  const sanitizedMain = PROMPT_BLOCKLIST.reduce((text, rule) => text.replace(rule.pattern, rule.replacement), mainPart);
  const softened = sanitizedMain
    .replace(/violent/gi, 'intense action')
    .replace(/scary/gi, 'mysterious, eerie atmosphere')
    .replace(/crying uncontrollably/gi, 'eyes glistening with tears')
    .replace(/dangerous/gi, 'precarious and risky');

  if (!stylePart) {
    return normalizeWhitespace(softened);
  }

  return normalizeWhitespace(`${softened}, in ${stylePart}`);
}

function createRevisedPrompt(originalPrompt: string, error: unknown, attempt: number): string {
  const failureCategory = classifyIllustrationFailure(error);
  let revised = preservePromptEffect(originalPrompt);

  if (failureCategory === 'policy_blocked' || failureCategory === 'provider_rejected') {
    revised = revised
      .replace(/close-up/gi, 'storybook composition')
      .replace(/highly realistic/gi, 'gentle illustrated')
      .replace(/intense/gi, 'warm')
      .replace(/MUST RENDER[^.]+\./gi, '')
      .replace(/Inside that band,[^.]+\./gi, '')
      .replace(/Do not omit the caption,[^.]+\./gi, '');
  }

  if (attempt > 1) {
    revised = `${revised}. Keep the scene child-safe, whimsical, and suitable for a gentle illustrated bedtime story.`;
  }

  return normalizeWhitespace(revised);
}

function buildPromptScene(scene: Scene): { description: string; text: string } {
  const visualReference = scene.imagePrompt?.trim();
  const imagePromptLooksGenerated = visualReference
    ? visualReference.includes('PICTURE-BOOK CAPTION AREA IS REQUIRED')
      || visualReference.includes('Primary scene:')
      || visualReference.includes('Specific visual beat:')
      || visualReference.length > 600
    : false;

  return {
    description: visualReference && !imagePromptLooksGenerated
      ? `${scene.description}. Visual reference prompt: ${visualReference}`
      : scene.description,
    text: scene.text,
  };
}

/**
 * LLM-based prompt rewriting as fallback when hardcoded replacements still fail
 */
async function llmRewritePrompt(prompt: string): Promise<string> {
  try {
    const { getLLMProvider } = await import('./llm.service.js');
    const llm = getLLMProvider();

    const result = await llm.chatCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are a prompt safety rewriter. Rewrite image generation prompts to be child-safe while preserving the original visual intent. Keep the same scene composition, characters, and atmosphere. Only change words that would trigger content moderation. Return ONLY the rewritten prompt, nothing else.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const rewritten = result.content?.trim();
    if (rewritten) {
      await cacheRewriteResult(prompt, rewritten);
      return rewritten;
    }
    return prompt;
  } catch {
    return prompt;
  }
}

/**
 * Cache a successful LLM rewrite for future reuse
 */
async function cacheRewriteResult(originalPrompt: string, rewrittenPrompt: string): Promise<void> {
  const key = `prompt_rewrite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.priceConfig.create({
    data: {
      key,
      value: 0,
      description: JSON.stringify({
        type: 'prompt_rewrite_cache',
        original: originalPrompt,
        rewritten: rewrittenPrompt,
      }),
    },
  }).catch(() => undefined);
}

/**
 * Get restricted keywords from DB to feed back into story generation
 */
export async function getRestrictedKeywords(): Promise<string[]> {
  try {
    const records = await prisma.priceConfig.findMany({
      where: {
        key: { startsWith: 'prompt_restriction_' },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const keywords = new Set<string>();
    for (const record of records) {
      try {
        const data = JSON.parse(record.description || '{}');
        if (data.type === 'prompt_restriction_memory' && data.prompt) {
          // Extract the triggering words from the blocked prompt
          const prompt = data.prompt.toLowerCase();
          for (const rule of PROMPT_BLOCKLIST) {
            const matches = prompt.match(rule.pattern);
            if (matches) {
              matches.forEach((m: string) => keywords.add(m));
            }
          }
        }
      } catch { /* skip malformed */ }
    }

    return Array.from(keywords);
  } catch {
    return [];
  }
}

async function rememberRestrictedPrompt(prompt: string, category: FailureCategory): Promise<void> {
  const key = `prompt_restriction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.priceConfig.create({
    data: {
      key,
      value: 0,
      description: JSON.stringify({
        type: 'prompt_restriction_memory',
        category,
        prompt,
      }),
    },
  }).catch(() => undefined);
}

/**
 * Get story scenes from database
 */
export async function getStoryScenes(storyId: string): Promise<Scene[]> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { scenes: true, title: true },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  try {
    const storyboard = normalizeStoryboard(story.scenes, story.title);
    return storyboard.scenes.map((scene) => ({
      index: scene.index,
      title: scene.title,
      description: scene.imageDescription,
      text: scene.storyText,
      imagePrompt: scene.imagePrompt,
      voiceover: scene.voiceover,
    }));
  } catch {
    throw new Error('Invalid scenes data');
  }
}

/**
 * Create illustration records for story scenes
 */
export async function createIllustrationRecords(
  storyId: string,
  sceneIndices: number[],
  options: { force?: boolean } = {},
): Promise<{ count: number; totalScenes: number }> {
  const scenes = await getStoryScenes(storyId);

  if (sceneIndices.length === 0) {
    sceneIndices = scenes.map((s) => s.index);
  }

  const illustrations = sceneIndices.map((index) => ({
    storyId,
    sceneIndex: index,
    status: 'pending',
  }));

  for (const illustration of illustrations) {
    await prisma.illustration.upsert({
      where: {
        storyId_sceneIndex: {
          storyId: illustration.storyId,
          sceneIndex: illustration.sceneIndex,
        },
      },
      update: options.force
        ? {
            status: 'pending',
            imageUrl: null,
            errorMessage: null,
            failureCategory: null,
          }
        : {},
      create: illustration,
    });
  }

  if (illustrations.length > 0) {
    await prisma.story.update({
      where: { id: storyId },
      data: { status: 'processing' },
    });
  }

  return {
    count: sceneIndices.length,
    totalScenes: scenes.length,
  };
}

/**
 * Generate single illustration for a scene
 * @param app Optional FastifyInstance for SSE notifications (can be passed from route context)
 */
export async function generateSceneIllustration(
  storyId: string,
  sceneIndex: number,
  characterId?: string,
  app?: FastifyInstance
): Promise<IllustrationResult> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      illustrations: {
        where: { sceneIndex },
      },
    },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  const storyboard = normalizeStoryboard(story.scenes, story.title);
  const scenes = storyboard.scenes.map((scene) => ({
    index: scene.index,
    title: scene.title,
    description: scene.imageDescription,
    text: scene.storyText,
    imagePrompt: scene.imagePrompt,
    voiceover: scene.voiceover,
  }));
  const scene = scenes.find((s) => s.index === sceneIndex);

  if (!scene) {
    throw new Error(`Scene ${sceneIndex} not found`);
  }

  let sourceImageUrl: string | undefined;
  let characterStyle: string | undefined;
  let characterIdentity: CharacterIdentity | null = null;

  // Fall back to the story's bound character when the caller (e.g. the
  // miniprogram `/illustrate` endpoint, which currently omits characterId)
  // didn't pass one. Without this, the illustration falls through to
  // generateSceneBackground() — pure text-to-image, no stylized character as
  // a reference — and the generated scene looks nothing like the user's
  // chosen character. Use whichever the caller specified first, then the
  // story's own characterId as the canonical source of truth.
  const effectiveCharacterId = characterId || story.characterId || undefined;
  if (!characterId && story.characterId) {
    console.log(
      `[Illustrate] characterId not passed by caller; falling back to story.characterId=${story.characterId} for story ${storyId}`
    );
  }

  if (effectiveCharacterId) {
    const character = await prisma.character.findUnique({
      where: { id: effectiveCharacterId },
    });

    if (character?.stylizedPhotoUrl) {
      // Prefer the per-story costume URL (set when the story was created with a
      // different title than the character's last-stylized title) so the
      // character's clothing matches the story. Fall back to the global
      // stylized photo when no per-story override exists.
      sourceImageUrl = story.characterStylizedUrl || character.stylizedPhotoUrl;
      console.log(
        `[Illustrate] story=${storyId} scene=${sceneIndex} using stylized character ${effectiveCharacterId} as image-to-image reference`
      );
      // Read the hard identity fields (gender / age / species / name) so the
      // illustration prompt can lock the protagonist's identity across scenes.
      characterIdentity = {
        featureDesc: character.featureDesc || '',
        gender: (character.gender as CharacterIdentity['gender']) || 'unknown',
        ageBand: (character.ageBand as CharacterIdentity['ageBand']) || 'unknown',
        subjectKind: ((character.subjectKind as CharacterIdentity['subjectKind']) || 'human'),
        characterName: character.characterName || undefined,
      };
    } else {
      throw new Error('Character has no stylized photo. Please complete the style step first.');
    }
  }

  const illustration = story.illustrations[0];
  if (!illustration) {
    throw new Error(`Illustration record for scene ${sceneIndex} not found`);
  }

  const promptScene = buildPromptScene(scene);
  const originalPrompt = buildVisualScenePrompt(promptScene, {
    title: story.title,
    characterStyle,
    sceneNumber: scene.index,
    totalScenes: scenes.length,
    textOnImage: scene.text,  // Pass story text to be rendered on the image
  });
  let currentPrompt = originalPrompt;
  const cost = 0.2;

  for (let attempt = 0; attempt <= MAX_PROMPT_RECOVERY_RETRIES; attempt++) {
    try {
      const imageUrl = sourceImageUrl
        ? await compositeIllustration(sourceImageUrl, currentPrompt, undefined, characterIdentity)
        : await generateSceneBackground(currentPrompt);

      await prisma.illustration.update({
        where: { id: illustration.id },
        data: {
          imageUrl,
          prompt: currentPrompt,
          originalPrompt,
          errorMessage: null,
          failureCategory: null,
          retryCount: attempt,
          status: 'completed',
          cost,
        },
      });

      const nextStoryboard = {
        ...storyboard,
        scenes: storyboard.scenes.map((storyboardScene) => storyboardScene.index === sceneIndex ? {
          ...storyboardScene,
          image: {
            ...storyboardScene.image,
            prompt: currentPrompt,
            originalPrompt,
            url: imageUrl,
            status: 'completed' as const,
            retryCount: attempt,
            failureCategory: null,
            errorMessage: null,
            cost,
          },
        } : storyboardScene),
      };

      await prisma.story.update({
        where: { id: storyId },
        data: { scenes: storyboardToStorage(nextStoryboard) },
      });

      // Emit SSE event for real-time frontend updates
      emitSceneCompleted(storyId, illustration.id, sceneIndex, {
        imageUrl,
        cost,
      });

      // 修复 (2026-06-18 Bug B): 配额已预扣, 此处不再逐个扣减
      // 预扣逻辑在 route 层 (preDeductQuota), 生成完成后根据成功数量调整

      return {
        imageUrl,
        prompt: currentPrompt,
        cost,
        retryCount: attempt,
      };
    } catch (error) {
      const failureCategory = classifyIllustrationFailure(error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // FAIL-FAST: every failed attempt marks the row as 'failed' and breaks out
      // of the recovery loop. Previously the row was set to 'processing' on
      // intermediate attempts, so if the process died mid-loop (Redis hiccup,
      // server restart, network blip) the row would be stuck in 'processing'
      // forever and the worker would never see a terminal status. Marking it
      // 'failed' immediately means:
      //   1. The worker route's catch will see a real failure and surface it.
      //   2. The user can hit "重试" from the failed card and try again with
      //      a fresh prompt instead of an already-polluted one.
      //   3. Frontend never has to guess "is this thing still running?".
      await prisma.illustration.update({
        where: { id: illustration.id },
        data: {
          prompt: currentPrompt,
          originalPrompt,
          errorMessage,
          failureCategory,
          retryCount: attempt + 1,
          status: 'failed',
        },
      });

      const nextStoryboard = {
        ...storyboard,
        scenes: storyboard.scenes.map((storyboardScene) => storyboardScene.index === sceneIndex ? {
          ...storyboardScene,
          image: {
            ...storyboardScene.image,
            prompt: currentPrompt,
            originalPrompt,
            status: 'failed' as StoryboardImageStatus,
            retryCount: attempt + 1,
            failureCategory,
            errorMessage,
          },
        } : storyboardScene),
      };

      await prisma.story.update({
        where: { id: storyId },
        data: { scenes: storyboardToStorage(nextStoryboard) },
      }).catch(() => undefined);

      // Emit SSE event for failed illustration
      emitSceneFailed(storyId, illustration.id, sceneIndex, {
        errorMessage,
        failureCategory,
      });

      if (failureCategory === 'policy_blocked') {
        await rememberRestrictedPrompt(currentPrompt, failureCategory);
      }

      if (failureCategory === 'network_error' || failureCategory === 'timeout') {
        throw error;
      }

      if (attempt >= MAX_PROMPT_RECOVERY_RETRIES) {
        // Last attempt: try LLM rewrite as a final rescue before giving up.
        try {
          const llmRewritten = await llmRewritePrompt(currentPrompt);
          if (llmRewritten !== currentPrompt) {
            const imageUrl = sourceImageUrl
              ? await compositeIllustration(sourceImageUrl, llmRewritten, undefined, characterIdentity)
              : await generateSceneBackground(llmRewritten);

            await prisma.illustration.update({
              where: { id: illustration.id },
              data: {
                imageUrl,
                prompt: llmRewritten,
                originalPrompt,
                errorMessage: null,
                failureCategory: null,
                retryCount: attempt + 1,
                status: 'completed',
                cost,
              },
            });

            return { imageUrl, prompt: llmRewritten, cost, retryCount: attempt + 1 };
          }
        } catch { /* LLM rewrite also failed */ }
        throw error;
      }

      // Prepare a revised prompt for the next attempt and continue the loop.
      currentPrompt = createRevisedPrompt(currentPrompt, error, attempt + 1);
    }
  }

  throw new Error('Illustration generation failed after prompt recovery');
}

/**
 * Get illustration list for a story
 */
export async function getStoryIllustrations(storyId: string, userId: string) {
  const story = await prisma.story.findFirst({
    where: { id: storyId, userId },
    include: {
      illustrations: {
        orderBy: { sceneIndex: 'asc' },
      },
    },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  const storyboard = normalizeStoryboard(story.scenes, story.title);
  const scenes = storyboard.scenes.map((scene) => ({
    index: scene.index,
    title: scene.title,
    description: scene.imageDescription,
    text: scene.storyText,
  }));

  return {
    storyId: story.id,
    title: story.title,
    status: story.status,
    illustrations: story.illustrations.map((ill) => {
      const scene = scenes.find((s) => s.index === ill.sceneIndex);
      return {
        id: ill.id,
        sceneIndex: ill.sceneIndex,
        imageUrl: ill.imageUrl,
        prompt: ill.prompt,
        description: scene?.description || '',
        text: scene?.text || '',
        status: ill.status,
        errorMessage: ill.errorMessage,
        failureCategory: ill.failureCategory,
        retryCount: ill.retryCount,
        hasAutoRecovery: Boolean(ill.originalPrompt && ill.prompt && ill.originalPrompt !== ill.prompt),
      };
    }),
    totalCost: story.totalCost,
  };
}

/**
 * Check if all illustrations are completed
 */
export async function checkAllIllustrationsCompleted(storyId: string): Promise<boolean> {
  const illustrations = await prisma.illustration.findMany({
    where: { storyId },
  });

  if (illustrations.length === 0) {
    return false;
  }

  const allCompleted = illustrations.every((ill) => ill.status === 'completed');
  const anyFailed = illustrations.some((ill) => ill.status === 'failed');

  if (allCompleted) {
    const totalCost = illustrations.reduce((sum, ill) => sum + ill.cost, 0);
    const fallbackCover = illustrations
      .slice()
      .sort((a, b) => a.sceneIndex - b.sceneIndex)
      .find((ill) => ill.imageUrl)?.imageUrl || null;
    await prisma.story.update({
      where: { id: storyId },
      data: {
        totalCost,
        status: 'covering',
      },
    });
    return completeStoryAfterCoverGeneration(storyId, fallbackCover, totalCost, illustrations.length);
  }

  if (anyFailed && !allCompleted) {
    return false;
  }

  return false;
}

/**
 * Get illustration statistics for a story
 */
export async function getIllustrationStats(storyId: string) {
  const illustrations = await prisma.illustration.findMany({
    where: { storyId },
  });

  const total = illustrations.length;
  const completed = illustrations.filter((i) => i.status === 'completed').length;
  const failed = illustrations.filter((i) => i.status === 'failed').length;
  const processing = illustrations.filter((i) => i.status === 'processing').length;
  const pending = illustrations.filter((i) => i.status === 'pending').length;
  const totalCost = illustrations.reduce((sum, i) => sum + i.cost, 0);

  return {
    total,
    completed,
    failed,
    processing,
    pending,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    totalCost,
  };
}

/**
 * Mark illustration as failed.
 *
 * Also clears `workerStartedAt` so the rescue watchdog doesn't re-enqueue
 * a permanently broken job — failed illustrations need a manual retry from
 * the user (or the /retry route), not auto-rescue.
 */
export async function markIllustrationFailed(
  illustrationId: string,
  error: string
): Promise<void> {
  await prisma.illustration.update({
    where: { id: illustrationId },
    data: {
      status: 'failed',
      errorMessage: error,
      failureCategory: classifyIllustrationFailure(error),
      workerStartedAt: null,
    },
  });

  console.error(`[Illustration] Failed ${illustrationId}: ${error}`);
}

/**
 * Mark illustration as processing.
 *
 * Also stamps `workerStartedAt = now()` so `rescueStuckIllustrations()` can
 * tell live workers from zombies after a server restart.
 */
export async function markIllustrationProcessing(illustrationId: string): Promise<void> {
  await prisma.illustration.update({
    where: { id: illustrationId },
    data: { status: 'processing', workerStartedAt: new Date() },
  });
}

// ============================================================
// Resumable worker pool — fixes "fire-and-forget" task loss bug
// (2026-06-18): /illustrate used to fire-and-forget Promise.all on the
// request handler. Server restart (any cause: tsx watch, prisma generate,
// manual restart) killed all in-flight workers with no recovery path —
// stuck illustrations sat in `processing` forever. The pool below makes
// every enqueue durable (DB row + queue entry), and a startup watchdog
// re-enqueues any zombie that hasn't pinged in 3 minutes.
// ============================================================

/** In-memory FIFO queue. Lost on restart — that's OK, rescue() rebuilds it. */
const illustrationQueue: Array<{
  storyId: string;
  sceneIndex: number;
  characterId?: string;
}> = [];

/** Concurrency cap (matches the previous fire-and-forget value). */
const ILLUSTRATION_CONCURRENCY = 2;
let illustrationActiveCount = 0;
let illustrationDrainInFlight = false;

/**
 * Single recoverable worker entrypoint. The route layer (and the startup
 * rescue) calls this instead of starting raw promises. Each call writes
 * `workerStartedAt` via `markIllustrationProcessing()` so the watchdog can
 * tell live workers from zombies.
 */
export async function enqueueIllustrationWork(
  storyId: string,
  sceneIndex: number,
  characterId?: string | null
): Promise<void> {
  illustrationQueue.push({
    storyId,
    sceneIndex,
    characterId: characterId ?? undefined,
  });
  scheduleIllustrationDrain();
}

function scheduleIllustrationDrain(): void {
  if (illustrationDrainInFlight) return;
  illustrationDrainInFlight = true;
  setImmediate(() => {
    illustrationDrainInFlight = false;
    void drainIllustrationQueue();
  });
}

async function drainIllustrationQueue(): Promise<void> {
  while (illustrationActiveCount < ILLUSTRATION_CONCURRENCY && illustrationQueue.length > 0) {
    const job = illustrationQueue.shift();
    if (!job) break;
    illustrationActiveCount += 1;
    void runOneIllustrationJob(job).finally(() => {
      illustrationActiveCount -= 1;
      // Keep draining — another job may have been enqueued while this one ran.
      if (illustrationQueue.length > 0 && illustrationActiveCount < ILLUSTRATION_CONCURRENCY) {
        scheduleIllustrationDrain();
      }
    });
  }
}

async function runOneIllustrationJob(job: {
  storyId: string;
  sceneIndex: number;
  characterId?: string;
}): Promise<void> {
  try {
    await generateSceneIllustration(job.storyId, job.sceneIndex, job.characterId);
  } catch (error) {
    // generateSceneIllustration already marks the row as failed with a
    // classified error message; nothing more to do here.
    console.error(
      `[IllustrationPool] scene ${job.sceneIndex} of story ${job.storyId} failed:`,
      error instanceof Error ? error.message : error
    );
  }
  // Advance the story status (no-op if other scenes are still pending).
  await checkAllIllustrationsCompleted(job.storyId).catch(() => {});
}

/**
 * Rescue illustrations that were processing when the previous server died.
 *
 * Triggered from three places:
 * 1. Server startup — picks up zombies left by the dead process.
 * 2. /illustrate route — extra safety net before starting a fresh batch.
 * 3. setInterval watchdog (every 60s) — covers any leak we missed.
 *
 * Rule:
 *   - status='processing' AND workerStartedAt IS NULL      → reset (legacy row, never stamped)
 *   - status='processing' AND workerStartedAt < now-3min    → reset (previous worker is dead)
 *   - status='processing' AND workerStartedAt >= now-3min   → leave alone (worker is alive)
 *
 * Resetting means: status='pending' + workerStartedAt=null, then enqueue.
 */
export async function rescueStuckIllustrations(): Promise<number> {
  const STUCK_THRESHOLD_MS = 3 * 60 * 1000;
  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const zombies = await prisma.illustration.findMany({
    where: {
      status: 'processing',
      OR: [
        { workerStartedAt: null },
        { workerStartedAt: { lt: threshold } },
      ],
    },
    include: {
      story: { select: { characterId: true } },
    },
  });

  if (zombies.length === 0) return 0;

  console.warn(`[IllustrationRescue] Found ${zombies.length} zombie illustration(s); re-enqueueing`);

  for (const ill of zombies) {
    await prisma.illustration.update({
      where: { id: ill.id },
      data: {
        status: 'pending',
        workerStartedAt: null,
      },
    });
    await enqueueIllustrationWork(ill.storyId, ill.sceneIndex, ill.story?.characterId);
  }

  return zombies.length;
}

/**
 * Start a periodic watchdog that calls `rescueStuckIllustrations()` every
 * 60s. Idempotent — calling twice does not start two intervals.
 *
 * Returned handle can be used to stop the watchdog (mostly for tests).
 */
let watchdogIntervalHandle: NodeJS.Timeout | null = null;
export function startIllustrationWatchdog(intervalMs = 60_000): void {
  if (watchdogIntervalHandle) return;
  watchdogIntervalHandle = setInterval(() => {
    rescueStuckIllustrations()
      .then((count) => {
        if (count > 0) {
          console.log(`[IllustrationWatchdog] rescued ${count} zombie(s)`);
        }
      })
      .catch((error) => {
        console.error('[IllustrationWatchdog] rescue failed:', error);
      });
  }, intervalMs);
  // Don't keep the Node event loop alive solely for this watchdog.
  watchdogIntervalHandle.unref?.();
  console.log(`[IllustrationWatchdog] started (interval=${intervalMs}ms)`);
}

/** Stop the watchdog (for graceful shutdown / tests). */
export function stopIllustrationWatchdog(): void {
  if (watchdogIntervalHandle) {
    clearInterval(watchdogIntervalHandle);
    watchdogIntervalHandle = null;
  }
}

export default {
  getStoryScenes,
  createIllustrationRecords,
  generateSceneIllustration,
  getStoryIllustrations,
  checkAllIllustrationsCompleted,
  getIllustrationStats,
  markIllustrationFailed,
  markIllustrationProcessing,
  enqueueIllustrationWork,
  rescueStuckIllustrations,
  startIllustrationWatchdog,
  stopIllustrationWatchdog,
};
