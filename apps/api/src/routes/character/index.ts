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
});

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
      where: { userId },
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

      // Build full URL for apiz.ai to access (works when OSS configured)
      const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
      const fullUrl = `${baseUrl}${originalPhotoUrl}`;

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

      // Async: extract character features using vision LLM
      extractCharacterFeatures(fullUrl)
        .then((featureDesc) => {
          if (featureDesc) {
            fastify.prisma.character.update({
              where: { id: character.id },
              data: { featureDesc },
            }).then(() => {
              fastify.log.info(`[Upload] Feature desc extracted for character ${character.id}: ${featureDesc.slice(0, 50)}`);
            }).catch((e) => {
              fastify.log.warn(`[Upload] Feature desc update skipped: ${e.message}`);
            });
          }
        })
        .catch((e) => {
          fastify.log.warn(`[Upload] Feature extraction skipped: ${e.message}`);
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

      const { style, title } = parseResult.data;

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

      // Update status to processing
      await fastify.prisma.character.update({
        where: { id },
        data: { status: 'processing' },
      });

      try {
        // Use the user's uploaded photo directly
        const imageUrl = character.originalPhotoUrl;
        fastify.log.info(`[Stylize] Using uploaded photo: ${imageUrl}`);

        // Generate stylized image
        const stylizedPhotoUrl = await stylizeCharacter(imageUrl, style, title);

        // Step 3: Upload the result back to素材库 for next iteration in the background.
        if (stylizedPhotoUrl) {
          uploadToApizAsset(
              stylizedPhotoUrl,
              `${style}-${character.id.slice(0, 8)}`,
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

        return {
          success: true,
          data: {
            characterId: updatedCharacter.id,
            stylizedPhotoUrl: updatedCharacter.stylizedPhotoUrl,
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

          return {
            success: true,
            data: {
              characterId: recoveredCharacter.id,
              stylizedPhotoUrl: recoveredCharacter.stylizedPhotoUrl,
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
