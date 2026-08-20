import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isHttpError } from '../common/http-error';

export type FastifyErrorHandler = (
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void> | void;

export const errorHandler: FastifyErrorHandler = (err, request, reply) => {
  const status = isHttpError(err) ? err.status : 500;
  const code = isHttpError(err) ? err.code : 'INTERNAL_ERROR';

  if (status >= 500) {
    request.log.error({ err }, 'unhandled error');
  } else {
    request.log.warn({ err }, 'request error');
  }

  reply.code(status).send({
    error: {
      code,
      message: status >= 500 ? 'Internal server error' : err.message,
    },
  });
};

export const zodValidationHandler: FastifyErrorHandler = (err, _request, reply) => {
  if (err instanceof ZodError) {
    reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }
  throw err;
};

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  request.log.debug({ method: request.method, url: request.url }, 'route not found');
  reply.code(404).send({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
}
