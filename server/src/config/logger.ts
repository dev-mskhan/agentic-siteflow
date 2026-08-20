import pino, { type Logger, type LoggerOptions } from 'pino';
import type { Env } from './env';

export function createLoggerOptions(env: Env): LoggerOptions {
  const transport =
    env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined;

  return {
    level: env.LOG_LEVEL,
    base: { service: 'siteflow-server', env: env.NODE_ENV },
    transport,
  };
}

export function createStandaloneLogger(env: Env): Logger {
  return pino(createLoggerOptions(env));
}
