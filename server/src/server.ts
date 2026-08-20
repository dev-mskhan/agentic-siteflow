import { buildApp } from './app';
import { setupInfra } from './config';
import { loadEnv } from './config/env';
import { createLoggerOptions, createStandaloneLogger } from './config/logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const infra = await setupInfra(env, createStandaloneLogger(env));
  const app = buildApp({
    env,
    logger: createLoggerOptions(env),
    readyChecks: infra.readyChecks,
  });

  await app.ready();

  app.listen({ port: env.PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      infra.logger.fatal({ err }, 'failed to start server');
      process.exit(1);
    }
    infra.logger.info({ port: env.PORT }, 'server listening');
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    infra.logger.info({ signal }, 'shutdown requested');

    const forceExit = setTimeout(() => {
      infra.logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    void app.close().then(async () => {
      await infra.close();
      infra.logger.info('shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    infra.logger.error({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    infra.logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
  });
}

main().catch((err) => {
  process.stderr.write(
    `Fatal startup error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
