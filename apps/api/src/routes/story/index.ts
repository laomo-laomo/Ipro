import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { generateStory as generateStoryWithAI, ensureCharacterCostumeForStory, type CharacterIdentity, type CharacterGender, type CharacterAgeBand, type CharacterSubjectKind, UNKNOWN_IDENTITY } from '../../services/ai.service.js';
import {
  enqueueStoryCoverGeneration,
  enqueueStoryCompletionAfterCoverGeneration,
  storyNeedsGeneratedCover,
} from '../../services/illustration.service.js';
import { checkDailyStoryLimit } from '../../services/membership.service.js';
import {
  buildStoryboardFromLegacyScenes,
  normalizeStoryboard,
  storyboardToLegacyScenes,
  storyboardToStorage,
  type Storyboard,
  type StoryboardScene,
} from '../../types/storyboard.js';

interface StoryParams {
  id: string;
}

interface SegmentParams extends StoryParams {
  segmentId: string;
}

type Scene = StoryboardScene;

interface GenerateBody {
  title?: string;
  customTitle?: string;
  characterId: string;
}

interface FromTemplateBody {
  templateId: string;
  templateName?: string;
  characterId: string;
}

interface CreateBody {
  characterId: string;
  title?: string;
  customTitle?: string;
  templateId?: string;
  templateName?: string;
  source?: string;
  skipAutoStylize?: boolean;
}

interface UpdateStoryBody {
  content?: string;
  scenes?: Scene[];
  storyboard?: Partial<Storyboard>;
}

interface SegmentPatchBody {
  description?: string;
  sceneDesc?: string;
  text?: string;
  textEn?: string;
  content?: string;
  storyText?: string;
  storyTextEn?: string;
  voiceover?: string;
  voiceoverEn?: string;
  subtitle?: string;
  title?: string;
  titleEn?: string;
  imageDescription?: string;
  imageDescriptionEn?: string;
  imagePrompt?: string;
  dialogue?: any[];
  narration?: any;
  charactersInScene?: string[];
  charactersLayout?: string;
  shot?: Record<string, unknown>;
  durationSec?: number;
  musicMood?: string;
  sfx?: string[];
  image?: Record<string, unknown>;
}

const dialogueSchema = z.object({
  speakerId: z.string().optional(),
  speaker: z.string().optional(),
  text: z.string(),
  textEn: z.string().optional(),
  displayOnImage: z.boolean().optional(),
  tts: z.boolean().optional(),
  emotion: z.string().optional(),
});

const narrationSchema = z.object({
  text: z.string(),
  textEn: z.string().optional(),
  displayOnImage: z.boolean().optional(),
  tts: z.boolean().optional(),
  voiceId: z.string().optional(),
  voiceIdEn: z.string().optional(),
});

const shotSchema = z.object({
  type: z.string().optional(),
  angle: z.string().optional(),
  focus: z.string().optional(),
  movement: z.string().optional(),
});

const imageSchema = z.object({
  prompt: z.string().optional(),
  originalPrompt: z.string().optional(),
  url: z.string().nullable().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  retryCount: z.number().int().min(0).optional(),
  failureCategory: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  cost: z.number().optional(),
});

const sceneSchema = z.object({
  id: z.string().optional(),
  index: z.number().int().min(0),
  title: z.string().optional(),
  titleEn: z.string().optional(),
  charactersInScene: z.array(z.string()).optional(),
  storyText: z.string().optional(),
  storyTextEn: z.string().optional(),
  imageDescription: z.string().optional(),
  imageDescriptionEn: z.string().optional(),
  imagePrompt: z.string().optional(),
  charactersLayout: z.string().optional(),
  dialogue: z.array(dialogueSchema).optional(),
  narration: narrationSchema.optional(),
  voiceover: z.string().optional(),
  voiceoverEn: z.string().optional(),
  subtitle: z.string().optional(),
  shot: shotSchema.optional(),
  durationSec: z.number().optional(),
  musicMood: z.string().optional(),
  sfx: z.array(z.string()).optional(),
  image: imageSchema.optional(),
  description: z.string().optional(),
  text: z.string().optional(),
  textEn: z.string().optional(),
  content: z.string().optional(),
});

