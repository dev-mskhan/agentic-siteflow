import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import type { FastifyBaseLogger } from 'fastify';

export interface TrpcContext {
  requestId: string;
  logger: FastifyBaseLogger;
}

export function createContext({ req }: CreateFastifyContextOptions): TrpcContext {
  return {
    requestId: String(req.id),
    logger: req.log,
  };
}
