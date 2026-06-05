/**
 * PDF Export Routes
 *
 * GET /api/stories/:id/pdf - Stream a generated PDF of the story
 */

import { FastifyInstance } from 'fastify';
import { generateStoryPDF } from '../../services/pdf.service.js';

export async function pdfRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { id: string };
  }>('/:id/pdf', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      const pdfBuffer = await generateStoryPDF(request.params.id, userId);
      const filename = `ipro-story-${request.params.id.slice(0, 8)}.pdf`;
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`绘本-${Date.now()}.pdf`)}`)
        .header('Content-Length', String(pdfBuffer.length))
        .send(pdfBuffer);
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to generate PDF';
      return reply.status(500).send({ success: false, message, code: 'PDF_GENERATION_FAILED' });
    }
  });
}

export default pdfRoutes;