const storyboardSchema = z.object({
  version: z.literal(1).optional(),
  title: z.string().optional(),
  titleEn: z.string().optional(),
  summary: z.string().optional(),
  summaryEn: z.string().optional(),
  theme: z.string().optional(),
  themeEn: z.string().optional(),
  audienceAge: z.string().optional(),
  character: z.object({
    characterId: z.string().optional(),
    featureDesc: z.string().optional(),
    featureDescEn: z.string().optional(),
    style: z.string().optional(),
    originalPhotoUrl: z.string().optional(),
    stylizedPhotoUrl: z.string().optional(),
  }).optional(),
  voiceCast: z.array(z.object({
    speakerId: z.string().optional(),
    name: z.string().optional(),
    nameEn: z.string().optional(),
    role: z.string().optional(),
    voiceId: z.string().optional(),
    voiceIdEn: z.string().optional(),
  })).optional(),
  scenes: z.array(sceneSchema).optional(),
});

const scenesArraySchema = z.array(sceneSchema);

// Templates with fewer than this many scenes are considered too thin to be a
// real 绘本 arc and we fall back to LLM generation instead. Defends against
// future seed entries that ship under-curated.
const MIN_TEMPLATE_SCENES = 6;

const updateStorySchema = z.object({
  content: z.string().optional(),
  scenes: scenesArraySchema.optional(),
  storyboard: storyboardSchema.optional(),
});

const generateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    customTitle: z.string().min(1).max(200).optional(),
    characterId: z.string().min(1),
  })
  .refine((data) => data.title || data.customTitle, {
    message: 'title or customTitle is required',
    path: ['title'],
  });

const fromTemplateSchema = z.object({
  templateId: z.string().min(1),
  templateName: z.string().min(1).max(200).optional(),
  characterId: z.string().min(1),
});

const createSchema = z
  .object({
    characterId: z.string().min(1),
    title: z.string().min(1).max(200).optional(),
    customTitle: z.string().min(1).max(200).optional(),
    templateId: z.string().min(1).optional(),
    templateName: z.string().min(1).max(200).optional(),
    source: z.string().max(50).optional(),
    skipAutoStylize: z.boolean().optional(),
  })
  .refine((data) => data.title || data.customTitle || data.templateId, {
    message: 'title, customTitle, or templateId is required',
    path: ['title'],
  });

function parseScenes(raw: string | null | undefined): Scene[] {
  return normalizeStoryboard(raw).scenes;
}

function parseStoryboard(raw: string | null | undefined, title = ''): Storyboard {
  return normalizeStoryboard(raw, title);
}

function toSceneArray(input: any[]): Scene[] {
  return normalizeStoryboard(JSON.stringify({ title: '', scenes: input })).scenes;
}

function mergeStoryboard(story: any, payload: Record<string, unknown>): Storyboard {
  const current = parseStoryboard(story.scenes, story.title);
  const nextRaw = {
    ...current,
    ...payload,
    version: 1,
    title: (typeof payload.title === 'string' && payload.title) ? payload.title : current.title || story.title,
    scenes: Array.isArray(payload.scenes) ? payload.scenes : current.scenes,
  };

  return normalizeStoryboard(JSON.stringify(nextRaw), nextRaw.title || story.title);
}

function buildStoryboardFromSceneInput(storyTitle: string, scenesInput: any[]): Storyboard {
  return normalizeStoryboard(JSON.stringify({
    version: 1,
    title: storyTitle,
    scenes: scenesInput,
  }), storyTitle);
}

function storyContentFromStoryboard(storyboard: Storyboard, fallbackContent = ''): string {
  const content = storyboard.scenes
    .map((scene) => (scene.storyText || scene.voiceover || '').trim())
    .filter(Boolean)
    .join('\n\n');

  return content || storyboard.summary || fallbackContent;
}

