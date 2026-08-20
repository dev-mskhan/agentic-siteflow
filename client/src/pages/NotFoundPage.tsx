import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-4xl font-bold">Page not found</h1>
      <p className="text-slate-600">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Back to overview
      </Link>
    </section>
  );
}
