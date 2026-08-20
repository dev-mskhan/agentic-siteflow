import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../src/middleware/error';
import { HttpError } from '../src/common/http-error';

function makeReply(): FastifyReply {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

function makeRequest(
  log: Partial<{ error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }> = {},
): FastifyRequest {
  return { log: { error: vi.fn(), warn: vi.fn(), ...log } } as unknown as FastifyRequest;
}

describe('error middleware', () => {
  it('maps HttpError to its status code', () => {
    const reply = makeReply();
    errorHandler(new HttpError(409, 'CONFLICT', 'already exists'), makeRequest({}), reply);
    expect(reply.code).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'already exists' },
    });
  });

  it('masks internal errors', () => {
    const reply = makeReply();
    errorHandler(new Error('db password leaked'), makeRequest({}), reply);
    expect(reply.code).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('logs server errors through the request logger', () => {
    const reply = makeReply();
    const logError = vi.fn();
    errorHandler(new Error('boom'), makeRequest({ error: logError }), reply);
    expect(logError).toHaveBeenCalled();
  });

  it('notFoundHandler returns JSON 404', () => {
    const reply = makeReply();
    const log = { debug: vi.fn() };
    notFoundHandler({ log } as unknown as FastifyRequest, reply);
    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });
});
