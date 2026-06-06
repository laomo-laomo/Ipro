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
} from './ai.service.js';
import { normalizeStoryboard, storyboardToStorage } from '../types/storyboard.js';
import {
  emitSceneCompleted,
  emitSceneFailed,
  emitSceneProcessing,
  emitStoryCompleted,
} from './illustration-emitter.js';
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

  if (failureCategory === 'policy_blocked') {
    revised = revised
      .replace(/close-up/gi, 'storybook composition')
      .replace(/highly realistic/gi, 'gentle illustrated')
      .replace(/intense/gi, 'warm');
  }

  if (attempt > 1) {
    revised = `${revised}. Keep the scene child-safe, whimsical, and suitable for a gentle illustrated bedtime story.`;
  }

  return normalizeWhitespace(revised);
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
  sceneIndices: number[]
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
      update: {
        status: 'pending',
        imageUrl: null,
        errorMessage: null,
        failureCategory: null,
      },
      create: illustration,
    });
  }

  await prisma.story.update({
    where: { id: storyId },
    data: { status: 'processing' },
  });

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

  if (characterId) {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (character?.stylizedPhotoUrl) {
      // Prefer the per-story costume URL (set when the story was created with a
      // different title than the character's last-stylized title) so the
      // character's clothing matches the story. Fall back to the global
      // stylized photo when no per-story override exists.
      sourceImageUrl = story.characterStylizedUrl || character.stylizedPhotoUrl;
    } else {
      throw new Error('Character has no stylized photo. Please complete the style step first.');
    }
  }

  const illustration = story.illustrations[0];
  if (!illustration) {
    throw new Error(`Illustration record for scene ${sceneIndex} not found`);
  }

  const promptScene = {
    description: scene.imagePrompt
      ? `${scene.description}. Visual reference prompt: ${scene.imagePrompt}`
      : scene.description,
    text: scene.text,
  };
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
        ? await compositeIllustration(sourceImageUrl, currentPrompt)
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
          imagePrompt: currentPrompt,
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

      // Deduct quota after successful illustration generation
      const story = await prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
      if (story) {
        await deductQuota(story.userId, 1).catch(err => {
          console.error('[Illustration] Failed to deduct quota:', err.message);
        });
      }

      // Check if all illustrations are done
      const allIllustrations = await prisma.illustration.findMany({
        where: { storyId },
      });
      const allDone = allIllustrations.every(ill => ill.status === 'completed');
      if (allDone) {
        const totalCost = allIllustrations.reduce((sum, ill) => sum + ill.cost, 0);
        emitStoryCompleted(storyId, {
          totalCost,
          illustrationCount: allIllustrations.length,
        });
      }

      return {
        imageUrl,
        prompt: currentPrompt,
        cost,
        retryCount: attempt,
      };
    } catch (error) {
      const failureCategory = classifyIllustrationFailure(error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      await prisma.illustration.update({
        where: { id: illustration.id },
        data: {
          prompt: currentPrompt,
          originalPrompt,
          errorMessage,
          failureCategory,
          retryCount: attempt + 1,
          status: attempt >= MAX_PROMPT_RECOVERY_RETRIES ? 'failed' : 'processing',
        },
      });

      const nextStoryboard = {
        ...storyboard,
        scenes: storyboard.scenes.map((storyboardScene) => storyboardScene.index === sceneIndex ? {
          ...storyboardScene,
          imagePrompt: currentPrompt,
          image: {
            ...storyboardScene.image,
            prompt: currentPrompt,
            originalPrompt,
            status: (attempt >= MAX_PROMPT_RECOVERY_RETRIES ? 'failed' : 'processing') as StoryboardImageStatus,
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
      if (attempt >= MAX_PROMPT_RECOVERY_RETRIES) {
        emitSceneFailed(storyId, illustration.id, sceneIndex, {
          errorMessage,
          failureCategory,
        });
      }

      if (failureCategory === 'policy_blocked') {
        await rememberRestrictedPrompt(currentPrompt, failureCategory);
      }

      if (failureCategory === 'network_error' || failureCategory === 'timeout') {
        throw error;
      }

      if (attempt >= MAX_PROMPT_RECOVERY_RETRIES) {
        // Last attempt: try LLM rewrite before giving up
        try {
          const llmRewritten = await llmRewritePrompt(currentPrompt);
          if (llmRewritten !== currentPrompt) {
            const imageUrl = sourceImageUrl
              ? await compositeIllustration(sourceImageUrl, llmRewritten)
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
    await prisma.story.update({
      where: { id: storyId },
      data: {
        status: 'illustrated',
        totalCost,
      },
    });
    return true;
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
 * Mark illustration as failed
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
    },
  });

  console.error(`[Illustration] Failed ${illustrationId}: ${error}`);
}

/**
 * Mark illustration as processing
 */
export async function markIllustrationProcessing(illustrationId: string): Promise<void> {
  await prisma.illustration.update({
    where: { id: illustrationId },
    data: { status: 'processing' },
  });
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
};
