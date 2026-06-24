import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uploadFile } from '../../config/oss.js';
import { stylizeCharacter, uploadToApizAsset, extractCharacterFeatures } from '../../services/ai.service.js';
import { z } from 'zod';

interface CharacterParams {
  id: string;
}

interface StylizeBody {
  // Preset enum OR a custom user-defined style. Mirrors the AI service
  // StyleInput union so the public surface accepts both shapes.
  style:
    | 'pixar'
    | 'ghibli'
    | 'clay'
    | 'handdrawn'
    | 'watercolor'
    | 'paper'
    | 'comic'
    | 'papercut'
    | { prompt: string; id?: string; name?: string };
  title?: string;
  storyId?: string;
}

// Validation schemas. The `style` field accepts either one of the 8 preset
// keys (string) or a { prompt, id?, name? } object describing a CustomStyle
// row. When the object is passed, the AI service bypasses the preset prompt
// map and uses the user's prompt directly as the styleSuffix.
const stylizeSchema = z.object({
  style: z
    .union([
      z.enum(['pixar', 'ghibli', 'clay', 'handdrawn', 'watercolor', 'paper', 'comic', 'papercut']),
      z.object({
        prompt: z.string().trim().min(1, 'Prompt is required').max(2000, 'Prompt must be 1-2000 characters'),
        id: z.string().optional(),
        name: z.string().optional(),
      }),
    ])
    .default('pixar'),
  title: z.string().max(200).optional(),
  storyId: z.string().optional(),
});

function getPublicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
}

function toPublicUrl(url: string): string {
  if (/^(https?:)?\/\//i.test(url) || /^data:/i.test(url)) {
    return url.startsWith('//') ? `https:${url}` : url;
  }
  if (url.startsWith('/')) {
    return `${getPublicBaseUrl()}${url}`;
  }
  return url;
}

function styleAssetName(style: StylizeBody['style'], characterId: string): string {
  const styleName = typeof style === 'string'
    ? style
    : (style.id || style.name || 'custom').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';
  return `${styleName}-${characterId.slice(0, 8)}`;
}

async function updateStoryStylizedUrl(
  fastify: FastifyInstance,
  storyId: string | undefined,
  userId: string,
  characterId: string,
  stylizedPhotoUrl: string | null
): Promise<boolean> {
  if (!storyId || !stylizedPhotoUrl) return false;
  const result = await fastify.prisma.story.updateMany({
    where: { id: storyId, userId, characterId },
    data: { characterStylizedUrl: stylizedPhotoUrl },
  });
  return result.count > 0;
}

