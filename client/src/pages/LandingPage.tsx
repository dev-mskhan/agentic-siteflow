import { useSelector } from 'react-redux';
import { useApiHealth, useApiReady } from '../hooks/useApiHealth';
import type { RootState } from '../store';
import { cn } from '../lib/cn';

const modules = [
  'auth',
  'organizations',
  'projects',
  'tasks',
  'subcontractors',
  'procurement',
  'documents',
  'payments',
  'notifications',
  'dashboard',
  'ai',
];

function StatusPill() {
  const health = useApiHealth();
  const ready = useApiReady();

  if (health.isLoading) {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        Checking…
      </span>
    );
  }

  if (health.isError || health.data?.status !== 'ok') {
    return (
      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
        API unavailable
      </span>
    );
  }

  const allReady = ready.data?.status === 'ready';
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium',
        allReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
      )}
    >
      {allReady ? 'Online' : 'Degraded'}
    </span>
  );
}

export function LandingPage() {
  const title = useSelector((state: RootState) => state.ui.title);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex flex-col items-start gap-6">
        <StatusPill />
        <h1 className="text-5xl font-bold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-lg text-slate-600">
          The construction operations platform for projects, subcontractors, procurement, documents,
          and payments — built as a modular monolith, with AI orchestration planned for later
          phases.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Registered modules
          </h2>
          <ul className="flex flex-wrap gap-2">
            {modules.map((name) => (
              <li
                key={name}
                className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm text-slate-700"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
