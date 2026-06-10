import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Tailwind color themes the StyleLibrary UI supports. Kept in sync with the
// web client's <StyleLibrary /> color picker. Validation is intentionally a
// list (not a free string) so a malicious client cannot inject arbitrary CSS
// class names via the API.
const ALLOWED_COLOR_THEMES = [
  'orange',
  'sky',
  'emerald',
  'rose',
  'violet',
  'amber',
  'cyan',
  'lime',
] as const;

const ALLOWED_ICON_NAMES = [
  'Sparkles',
  'Palette',
  'Brush',
  'Wand2',
  'Stars',
  'Flame',
  'Snowflake',
  'Sun',
  'Moon',
  'Cloud',
  'Leaf',
  'Flower2',
  'Heart',
  'Crown',
  'Gem',
] as const;

const createStyleSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(30, 'Name must be 1-30 characters'),
  prompt: z.string().trim().min(1, 'Prompt is required').max(2000, 'Prompt must be 1-2000 characters'),
  colorTheme: z.enum(ALLOWED_COLOR_THEMES).default('violet'),
  iconName: z.enum(ALLOWED_ICON_NAMES).default('Sparkles'),
});

const updateStyleSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  prompt: z.string().trim().min(1).max(2000).optional(),
  colorTheme: z.enum(ALLOWED_COLOR_THEMES).optional(),
  iconName: z.enum(ALLOWED_ICON_NAMES).optional(),
});

interface StyleParams {
  id: string;
}

/**
 * Custom-style CRUD routes. All endpoints require the standard JWT auth
 * preHandler (mounted inside the protectedApp in src/index.ts).
 *
 * Routes:
 *   GET    /api/styles        - List the caller's custom styles
 *   POST   /api/styles        - Create a new custom style
 *   PUT    /api/styles/:id    - Update one of the caller's styles
 *   DELETE /api/styles/:id    - Delete one of the caller's styles
 */
export async function styleRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/styles - List current user's custom styles
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const styles = await fastify.prisma.customStyle.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: styles };
  });

  // POST /api/styles - Create a new custom style
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const parseResult = createStyleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid request body',
        errors: parseResult.error.errors,
      });
    }

    const { name, prompt, colorTheme, iconName } = parseResult.data;

    // Cap how many custom styles a single user can create to keep the
    // styleLibrary UI snappy and prevent prompt-abuse storage bloat.
    const MAX_STYLES_PER_USER = 50;
    const existingCount = await fastify.prisma.customStyle.count({ where: { userId } });
    if (existingCount >= MAX_STYLES_PER_USER) {
      return reply.status(400).send({
        success: false,
        message: `已到达自定义风格上限 (${MAX_STYLES_PER_USER})，请先删除一些再创建`,
      });
    }

    const style = await fastify.prisma.customStyle.create({
      data: { userId, name, prompt, colorTheme, iconName },
    });

    return { success: true, data: style };
  });

  // PUT /api/styles/:id - Update one of the caller's styles
  fastify.put<{ Params: StyleParams }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user?.id;
    const { id } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const parseResult = updateStyleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid request body',
        errors: parseResult.error.errors,
      });
    }

    const existing = await fastify.prisma.customStyle.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, message: 'Style not found' });
    }

    const data: Record<string, unknown> = {};
    if (parseResult.data.name !== undefined) data.name = parseResult.data.name;
    if (parseResult.data.prompt !== undefined) data.prompt = parseResult.data.prompt;
    if (parseResult.data.colorTheme !== undefined) data.colorTheme = parseResult.data.colorTheme;
    if (parseResult.data.iconName !== undefined) data.iconName = parseResult.data.iconName;

    const updated = await fastify.prisma.customStyle.update({
      where: { id },
      data,
    });

    return { success: true, data: updated };
  });

  // DELETE /api/styles/:id - Delete one of the caller's styles
  fastify.delete<{ Params: StyleParams }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user?.id;
    const { id } = request.params;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const existing = await fastify.prisma.customStyle.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, message: 'Style not found' });
    }

    await fastify.prisma.customStyle.delete({ where: { id } });

    return { success: true, message: 'Style deleted' };
  });
}
