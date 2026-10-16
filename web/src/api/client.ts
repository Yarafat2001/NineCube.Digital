import type { ProblemDetails, ShortItem } from './types';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:5080';

/**
 * One error type for the whole app. It exposes exactly what the UI needs to render a
 * useful message: the HTTP status, the machine-readable code, the correlation id (so a
 * user can quote it in a ticket) and the per-field errors.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly shortItems: ShortItem[];
  readonly currentStatus?: string;
  readonly attemptedStatus?: string;
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails, status: number) {
    super(problem.detail ?? problem.title ?? 'The request failed.');
    this.name = 'ApiError';
    this.problem = problem;
    this.status = status;
    this.code = problem.code ?? (status === 0 ? 'network_error' : 'error');
    this.correlationId = problem.correlationId;
    this.fieldErrors = problem.errors ?? {};
    this.shortItems = problem.shortItems ?? [];
    this.currentStatus = problem.currentStatus;
    this.attemptedStatus = problem.attemptedStatus;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isInsufficientStock(): boolean {
    return this.code === 'insufficient_stock';
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/** The auth layer registers a handler so any 401 sends the user back to the login screen. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, idempotencyKey, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (cause) {
    if ((cause as Error)?.name === 'AbortError') throw cause;

    throw new ApiError(
      {
        title: 'Cannot reach the server.',
        detail: `The API at ${API_BASE_URL} did not respond. Check that it is running and try again.`,
        code: 'network_error'
      },
      0
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? safeJson(text) : undefined;

  if (!response.ok) {
    const problem = (payload as ProblemDetails | undefined) ?? {
      title: response.statusText || 'The request failed.',
      status: response.status
    };

    const error = new ApiError(problem, response.status);

    if (error.isUnauthorized && onUnauthorized) onUnauthorized();

    throw error;
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { title: 'Unexpected response', detail: text.slice(0, 400) };
  }
}

/** Human readable summary of an ApiError, with the correlation id appended when present. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const suffix = error.correlationId ? ` (ref ${error.correlationId})` : '';
    return `${error.message}${suffix}`;
  }

  if (error instanceof Error) return error.message;

  return 'Something went wrong.';
}

/**
 * Only uploaded media is served by the API (the /uploads physical provider). Any other
 * root-relative path belongs to the app's own static folder, so qualifying it with the API origin
 * would point at a file the API does not have - which is how the seeded catalogue photos 404ed.
 */
export function resolveAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  if (url.startsWith('/uploads/')) return `${API_BASE_URL}${url}`;
  // App-owned static file: prefix the Vite base so it resolves under a subpath host (GitHub Pages).
  if (url.startsWith('/')) return `${import.meta.env.BASE_URL}${url.slice(1)}`;
  return url;
}

/** Multipart upload: the browser sets the boundary, so no JSON encoding happens here. */
export async function apiUpload<T>(path: string, form: FormData, token?: string | null): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form
    });
  } catch {
    throw new ApiError({ title: 'Cannot reach the server.', code: 'network_error' }, 0);
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : undefined;

  if (!response.ok) {
    throw new ApiError((payload as ProblemDetails | undefined) ?? { title: response.statusText || 'Upload failed.', status: response.status }, response.status);
  }

  return payload as T;
}
