import { publicProcedure, router, mergeRouters } from './trpc';
import { registeredModules } from '../modules';

const metaRouter = router({
  app: router({
    status: publicProcedure.query(() => ({
      service: 'siteflow-server',
      modules: registeredModules.map((m) => m.name),
    })),
  }),
});

export const appRouter = mergeRouters(metaRouter, ...registeredModules.map((m) => m.router));

export type AppRouter = typeof appRouter;
