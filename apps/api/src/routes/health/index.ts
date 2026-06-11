/**
 * Health check route
 *
 * GET /api/health
 *
 * Reports per-subsystem status for dev/ops to localize a failure in ~1 second
 * instead of staring at logs.
 *
 * Subsystems:
 *   - web      : Next.js frontend (pings itself via 127.0.0.1:3000)
 *   - api      : this Fastify process (always ok if it answered)
 *   - db       : Prisma + SQLite (`$queryRaw SELECT 1`)
 *   - redis    : ioredis PING (not_configured is not a failure)
 *   - apiz.ai  : ChatGPT Images 2.0 provider (not_tested if no key)
 *   - storage  : COS / OSS / local (env-presence check)
 *
 * Overall status:
 *   - healthy   : every subsystem ok / not_configured / not_tested
 *   - degraded  : at least one non-critical subsystem failed
 *   - unhealthy : db (critical) failed
 *
 * Each subsystem is wrapped in a 1s timeout so the endpoint always returns
 * within ~5s even when an external dependency hangs.
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database.js';
import { getRedisClient } from '../../config/redis.js';

const SUB_TIMEOUT_MS = 1000;

type SubStatus = 'ok' | 'failed' | 'not_configured' | 'not_tested';

interface SubReport {
  status: SubStatus;
  detail?: string;
  latencyMs?: number;
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkApi(): Promise<SubReport> {
  // The API answered, so it's up.
  return { status: 'ok', latencyMs: 0 };
}

async function checkDb(): Promise<SubReport> {
  const started = Date.now();
  try {
    await withTimeout(
      () => prisma.$queryRaw`SELECT 1`,
      SUB_TIMEOUT_MS,
      'db',
    );
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (err) {
    return {
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

async function checkRedis(): Promise<SubReport> {
  const started = Date.now();
  // No host configured at all — not a failure, just unused.
  if (!process.env.REDIS_HOST) {
    return { status: 'not_configured', detail: 'REDIS_HOST not set' };
  }
  const client = getRedisClient();
  if (!client) {
    return { status: 'not_configured', detail: 'redis client not initialized' };
  }
  try {
    const reply = await withTimeout(() => client.ping(), SUB_TIMEOUT_MS, 'redis');
    if (reply === 'PONG') {
      return { status: 'ok', latencyMs: Date.now() - started };
    }
    return {
      status: 'failed',
      detail: `unexpected reply: ${reply}`,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

async function checkApiz(): Promise<SubReport> {
  // Not a hard dependency right now (apiz is wired into illustration flow but
  // we don't want to ping their endpoint on every health check). Surface
  // whether the key is present so ops can spot misconfiguration fast.
  if (!process.env.APIZ_API_KEY) {
    return { status: 'not_tested', detail: 'APIZ_API_KEY not set' };
  }
  return {
    status: 'not_tested',
    detail: 'key present; live ping skipped to avoid burning quota',
  };
}

async function checkStorage(): Promise<SubReport> {
  const cos = !!(
    process.env.COS_SECRET_ID &&
    process.env.COS_SECRET_KEY &&
    process.env.COS_BUCKET &&
    process.env.COS_REGION
  );
  const oss = !!(
    process.env.OSS_ACCESS_KEY_ID &&
    process.env.OSS_ACCESS_KEY_SECRET &&
    process.env.OSS_BUCKET
  );
  if (cos) return { status: 'ok', detail: 'cos' };
  if (oss) return { status: 'ok', detail: 'oss' };
  return { status: 'ok', detail: 'local (no COS/OSS env, falling back to public/uploads)' };
}

async function checkWeb(): Promise<SubReport> {
  const port = process.env.WEB_PORT || '3000';
  const started = Date.now();
  try {
    const res = await withTimeout(
      () => fetch(`http://127.0.0.1:${port}/`, { method: 'GET' }),
      SUB_TIMEOUT_MS,
      'web',
    );
    if (res.ok) {
      return { status: 'ok', latencyMs: Date.now() - started, detail: `HTTP ${res.status}` };
    }
    return {
      status: 'failed',
      detail: `HTTP ${res.status}`,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    const [api, db, redis, apiz, storage, web] = await Promise.all([
      checkApi(),
      checkDb(),
      checkRedis(),
      checkApiz(),
      checkStorage(),
      checkWeb(),
    ]);

    const subs = { api, db, redis, apiz, storage, web };

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (db.status === 'failed') {
      overall = 'unhealthy';
    } else if (
      redis.status === 'failed' ||
      storage.status === 'failed' ||
      web.status === 'failed' ||
      api.status === 'failed'
    ) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const httpStatus = overall === 'unhealthy' ? 503 : 200;

    return reply.status(httpStatus).send({
      status: overall,
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version || 'unknown',
      env: process.env.NODE_ENV || 'development',
      subsystems: subs,
    });
  });
}

export default healthRoutes;