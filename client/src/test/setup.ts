import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    const isHealth = href.includes('/health');
    const isReady = href.includes('/ready');
    return new Response(
      JSON.stringify(
        isHealth
          ? { status: 'ok', uptime: 1 }
          : isReady
            ? { status: 'ready', checks: [{ name: 'postgres', status: 'ok' }] }
            : { error: { code: 'NOT_FOUND', message: 'not found' } },
      ),
      { status: isHealth || isReady ? 200 : 404, headers: { 'Content-Type': 'application/json' } },
    );
  }),
);
