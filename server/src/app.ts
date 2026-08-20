import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import type { LoggerOptions } from 'pino';
import type { Env } from './config/env';
import { createLoggerOptions } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { TRPCError } from '@trpc/server';
import { appRouter } from './trpc/root';
import { createContext } from './trpc/context';

export interface ReadyCheck {
  name: string;
  check: () => Promise<void>;
}

export interface AppDeps {
  env: Env;
  logger?: LoggerOptions;
  readyChecks?: ReadyCheck[];
}

export function buildApp({
  env,
  logger = createLoggerOptions(env),
  readyChecks = [],
}: AppDeps): FastifyInstance {
  const app = Fastify({
    logger,
    trustProxy: true,
    bodyLimit: 1_000_000,
    genReqId: (req) => String(req.headers['x-request-id'] ?? randomUUID()),
  });

  app.addHook('onRequest', (req, reply, done) => {
    reply.header('X-Request-Id', req.id);
    done();
  });

  app.register(helmet);
  app.register(cors, {
    origin: env.CLIENT_URL.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
    }),
  });

  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/ready', async (_req, reply) => {
    const results: { name: string; status: string }[] = [];
    let healthy = true;
    for (const check of readyChecks) {
      try {
        await check.check();
        results.push({ name: check.name, status: 'ok' });
      } catch {
        healthy = false;
        results.push({ name: check.name, status: 'error' });
      }
    }
    reply
      .code(healthy ? 200 : 503)
      .send({ status: healthy ? 'ready' : 'not_ready', checks: results });
  });

  app.register(fastifyTRPCPlugin, {
    prefix: '/api/v1',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError: ({ error, path }: { error: TRPCError; path?: string }) => {
        app.log.warn({ path, code: error.code, cause: error.cause }, 'trpc error');
      },
    },
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  return app;
}
