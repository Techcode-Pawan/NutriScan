import { Platform } from 'react-native';

/**
 * Backend base URL. Set EXPO_PUBLIC_API_URL in apps/mobile/.env:
 *  - Android emulator: http://10.0.2.2:4000  (the emulator's alias for the host machine)
 *  - Physical device:  http://<your computer's LAN IP>:4000  (same Wi-Fi network)
 *  - Web / iOS simulator: http://localhost:4000
 * Only the URL lives in the app; no secrets are ever bundled.
 */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000')
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let tokenGetter: () => string | null = () => null;
let onUnauthorized: () => void = () => undefined;

export function configureApi(opts: { getToken: () => string | null; onUnauthorized: () => void }) {
  tokenGetter = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
  auth?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = opts.auth === false ? null : tokenGetter();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    throw new ApiError(
      0,
      aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      aborted
        ? 'The server took too long to respond. Please try again.'
        : `Cannot reach the NutriScan server at ${API_URL}. Check your connection and the API address.`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return { data: undefined as T };
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body (e.g. proxy error page)
  }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json as { data: T; meta?: any };
}

export const api = {
  get: <T>(path: string) => request<T>(path).then((r) => r.data),
  getWithMeta: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, timeoutMs?: number) => request<T>(path, { method: 'POST', body: body ?? {}, timeoutMs }).then((r) => r.data),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }).then((r) => r.data),
  upload: <T>(path: string, form: FormData, timeoutMs = 60000) => request<T>(path, { method: 'POST', form, timeoutMs }).then((r) => r.data),
};

/** Appends a picked image to FormData in the format each platform's fetch expects. */
export async function appendImage(form: FormData, field: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const type = asset.mimeType ?? 'image/jpeg';
  const name = asset.fileName ?? `photo.${type.split('/')[1] ?? 'jpg'}`;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append(field, blob, name);
  } else {
    // React Native's FormData accepts { uri, name, type } file descriptors.
    form.append(field, { uri: asset.uri, name, type } as unknown as Blob);
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Something went wrong. Please try again.';
}