export async function characterRoutes(fastify: FastifyInstance) {
  // GET /api/characters - Get user's character list
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
      });
    }

    const characters = await fastify.prisma.character.findMany({
      where: {
        userId,
        OR: [
          { status: 'pending' },           // 未风格化的保留
          { status: 'completed' },         // 已风格化的保留
          { stylizedPhotoUrl: { not: null } }, // 有风格化图的保留
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: characters,
    };
  });

  // GET /api/characters/:id - Get character details
  fastify.get<{ Params: CharacterParams }>(
    '/:id',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = request.user?.id;
      const { id } = request.params;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: 'Unauthorized',
        });
      }

      const character = await fastify.prisma.character.findFirst({
        where: { id, userId },
      });

      if (!character) {
        return reply.status(404).send({
          success: false,
          message: 'Character not found',
        });
      }

      return {
        success: true,
        data: character,
      };
    }
  );

  
  // POST /api/characters/dev-seed - Create a test character for local flow debugging
  fastify.post('/dev-seed', {
    preHandler: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
      });
    }

    const character = await fastify.prisma.character.create({
      data: {
        userId,
        originalPhotoUrl: '/brand/ipro-book.svg',
        stylizedPhotoUrl: '/styles/pixar.svg',
        featureDesc: '测试角色：用于本地联调创作流程',
        status: 'completed',
      },
    });

    return {
      success: true,
      data: {
        characterId: character.id,
        originalPhotoUrl: character.originalPhotoUrl,
        stylizedPhotoUrl: character.stylizedPhotoUrl,
        featureDesc: character.featureDesc,
      },
    };
  });
  // POST /api/characters/upload - Upload photo to OSS
  fastify.post('/upload', {
    preHandler: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
      });
    }

    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          success: false,
          message: 'No file uploaded',
        });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(data.mimetype)) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
        });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const ext = data.mimetype.split('/')[1];
      const filename = `characters/${userId}/${timestamp}.${ext}`;
      const buffer = await data.toBuffer();

      const result = await uploadFile(filename, buffer, { contentType: data.mimetype });
      const originalPhotoUrl = result.url;

      // Create character record
      const character = await fastify.prisma.character.create({
        data: {
          userId,
          originalPhotoUrl,
          status: 'pending',
        },
      });

      // Build full URL for apiz.ai to access.
      const fullUrl = toPublicUrl(originalPhotoUrl);

      // Naming convention: {userId}_{timestamp}
      const extLabel = ext === 'jpeg' ? 'jpg' : ext;
      const assetName = `${userId}_${timestamp}.${extLabel}`;

      // Async: upload to apiz.ai素材库 for future image-to-image
      uploadToApizAsset(fullUrl, assetName, 'ipro-characters')
        .then((assetUrl) => {
          if (assetUrl) {
            fastify.log.info(`[Upload] Photo synced to素材库: ${assetName} -> ${assetUrl}`);
          }
        })
        .catch((e) => {
          fastify.log.warn(`[Upload]素材库 sync skipped: ${e.message}`);
        });

      // Async: extract character identity (appearance + hard identity fields)
      // using vision LLM. Stores all five fields back into the Character row
      // so the story generator and illustration pipeline can enforce the
      // gender / age / species contract on every subsequent call.
      extractCharacterFeatures(fullUrl)
        .then((identity) => {
          fastify.prisma.character.update({
            where: { id: character.id },
            data: {
              featureDesc: identity.featureDesc || null,
              gender: identity.gender,
              ageBand: identity.ageBand,
              subjectKind: identity.subjectKind,
              characterName: identity.characterName || null,
            },
          }).then(() => {
            fastify.log.info(
              `[Upload] Identity extracted for character ${character.id}: ` +
              `gender=${identity.gender} ageBand=${identity.ageBand} subjectKind=${identity.subjectKind} ` +
              `feature="${identity.featureDesc.slice(0, 40)}"`
            );
          }).catch((e) => {
            fastify.log.warn(`[Upload] Identity update skipped: ${e.message}`);
          });
        })
        .catch((e) => {
          fastify.log.warn(`[Upload] Identity extraction skipped: ${e.message}`);
        });

      return {
        success: true,
        data: {
          characterId: character.id,
          originalPhotoUrl: character.originalPhotoUrl,
        },
      };
    } catch (error) {
      fastify.log.error({ error }, '[Upload] Error');
      return reply.status(500).send({
        success: false,
        message: 'Failed to upload photo',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/characters/:id/stylize - Stylize character image
  fastify.post<{ Params: CharacterParams; Body: StylizeBody }>(
    '/:id/stylize',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = request.user?.id;
      const { id } = request.params;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: 'Unauthorized',
        });
      }

      // Validate request body
      const parseResult = stylizeSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid request body',
          errors: parseResult.error.errors,
        });
      }

      const { style, title, storyId } = parseResult.data;

      // Get character
      const character = await fastify.prisma.character.findFirst({
        where: { id, userId },
      });

      if (!character) {
        return reply.status(404).send({
          success: false,
          message: 'Character not found',
        });
      }

      if (!character.originalPhotoUrl) {
        return reply.status(400).send({
          success: false,
          message: 'Character has no original photo',
        });
      }

      if (storyId) {
        const story = await fastify.prisma.story.findFirst({
          where: { id: storyId, userId, characterId: id },
          select: { id: true },
        });
        if (!story) {
          return reply.status(404).send({
            success: false,
            message: 'Story not found for this character',
          });
        }
      }

      // Update status to processing
      await fastify.prisma.character.update({
        where: { id },
        data: { status: 'processing' },
      });

      try {
        // Use the user's uploaded photo directly
        const imageUrl = toPublicUrl(character.originalPhotoUrl);
        fastify.log.info(`[Stylize] Using uploaded photo: ${imageUrl}`);

        // Generate stylized image
        const stylizedPhotoUrl = await stylizeCharacter(imageUrl, style, title);

        // Step 3: Upload the result back to素材库 for next iteration in the background.
        if (stylizedPhotoUrl) {
          uploadToApizAsset(
              stylizedPhotoUrl,
              styleAssetName(style, character.id),
              'ipro-characters'
            )
            .then(() => fastify.log.info(`[Stylize] Result uploaded to素材库`))
            .catch((e) => fastify.log.warn(`[Stylize] Upload to素材库 skipped: ${e.message}`));
        }

        // Update character with stylized photo. Also track the title this
        // costume was generated for so future story creation can decide
        // whether to re-stylize for a new story context.
        const updatedCharacter = await fastify.prisma.character.update({
          where: { id },
          data: {
            stylizedPhotoUrl,
            lastStylizedTitle: title ?? null,
            lastStylizedAt: new Date(),
            status: 'completed',
          },
        });
        const storyUpdated = await updateStoryStylizedUrl(
          fastify,
          storyId,
          userId,
          id,
          updatedCharacter.stylizedPhotoUrl
        );

        return {
          success: true,
          data: {
            characterId: updatedCharacter.id,
            stylizedPhotoUrl: updatedCharacter.stylizedPhotoUrl,
            characterStylizedUrl: storyUpdated ? updatedCharacter.stylizedPhotoUrl : undefined,
            storyId: storyUpdated ? storyId : undefined,
            status: updatedCharacter.status,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (character.stylizedPhotoUrl) {
          fastify.log.warn(
            `[Stylize] Provider failed for ${id}, reusing existing stylized photo: ${errorMessage}`,
          );

          const recoveredCharacter = await fastify.prisma.character.update({
            where: { id },
            data: { status: 'completed' },
          });
          const storyUpdated = await updateStoryStylizedUrl(
            fastify,
            storyId,
            userId,
            id,
            recoveredCharacter.stylizedPhotoUrl
          );

          return {
            success: true,
            data: {
              characterId: recoveredCharacter.id,
              stylizedPhotoUrl: recoveredCharacter.stylizedPhotoUrl,
              characterStylizedUrl: storyUpdated ? recoveredCharacter.stylizedPhotoUrl : undefined,
              storyId: storyUpdated ? storyId : undefined,
              status: recoveredCharacter.status,
            },
          };
        }

        // Reset status on failure when there is no usable previous result.
        await fastify.prisma.character.update({
          where: { id },
          data: { status: 'pending' },
        });

        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          message: 'Failed to stylize character: ' + errorMessage,
        });
      }
    }
  );

  // DELETE /api/characters/:id - Delete character
  // 修复: 删除上传的照片, 但保留风格化好的角色
  // - 未风格化 (status='pending'): 硬删除整个记录
  // - 已风格化 (status='completed'): 只删除 originalPhotoUrl, 保留 stylizedPhotoUrl
  fastify.delete<{ Params: CharacterParams }>(
    '/:id',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = request.user?.id;
      const { id } = request.params;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: 'Unauthorized',
        });
      }

      const character = await fastify.prisma.character.findFirst({
        where: { id, userId },
      });

      if (!character) {
        return reply.status(404).send({
          success: false,
          message: 'Character not found',
        });
      }

      // 修复 (2026-06-18): 统一硬删除整个 Character 记录 (不再是"软删除保留风格化").
      // 历史原因: 之前的"只清 originalPhotoUrl + 保留记录"策略导致前端 listCharacters
      // 还会返回这个角色 (但原图空), 用户点删除后"幽灵角色"依然显示, 体验差.
      //
      // 安全前提: Story.characterStylizedUrl 在故事创建时已经快照到 Story 行,
      // 不依赖 Character 表, 所以硬删 Character 不会破坏已有绘本/插画/封面.
      //
      // detach 步骤: 把所有引用此 character 的 Story.characterId 设为 null,
      // 防止"孤儿引用"导致后续 illustration 流程查 prisma.character.findUnique → null.
      await fastify.prisma.story.updateMany({
        where: { characterId: id },
        data: { characterId: null },
      });

      await fastify.prisma.character.delete({
        where: { id },
      });

      return {
        success: true,
        message: 'Character deleted',
      };
    }
  );

}
