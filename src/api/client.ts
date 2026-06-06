import { getToken, clearToken } from '../utils/storage';
import type { ApiError } from './types';

const BASE_URL = 'https://api.example.com';

type OnUnauthorized = () => void;

let onUnauthorized: OnUnauthorized | null = null;

export function setUnauthorizedHandler(handler: OnUnauthorized): void {
  onUnauthorized = handler;
}

export class ApiClientError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string[]>;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    return await response.json();
  } catch {
    return { error: response.statusText || 'Request failed' };
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`Server error: ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Network error');
    }
    if (attempt < retries) {
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  throw lastError ?? new Error('Request failed');
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; skipRetry?: boolean } = {}
): Promise<T> {
  const { skipAuth, skipRetry, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);

  if (!skipAuth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${BASE_URL}${path}`;
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const isIdempotentGet = method === 'GET' && !skipRetry;

  const response = isIdempotentGet
    ? await fetchWithRetry(url, { ...fetchOptions, headers })
    : await fetch(url, { ...fetchOptions, headers });

  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
    const body = await parseError(response);
    throw new ApiClientError(401, body);
  }

  if (!response.ok) {
    const body = await parseError(response);
    throw new ApiClientError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
