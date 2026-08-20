import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { Env } from './env';

export function createSocketServer(httpServer: HttpServer, env: Env): SocketServer {
  return new SocketServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: env.CLIENT_URL.split(',').map((origin) => origin.trim()),
      credentials: true,
    },
  });
}