function parseSegmentIndex(segmentId: string): number | null {
  const exactNumber = Number(segmentId);
  if (Number.isInteger(exactNumber) && exactNumber >= 0) {
    return exactNumber;
  }
  const match = segmentId.match(/(\d+)$/);
  if (!match) {
    return null;
  }
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

async function getCharacterDescription(
  fastify: FastifyInstance,
  characterId: string
): Promise<CharacterIdentity> {
  const character = await fastify.prisma.character.findUnique({
    where: { id: characterId },
  });
  if (!character) {
    // No character at all — story LLM gets a soft "unknown" identity and is
    // allowed to invent, but it'll still go through the pronoun-check gate.
    return { ...UNKNOWN_IDENTITY, featureDesc: 'a cute child' };
  }
  return {
    featureDesc:
      character.featureDesc
      || (character.stylizedPhotoUrl ? 'an illustration-style main character' : 'a cute child'),
    gender: normalizeIdentityField(character.gender, ['male', 'female', 'unknown']) as CharacterGender,
    ageBand: normalizeIdentityField(character.ageBand, ['child', 'teen', 'adult', 'unknown']) as CharacterAgeBand,
    subjectKind: normalizeIdentityField(character.subjectKind, ['human', 'animal']) as CharacterSubjectKind,
    characterName: character.characterName || undefined,
  };
}

function normalizeIdentityField(
  raw: string | null | undefined,
  allowed: readonly string[]
): string {
  if (!raw) return 'unknown';
  return allowed.includes(raw) ? raw : 'unknown';
}

function storyResponse(story: any) {
  const storyboard = parseStoryboard(story.scenes, story.title);
  const firstIllustrationCover = story.illustrations?.find((ill: any) => ill?.imageUrl)?.imageUrl || null;
  const needsGeneratedCover = storyNeedsGeneratedCover(story, firstIllustrationCover);
  const cover = story.cover || story.coverUrl || story.coverImageUrl || firstIllustrationCover || null;
  if (
    story.id
    && ['illustrated', 'completed', 'published'].includes(story.status)
    && needsGeneratedCover
  ) {
    enqueueStoryCoverGeneration(story.id, firstIllustrationCover);
  }
  return {
    ...story,
    cover,
    coverUrl: cover,
    coverReady: Boolean(cover && !needsGeneratedCover),
    storyboard,
    scenes: storyboardToLegacyScenes(storyboard),
  };
}

/**
 * Background story generation: AI generate -> save to StoryTemplate -> update user story
 */
async function generateStoryInBackground(
  fastify: FastifyInstance,
  storyId: string,
  title: string,
  characterId: string
) {
  try {
    // Check StoryTemplate cache first
    let cachedTemplate = await fastify.prisma.storyTemplate.findFirst({
      where: { title, status: 'active' },
    });

    if (!cachedTemplate) {
      const characterDesc = await getCharacterDescription(fastify, characterId);
      const storyData = await generateStoryWithAI(title, characterDesc);

      cachedTemplate = await fastify.prisma.storyTemplate.create({
        data: {
          title,
          content: storyData.content,
          scenes: storyboardToStorage(storyData.storyboard),
          status: 'active',
        },
      });
    }

    // Update the user story with generated content
    const storyboard = parseStoryboard(cachedTemplate.scenes, cachedTemplate.title);
    await fastify.prisma.story.update({
      where: { id: storyId },
      data: {
        title: cachedTemplate.title,
        content: cachedTemplate.content || storyContentFromStoryboard(storyboard),
        scenes: storyboardToStorage(storyboard),
        status: 'completed',
      },
    });

    fastify.log.info({ storyId, title }, '[Story] Background generation completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    fastify.log.error({ error: errorMessage, stack: errorStack, storyId, title }, '[Story] Background generation failed');
    await fastify.prisma.story.update({
      where: { id: storyId },
      data: { status: 'failed', errorMessage },
    }).catch(() => {});
  }
}

export async function storyRoutes(fastify: FastifyInstance) {
  fastify.get('/templates', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const templates = await fastify.prisma.storyTemplate.findMany({
        where: { status: 'active' },
        select: { id: true, title: true, cover: true, scenes: true },
        orderBy: { createdAt: 'asc' },
      });
      const result = templates.map((template: any) => ({
        id: template.id,
        title: template.title,
        cover: template.cover,
        sceneCount: parseScenes(template.scenes).length,
      }));
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to fetch templates' });
    }
  });

  // Unified create endpoint - returns immediately, generates in background
  fastify.post<{ Body: CreateBody }>('/create', async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const parseResult = createSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, message: 'Invalid request body', errors: parseResult.error.errors });
    }

    const { characterId, templateId, templateName, source: _source, skipAutoStylize } = parseResult.data;

    const character = await fastify.prisma.character.findFirst({
      where: { id: characterId, userId },
    });
    if (!character) {
      return reply.status(404).send({ success: false, message: 'Character not found' });
    }

    // 修复 (2026-06-18 Bug E): 在 story 创建时检查 daily limit,
    // 防止用户通过创建大量 story 绕过每日限额
    if (process.env.NODE_ENV === 'production') {
      const dailyLimitCheck = await checkDailyStoryLimit(userId);
      if (!dailyLimitCheck.allowed) {
        return reply.status(403).send({
          success: false,
          message: dailyLimitCheck.error || '今日创作已达上限',
          code: 'DAILY_LIMIT_EXCEEDED',
        });
      }
    }

    try {
      // 1. Resolve final title
      let title = parseResult.data.title || parseResult.data.customTitle || '';
      if (!title && templateId) {
        const tpl = await fastify.prisma.storyTemplate.findUnique({ where: { id: templateId } });
        title = tpl?.title || templateName || templateId;
      }
      if (!title) {
        return reply.status(400).send({ success: false, message: 'Title is required' });
      }

      // 2. Check StoryTemplate cache for instant response
      const cachedTemplate = await fastify.prisma.storyTemplate.findFirst({
        where: { title, status: 'active' },
      });

      const source = templateId ? 'template' : 'custom';

      if (cachedTemplate) {
        const initialCostumeUrl = character.stylizedPhotoUrl;
        const storyboard = parseStoryboard(cachedTemplate.scenes, cachedTemplate.title);
        const story = await fastify.prisma.story.create({
          data: {
            userId,
            characterId,
            title: cachedTemplate.title,
            content: cachedTemplate.content || storyContentFromStoryboard(storyboard),
            scenes: storyboardToStorage(storyboard),
            source,
            status: 'completed',
            characterStylizedUrl: initialCostumeUrl,
          },
        });
        if (!skipAutoStylize) {
          void ensureCharacterCostumeForStory(
            fastify.prisma,
            character,
            story.id,
            cachedTemplate.title,
          ).catch(() => { /* ensure internally already falls back */ });
        }
        return {
          success: true,
          data: { storyId: story.id, title: story.title, content: story.content, storyboard, scenes: storyboardToLegacyScenes(storyboard), status: 'completed', characterStylizedUrl: initialCostumeUrl, costumeRestyled: false },
        };
      }

      // 3. Cache miss: create empty story, generate in background.
      // Per-story costume (cache hit fast-path, restyle on cache miss) is
      // fired in the background — never block the HTTP response on AI
      // generation (see comment in the cache-hit branch above).
      const story = await fastify.prisma.story.create({
        data: {
          userId,
          characterId,
          title,
          content: '',
          scenes: storyboardToStorage({ version: 1, title, scenes: [] }),
          source,
          status: 'draft',
          characterStylizedUrl: character.stylizedPhotoUrl,
        },
      });

      if (!skipAutoStylize) {
        // 修复 (2026-06-18): 串行化 costume 重生成 → 故事生成,
        // 避免 LLM 故事生成比 costume 重生成快时, 前端在旧 URL 上触发插画,
        // 导致首页/封面与内页服装不一致。ensure 内部已 fall back, catch 不影响。
        ensureCharacterCostumeForStory(
          fastify.prisma,
          character,
          story.id,
          title,
        )
          .catch(() => {})
          .finally(() => {
            generateStoryInBackground(fastify, story.id, title, characterId);
          });
      } else {
        generateStoryInBackground(fastify, story.id, title, characterId);
      }

      return {
        success: true,
        data: { storyId: story.id, title: story.title, content: '', storyboard: { version: 1, title: story.title, scenes: [] }, scenes: [], status: 'draft', characterStylizedUrl: character.stylizedPhotoUrl, costumeRestyled: false },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to generate story' });
    }
  });

  fastify.post<{ Body: GenerateBody }>('/generate', async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const parseResult = generateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, message: 'Invalid request body', errors: parseResult.error.errors });
    }
    const { characterId } = parseResult.data;
    const title = parseResult.data.title || parseResult.data.customTitle!;
    const character = await fastify.prisma.character.findFirst({ where: { id: characterId, userId } });
    if (!character) {
      return reply.status(404).send({ success: false, message: 'Character not found' });
    }
    try {
      const cachedTemplate = await fastify.prisma.storyTemplate.findFirst({ where: { title, status: 'active' } });
      if (cachedTemplate) {
        const storyboard = parseStoryboard(cachedTemplate.scenes, cachedTemplate.title);
        // Per-story costume (cache hit fast-path, restyle on cache miss) —
        // fired in the background, never blocks the HTTP response.
        const initialCostumeUrl = character.stylizedPhotoUrl;
        void ensureCharacterCostumeForStory(
          fastify.prisma,
          character,
          /* storyId */ '',
          cachedTemplate.title,
        ).then((costume) => {
          if (!costume.restyled || !costume.url) return;
          fastify.prisma.story.update({
            where: { id: story.id },
            data: { characterStylizedUrl: costume.url },
          }).catch(() => {});
        }).catch(() => {});

        const story = await fastify.prisma.story.create({
          data: {
            userId,
            characterId,
            title: cachedTemplate.title,
            content: cachedTemplate.content || storyContentFromStoryboard(storyboard),
            scenes: storyboardToStorage(storyboard),
            source: 'custom',
            status: 'completed',
            characterStylizedUrl: initialCostumeUrl,
          },
        });
        return { success: true, data: { storyId: story.id, title: story.title, content: story.content, storyboard, scenes: storyboardToLegacyScenes(storyboard), status: 'completed', characterStylizedUrl: initialCostumeUrl, costumeRestyled: false } };
      }
      const story = await fastify.prisma.story.create({
        data: { userId, characterId, title, content: '', scenes: storyboardToStorage({ version: 1, title, scenes: [] }), source: 'custom', status: 'draft', characterStylizedUrl: character.stylizedPhotoUrl },
      });
      // 修复 (2026-06-18): 串行化 costume → 故事生成 (custom title 路径),
      // ensure 已内部处理 fallback。
      ensureCharacterCostumeForStory(
        fastify.prisma,
        character,
        story.id,
        title,
      )
        .catch(() => {})
        .finally(() => {
          generateStoryInBackground(fastify, story.id, title, characterId);
        });

      return { success: true, data: { storyId: story.id, title: story.title, content: '', storyboard: { version: 1, title: story.title, scenes: [] }, scenes: [], status: 'draft', characterStylizedUrl: character.stylizedPhotoUrl, costumeRestyled: false } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to generate story' });
    }
  });

  fastify.post<{ Body: FromTemplateBody }>('/from-template', async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const parseResult = fromTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, message: 'Invalid request body', errors: parseResult.error.errors });
    }
    const { templateId, templateName, characterId } = parseResult.data;
    const character = await fastify.prisma.character.findFirst({ where: { id: characterId, userId } });
    if (!character) {
      return reply.status(404).send({ success: false, message: 'Character not found' });
    }

    // 修复 (2026-06-18 Bug E): 在 story 创建时检查 daily limit
    if (process.env.NODE_ENV === 'production') {
      const dailyLimitCheck = await checkDailyStoryLimit(userId);
      if (!dailyLimitCheck.allowed) {
        return reply.status(403).send({
          success: false,
          message: dailyLimitCheck.error || '今日创作已达上限',
          code: 'DAILY_LIMIT_EXCEEDED',
        });
      }
    }

    try {
      const tpl = await fastify.prisma.storyTemplate.findUnique({ where: { id: templateId } });
      const title = tpl?.title || templateName || templateId;
      const cachedTemplate = await fastify.prisma.storyTemplate.findFirst({ where: { title, status: 'active' } });
      // Reject under-curated templates (e.g. legacy 4-幕 seed entries) and
      // fall back to LLM generation so the user always gets a real story arc.
      const cachedStoryboard = cachedTemplate ? parseStoryboard(cachedTemplate.scenes, cachedTemplate.title) : null;
      const cachedScenes = cachedStoryboard?.scenes ?? [];
      if (cachedTemplate && cachedScenes.length >= MIN_TEMPLATE_SCENES) {
        // Per-story costume: if the character's current costume was generated
        // for a different title, re-stylize so the character's clothing matches
        // this story. Cache hit (same title) is a no-op. Fired in the
        // background — never blocks the HTTP response.
        const initialCostumeUrl = character.stylizedPhotoUrl;
        void ensureCharacterCostumeForStory(
          fastify.prisma,
          character,
          /* storyId */ '',  // story not created yet; we'll set characterStylizedUrl after
          title,
        ).then((costume) => {
          if (!costume.restyled || !costume.url) return;
          fastify.prisma.story.update({
            where: { id: story.id },
            data: { characterStylizedUrl: costume.url },
          }).catch(() => {});
        }).catch(() => {});

        const story = await fastify.prisma.story.create({
          data: {
            userId,
            characterId,
            title: cachedTemplate.title,
            content: cachedTemplate.content || storyContentFromStoryboard(cachedStoryboard!),
            scenes: storyboardToStorage(cachedStoryboard!),
            source: 'template',
            status: 'completed',
            characterStylizedUrl: initialCostumeUrl,
          },
        });
        return { success: true, data: { storyId: story.id, title: story.title, content: story.content, storyboard: cachedStoryboard, scenes: storyboardToLegacyScenes(cachedStoryboard!), status: 'completed', characterStylizedUrl: initialCostumeUrl, costumeRestyled: false } };
      }
      if (cachedTemplate && cachedScenes.length < MIN_TEMPLATE_SCENES) {
        fastify.log.warn(
          { templateId, title, scenes: cachedScenes.length },
          '[fromTemplate] Template under-curated, falling back to LLM',
        );
      }
      const story = await fastify.prisma.story.create({
        data: { userId, characterId, title, content: '', scenes: storyboardToStorage({ version: 1, title, scenes: [] }), source: 'template', status: 'draft', characterStylizedUrl: character.stylizedPhotoUrl },
      });
      // 修复 (2026-06-18): 串行化 costume → 故事生成 (from-template cache miss 路径)。
      ensureCharacterCostumeForStory(
        fastify.prisma,
        character,
        story.id,
        title,
      )
        .catch(() => {})
        .finally(() => {
          generateStoryInBackground(fastify, story.id, title, characterId);
        });

      return { success: true, data: { storyId: story.id, title: story.title, content: '', storyboard: { version: 1, title: story.title, scenes: [] }, scenes: [], status: 'draft', characterStylizedUrl: character.stylizedPhotoUrl, costumeRestyled: false } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to create story from template' });
    }
  });

fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const stories = await fastify.prisma.story.findMany({
      where: { userId, status: { not: 'deleted' } },
      include: {
        illustrations: { orderBy: { sceneIndex: 'asc' } },
        videos: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Note: we previously N+1'd into Character.findUnique and dropped stories whose
    // character had been deleted ("orphans"). That was wrong: a book is the user's
    // creation, not the character's — deleting a character shouldn't hide their
    // work. We now return ALL stories and just log orphans so we know they exist.
    for (const story of stories) {
      if (!story.characterId) {
        fastify.log.warn({ storyId: story.id }, '[Story] Story has no characterId');
        continue;
      }
      // We could join Character here, but the API doesn't return the character object
      // to the client — the gallery only needs `characterId`. Skip the lookup.
    }
    return { success: true, data: stories.map(storyResponse) };
  });

fastify.get('/:id', async (request: FastifyRequest<{ Params: StoryParams }>, reply: FastifyReply) => {
    const userId = request.user?.id;
    const { id } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const story = await fastify.prisma.story.findFirst({
      where: { id, userId },
      include: {
        illustrations: { orderBy: { sceneIndex: 'asc' } },
        videos: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!story) {
      return reply.status(404).send({ success: false, message: 'Story not found' });
    }
    // Story stays accessible even if the underlying Character was deleted — the
    // story is the user's creation, not the character's. We don't return the
    // character object to the client anyway, so the missing character is harmless.
    if (!story.characterId) {
      fastify.log.warn({ storyId: story.id }, '[Story] Story has no characterId');
    }
    return { success: true, data: storyResponse(story) };
  });

  fastify.get('/:id/progress', async (request: FastifyRequest<{ Params: StoryParams }>, reply: FastifyReply) => {
    const userId = request.user?.id;
    const { id } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const story = await fastify.prisma.story.findFirst({
      where: { id, userId },
      include: { illustrations: { orderBy: { sceneIndex: 'asc' } } },
    });
    if (!story) {
      return reply.status(404).send({ success: false, message: 'Story not found' });
    }
    const totalIllustrations = story.illustrations.length;
    const completedIllustrations = story.illustrations.filter((ill: any) => ill.status === 'completed').length;
    const failedIllustrations = story.illustrations.filter((ill: any) => ill.status === 'failed').length;
    let status = story.status;
    let currentStep = '';
    let progress = 0;
    if (story.status === 'draft') {
      status = 'draft';
      currentStep = 'AI 正在创作故事...';
      progress = 5;
    } else if (story.status === 'completed') {
      status = 'completed';
      currentStep = '故事已生成';
      progress = 10;
    } else if (story.status === 'failed') {
      status = 'failed';
      currentStep = '生成失败';
      progress = 0;
    } else if (story.status === 'processing') {
      // If every illustration has reached a terminal state (completed OR failed) but the
      // story row is still 'processing' (because checkAllIllustrationsCompleted never
      // promoted it when some failed), surface a synthetic terminal status so the
      // frontend polling stops spinning and shows the actual results. The per-scene
      // imageStatus is still accurate — loadStory will pull the truth.
      const terminalCount = completedIllustrations + failedIllustrations;
      if (totalIllustrations > 0 && terminalCount >= totalIllustrations) {
        if (failedIllustrations > 0) {
          status = 'failed';
          currentStep = `插画已结束 (${completedIllustrations} 张成功, ${failedIllustrations} 张失败)`;
          progress = 10 + Math.round((completedIllustrations / Math.max(totalIllustrations, 1)) * 70);
        } else {
          const fallbackCover = story.illustrations.find((ill: any) => ill?.imageUrl)?.imageUrl || null;
          enqueueStoryCompletionAfterCoverGeneration(story.id, fallbackCover);
          status = 'covering';
          currentStep = '正在生成封面';
          progress = 90;
        }
      } else {
        status = 'processing';
        currentStep = '正在生成插画 (' + completedIllustrations + '/' + totalIllustrations + ')';
        progress = 10 + Math.round((completedIllustrations / Math.max(totalIllustrations, 1)) * 70);
      }
    } else if (story.status === 'covering') {
      const fallbackCover = story.illustrations.find((ill: any) => ill?.imageUrl)?.imageUrl || null;
      enqueueStoryCompletionAfterCoverGeneration(story.id, fallbackCover);
      status = 'covering';
      currentStep = '正在生成封面';
      progress = 90;
    } else if (story.status === 'rendering') {
      status = 'rendering';
      currentStep = '正在生成视频';
      progress = 80;
    } else if (story.status === 'illustrated') {
      status = 'completed';
      currentStep = '已完成';
      progress = 100;
    }
    return {
      success: true,
      data: {
        storyId: story.id,
        status,
        currentStep,
        progress,
        // 修复 (2026-06-15): 把 illustrations 数组也返回,小程序生成页
        // 需要根据 illustration.status / errorMessage / imageUrl 渲染每张
        // 分镜卡片和失败原因。原来 /progress 只返回数字统计,前端拿不到
        // 单张分镜的细节,失败原因 / 重试按钮都没法定位到具体哪一张。
        illustrations: story.illustrations.map((ill: any) => ({
          id: ill.id,
          sceneIndex: ill.sceneIndex,
          status: ill.status,
          imageUrl: ill.imageUrl,
          errorMessage: ill.errorMessage,
          failureCategory: ill.failureCategory,
          retryCount: ill.retryCount,
        })),
        completedIllustrations,
        failedIllustrations,
        totalIllustrations,
        errorMessage: story.errorMessage,
        message: story.errorMessage || undefined,
      },
    };
  });

  fastify.put<{ Params: StoryParams; Body: { segments: any[] } }>('/:id/segments', async (request, reply) => {
    const userId = request.user?.id;
    const { id } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const story = await fastify.prisma.story.findFirst({ where: { id, userId } });
    if (!story) {
      return reply.status(404).send({ success: false, message: 'Story not found' });
    }
    const segments = Array.isArray(request.body?.segments) ? request.body.segments : [];
    const storyboard = buildStoryboardFromSceneInput(story.title, segments);
    const updatedStory = await fastify.prisma.story.update({
      where: { id },
      data: { scenes: storyboardToStorage(storyboard), content: storyContentFromStoryboard(storyboard, story.content) },
      include: { illustrations: { orderBy: { sceneIndex: 'asc' } } },
    });
    return { success: true, data: storyResponse(updatedStory) };
  });

  fastify.patch<{ Params: SegmentParams; Body: SegmentPatchBody }>('/:id/segments/:segmentId', async (request, reply) => {
    const userId = request.user?.id;
    const { id, segmentId } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const story = await fastify.prisma.story.findFirst({ where: { id, userId } });
    if (!story) {
      return reply.status(404).send({ success: false, message: 'Story not found' });
    }
    const targetIndex = parseSegmentIndex(segmentId);
    if (targetIndex === null) {
      return reply.status(400).send({ success: false, message: 'Invalid segment id' });
    }
    const storyboard = parseStoryboard(story.scenes, story.title);
    const scenes = storyboard.scenes.map((scene) => {
      if (scene.index !== targetIndex) return scene;

      const nextTitle = request.body?.title !== undefined ? request.body.title : scene.title;
      const nextTitleEn = request.body?.titleEn !== undefined ? request.body.titleEn : scene.titleEn;
      const nextImageDescription = request.body?.imageDescription !== undefined
        ? request.body.imageDescription
        : request.body?.description !== undefined
          ? request.body.description
          : request.body?.sceneDesc !== undefined
            ? request.body.sceneDesc
            : scene.imageDescription;
      const nextImageDescriptionEn = request.body?.imageDescriptionEn !== undefined ? request.body.imageDescriptionEn : scene.imageDescriptionEn;
      const nextStoryText = request.body?.storyText !== undefined
        ? request.body.storyText
        : request.body?.text !== undefined
          ? request.body.text
          : request.body?.content !== undefined
            ? request.body.content
            : scene.storyText;
      const nextStoryTextEn = request.body?.storyTextEn !== undefined
        ? request.body.storyTextEn
        : request.body?.textEn !== undefined
          ? request.body.textEn
          : scene.storyTextEn;
      const nextVoiceover = request.body?.voiceover !== undefined
        ? request.body.voiceover
        : request.body?.storyText !== undefined
          ? request.body.storyText
          : request.body?.text !== undefined
            ? request.body.text
            : request.body?.content !== undefined
              ? request.body.content
              : scene.voiceover;
      const nextVoiceoverEn = request.body?.voiceoverEn !== undefined
        ? request.body.voiceoverEn
        : request.body?.storyTextEn !== undefined
          ? request.body.storyTextEn
          : request.body?.textEn !== undefined
            ? request.body.textEn
            : scene.voiceoverEn;

      return {
        ...scene,
        title: nextTitle,
        titleEn: nextTitleEn,
        imageDescription: nextImageDescription,
        imageDescriptionEn: nextImageDescriptionEn,
        storyText: nextStoryText,
        storyTextEn: nextStoryTextEn,
        imagePrompt: request.body?.imagePrompt !== undefined ? request.body.imagePrompt : scene.imagePrompt,
        charactersInScene: request.body?.charactersInScene !== undefined ? request.body.charactersInScene : scene.charactersInScene,
        charactersLayout: request.body?.charactersLayout !== undefined ? request.body.charactersLayout : scene.charactersLayout,
        dialogue: request.body?.dialogue !== undefined ? request.body.dialogue : scene.dialogue,
        narration: request.body?.narration !== undefined ? request.body.narration : scene.narration,
        voiceover: nextVoiceover,
        voiceoverEn: nextVoiceoverEn,
        subtitle: request.body?.subtitle !== undefined ? request.body.subtitle : scene.subtitle,
        shot: request.body?.shot !== undefined ? request.body.shot : scene.shot,
        durationSec: typeof request.body?.durationSec === 'number' ? request.body.durationSec : scene.durationSec,
        musicMood: request.body?.musicMood !== undefined ? request.body.musicMood : scene.musicMood,
        sfx: request.body?.sfx !== undefined ? request.body.sfx : scene.sfx,
        image: request.body?.image !== undefined ? request.body.image : scene.image,
      };
    });
    const nextStoryboard = normalizeStoryboard(JSON.stringify({ ...storyboard, scenes }), storyboard.title);
    const updatedStory = await fastify.prisma.story.update({
      where: { id },
      data: { scenes: storyboardToStorage(nextStoryboard), content: storyContentFromStoryboard(nextStoryboard, story.content) },
      include: { illustrations: { orderBy: { sceneIndex: 'asc' } } },
    });
    return { success: true, data: storyResponse(updatedStory) };
  });

  fastify.put<{ Params: StoryParams; Body: UpdateStoryBody }>('/:id', async (request, reply) => {
    const userId = request.user?.id;
    const { id } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const parseResult = updateStorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, message: 'Invalid request body', errors: parseResult.error.errors });
    }
    const story = await fastify.prisma.story.findFirst({ where: { id, userId } });
    if (!story) {
      return reply.status(404).send({ success: false, message: 'Story not found' });
    }

    let nextStoryboard = parseStoryboard(story.scenes, story.title);
    if (parseResult.data.storyboard) {
      nextStoryboard = mergeStoryboard(story, parseResult.data.storyboard);
    } else if (parseResult.data.scenes) {
      nextStoryboard = buildStoryboardFromSceneInput(story.title, parseResult.data.scenes);
    }

    const nextContent = parseResult.data.content ?? storyContentFromStoryboard(nextStoryboard, story.content);
    const updatedStory = await fastify.prisma.story.update({
      where: { id },
      data: { content: nextContent, scenes: storyboardToStorage(nextStoryboard) },
      include: { illustrations: { orderBy: { sceneIndex: 'asc' } } },
    });
    return { success: true, data: storyResponse(updatedStory) };
  });

  // 修复: Story 删除改为软删除, 保留 Illustration/Video/SceneAudio 给用户查看
  fastify.delete<{ Params: StoryParams }>('/:id', async (request, reply) => {
    const userId = request.user?.id;
    const { id } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    const story = await fastify.prisma.story.findFirst({ where: { id, userId } });
    if (!story) {
      return reply.status(404).send({ success: false, message: 'Story not found' });
    }
    // 软删除: 设置 status='deleted', 不删除关联的 Illustration/Video/SceneAudio
    await fastify.prisma.story.update({
      where: { id },
      data: { status: 'deleted' },
    });
    return { success: true, message: 'Story deleted' };
  });
}



