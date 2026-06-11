import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load the repository root .env before anything else.
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { prisma } from './config/database.js';
import 'dotenv/config';
import { authRoutes } from './routes/auth/index.js';
import { characterRoutes } from './routes/character/index.js';
import { storyRoutes } from './routes/story/index.js';
import { illustrationRoutes } from './routes/illustration/index.js';
import { illustrationEventsRoutes } from './routes/illustration-events.js';
import { audiobookRoutes } from './routes/audiobook/index.js';
import { videoRoutes } from './routes/video/index.js';
import { pdfRoutes } from './routes/pdf/index.js';
import { videoEventsRoutes } from './routes/video-events.js';
import { voiceRoutes } from './routes/voice/index.js';
import { orderRoutes } from './routes/order/index.js';
import { membershipRoutes } from './routes/membership/index.js';
import { adminRoutes } from './routes/admin/index.js';
import { styleRoutes } from './routes/style/index.js';
import { assetsRoutes } from './routes/assets/index.js';
import { healthRoutes } from './routes/health/index.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { initializeWorkers, shutdownWorkers } from './jobs/index.js';
import { startOrderCleanupScheduler, stopOrderCleanupScheduler } from './services/payment.service.js';
import { initRemotionHealthCheck } from './services/video.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {

  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
    keepAliveTimeout: 600000,     // 10 min for long AI generation
    connectionTimeout: 600000,    // 10 min for long AI generation
    requestTimeout: 600000,       // 10 min for long AI generation
  });

  // Plugins - allow all origins for development
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // JWT secret — default to dev fallback if not set (not for production)
  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET not set, using development fallback');
    process.env.JWT_SECRET = 'ipro-dev-secret-fallback-not-for-production';
  }

  await app.register(jwt, {
    secret: process.env.JWT_SECRET,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  await app.register(staticPlugin, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // Decorate with prisma and authenticate
  app.decorate('prisma', prisma);
  app.decorate('authenticate', authMiddleware);

  // Middleware
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Detailed subsystem health (no auth) — mounted under /api/health
  await app.register(healthRoutes, { prefix: '/api/health' });

  // Public routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Protected routes
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', app.authenticate);

    await protectedApp.register(characterRoutes, { prefix: '/api/characters' });
    await protectedApp.register(storyRoutes, { prefix: '/api/stories' });
    await protectedApp.register(illustrationRoutes, { prefix: '/api/stories' });
    await protectedApp.register(illustrationEventsRoutes, { prefix: '/api/stories' });
    await protectedApp.register(audiobookRoutes, { prefix: '/api/stories' });
    await protectedApp.register(videoRoutes, { prefix: '/api/stories' });
    await protectedApp.register(pdfRoutes, { prefix: '/api/stories' });
    await protectedApp.register(videoEventsRoutes, { prefix: '/api/videos' });
    await protectedApp.register(voiceRoutes, { prefix: '/api/voices' });
    await protectedApp.register(orderRoutes, { prefix: '/api/orders' });
    await protectedApp.register(membershipRoutes, { prefix: '/api/membership' });
    await protectedApp.register(styleRoutes, { prefix: '/api/styles' });
  });

  // Protected routes - assets
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', app.authenticate);
    await protectedApp.register(assetsRoutes, { prefix: '/api/assets' });
  });

  // Admin routes - mounted inside the same protectedApp so the JWT authenticate
  // preHandler runs before adminMiddleware; otherwise request.user is empty and
  // every admin call returns 401.
  await app.register(async (adminApp) => {
    adminApp.addHook('preHandler', app.authenticate);
    await adminApp.register(adminRoutes, { prefix: '/api/admin' });
  });

// Start
  try {
    // Initialize Remotion health check (non-blocking warning)
    initRemotionHealthCheck().catch(err => {
      console.warn('[Video] Remotion health check failed:', err.message);
    });

    // Initialize job workers (only if Redis is available)
    if (process.env.REDIS_HOST) {
      try {
        await initializeWorkers();
        console.log('Job workers initialized');
      } catch (workerError) {
        console.warn('Failed to initialize job workers (Redis may not be available):', workerError);
      }
    } else {
      console.log('Redis not configured, skipping job workers');
    }

    await app.listen({ port: 3001, host: '0.0.0.0' });
    console.log('🚀 Server running at http://localhost:3001');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

// Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    stopOrderCleanupScheduler();
    await app.close();
    await shutdownWorkers();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start order cleanup scheduler
  startOrderCleanupScheduler();
}

main();

