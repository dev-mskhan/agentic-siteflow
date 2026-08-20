import { Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="inline-block h-7 w-7 rounded-lg bg-slate-900">
              <svg viewBox="0 0 32 32" className="h-full w-full p-1">
                <path
                  d="M16 4 6 9v8c0 7 4.6 10.6 10 12 5.4-1.4 10-5 10-12V9L16 4z"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
                <path
                  d="M16 11l-4 1.8v3.4c0 2.4 1.5 3.7 4 4.8 2.5-1.1 4-2.4 4-4.8v-3.4L16 11z"
                  fill="#38bdf8"
                />
              </svg>
            </span>
            SiteFlow AI
          </a>
          <nav className="flex items-center gap-6 text-sm text-slate-600">
            <a href="/" className="transition-colors hover:text-slate-900">
              Overview
            </a>
            <a
              href="#"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-white transition-opacity hover:opacity-90"
            >
              Get started
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        SiteFlow AI — construction operations platform. Phase 0 foundation.
      </footer>
    </div>
  );
}
