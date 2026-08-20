const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const apiBase = rawApiUrl.replace(/\/+$/, '');
const serverOrigin = apiBase === '/api' ? '' : apiBase.replace(/\/api$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = { error: { message: response.statusText } };
    }
    throw new ApiError(response.status, body);
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T, B = unknown>(path: string, body: B): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T, B = unknown>(path: string, body: B): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};

export interface HealthResponse {
  status: string;
  uptime?: number;
}

export interface ReadyResponse {
  status: string;
  checks: { name: string; status: string }[];
}

export const healthApi = {
  check: () => fetch(`${serverOrigin}/health`).then((r) => r.json() as Promise<HealthResponse>),
  ready: () => fetch(`${serverOrigin}/ready`).then((r) => r.json() as Promise<ReadyResponse>),
};

export const serverOriginUrl = serverOrigin;
