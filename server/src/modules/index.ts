import type { AnyRouter } from '@trpc/server';
import authRouter, { name as authName } from './auth';
import organizationsRouter, { name as organizationsName } from './organizations';
import projectsRouter, { name as projectsName } from './projects';
import tasksRouter, { name as tasksName } from './tasks';
import subcontractorsRouter, { name as subcontractorsName } from './subcontractors';
import procurementRouter, { name as procurementName } from './procurement';
import documentsRouter, { name as documentsName } from './documents';
import paymentsRouter, { name as paymentsName } from './payments';
import notificationsRouter, { name as notificationsName } from './notifications';
import dashboardRouter, { name as dashboardName } from './dashboard';
import aiRouter, { name as aiName } from './ai';

export interface ModuleDefinition {
  name: string;
  router: AnyRouter;
}

export const registeredModules: ModuleDefinition[] = [
  { name: authName, router: authRouter },
  { name: organizationsName, router: organizationsRouter },
  { name: projectsName, router: projectsRouter },
  { name: tasksName, router: tasksRouter },
  { name: subcontractorsName, router: subcontractorsRouter },
  { name: procurementName, router: procurementRouter },
  { name: documentsName, router: documentsRouter },
  { name: paymentsName, router: paymentsRouter },
  { name: notificationsName, router: notificationsRouter },
  { name: dashboardName, router: dashboardRouter },
  { name: aiName, router: aiRouter },
];
