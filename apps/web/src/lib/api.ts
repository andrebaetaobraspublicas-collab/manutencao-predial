const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retryAfterRefresh = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401 && retryAfterRefresh && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return apiFetch<T>(path, init, false);
  }

  if (!response.ok) {
    const details = await response.json().catch(() => undefined);
    const message =
      details && typeof details === 'object' && 'message' in details
        ? Array.isArray(details.message)
          ? details.message.join(' ')
          : String(details.message)
        : `Falha na solicitação (${response.status}).`;
    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiFileUrl(path: string): string {
  return `${API_URL}${path}`;
}

/** NDJSON import progress from authenticated POST. Percentages come from the
 * server, never from a timer; 100% is emitted only after the transaction commits. */
export async function apiImportStream<T>(path: string, init: RequestInit, onProgress: (phase: string, percent: number) => void, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type','application/json');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (response.status === 401 && retry && await refreshSession()) return apiImportStream(path, init, onProgress, false);
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new ApiError(Array.isArray(details?.message) ? details.message.join(' ') : String(details?.message ?? `Falha na importação (${response.status}).`), response.status);
  }
  if (!response.body) throw new Error('O navegador não disponibilizou o progresso da importação.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', result: T | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'progress') onProgress(String(event.phase), Number(event.percent));
    if (event.type === 'error') throw new ApiError(String(event.message), Number(event.status));
    if (event.type === 'result') result = event.result as T;
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0,end)); buffer = buffer.slice(end + 1); }
      if (chunk.done) { consume(buffer); break; }
    }
  } catch (cause) {
    await reader.cancel().catch(() => {});
    if (cause instanceof ApiError) throw cause;
    throw new Error('O acompanhamento foi interrompido. Confira a lista de referências e seu relatório antes de repetir a importação.');
  } finally { reader.releaseLock(); }
  if (result === undefined) throw new Error('A conexão terminou sem confirmação. Confira a lista de referências e seu relatório antes de repetir a importação.');
  return result;
}

function downloadFileName(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Continua para o nome simples quando o servidor enviar um cabeçalho inválido.
    }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

export async function apiDownload(
  path: string,
  fallbackName: string,
  retryAfterRefresh = true,
): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401 && retryAfterRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) return apiDownload(path, fallbackName, false);
  }

  if (!response.ok) {
    const details = await response.json().catch(() => undefined);
    const message =
      details && typeof details === 'object' && 'message' in details
        ? String(details.message)
        : `Não foi possível baixar o arquivo (${response.status}).`;
    throw new ApiError(message, response.status, details);
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = downloadFileName(response, fallbackName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
